/**
 * SISTEMA LYLA - Rutas de Reservas y Apartados (168 Horas / 7 Días)
 * Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected, query, withTransaction, getTableMap, inMemoryStore } from '../db.js';
import type { RowDataPacket } from 'mysql2/promise';

export const reservationsRouter = Router();

// =====================================================================
// PROCESAMIENTO AUTOMÁTICO DE VENCIMIENTOS (168 HORAS / 7 DÍAS)
// =====================================================================
export async function processExpiredReservations(): Promise<number> {
  const now = new Date();

  if (!isDbConnected()) {
    let expiredCount = 0;
    inMemoryStore.reservations.forEach((r) => {
      if (r.status === 'PENDIENTE') {
        const exp = new Date(r.expiresAt).getTime();
        if (now.getTime() > exp) {
          r.status = 'VENCIDA';
          r.cancelledAt = r.expiresAt;
          r.cancellationReason = 'Vencimiento automático de 7 días (168 horas) cumplido sin recojo de pedido';
          r.responsible = 'Sistema LYLA';
          r.retainedDeposit = r.depositAmount;
          expiredCount++;

          // Liberar stock reservado en memoria
          r.items.forEach((item: any) => {
            const prod = inMemoryStore.products.find((p) => p.id === item.productId);
            if (prod) {
              prod.reservedStock = Math.max(0, (prod.reservedStock ?? 0) - item.quantity);
              prod.stock = Math.max(0, (prod.physicalStock ?? prod.stock) - prod.reservedStock);
              if (prod.colorStock && item.selectedColor) {
                prod.colorStock[item.selectedColor] = (Number(prod.colorStock[item.selectedColor]) || 0) + item.quantity;
              }
            }
          });

          // Registrar retención de anticipo
          inMemoryStore.retainedDeposits.push({
            id: `ret-${r.id}-${Date.now()}`,
            reservaId: r.id,
            monto: r.depositAmount,
            metodoPagoOrigen: r.depositPaymentMethod,
            fechaRetencion: r.expiresAt,
            motivo: 'VENCIMIENTO_168_HORAS',
            responsable: 'Sistema LYLA',
          });
        }
      }
    });
    return expiredCount;
  }

  try {
    return await withTransaction(async (conn, tables) => {
      // 1. Buscar reservas pendientes que hayan superado las 168 horas
      const [expiredRows] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM ${tables.reservations} 
         WHERE (estado = 'PENDIENTE' OR status = 'PENDIENTE') 
           AND (fecha_vencimiento_exacta <= ? OR expires_at <= ?)
         FOR UPDATE`,
        [now, now]
      );

      if (expiredRows.length === 0) return 0;

      for (const resRow of expiredRows) {
        const resId = resRow.id;
        const deposit = Number(resRow.monto_anticipo ?? resRow.deposit_amount ?? 0);
        const depMethod = resRow.metodo_pago_anticipo ?? resRow.deposit_payment_method ?? 'QR';

        // 2. Liberar stock reservado devolviéndolo a disponible
        const [items] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM ${tables.reservationItems} WHERE reserva_id = ? OR reservation_id = ?`,
          [resId, resId]
        );

        for (const item of items) {
          const qty = Number(item.cantidad ?? item.quantity);
          const prodId = item.producto_id ?? item.product_id;
          const color = item.color_seleccionado ?? item.selected_color;

          await conn.query(
            `UPDATE ${tables.products} SET
              stock_reservado = GREATEST(0, stock_reservado - ?),
              stock_disponible = stock_disponible + ?,
              updated_at = ?
             WHERE id = ?`,
            [qty, qty, now, prodId]
          );

          if (color) {
            await conn.query(
              `UPDATE ${tables.productColors} SET
                stock_reservado = GREATEST(0, stock_reservado - ?),
                stock_disponible = stock_disponible + ?
               WHERE producto_id = ? AND color = ?`,
              [qty, qty, prodId, color]
            ).catch(() => {});
          }
        }

        // 3. Marcar reserva como VENCIDA con anticipo retenido
        await conn.query(
          `UPDATE ${tables.reservations} SET
            estado = 'VENCIDA',
            fecha_cancelacion = ?,
            motivo_cancelacion = 'Vencimiento automático de 7 días (168 horas) cumplido sin recojo de pedido',
            responsable = 'Sistema LYLA',
            anticipo_retenido = ?
           WHERE id = ?`,
          [now, deposit, resId]
        );

        // 4. Registrar anticipo retenido en tabla independiente para el Estado de Resultados
        await conn.query(
          `INSERT INTO ${tables.retainedDeposits}
            (id, reserva_id, monto, metodo_pago_origen, fecha_retencion, motivo, responsable, registrado_en_resultados)
           VALUES (?, ?, ?, ?, ?, 'VENCIMIENTO_168_HORAS', 'Sistema LYLA', 1)
           ON DUPLICATE KEY UPDATE monto = VALUES(monto)`,
          [`ret-${resId}-${Date.now()}`, resId, deposit, depMethod, now]
        ).catch(() => {});
      }

      console.log(`ℹ️ [SISTEMA LYLA - Auditoría] Se procesaron automáticamente ${expiredRows.length} reservas vencidas a las 168h.`);
      return expiredRows.length;
    });
  } catch (err: any) {
    console.error('Error al procesar reservas vencidas:', err);
    return 0;
  }
}

// =====================================================================
// GET /api/reservations
// =====================================================================
reservationsRouter.get('/', async (_req: Request, res: Response) => {
  // Ejecutar verificación de vencimientos al consultar
  await processExpiredReservations();

  if (!isDbConnected()) {
    return res.json(inMemoryStore.reservations);
  }

  try {
    const tables = getTableMap();
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM ${tables.reservations} ORDER BY created_at DESC`
    );
    const allItems = await query<RowDataPacket[]>(`SELECT * FROM ${tables.reservationItems}`);

    const itemsByResId: Record<string, any[]> = {};
    allItems.forEach((item) => {
      const rId = String(item.reserva_id ?? item.reservation_id);
      if (!itemsByResId[rId]) itemsByResId[rId] = [];
      itemsByResId[rId].push({
        productId: String(item.producto_id ?? item.product_id),
        code: String(item.codigo ?? item.code),
        name: String(item.nombre ?? item.name),
        category: String(item.categoria ?? item.category),
        selectedColor: item.color_seleccionado ?? item.selected_color ?? undefined,
        unitPrice: Number(item.precio_unitario ?? item.unit_price ?? 0),
        quantity: Number(item.cantidad ?? item.quantity ?? 1),
        subtotal: Number(item.subtotal ?? 0),
        unitPurchaseCost: Number(item.costo_unitario_compra ?? item.unit_purchase_cost ?? 0),
        imageUrl: item.imagen_url ?? item.image_url ?? undefined,
      });
    });

    const result = rows.map((r) => ({
      id: String(r.id),
      reservationNumber: String(r.numero_reserva ?? r.reservation_number ?? ''),
      customerName: String(r.cliente_nombre ?? r.customer_name ?? ''),
      customerPhone: r.cliente_telefono ?? r.customer_phone ?? undefined,
      customerSocialUser: r.cliente_red_social ?? r.customer_social_user ?? undefined,
      channel: String(r.canal ?? r.channel ?? 'Live TikTok'),
      items: itemsByResId[String(r.id)] || [],
      totalAmount: Number(r.monto_total ?? r.total_amount ?? 0),
      depositAmount: Number(r.monto_anticipo ?? r.deposit_amount ?? 0),
      depositPaymentMethod: r.metodo_pago_anticipo ?? r.deposit_payment_method ?? 'QR',
      remainingBalance: Number(r.saldo_pendiente ?? r.remaining_balance ?? 0),
      status: r.estado ?? r.status ?? 'PENDIENTE',
      createdAt: r.fecha_creacion ?? r.created_at ? new Date(r.fecha_creacion ?? r.created_at).toISOString() : new Date().toISOString(),
      expiresAt: r.fecha_vencimiento_exacta ?? r.expires_at ? new Date(r.fecha_vencimiento_exacta ?? r.expires_at).toISOString() : new Date().toISOString(),
      expirationDate: r.fecha_vencimiento ?? r.expiration_date ? new Date(r.fecha_vencimiento ?? r.expiration_date).toISOString().slice(0, 10) : undefined,
      completedAt: r.fecha_completada ?? r.completed_at ? new Date(r.fecha_completada ?? r.completed_at).toISOString() : undefined,
      completedSaleId: r.venta_completada_id ?? r.completed_sale_id ?? undefined,
      cancelledAt: r.fecha_cancelacion ?? r.cancelled_at ? new Date(r.fecha_cancelacion ?? r.cancelled_at).toISOString() : undefined,
      cancellationReason: r.motivo_cancelacion ?? r.cancellation_reason ?? undefined,
      responsible: r.responsable ?? undefined,
      retainedDeposit: r.anticipo_retenido ?? r.retained_deposit ? Number(r.anticipo_retenido ?? r.retained_deposit) : undefined,
      notes: r.notas ?? r.notes ?? undefined,
    }));

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================================
// POST /api/reservations (Apartado y Descuento de Stock Disponible)
// =====================================================================
reservationsRouter.post('/', async (req: Request, res: Response) => {
  const {
    customerName,
    customerPhone,
    customerSocialUser,
    channel = 'Live TikTok',
    items = [],
    totalAmount,
    depositAmount = 20,
    depositPaymentMethod = 'QR',
    remainingBalance,
    notes,
  } = req.body;

  if (!customerName || !items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Nombre de cliente e items son requeridos' });
  }

  const id = req.body.id || `res-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const reservationNumber = req.body.reservationNumber || `RES-${Date.now().toString().slice(-3)}`;
  const now = new Date();
  // Regla Clave: Vencimiento exacto a 168 horas / 7 días
  const expiresAt = new Date(now.getTime() + 168 * 3600 * 1000);
  const expirationDate = expiresAt.toISOString().slice(0, 10);
  const tot = Number(totalAmount);
  const dep = Number(depositAmount);
  const rem = remainingBalance !== undefined ? Number(remainingBalance) : tot - dep;

  if (!isDbConnected()) {
    // Modo memoria: apartar unidades sin tocar físico
    for (const item of items) {
      const prod = inMemoryStore.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.reservedStock = (prod.reservedStock ?? 0) + item.quantity;
        prod.stock = Math.max(0, (prod.physicalStock ?? prod.stock) - prod.reservedStock);
        if (prod.colorStock && item.selectedColor) {
          prod.colorStock[item.selectedColor] = Math.max(
            0,
            (Number(prod.colorStock[item.selectedColor]) || 0) - item.quantity
          );
        }
      }
    }
    const newRes = {
      id,
      reservationNumber,
      customerName,
      customerPhone,
      customerSocialUser,
      channel,
      items,
      totalAmount: tot,
      depositAmount: dep,
      depositPaymentMethod,
      remainingBalance: rem,
      status: 'PENDIENTE' as const,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      expirationDate,
      notes,
    };
    inMemoryStore.reservations.unshift(newRes);
    return res.status(201).json({ success: true, reservation: newRes });
  }

  try {
    const result = await withTransaction(async (conn, tables) => {
      // 1. Validar y apartar stock disponible en productos
      for (const item of items) {
        const [prods] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM ${tables.products} WHERE id = ? FOR UPDATE`,
          [item.productId]
        );
        if (prods.length === 0) throw new Error(`Producto ${item.name} no encontrado.`);

        const p = prods[0];
        const curDisp = Number(p.stock_disponible ?? p.stock ?? 0);
        if (curDisp < item.quantity) {
          throw new Error(`Stock disponible insuficiente para apartar "${p.nombre ?? p.name}".`);
        }

        // Aumentar stock reservado y reducir stock disponible (físico intacto en tienda)
        await conn.query(
          `UPDATE ${tables.products} SET
            stock_reservado = stock_reservado + ?,
            stock_disponible = GREATEST(0, stock_disponible - ?),
            updated_at = ?
           WHERE id = ?`,
          [item.quantity, item.quantity, now, item.productId]
        );

        if (item.selectedColor) {
          await conn.query(
            `UPDATE ${tables.productColors} SET
              stock_reservado = stock_reservado + ?,
              stock_disponible = GREATEST(0, stock_disponible - ?)
             WHERE producto_id = ? AND color = ?`,
            [item.quantity, item.quantity, item.productId, item.selectedColor]
          ).catch(() => {});
        }
      }

      // 2. Insertar cabecera de reserva
      await conn.query(
        `INSERT INTO ${tables.reservations}
          (id, numero_reserva, cliente_nombre, cliente_telefono, cliente_red_social, canal, monto_total, monto_anticipo, metodo_pago_anticipo, saldo_pendiente, estado, fecha_creacion, fecha_vencimiento_exacta, fecha_vencimiento, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, ?)`,
        [
          id,
          reservationNumber,
          customerName,
          customerPhone || null,
          customerSocialUser || null,
          channel,
          tot,
          dep,
          depositPaymentMethod,
          rem,
          now,
          expiresAt,
          expirationDate,
          notes || null,
        ]
      );

      // 3. Insertar items de reserva
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await conn.query(
          `INSERT INTO ${tables.reservationItems}
            (id, reserva_id, producto_id, codigo, nombre, categoria, color_seleccionado, precio_unitario, cantidad, subtotal, costo_unitario_compra)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `${id}-item-${i}`,
            id,
            it.productId,
            it.code,
            it.name,
            it.category || 'Carteras',
            it.selectedColor || null,
            Number(it.unitPrice),
            Number(it.quantity),
            Number(it.subtotal),
            Number(it.unitPurchaseCost || 0),
          ]
        );
      }

      return {
        id,
        reservationNumber,
        customerName,
        customerPhone,
        customerSocialUser,
        channel,
        items,
        totalAmount: tot,
        depositAmount: dep,
        depositPaymentMethod,
        remainingBalance: rem,
        status: 'PENDIENTE' as const,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        expirationDate,
        notes,
      };
    });

    return res.status(201).json({ success: true, reservation: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// =====================================================================
// POST /api/reservations/:id/cancel (Cancelación, Liberación de Stock y Retención)
// =====================================================================
reservationsRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason = 'Cancelación solicitada por el cliente', responsible = 'Roly' } = req.body;
  const now = new Date();

  if (!isDbConnected()) {
    const resv = inMemoryStore.reservations.find((r) => r.id === id);
    if (!resv || resv.status !== 'PENDIENTE') {
      return res.status(400).json({ success: false, message: 'Reserva no encontrada o ya finalizada' });
    }
    resv.status = 'CANCELADA';
    resv.cancelledAt = now.toISOString();
    resv.cancellationReason = reason;
    resv.responsible = responsible;
    resv.retainedDeposit = resv.depositAmount;

    // Liberar stock
    resv.items.forEach((item: any) => {
      const prod = inMemoryStore.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.reservedStock = Math.max(0, (prod.reservedStock ?? 0) - item.quantity);
        prod.stock = Math.max(0, (prod.physicalStock ?? prod.stock) - prod.reservedStock);
        if (prod.colorStock && item.selectedColor) {
          prod.colorStock[item.selectedColor] = (Number(prod.colorStock[item.selectedColor]) || 0) + item.quantity;
        }
      }
    });

    // Registrar en anticipos retenidos
    inMemoryStore.retainedDeposits.push({
      id: `ret-${id}-${Date.now()}`,
      reservaId: id,
      monto: resv.depositAmount,
      metodoPagoOrigen: resv.depositPaymentMethod,
      fechaRetencion: now.toISOString(),
      motivo: 'CANCELACION_CLIENTE',
      responsable: responsible,
    });

    return res.json({ success: true, message: 'Reserva cancelada, stock liberado y anticipo retenido al 100%.' });
  }

  try {
    await withTransaction(async (conn, tables) => {
      const [resRows] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM ${tables.reservations} WHERE id = ? FOR UPDATE`,
        [id]
      );
      if (resRows.length === 0) throw new Error('Reserva no encontrada');
      const r = resRows[0];
      if (r.estado !== 'PENDIENTE' && r.status !== 'PENDIENTE') {
        throw new Error('Solo se pueden cancelar reservas en estado PENDIENTE.');
      }

      const dep = Number(r.monto_anticipo ?? r.deposit_amount ?? 0);
      const depMethod = r.metodo_pago_anticipo ?? r.deposit_payment_method ?? 'QR';

      // 1. Liberar stock reservado devolviéndolo a disponible
      const [items] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM ${tables.reservationItems} WHERE reserva_id = ? OR reservation_id = ?`,
        [id, id]
      );

      for (const item of items) {
        const qty = Number(item.cantidad ?? item.quantity);
        const prodId = item.producto_id ?? item.product_id;
        const color = item.color_seleccionado ?? item.selected_color;

        await conn.query(
          `UPDATE ${tables.products} SET
            stock_reservado = GREATEST(0, stock_reservado - ?),
            stock_disponible = stock_disponible + ?,
            updated_at = ?
           WHERE id = ?`,
          [qty, qty, now, prodId]
        );

        if (color) {
          await conn.query(
            `UPDATE ${tables.productColors} SET
              stock_reservado = GREATEST(0, stock_reservado - ?),
              stock_disponible = stock_disponible + ?
             WHERE producto_id = ? AND color = ?`,
            [qty, qty, prodId, color]
          ).catch(() => {});
        }
      }

      // 2. Marcar reserva cancelada con retención del 100% del adelanto
      await conn.query(
        `UPDATE ${tables.reservations} SET
          estado = 'CANCELADA',
          fecha_cancelacion = ?,
          motivo_cancelacion = ?,
          responsable = ?,
          anticipo_retenido = ?
         WHERE id = ?`,
        [now, reason, responsible, dep, id]
      );

      // 3. Registrar en anticipos_retenidos para el Estado de Resultados
      await conn.query(
        `INSERT INTO ${tables.retainedDeposits}
          (id, reserva_id, monto, metodo_pago_origen, fecha_retencion, motivo, responsable, registrado_en_resultados)
         VALUES (?, ?, ?, ?, ?, 'CANCELACION_CLIENTE', ?, 1)`,
        [`ret-${id}-${Date.now()}`, id, dep, depMethod, now, responsible]
      ).catch(() => {});
    });

    return res.json({ success: true, message: 'Reserva cancelada, stock liberado y anticipo retenido registrado.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});
