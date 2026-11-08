/**
 * SISTEMA LYLA - Rutas de Gastos Operativos y Categorías
 * Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected, query, getTableMap, inMemoryStore } from '../db.js';
import type { RowDataPacket } from 'mysql2/promise';

export const expensesRouter = Router();

// =====================================================================
// GET /api/expenses
// =====================================================================
expensesRouter.get('/', async (req: Request, res: Response) => {
  const { date, category } = req.query;

  if (!isDbConnected()) {
    let list = [...inMemoryStore.expenses];
    if (date && typeof date === 'string') {
      list = list.filter((e) => e.date.startsWith(date));
    }
    if (category && typeof category === 'string') {
      list = list.filter((e) => e.category.toLowerCase() === category.toLowerCase());
    }
    return res.json(list);
  }

  try {
    const tables = getTableMap();
    let sql = `SELECT * FROM ${tables.expenses} WHERE 1=1`;
    const params: any[] = [];

    if (date && typeof date === 'string') {
      sql += ' AND DATE(fecha) = ?';
      params.push(date.slice(0, 10));
    }

    if (category && typeof category === 'string') {
      sql += ' AND (categoria = ? OR category = ?)';
      params.push(category.trim(), category.trim());
    }

    sql += ' ORDER BY fecha DESC';

    const rows = await query<RowDataPacket[]>(sql, params);
    const result = rows.map((r) => ({
      id: String(r.id),
      category: String(r.categoria ?? r.category ?? 'Alquiler'),
      description: String(r.descripcion ?? r.description ?? ''),
      amount: Number(r.monto ?? r.amount ?? 0),
      paymentMethod: r.metodo_pago ?? r.payment_method ?? 'Efectivo',
      responsible: String(r.responsable ?? r.responsible ?? 'Roly'),
      date: r.fecha ? new Date(r.fecha).toISOString() : new Date().toISOString(),
      shiftClosedId: r.jornada_id ?? r.shift_closed_id ?? undefined,
    }));

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================================
// POST /api/expenses
// =====================================================================
expensesRouter.post('/', async (req: Request, res: Response) => {
  const { category, description, amount, paymentMethod = 'Efectivo', responsible = 'Roly', date } = req.body;

  if (!description || !amount || Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Descripción y Monto válido son requeridos' });
  }

  const id = req.body.id || `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = date ? new Date(date) : new Date();

  if (!isDbConnected()) {
    const newExp = {
      id,
      category: category || 'Alquiler',
      description,
      amount: Number(amount),
      paymentMethod,
      responsible,
      date: now.toISOString(),
    };
    inMemoryStore.expenses.unshift(newExp);
    return res.status(201).json({ success: true, expense: newExp });
  }

  try {
    const tables = getTableMap();
    await query(
      `INSERT INTO ${tables.expenses}
        (id, categoria, descripcion, monto, metodo_pago, responsable, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, category || 'Alquiler', description, Number(amount), paymentMethod, responsible, now]
    );

    return res.status(201).json({
      success: true,
      expense: {
        id,
        category: category || 'Alquiler',
        description,
        amount: Number(amount),
        paymentMethod,
        responsible,
        date: now.toISOString(),
      },
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// =====================================================================
// PUT /api/expenses/:id
// =====================================================================
expensesRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { category, description, amount, paymentMethod, responsible } = req.body;

  if (!isDbConnected()) {
    const idx = inMemoryStore.expenses.findIndex((e) => e.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Gasto no encontrado' });
    inMemoryStore.expenses[idx] = { ...inMemoryStore.expenses[idx], ...req.body };
    return res.json({ success: true, expense: inMemoryStore.expenses[idx] });
  }

  try {
    const tables = getTableMap();
    await query(
      `UPDATE ${tables.expenses} SET
        categoria = COALESCE(?, categoria),
        descripcion = COALESCE(?, descripcion),
        monto = COALESCE(?, monto),
        metodo_pago = COALESCE(?, metodo_pago),
        responsable = COALESCE(?, responsable)
       WHERE id = ?`,
      [category, description, amount !== undefined ? Number(amount) : null, paymentMethod, responsible, id]
    );
    return res.json({ success: true, message: 'Gasto actualizado correctamente' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// =====================================================================
// DELETE /api/expenses/:id
// =====================================================================
expensesRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!isDbConnected()) {
    inMemoryStore.expenses = inMemoryStore.expenses.filter((e) => e.id !== id);
    return res.json({ success: true, message: 'Gasto eliminado correctamente' });
  }

  try {
    const tables = getTableMap();
    await query(`DELETE FROM ${tables.expenses} WHERE id = ?`, [id]);
    return res.json({ success: true, message: 'Gasto eliminado correctamente' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================================
// CATEGORÍAS DE GASTOS
// =====================================================================
expensesRouter.get('/categories/all', async (_req: Request, res: Response) => {
  if (!isDbConnected()) {
    return res.json(inMemoryStore.expenseCategories);
  }

  try {
    const tables = getTableMap();
    const rows = await query<RowDataPacket[]>(
      `SELECT nombre FROM ${tables.expenseCategories} WHERE activa = 1 ORDER BY nombre ASC`
    ).catch(async () => {
      return inMemoryStore.expenseCategories.map((c) => ({ nombre: c }));
    });
    return res.json(rows.map((r) => r.nombre));
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

expensesRouter.post('/categories', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'El nombre de la categoría es requerido' });
  }
  const cleanName = name.trim();
  const id = `cat-exp-${cleanName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

  if (!isDbConnected()) {
    if (!inMemoryStore.expenseCategories.includes(cleanName)) {
      inMemoryStore.expenseCategories.push(cleanName);
    }
    return res.status(201).json({ success: true, name: cleanName });
  }

  try {
    const tables = getTableMap();
    await query(
      `INSERT INTO ${tables.expenseCategories} (id, nombre, activa) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE activa = 1`,
      [id, cleanName]
    );
    return res.status(201).json({ success: true, name: cleanName });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});
