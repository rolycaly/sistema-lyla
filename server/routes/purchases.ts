/**
 * SISTEMA LYLA - Rutas de Compras de Mercadería
 * Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected, query, withTransaction, getTableMap, inMemoryStore } from '../db.js';
import type { RowDataPacket } from 'mysql2/promise';

export const purchasesRouter = Router();

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// =====================================================================
// GET /api/purchases
// =====================================================================
purchasesRouter.get('/', async (_req: Request, res: Response) => {
  if (!isDbConnected()) {
    return res.json(inMemoryStore.purchases);
  }

  try {
    const tables = getTableMap();
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM ${tables.purchases} ORDER BY created_at DESC`
    );

    const result = rows.map((r) => ({
      id: String(r.id),
      purchaseNumber: String(r.numero_compra ?? r.purchase_number ?? ''),
      supplier: String(r.proveedor ?? r.supplier ?? ''),
      date: r.fecha ? new Date(r.fecha).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      productId: String(r.producto_id ?? r.product_id ?? ''),
      productCode: String(r.codigo_producto ?? r.product_code ?? ''),
      productName: String(r.nombre_producto ?? r.product_name ?? ''),
      category: String(r.categoria ?? r.category ?? 'Carteras'),
      selectedColor: r.color_seleccionado ?? r.selected_color ?? undefined,
      quantity: Number(r.cantidad ?? r.quantity ?? 1),
      unitCost: Number(r.costo_unitario ?? r.unit_cost ?? 0),
      total: Number(r.total ?? 0),
      isNewProduct: Boolean(r.es_producto_nuevo ?? r.is_new_product ?? 0),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    }));

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================================
// GET /api/purchases/:id
// =====================================================================
purchasesRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!isDbConnected()) {
    const purch = inMemoryStore.purchases.find((p) => p.id === id);
    if (!purch) return res.status(404).json({ success: false, message: 'Compra no encontrada' });
    return res.json(purch);
  }

  try {
    const tables = getTableMap();
    const rows = await query<RowDataPacket[]>(`SELECT * FROM ${tables.purchases} WHERE id = ? LIMIT 1`, [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Compra no encontrada' });
    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================================
// POST /api/purchases
// Transacción: Insertar Compra + Actualizar Stock y Costo Promedio Ponderado
// =====================================================================
purchasesRouter.post('/', async (req: Request, res: Response) => {
  const {
    supplier,
    date,
    productId,
    productCode,
    productName,
    category,
    selectedColor,
    quantity = 1,
    unitCost = 0,
    total,
    isNewProduct = false,
    newProductData,
  } = req.body;

  if (!supplier || !productId || !quantity || quantity <= 0) {
    return res.status(400).json({ success: false, message: 'Proveedor, Producto y Cantidad válida son requeridos' });
  }

  const id = req.body.id || `purch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const purchaseNumber = req.body.purchaseNumber || `COM-${Date.now().toString().slice(-4)}`;
  const calcTotal = total ? Number(total) : round2(Number(quantity) * Number(unitCost));
  const now = new Date();

  if (!isDbConnected()) {
    // Modo autónomo en memoria
    if (isNewProduct && newProductData) {
      const newlyCreated = {
        ...newProductData,
        id: productId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      inMemoryStore.products.unshift(newlyCreated);
    } else {
      const existing = inMemoryStore.products.find((p) => p.id === productId);
      if (existing) {
        const curStock = existing.stock || 0;
        const curCost = existing.purchaseCost || 0;
        const newTotalStock = curStock + Number(quantity);
        const weightedCost = newTotalStock > 0
          ? round2((curStock * curCost + Number(quantity) * Number(unitCost)) / newTotalStock)
          : Number(unitCost);

        existing.physicalStock = (existing.physicalStock ?? existing.stock) + Number(quantity);
        existing.stock = newTotalStock;
        existing.purchaseCost = weightedCost;
        if (existing.colorStock && selectedColor) {
          existing.colorStock[selectedColor] = (Number(existing.colorStock[selectedColor]) || 0) + Number(quantity);
        }
      }
    }

    const newPurch = {
      id,
      purchaseNumber,
      supplier,
      date: date || now.toISOString().slice(0, 10),
      productId,
      productCode,
      productName,
      category: category || 'Carteras',
      selectedColor,
      quantity: Number(quantity),
      unitCost: Number(unitCost),
      total: calcTotal,
      isNewProduct: Boolean(isNewProduct),
      createdAt: now.toISOString(),
    };
    inMemoryStore.purchases.unshift(newPurch);
    return res.status(201).json({ success: true, purchase: newPurch });
  }

  try {
    const result = await withTransaction(async (conn, tables) => {
      // 1. Manejo del producto (Nuevo o Existente con Costo Promedio Ponderado)
      if (isNewProduct && newProductData) {
        await conn.query(
          `INSERT INTO ${tables.products}
            (id, codigo, nombre, categoria, color, colores_disponibles, stock_por_color, marca, costo_compra, precio_venta, stock_fisico, stock_reservado, stock_disponible, imagen_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
          [
            productId,
            newProductData.code,
            newProductData.name,
            newProductData.category || 'Carteras',
            newProductData.color || '',
            JSON.stringify(newProductData.availableColors || []),
            JSON.stringify(newProductData.colorStock || {}),
            newProductData.brand || 'Lyla Atelier',
            Number(unitCost),
            Number(newProductData.salePrice || 0),
            Number(quantity),
            Number(quantity),
            newProductData.imageUrl || '',
            now,
            now,
          ]
        );
      } else {
        const [prodRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM ${tables.products} WHERE id = ? FOR UPDATE`,
          [productId]
        );
        if (prodRows.length > 0) {
          const prod = prodRows[0];
          const curStock = Number(prod.stock_disponible ?? prod.stock ?? 0);
          const curPhys = Number(prod.stock_fisico ?? prod.physical_stock ?? curStock);
          const curCost = Number(prod.costo_compra ?? prod.purchase_cost ?? 0);
          const newQty = Number(quantity);
          const newUnitCost = Number(unitCost);

          const newTotalStock = curStock + newQty;
          // Regla Contable: Costo Promedio Ponderado
          const weightedCost = newTotalStock > 0
            ? round2((curStock * curCost + newQty * newUnitCost) / newTotalStock)
            : newUnitCost;

          let colorStock: Record<string, number> = {};
          try {
            const rawCStock = prod.stock_por_color ?? prod.color_stock;
            colorStock = typeof rawCStock === 'string' ? JSON.parse(rawCStock) : (rawCStock || {});
          } catch (e) {
            colorStock = {};
          }

          if (selectedColor) {
            colorStock[selectedColor] = (Number(colorStock[selectedColor]) || 0) + newQty;
          }

          const activeColors = Object.entries(colorStock)
            .filter(([_, q]) => Number(q) > 0)
            .map(([c]) => c);

          await conn.query(
            `UPDATE ${tables.products} SET
              stock_fisico = ?, stock_disponible = ?, costo_compra = ?, stock_por_color = ?, colores_disponibles = ?, updated_at = ?
             WHERE id = ?`,
            [
              curPhys + newQty,
              newTotalStock,
              weightedCost,
              JSON.stringify(colorStock),
              JSON.stringify(activeColors),
              now,
              productId,
            ]
          );

          if (selectedColor) {
            await conn.query(
              `INSERT INTO ${tables.productColors} (id, producto_id, color, stock_fisico, stock_reservado, stock_disponible)
               VALUES (?, ?, ?, ?, 0, ?)
               ON DUPLICATE KEY UPDATE stock_fisico = stock_fisico + ?, stock_disponible = stock_disponible + ?`,
              [`col-${productId}-${selectedColor}`, productId, selectedColor, newQty, newQty, newQty, newQty]
            ).catch(() => {});
          }
        }
      }

      // 2. Insertar en tabla de compras
      await conn.query(
        `INSERT INTO ${tables.purchases}
          (id, numero_compra, proveedor, fecha, producto_id, codigo_producto, nombre_producto, categoria, color_seleccionado, cantidad, costo_unitario, total, es_producto_nuevo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          purchaseNumber,
          supplier,
          date || now.toISOString().slice(0, 10),
          productId,
          productCode,
          productName,
          category || 'Carteras',
          selectedColor || null,
          Number(quantity),
          Number(unitCost),
          calcTotal,
          isNewProduct ? 1 : 0,
          now,
        ]
      );

      return {
        id,
        purchaseNumber,
        supplier,
        date: date || now.toISOString().slice(0, 10),
        productId,
        productCode,
        productName,
        category: category || 'Carteras',
        selectedColor,
        quantity: Number(quantity),
        unitCost: Number(unitCost),
        total: calcTotal,
        isNewProduct: Boolean(isNewProduct),
        createdAt: now.toISOString(),
      };
    });

    return res.status(201).json({ success: true, purchase: result });
  } catch (err: any) {
    console.error('Error al registrar compra:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
});
