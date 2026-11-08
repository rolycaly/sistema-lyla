/**
 * SISTEMA LYLA - Rutas de Proveedores
 * Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected, query, getTableMap, inMemoryStore } from '../db.js';
import type { RowDataPacket } from 'mysql2/promise';

export const suppliersRouter = Router();

// =====================================================================
// GET /api/suppliers
// =====================================================================
suppliersRouter.get('/', async (_req: Request, res: Response) => {
  if (!isDbConnected()) {
    return res.json(inMemoryStore.suppliers);
  }

  try {
    const tables = getTableMap();
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM ${tables.suppliers} WHERE activo = 1 ORDER BY nombre ASC`
    ).catch(async () => {
      // Si la tabla proveedores aún no tiene datos, extraer proveedores únicos de compras
      const distinct = await query<RowDataPacket[]>(`SELECT DISTINCT proveedor as nombre FROM ${tables.purchases}`);
      return distinct.map((d, i) => ({ id: `prov-${i}`, nombre: d.nombre, activo: 1 }));
    });

    const result = rows.map((r: any) => ({
      id: String(r.id),
      name: String(r.nombre),
      phone: r.telefono ?? r.contacto ?? undefined,
      email: r.email ?? undefined,
      city: r.ciudad ?? 'Santa Cruz',
      active: Boolean(r.activo),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    }));
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================================
// POST /api/suppliers
// =====================================================================
suppliersRouter.post('/', async (req: Request, res: Response) => {
  const { name, phone, email, city = 'Santa Cruz' } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'El nombre del proveedor es obligatorio' });
  }

  const id = `prov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  if (!isDbConnected()) {
    const newProv = { id, name: name.trim(), phone, email, city, active: true };
    inMemoryStore.suppliers.push(newProv);
    return res.status(201).json({ success: true, supplier: newProv });
  }

  try {
    const tables = getTableMap();
    await query(
      `INSERT INTO ${tables.suppliers} (id, nombre, contacto, email, ciudad, activo)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [id, name.trim(), phone || null, email || null, city]
    );
    return res.status(201).json({ success: true, supplier: { id, name: name.trim(), phone, email, city, active: true } });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// =====================================================================
// PUT /api/suppliers/:id
// =====================================================================
suppliersRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, phone, email, city } = req.body;

  if (!isDbConnected()) {
    const idx = inMemoryStore.suppliers.findIndex((s) => s.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
    inMemoryStore.suppliers[idx] = { ...inMemoryStore.suppliers[idx], ...req.body };
    return res.json({ success: true, supplier: inMemoryStore.suppliers[idx] });
  }

  try {
    const tables = getTableMap();
    await query(
      `UPDATE ${tables.suppliers} SET
        nombre = COALESCE(?, nombre),
        contacto = COALESCE(?, contacto),
        email = COALESCE(?, email),
        ciudad = COALESCE(?, ciudad)
       WHERE id = ?`,
      [name, phone, email, city, id]
    );
    return res.json({ success: true, message: 'Proveedor actualizado correctamente' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// =====================================================================
// DELETE /api/suppliers/:id (Baja Lógica)
// =====================================================================
suppliersRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!isDbConnected()) {
    inMemoryStore.suppliers = inMemoryStore.suppliers.filter((s) => s.id !== id);
    return res.json({ success: true, message: 'Proveedor eliminado' });
  }

  try {
    const tables = getTableMap();
    await query(`UPDATE ${tables.suppliers} SET activo = 0 WHERE id = ?`, [id]);
    return res.json({ success: true, message: 'Proveedor desactivado lógicamente' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
