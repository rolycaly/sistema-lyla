/**
 * SISTEMA LYLA - Rutas de Productos y Categorías
 * Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected, query, withTransaction, getTableMap, inMemoryStore } from '../db.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export const productsRouter = Router();

// Helper para normalizar producto desde MySQL a formato TypeScript
export function mapDbProductToDto(row: any, hidePurchaseCost = false) {
  let availableColors: string[] = [];
  let colorStock: Record<string, number> = {};

  try {
    const rawColors = row.colores_disponibles ?? row.available_colors;
    if (typeof rawColors === 'string') {
      availableColors = JSON.parse(rawColors);
    } else if (Array.isArray(rawColors)) {
      availableColors = rawColors;
    }
  } catch (e) {
    availableColors = [];
  }

  try {
    const rawCStock = row.stock_por_color ?? row.color_stock;
    if (typeof rawCStock === 'string') {
      colorStock = JSON.parse(rawCStock);
    } else if (typeof rawCStock === 'object' && rawCStock !== null) {
      colorStock = rawCStock;
    }
  } catch (e) {
    colorStock = {};
  }

  const physicalStock = Number(row.stock_fisico ?? row.physical_stock ?? 0);
  const reservedStock = Number(row.stock_reservado ?? row.reserved_stock ?? 0);
  const stock = Number(row.stock_disponible ?? row.stock ?? Math.max(0, physicalStock - reservedStock));

  return {
    id: String(row.id),
    code: String(row.codigo ?? row.code ?? ''),
    name: String(row.nombre ?? row.name ?? ''),
    category: String(row.categoria ?? row.category ?? 'Carteras'),
    color: String(row.color ?? ''),
    availableColors,
    colorStock,
    brand: String(row.marca ?? row.brand ?? 'Lyla Atelier'),
    // Regla de seguridad: Si hidePurchaseCost = true, no se envía el costo de compra al frontend de POS
    purchaseCost: hidePurchaseCost ? 0 : Number(row.costo_compra ?? row.purchase_cost ?? 0),
    salePrice: Number(row.precio_venta ?? row.sale_price ?? 0),
    stock,
    physicalStock,
    reservedStock,
    imageUrl: String(row.imagen_url ?? row.image_url ?? ''),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

// =====================================================================
// GET /api/products
// =====================================================================
productsRouter.get('/', async (req: Request, res: Response) => {
  const { category, search, hideCost } = req.query;
  const hidePurchaseCost = hideCost === 'true' || hideCost === '1';

  if (!isDbConnected()) {
    let prods = [...inMemoryStore.products];
    if (category && typeof category === 'string' && category.trim()) {
      prods = prods.filter((p) => p.category.toLowerCase() === category.toLowerCase());
    }
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.toLowerCase();
      prods = prods.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
    }
    if (hidePurchaseCost) {
      prods = prods.map((p) => ({ ...p, purchaseCost: 0 }));
    }
    return res.json(prods);
  }

  try {
    const tables = getTableMap();
    let sql = `SELECT * FROM ${tables.products} WHERE 1=1`;
    const params: any[] = [];

    if (category && typeof category === 'string' && category.trim()) {
      sql += ' AND (categoria = ? OR category = ?)';
      params.push(category.trim(), category.trim());
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.trim()}%`;
      sql += ' AND (codigo LIKE ? OR code LIKE ? OR nombre LIKE ? OR name LIKE ?)';
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY created_at DESC';

    const rows = await query<RowDataPacket[]>(sql, params);
    const result = rows.map((r) => mapDbProductToDto(r, hidePurchaseCost));
    return res.json(result);
  } catch (err: any) {
    console.error('Error al obtener productos:', err);
    return res.status(500).json({ success: false, message: `Error en base de datos: ${err.message}` });
  }
});

// =====================================================================
// GET /api/products/:id
// =====================================================================
productsRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!isDbConnected()) {
    const prod = inMemoryStore.products.find((p) => p.id === id);
    if (!prod) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    return res.json(prod);
  }

  try {
    const tables = getTableMap();
    const rows = await query<RowDataPacket[]>(`SELECT * FROM ${tables.products} WHERE id = ? LIMIT 1`, [id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }
    return res.json(mapDbProductToDto(rows[0]));
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================================
// POST /api/products
// =====================================================================
productsRouter.post('/', async (req: Request, res: Response) => {
  const {
    code,
    name,
    category,
    color = '',
    availableColors = [],
    colorStock = {},
    brand = 'Lyla Atelier',
    purchaseCost = 0,
    salePrice = 0,
    stock = 0,
    physicalStock,
    reservedStock = 0,
    imageUrl = '',
  } = req.body;

  if (!code || !name) {
    return res.status(400).json({ success: false, message: 'Código y Nombre son obligatorios' });
  }

  const id = req.body.id || `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const physStock = physicalStock !== undefined ? Number(physicalStock) : Number(stock);
  const resStock = Number(reservedStock);
  const dispStock = Math.max(0, physStock - resStock);

  if (!isDbConnected()) {
    const exists = inMemoryStore.products.find((p) => p.code.toLowerCase() === code.trim().toLowerCase());
    if (exists) {
      return res.status(400).json({ success: false, message: `El código ${code} ya existe en el inventario` });
    }
    const newProd = {
      id,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      category: category || 'Carteras',
      color,
      availableColors,
      colorStock,
      brand,
      purchaseCost: Number(purchaseCost),
      salePrice: Number(salePrice),
      stock: dispStock,
      physicalStock: physStock,
      reservedStock: resStock,
      imageUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    inMemoryStore.products.unshift(newProd);
    return res.status(201).json({ success: true, product: newProd });
  }

  try {
    const result = await withTransaction(async (conn, tables) => {
      // 1. Validar unicidad de código
      const [existing] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM ${tables.products} WHERE codigo = ? OR code = ? LIMIT 1`,
        [code.trim(), code.trim()]
      );
      if (existing.length > 0) {
        throw new Error(`El código ${code} ya está registrado en el inventario.`);
      }

      // 2. Insertar producto
      const now = new Date();
      await conn.query(
        `INSERT INTO ${tables.products} 
          (id, codigo, nombre, categoria, color, colores_disponibles, stock_por_color, marca, costo_compra, precio_venta, stock_fisico, stock_reservado, stock_disponible, imagen_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          code.trim().toUpperCase(),
          name.trim(),
          category || 'Carteras',
          color,
          JSON.stringify(availableColors || []),
          JSON.stringify(colorStock || {}),
          brand,
          Number(purchaseCost),
          Number(salePrice),
          physStock,
          resStock,
          dispStock,
          imageUrl,
          now,
          now,
        ]
      );

      // 3. Sincronizar tabla relacional de variantes de color (si existe)
      if (colorStock && typeof colorStock === 'object') {
        for (const [colName, q] of Object.entries(colorStock)) {
          const qty = Number(q) || 0;
          await conn.query(
            `INSERT INTO ${tables.productColors} (id, producto_id, color, stock_fisico, stock_reservado, stock_disponible)
             VALUES (?, ?, ?, ?, 0, ?)
             ON DUPLICATE KEY UPDATE stock_fisico = VALUES(stock_fisico), stock_disponible = VALUES(stock_disponible)`,
            [`col-${id}-${colName}`, id, colName, qty, qty]
          ).catch(() => {}); // Omitir silenciosamente si tabla inventario_colores no existe
        }
      }

      return {
        id,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        category: category || 'Carteras',
        color,
        availableColors,
        colorStock,
        brand,
        purchaseCost: Number(purchaseCost),
        salePrice: Number(salePrice),
        stock: dispStock,
        physicalStock: physStock,
        reservedStock: resStock,
        imageUrl,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    });

    return res.status(201).json({ success: true, product: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// =====================================================================
// PUT /api/products/:id
// =====================================================================
productsRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    code,
    name,
    category,
    color,
    availableColors,
    colorStock,
    brand,
    purchaseCost,
    salePrice,
    stock,
    physicalStock,
    reservedStock,
    imageUrl,
  } = req.body;

  if (!isDbConnected()) {
    const idx = inMemoryStore.products.findIndex((p) => p.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    const existing = inMemoryStore.products[idx];
    const updated = {
      ...existing,
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    inMemoryStore.products[idx] = updated;
    return res.json({ success: true, product: updated });
  }

  try {
    const result = await withTransaction(async (conn, tables) => {
      const [existing] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM ${tables.products} WHERE id = ? LIMIT 1`,
        [id]
      );
      if (existing.length === 0) throw new Error('Producto no encontrado');

      const current = existing[0];
      const now = new Date();
      const updatedCode = (code ?? current.codigo ?? current.code).trim().toUpperCase();
      const updatedName = (name ?? current.nombre ?? current.name).trim();
      const updatedCategory = category ?? current.categoria ?? current.category;
      const updatedColor = color ?? current.color ?? '';
      const updatedAvailableColors = availableColors ?? current.colores_disponibles ?? current.available_colors ?? [];
      const updatedColorStock = colorStock ?? current.stock_por_color ?? current.color_stock ?? {};
      const updatedBrand = brand ?? current.marca ?? current.brand ?? 'Lyla Atelier';
      const updatedPurchaseCost = purchaseCost !== undefined ? Number(purchaseCost) : Number(current.costo_compra ?? current.purchase_cost);
      const updatedSalePrice = salePrice !== undefined ? Number(salePrice) : Number(current.precio_venta ?? current.sale_price);
      const updatedPhysical = physicalStock !== undefined ? Number(physicalStock) : Number(current.stock_fisico ?? current.physical_stock);
      const updatedReserved = reservedStock !== undefined ? Number(reservedStock) : Number(current.stock_reservado ?? current.reserved_stock);
      const updatedStock = stock !== undefined ? Number(stock) : Math.max(0, updatedPhysical - updatedReserved);
      const updatedImg = imageUrl ?? current.imagen_url ?? current.image_url;

      await conn.query(
        `UPDATE ${tables.products} SET
          codigo = ?, nombre = ?, categoria = ?, color = ?, colores_disponibles = ?, stock_por_color = ?,
          marca = ?, costo_compra = ?, precio_venta = ?, stock_fisico = ?, stock_reservado = ?,
          stock_disponible = ?, imagen_url = ?, updated_at = ?
         WHERE id = ?`,
        [
          updatedCode,
          updatedName,
          updatedCategory,
          updatedColor,
          JSON.stringify(updatedAvailableColors),
          JSON.stringify(updatedColorStock),
          updatedBrand,
          updatedPurchaseCost,
          updatedSalePrice,
          updatedPhysical,
          updatedReserved,
          updatedStock,
          updatedImg,
          now,
          id,
        ]
      );

      // Actualizar tabla relacional de variantes
      if (updatedColorStock && typeof updatedColorStock === 'object') {
        for (const [colName, q] of Object.entries(updatedColorStock)) {
          const qty = Number(q) || 0;
          await conn.query(
            `INSERT INTO ${tables.productColors} (id, producto_id, color, stock_fisico, stock_reservado, stock_disponible)
             VALUES (?, ?, ?, ?, 0, ?)
             ON DUPLICATE KEY UPDATE stock_fisico = VALUES(stock_fisico), stock_disponible = VALUES(stock_disponible)`,
            [`col-${id}-${colName}`, id, colName, qty, qty]
          ).catch(() => {});
        }
      }

      return {
        id,
        code: updatedCode,
        name: updatedName,
        category: updatedCategory,
        color: updatedColor,
        availableColors: updatedAvailableColors,
        colorStock: updatedColorStock,
        brand: updatedBrand,
        purchaseCost: updatedPurchaseCost,
        salePrice: updatedSalePrice,
        stock: updatedStock,
        physicalStock: updatedPhysical,
        reservedStock: updatedReserved,
        imageUrl: updatedImg,
        updatedAt: now.toISOString(),
      };
    });

    return res.json({ success: true, product: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// =====================================================================
// DELETE /api/products/:id
// =====================================================================
productsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!isDbConnected()) {
    inMemoryStore.products = inMemoryStore.products.filter((p) => p.id !== id);
    return res.json({ success: true, message: 'Producto eliminado correctamente' });
  }

  try {
    const tables = getTableMap();
    await query(`DELETE FROM ${tables.products} WHERE id = ?`, [id]);
    return res.json({ success: true, message: 'Producto eliminado correctamente' });
  } catch (err: any) {
    // Si falla por clave foránea, hacer baja lógica
    try {
      const tables = getTableMap();
      await query(`UPDATE ${tables.products} SET activo = 0 WHERE id = ?`, [id]);
      return res.json({ success: true, message: 'Producto desactivado lógicamente por contener ventas o reservas asociadas.' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
});

// =====================================================================
// GESTIÓN DE CATEGORÍAS DE PRODUCTOS
// =====================================================================
productsRouter.get('/categories/all', async (_req: Request, res: Response) => {
  if (!isDbConnected()) {
    return res.json(inMemoryStore.productCategories);
  }

  try {
    const tables = getTableMap();
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM ${tables.productCategories} ORDER BY nombre ASC`
    ).catch(async () => {
      // Si la tabla categorias_productos no existe, devolver valores únicos de productos
      const prods = await query<RowDataPacket[]>(`SELECT DISTINCT categoria FROM ${tables.products}`);
      return prods.map((p, idx) => ({ id: `cat-${idx}`, nombre: p.categoria, activa: 1 }));
    });

    const result = rows.map((r: any) => ({
      id: String(r.id),
      name: String(r.nombre),
      active: Boolean(r.activa),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    }));
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

productsRouter.post('/categories', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'El nombre de la categoría es obligatorio' });
  }
  const cleanName = name.trim();
  const id = `cat-${cleanName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

  if (!isDbConnected()) {
    const exists = inMemoryStore.productCategories.some((c) => c.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) return res.status(400).json({ success: false, message: 'La categoría ya existe' });
    const newCat = { id, name: cleanName, active: true };
    inMemoryStore.productCategories.push(newCat);
    return res.status(201).json({ success: true, category: newCat });
  }

  try {
    const tables = getTableMap();
    await query(
      `INSERT INTO ${tables.productCategories} (id, nombre, activa) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE activa = 1`,
      [id, cleanName]
    );
    return res.status(201).json({ success: true, category: { id, name: cleanName, active: true } });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

productsRouter.put('/categories/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, active } = req.body;

  if (!isDbConnected()) {
    const idx = inMemoryStore.productCategories.findIndex((c) => c.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    if (name) inMemoryStore.productCategories[idx].name = name.trim();
    if (active !== undefined) inMemoryStore.productCategories[idx].active = Boolean(active);
    return res.json({ success: true, category: inMemoryStore.productCategories[idx] });
  }

  try {
    const tables = getTableMap();
    if (name !== undefined && active !== undefined) {
      await query(`UPDATE ${tables.productCategories} SET nombre = ?, activa = ? WHERE id = ?`, [name.trim(), active ? 1 : 0, id]);
    } else if (name !== undefined) {
      await query(`UPDATE ${tables.productCategories} SET nombre = ? WHERE id = ?`, [name.trim(), id]);
    } else if (active !== undefined) {
      await query(`UPDATE ${tables.productCategories} SET activa = ? WHERE id = ?`, [active ? 1 : 0, id]);
    }
    return res.json({ success: true, message: 'Categoría actualizada correctamente' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});
