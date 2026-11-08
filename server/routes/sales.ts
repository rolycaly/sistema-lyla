/**
 * SISTEMA LYLA - Rutas de Ventas (POS)
 * Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected, query, withTransaction, getTableMap, inMemoryStore } from '../db.js';
import type { RowDataPacket } from 'mysql2/promise';

export const salesRouter = Router();

// Helper para normalizar venta desde MySQL a TypeScript DTO
export function mapDbSaleToDto(saleRow: any, items: any[] = [], payments: any[] = []) {
  let history: any[] = [];
  try {
    const rawHist = saleRow.historial ?? saleRow.history;
    if (typeof rawHist === 'string') {
      history = JSON.parse(rawHist);
    } else if (Array.isArray(rawHist)) {
      history = rawHist;
    }
  } catch (e) {
    history = [];
  }

  const mappedItems = items.map((i) => ({
    productId: String(i.producto_id ?? i.product_id),
    code: String(i.codigo ?? i.code),
    name: String(i.nombre ?? i.name),
    category: String(i.categoria ?? i.category),
    selectedColor: i.color_seleccionado ?? i.selected_color ?? undefined,
    unitPrice: Number(i.precio_unitario ?? i.unit_price ?? 0),
    quantity: Number(i.cantidad ?? i.quantity ?? 1),
    subtotal: Number(i.subtotal ?? 0),
    unitPurchaseCost: Number(i.costo_unitario_compra ?? i.unit_purchase_cost ?? 0),
    totalPurchaseCost: Number(i.costo_total_compra ?? i.total_purchase_cost ?? 0),
    imageUrl: i.imagen_url ?? i.image_url ?? undefined,
  }));

  return {
    id: String(saleRow.id),
    receiptNumber: String(saleRow.numero_recibo ?? saleRow.receipt_number),
    items: mappedItems,
    subtotal: Number(saleRow.subtotal ?? 0),
    discount: Number(saleRow.descuento ?? saleRow.discount ?? 0),
    total: Number(saleRow.total ?? 0),
    paymentMethod: saleRow.metodo_pago ?? saleRow.payment_method ?? 'Efectivo',
    cashAmount: Number(saleRow.monto_efectivo ?? saleRow.cash_amount ?? 0),
    qrAmount: Number(saleRow.monto_qr ?? saleRow.qr_amount ?? 0),
    amountReceived: saleRow.monto_recibido ?? saleRow.amount_received ? Number(saleRow.monto_recibido ?? saleRow.amount_received) : undefined,
    changeGiven: saleRow.cambio_devuelto ?? saleRow.change_given ? Number(saleRow.cambio_devuelto ?? saleRow.change_given) : undefined,
    totalCostOfGoodsSold: Number(saleRow.costo_total_ventas ?? saleRow.total_cost_of_goods_sold ?? 0),
    status: saleRow.estado ?? saleRow.status ?? 'CONFIRMADA',
    cancellationReason: saleRow.motivo_anulacion ?? saleRow.cancellation_reason ?? undefined,
    history,
    createdAt: saleRow.created_at ? new Date(saleRow.created_at).toISOString() : new Date().toISOString(),
    updatedAt: saleRow.updated_at ? new Date(saleRow.updated_at).toISOString() : new Date().toISOString(),
    shiftClosedId: saleRow.jornada_id ?? saleRow.shift_closed_id ?? undefined,
    reservationId: saleRow.reserva_id ?? saleRow.reservation_id ?? undefined,
    reservationDepositApplied: saleRow.anticipo_reserva_aplicado ?? saleRow.reservation_deposit_applied ? Number(saleRow.anticipo_reserva_aplicado ?? saleRow.reservation_deposit_applied) : undefined,
  };
}

// =====================================================================
// GET /api/sales
// =====================================================================
salesRouter.get('/', async (_req: Request, res: Response) => {
  if (!isDbConnected()) {
    return res.json(inMemoryStore.sales);
  }

  try {
    const tables = getTableMap();
    const salesRows = await query<RowDataPacket[]>(`SELECT * FROM ${tables.sales} ORDER BY created_at DESC`);
    const allItems = await query<RowDataPacket[]>(`SELECT * FROM ${tables.saleItems}`);

    const itemsBySaleId: Record<string, any[]> = {};
    allItems.forEach((item) => {
      const saleId = String(item.venta_id ?? item.sale_id);
      if (!itemsBySaleId[saleId]) itemsBySaleId[saleId] = [];
      itemsBySaleId[saleId].push(item);
    });

    const result = salesRows.map((s) => mapDbSaleToDto(s, itemsBySaleId[String(s.id)] || []));
    return res.json(result);
  } catch (err: any) {
    console.error('Error al obtener ventas:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================================
// GET /api/sales/:id
// =====================================================================
salesRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!isDbConnected()) {
    const sale = inMemoryStore.sales.find((s) => s.id === id);
    if (!sale) return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    return res.json(sale);
  }

  try {
    const tables = getTableMap();
    const [salesRows] = await query<RowDataPacket[]>(`SELECT * FROM ${tables.sales} WHERE id = ? LIMIT 1`, [id]);
    if (!salesRows || salesRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    }
    const items = await query<RowDataPacket[]>(
      `SELECT * FROM ${tables.saleItems} WHERE venta_id = ? OR sale_id = ?`,
      [id, id]
    );
    return res.json(mapDbSaleToDto(salesRows[0], items));
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================================
// POST /api/sales
// Transacción Atómica: Venta, Items, Desglose Pagos y Descuento de Stock
// =====================================================================
salesRouter.post('/', async (req: Request, res: Response) => {
  const {
    items = [],
    subtotal = 0,
    discount = 0,
    total = 0,
    paymentMethod = 'Efectivo',
    cashAmount = 0,
    qrAmount = 0,
    amountReceived,
    changeGiven,
    totalCostOfGoodsSold = 0,
    reservationId,
    reservationDepositApplied = 0,
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'La venta debe contener al menos un producto' });
  }

  const id = req.body.id || `sale-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const receiptNumber = req.body.receiptNumber || `LYLA-${Date.now().toString().slice(-4)}`;
  const now = new Date();

  if (!isDbConnected()) {
    // Modo autónomo: actualizar stock en memoria
    for (const item of items) {
      const prod = inMemoryStore.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.physicalStock = Math.max(0, (prod.physicalStock ?? prod.stock) - item.quantity);
        if (reservationId) {
          prod.reservedStock = Math.max(0, (prod.reservedStock ?? 0) - item.quantity);
        }
        prod.stock = Math.max(0, prod.physicalStock - (prod.reservedStock ?? 0));
        if (prod.colorStock && item.selectedColor) {
          prod.colorStock[item.selectedColor] = Math.max(
            0,
            (Number(prod.colorStock[item.selectedColor]) || 0) - item.quantity
          );
        }
      }
    }
    if (reservationId) {
      const resv = inMemoryStore.reservations.find((r) => r.id === reservationId);
      if (resv) {
        resv.status = 'COMPLETADA';
        resv.completedAt = now.toISOString();
        resv.completedSaleId = id;
        resv.completionPaymentMethod = paymentMethod;
        resv.completionCashAmount = Number(cashAmount);
        resv.completionQrAmount = Number(qrAmount);
      }
    }
    const newSale = {
      id,
      receiptNumber,
      items,
      subtotal: Number(subtotal),
      discount: Number(discount),
      total: Number(total),
      paymentMethod,
      cashAmount: Number(cashAmount),
      qrAmount: Number(qrAmount),
      amountReceived: amountReceived ? Number(amountReceived) : undefined,
      changeGiven: changeGiven ? Number(changeGiven) : undefined,
      totalCostOfGoodsSold: Number(totalCostOfGoodsSold),
      status: 'CONFIRMADA' as const,
      history: [
        {
          timestamp: now.toISOString(),
          action: 'REGISTRO_INICIAL',
          note: `Venta registrada por Bs ${total} (${paymentMethod})`,
        },
      ],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      reservationId,
      reservationDepositApplied: Number(reservationDepositApplied),
    };
    inMemoryStore.sales.unshift(newSale);
    return res.status(201).json({ success: true, sale: newSale });
  }

  try {
    const result = await withTransaction(async (conn, tables) => {
      // 1. Validar y descontar stock de cada producto en la base de datos
      let calculatedCOGS = 0;

      for (const item of items) {
        const [prodRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM ${tables.products} WHERE id = ? FOR UPDATE`,
          [item.productId]
        );
        if (prodRows.length === 0) {
          throw new Error(`El producto ${item.name} (${item.code}) no existe en el inventario.`);
        }

        const prod = prodRows[0];
        const currentPhys = Number(prod.stock_fisico ?? prod.physical_stock ?? prod.stock);
        const currentRes = Number(prod.stock_reservado ?? prod.reserved_stock ?? 0);
        const currentCost = Number(prod.costo_compra ?? prod.purchase_cost ?? 0);

        if (currentPhys < item.quantity) {
          throw new Error(
            `Stock insuficiente para "${prod.nombre ?? prod.name}". Disponible físico: ${currentPhys}, Solicitado: ${item.quantity}`
          );
        }

        const newPhys = currentPhys - item.quantity;
        const newRes = reservationId ? Math.max(0, currentRes - item.quantity) : currentRes;
        const newStock = Math.max(0, newPhys - newRes);

        // Descontar del objeto JSON de stock por color
        let colorStock: Record<string, number> = {};
        try {
          const rawCStock = prod.stock_por_color ?? prod.color_stock;
          colorStock = typeof rawCStock === 'string' ? JSON.parse(rawCStock) : (rawCStock || {});
        } catch (e) {
          colorStock = {};
        }

        if (item.selectedColor && colorStock[item.selectedColor] !== undefined) {
          colorStock[item.selectedColor] = Math.max(0, (Number(colorStock[item.selectedColor]) || 0) - item.quantity);
        }

        const activeColors = Object.entries(colorStock)
          .filter(([_, q]) => Number(q) > 0)
          .map(([c]) => c);

        // Actualizar producto en MySQL
        await conn.query(
          `UPDATE ${tables.products} SET
            stock_fisico = ?, stock_reservado = ?, stock_disponible = ?, stock_por_color = ?, colores_disponibles = ?, updated_at = ?
           WHERE id = ?`,
          [newPhys, newRes, newStock, JSON.stringify(colorStock), JSON.stringify(activeColors), now, item.productId]
        );

        // Actualizar variante de color en tabla normalizada (si existe)
        if (item.selectedColor) {
          await conn.query(
            `UPDATE ${tables.productColors} SET 
              stock_fisico = GREATEST(0, stock_fisico - ?),
              stock_reservado = GREATEST(0, stock_reservado - ?),
              stock_disponible = GREATEST(0, stock_disponible - ?)
             WHERE producto_id = ? AND color = ?`,
            [item.quantity, reservationId ? item.quantity : 0, item.quantity, item.productId, item.selectedColor]
          ).catch(() => {});
        }

        calculatedCOGS += currentCost * item.quantity;
      }

      const finalCOGS = totalCostOfGoodsSold > 0 ? Number(totalCostOfGoodsSold) : calculatedCOGS;

      // 2. Insertar en tabla de ventas
      const initialHistory = [
        {
          timestamp: now.toISOString(),
          action: 'REGISTRO_INICIAL',
          note: `Venta registrada por Bs ${total} (${paymentMethod})`,
        },
      ];

      await conn.query(
        `INSERT INTO ${tables.sales}
          (id, numero_recibo, subtotal, descuento, total, metodo_pago, monto_efectivo, monto_qr, monto_recibido, cambio_devuelto, costo_total_ventas, estado, reserva_id, anticipo_reserva_aplicado, historial, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMADA', ?, ?, ?, ?, ?)`,
        [
          id,
          receiptNumber,
          Number(subtotal),
          Number(discount),
          Number(total),
          paymentMethod,
          Number(cashAmount),
          Number(qrAmount),
          amountReceived ? Number(amountReceived) : null,
          changeGiven ? Number(changeGiven) : null,
          finalCOGS,
          reservationId || null,
          Number(reservationDepositApplied),
          JSON.stringify(initialHistory),
          now,
          now,
        ]
      );

      // 3. Insertar items de venta
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemId = `${id}-item-${i}`;
        await conn.query(
          `INSERT INTO ${tables.saleItems}
            (id, venta_id, producto_id, codigo, nombre, categoria, color_seleccionado, precio_unitario, cantidad, subtotal, costo_unitario_compra, costo_total_compra, imagen_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            id,
            item.productId,
            item.code,
            item.name,
            item.category || 'Carteras',
            item.selectedColor || null,
            Number(item.unitPrice),
            Number(item.quantity),
            Number(item.subtotal),
            Number(item.unitPurchaseCost || 0),
            Number(item.totalPurchaseCost || 0),
            item.imageUrl || null,
          ]
        );
      }

      // 4. Si hubo pago mixto, registrar en pagos_ventas
      if (paymentMethod === 'Mixto') {
        if (Number(cashAmount) > 0) {
          await conn.query(
            `INSERT INTO ${tables.salePayments} (id, venta_id, metodo_pago, monto, monto_recibido, cambio_devuelto, fecha)
             VALUES (?, ?, 'Efectivo', ?, ?, ?, ?)`,
            [`pay-${id}-cash`, id, Number(cashAmount), amountReceived ? Number(amountReceived) : null, changeGiven ? Number(changeGiven) : null, now]
          ).catch(() => {});
        }
        if (Number(qrAmount) > 0) {
          await conn.query(
            `INSERT INTO ${tables.salePayments} (id, venta_id, metodo_pago, monto, fecha)
             VALUES (?, ?, 'QR', ?, ?)`,
            [`pay-${id}-qr`, id, Number(qrAmount), now]
          ).catch(() => {});
        }
      }

      // 5. Si la venta proviene de una reserva, actualizar estado a COMPLETADA
      if (reservationId) {
        await conn.query(
          `UPDATE ${tables.reservations} SET
            estado = 'COMPLETADA',
            fecha_completada = ?,
            venta_completada_id = ?,
            metodo_pago_completada = ?,
            monto_efectivo_completada = ?,
            monto_qr_completada = ?
           WHERE id = ?`,
          [now, id, paymentMethod, Number(cashAmount), Number(qrAmount), reservationId]
        ).catch(() => {});
      }

      return {
        id,
        receiptNumber,
        items,
        subtotal: Number(subtotal),
        discount: Number(discount),
        total: Number(total),
        paymentMethod,
        cashAmount: Number(cashAmount),
        qrAmount: Number(qrAmount),
        amountReceived: amountReceived ? Number(amountReceived) : undefined,
        changeGiven: changeGiven ? Number(changeGiven) : undefined,
        totalCostOfGoodsSold: finalCOGS,
        status: 'CONFIRMADA' as const,
        history: initialHistory,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        reservationId,
        reservationDepositApplied: Number(reservationDepositApplied),
      };
    });

    return res.status(201).json({ success: true, sale: result });
  } catch (err: any) {
    console.error('Error al registrar venta:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
});

// =====================================================================
// PUT /api/sales/:id (Modificación dentro de la ventana de 30 minutos)
// =====================================================================
salesRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { items, subtotal, discount, total, paymentMethod, amountReceived, changeGiven, reason } = req.body;

  if (!isDbConnected()) {
    const saleIdx = inMemoryStore.sales.findIndex((s) => s.id === id);
    if (saleIdx === -1) return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    const existing = inMemoryStore.sales[saleIdx];
    const updated = {
      ...existing,
      items,
      subtotal,
      discount,
      total,
      paymentMethod,
      amountReceived,
      changeGiven,
      status: 'EDITADA' as const,
      updatedAt: new Date().toISOString(),
    };
    inMemoryStore.sales[saleIdx] = updated;
    return res.json({ success: true, sale: updated });
  }

  try {
    const result = await withTransaction(async (conn, tables) => {
      // 1. Obtener venta existente
      const [sales] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM ${tables.sales} WHERE id = ? FOR UPDATE`,
        [id]
      );
      if (sales.length === 0) throw new Error('Venta no encontrada');
      const currentSale = sales[0];

      // 2. Validar ventana de 30 minutos
      const createdAtTime = new Date(currentSale.created_at).getTime();
      const now = new Date();
      const diffMinutes = (now.getTime() - createdAtTime) / (1000 * 60);

      if (diffMinutes > 30) {
        throw new Error('El plazo de 30 minutos para modificar la venta ha expirado. Proceda con una anulación si es necesario.');
      }

      // 3. Restaurar stock de los items anteriores
      const [oldItems] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM ${tables.saleItems} WHERE venta_id = ? OR sale_id = ?`,
        [id, id]
      );

      for (const oldItem of oldItems) {
        await conn.query(
          `UPDATE ${tables.products} SET
            stock_fisico = stock_fisico + ?,
            stock_disponible = stock_disponible + ?,
            updated_at = ?
           WHERE id = ?`,
          [oldItem.cantidad ?? oldItem.quantity, oldItem.cantidad ?? oldItem.quantity, now, oldItem.producto_id ?? oldItem.product_id]
        );
      }

      // 4. Descontar stock de los nuevos items
      let newCOGS = 0;
      for (const item of items) {
        const [prod] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM ${tables.products} WHERE id = ? FOR UPDATE`,
          [item.productId]
        );
        if (prod.length === 0) throw new Error(`Producto ${item.name} no encontrado`);
        const p = prod[0];
        const cost = Number(p.costo_compra ?? p.purchase_cost ?? 0);
        newCOGS += cost * item.quantity;

        await conn.query(
          `UPDATE ${tables.products} SET
            stock_fisico = GREATEST(0, stock_fisico - ?),
            stock_disponible = GREATEST(0, stock_disponible - ?),
            updated_at = ?
           WHERE id = ?`,
          [item.quantity, item.quantity, now, item.productId]
        );
      }

      // 5. Eliminar items anteriores e insertar los nuevos
      await conn.query(`DELETE FROM ${tables.saleItems} WHERE venta_id = ? OR sale_id = ?`, [id, id]);

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await conn.query(
          `INSERT INTO ${tables.saleItems}
            (id, venta_id, producto_id, codigo, nombre, categoria, color_seleccionado, precio_unitario, cantidad, subtotal, costo_unitario_compra, costo_total_compra, imagen_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `${id}-mod-${i}`,
            id,
            item.productId,
            item.code,
            item.name,
            item.category || 'Carteras',
            item.selectedColor || null,
            Number(item.unitPrice),
            Number(item.quantity),
            Number(item.subtotal),
            Number(item.unitPurchaseCost || 0),
            Number(item.totalPurchaseCost || 0),
            item.imageUrl || null,
          ]
        );
      }

      // 6. Actualizar historial JSON
      let history: any[] = [];
      try {
        history = typeof currentSale.historial === 'string' ? JSON.parse(currentSale.historial) : (currentSale.historial || []);
      } catch (e) {
        history = [];
      }
      history.push({
        timestamp: now.toISOString(),
        action: 'MODIFICADA_30_MIN',
        note: reason || 'Modificación dentro del plazo de 30 minutos',
      });

      // 7. Actualizar cabecera de venta
      await conn.query(
        `UPDATE ${tables.sales} SET
          subtotal = ?, descuento = ?, total = ?, metodo_pago = ?, monto_recibido = ?,
          cambio_devuelto = ?, costo_total_ventas = ?, estado = 'EDITADA', historial = ?, updated_at = ?
         WHERE id = ?`,
        [
          Number(subtotal),
          Number(discount),
          Number(total),
          paymentMethod,
          amountReceived ? Number(amountReceived) : null,
          changeGiven ? Number(changeGiven) : null,
          newCOGS,
          JSON.stringify(history),
          now,
          id,
        ]
      );

      return { id, message: 'Venta actualizada exitosamente dentro de los 30 min.' };
    });

    return res.json({ success: true, result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// =====================================================================
// POST /api/sales/:id/cancel (Anulación y Restauración de Stock)
// =====================================================================
salesRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason = 'Anulación solicitada por el usuario' } = req.body;

  if (!isDbConnected()) {
    const sale = inMemoryStore.sales.find((s) => s.id === id);
    if (!sale) return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    sale.status = 'ANULADA';
    sale.cancellationReason = reason;

    // Restaurar stock
    sale.items.forEach((item: any) => {
      const prod = inMemoryStore.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.physicalStock = (prod.physicalStock ?? prod.stock) + item.quantity;
        prod.stock = prod.physicalStock - (prod.reservedStock ?? 0);
        if (prod.colorStock && item.selectedColor) {
          prod.colorStock[item.selectedColor] = (Number(prod.colorStock[item.selectedColor]) || 0) + item.quantity;
        }
      }
    });

    return res.json({ success: true, message: 'Venta anulada y stock devuelto al inventario.' });
  }

  try {
    await withTransaction(async (conn, tables) => {
      const [sales] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM ${tables.sales} WHERE id = ? FOR UPDATE`,
        [id]
      );
      if (sales.length === 0) throw new Error('Venta no encontrada');
      const sale = sales[0];

      if (sale.estado === 'ANULADA' || sale.status === 'ANULADA') {
        throw new Error('Esta venta ya se encuentra anulada previamente.');
      }

      const now = new Date();

      // 1. Reincorporar stock físico y disponible de los productos vendidos
      const [items] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM ${tables.saleItems} WHERE venta_id = ? OR sale_id = ?`,
        [id, id]
      );

      for (const item of items) {
        const qty = Number(item.cantidad ?? item.quantity);
        const prodId = item.producto_id ?? item.product_id;
        const color = item.color_seleccionado ?? item.selected_color;

        await conn.query(
          `UPDATE ${tables.products} SET
            stock_fisico = stock_fisico + ?,
            stock_disponible = stock_disponible + ?,
            updated_at = ?
           WHERE id = ?`,
          [qty, qty, now, prodId]
        );

        // Restaurar en tabla normalizada de variantes (si existe)
        if (color) {
          await conn.query(
            `UPDATE ${tables.productColors} SET
              stock_fisico = stock_fisico + ?,
              stock_disponible = stock_disponible + ?
             WHERE producto_id = ? AND color = ?`,
            [qty, qty, prodId, color]
          ).catch(() => {});
        }
      }

      // 2. Registrar anulación en la venta
      let history: any[] = [];
      try {
        history = typeof sale.historial === 'string' ? JSON.parse(sale.historial) : (sale.historial || []);
      } catch (e) {
        history = [];
      }
      history.push({
        timestamp: now.toISOString(),
        action: 'ANULADA_CONTROLADA',
        note: `Anulación: ${reason}`,
      });

      await conn.query(
        `UPDATE ${tables.sales} SET
          estado = 'ANULADA', motivo_anulacion = ?, historial = ?, updated_at = ?
         WHERE id = ?`,
        [reason, JSON.stringify(history), now, id]
      );
    });

    return res.json({ success: true, message: 'Venta anulada y existencias reincorporadas al inventario.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});
