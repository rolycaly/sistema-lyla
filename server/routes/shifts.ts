/**
 * SISTEMA LYLA - Rutas de Jornadas y Arqueo Diario
 * Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected, query, withTransaction, getTableMap, inMemoryStore } from '../db.js';
import type { RowDataPacket } from 'mysql2/promise';

export const shiftsRouter = Router();

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// =====================================================================
// GET /api/shifts/active
// =====================================================================
shiftsRouter.get('/active', async (_req: Request, res: Response) => {
  if (!isDbConnected()) {
    const openings = inMemoryStore.shiftOpenings || [];
    const closes = inMemoryStore.shifts || [];
    const active = openings.find((o) => {
      const closed = closes.find((s) => s.date === o.date);
      return !closed || closed.isReopened;
    });
    return res.json({ hasActiveShift: Boolean(active), activeShift: active || null });
  }

  try {
    const tables = getTableMap();
    // Consultar última jornada registrada
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM ${tables.shifts} ORDER BY created_at DESC, fecha DESC LIMIT 1`
    ).catch(async () => {
      // Fallback a shift_openings si existen tablas separadas
      return await query<RowDataPacket[]>(`SELECT * FROM shift_openings ORDER BY date DESC LIMIT 1`);
    });

    if (rows.length === 0) {
      return res.json({ hasActiveShift: false, activeShift: null });
    }

    const last = rows[0];
    const isClosed = (last.cerrada_at !== null && last.cerrada_at !== undefined) || 
                     (last.closed_at !== null && last.closed_at !== undefined);
    const isReopened = Boolean(last.reabierta ?? last.is_reopened ?? 0);

    const isActive = !isClosed || isReopened;

    const activeShift = isActive
      ? {
          id: String(last.id),
          date: last.fecha ? new Date(last.fecha).toISOString().slice(0, 10) : (last.date || ''),
          openedAt: last.abierta_at ?? last.opened_at ? new Date(last.abierta_at ?? last.opened_at).toISOString() : new Date().toISOString(),
          openedBy: last.abierta_por ?? last.opened_by ?? 'Roly',
          initialCash: Number(last.caja_inicial_efectivo ?? last.initial_cash ?? 0),
          initialQr: Number(last.saldo_inicial_qr ?? last.initial_qr ?? 0),
          totalInitial: Number(last.total_inicial ?? 0),
          notes: last.notas ?? last.notes ?? undefined,
        }
      : null;

    return res.json({ hasActiveShift: isActive, activeShift });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================================
// POST /api/shifts/open (Apertura de Jornada)
// =====================================================================
shiftsRouter.post('/open', async (req: Request, res: Response) => {
  const { date, openedBy = 'Roly', initialCash = 100, initialQr = 0, totalInitial, notes } = req.body;

  if (!date) {
    return res.status(400).json({ success: false, message: 'La fecha de la jornada es requerida' });
  }

  const id = `shift-${date}-${Date.now()}`;
  const now = new Date();
  const cash = Number(initialCash);
  const qr = Number(initialQr);
  const tot = totalInitial !== undefined ? Number(totalInitial) : cash + qr;

  if (!isDbConnected()) {
    // Validar que no haya otra jornada activa abierta
    const unclosed = inMemoryStore.shiftOpenings.find((o) => {
      if (o.date === date) return false;
      const closed = inMemoryStore.shifts.find((s) => s.date === o.date);
      return !closed || closed.isReopened;
    });
    if (unclosed) {
      return res.status(400).json({
        success: false,
        message: `Ya existe una jornada abierta actualmente (${unclosed.date} por ${unclosed.openedBy}). Debe cerrarla primero.`,
      });
    }

    const newOpening = {
      id,
      date,
      openedAt: now.toISOString(),
      openedBy,
      initialCash: cash,
      initialQr: qr,
      totalInitial: tot,
      notes,
    };
    inMemoryStore.shiftOpenings.unshift(newOpening);
    return res.status(201).json({ success: true, opening: newOpening });
  }

  try {
    const result = await withTransaction(async (conn, tables) => {
      // 1. Validar si ya hay una jornada abierta
      const [openShifts] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM ${tables.shifts} 
         WHERE (cerrada_at IS NULL OR closed_at IS NULL OR reabierta = 1 OR is_reopened = 1)
           AND (fecha != ? AND date != ?)
         LIMIT 1`,
        [date, date]
      ).catch(() => [[]]);

      if (openShifts && openShifts.length > 0) {
        const os = openShifts[0];
        throw new Error(
          `Existe una jornada anterior abierta (${os.fecha ?? os.date} por ${os.abierta_por ?? os.opened_by}). Debe cerrarla antes de iniciar una nueva.`
        );
      }

      // 2. Insertar apertura en `jornadas`
      await conn.query(
        `INSERT INTO ${tables.shifts}
          (id, fecha, abierta_at, abierta_por, caja_inicial_efectivo, saldo_inicial_qr, total_inicial, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          abierta_at = VALUES(abierta_at), abierta_por = VALUES(abierta_por),
          caja_inicial_efectivo = VALUES(caja_inicial_efectivo), saldo_inicial_qr = VALUES(saldo_inicial_qr),
          total_inicial = VALUES(total_inicial)`,
        [id, date, now, openedBy, cash, qr, tot, notes || null]
      );

      return {
        id,
        date,
        openedAt: now.toISOString(),
        openedBy,
        initialCash: cash,
        initialQr: qr,
        totalInitial: tot,
        notes,
      };
    });

    return res.status(201).json({ success: true, opening: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// =====================================================================
// POST /api/shifts/close (Cierre y Arqueo Completo de Caja y QR)
// =====================================================================
shiftsRouter.post('/close', async (req: Request, res: Response) => {
  const {
    date,
    closedBy = 'Roly',
    initialCash = 0,
    initialQr = 0,
    totalInitial = 0,
    totalSales = 0,
    cashSales = 0,
    qrSales = 0,
    salesCount = 0,
    totalDiscounts = 0,
    totalExpenses = 0,
    cashExpenses = 0,
    qrExpenses = 0,
    expensesByCategory = {},
    operationalFlow = 0,
    realCashCounted,
    realQrVerified,
    differenceReason,
    notes,
  } = req.body;

  if (!date) {
    return res.status(400).json({ success: false, message: 'La fecha de la jornada es obligatoria' });
  }

  // Fórmulas Obligatorias del Arqueo
  const expectedCash = round2(Number(initialCash) + Number(cashSales) - Number(cashExpenses));
  const expectedQr = round2(Number(initialQr) + Number(qrSales) - Number(qrExpenses));
  const expectedTotal = round2(expectedCash + expectedQr);

  const realCash = realCashCounted !== undefined ? round2(Number(realCashCounted)) : expectedCash;
  const realQr = realQrVerified !== undefined ? round2(Number(realQrVerified)) : expectedQr;
  const realTotal = round2(realCash + realQr);

  const cashDiff = round2(realCash - expectedCash);
  const qrDiff = round2(realQr - expectedQr);
  const totalDiff = round2(realTotal - expectedTotal);

  const hasDiff = Math.abs(cashDiff) > 0.01 || Math.abs(qrDiff) > 0.01;
  // Regla de Negocio: Si existe diferencia, la justificación es obligatoria
  if (hasDiff && (!differenceReason || !String(differenceReason).trim())) {
    return res.status(400).json({
      success: false,
      message: 'Existe una diferencia en el arqueo (Faltante o Sobrante). Es OBLIGATORIO registrar una justificación antes de cerrar la jornada.',
    });
  }

  const now = new Date();
  const id = `close-${date}-${Date.now()}`;

  if (!isDbConnected()) {
    const shiftCloseData = {
      id,
      date,
      closedAt: now.toISOString(),
      closedBy,
      initialCash: Number(initialCash),
      initialQr: Number(initialQr),
      totalInitial: Number(totalInitial),
      totalSales: Number(totalSales),
      cashSales: Number(cashSales),
      qrSales: Number(qrSales),
      salesCount: Number(salesCount),
      totalDiscounts: Number(totalDiscounts),
      totalExpenses: Number(totalExpenses),
      cashExpenses: Number(cashExpenses),
      qrExpenses: Number(qrExpenses),
      expensesByCategory,
      operationalFlow: Number(operationalFlow),
      finalExpectedCash: expectedCash,
      finalExpectedQr: expectedQr,
      expectedTotalMoney: expectedTotal,
      realCashCounted: realCash,
      realQrVerified: realQr,
      realTotalMoney: realTotal,
      cashDifference: cashDiff,
      qrDifference: qrDiff,
      totalDifference: totalDiff,
      differenceReason: differenceReason || null,
      notes,
    };
    inMemoryStore.shifts.unshift(shiftCloseData);
    return res.json({ success: true, shiftClose: shiftCloseData });
  }

  try {
    const result = await withTransaction(async (conn, tables) => {
      await conn.query(
        `INSERT INTO ${tables.shifts}
          (id, fecha, cerrada_at, cerrada_por, caja_inicial_efectivo, saldo_inicial_qr, total_inicial,
           total_ventas, ventas_efectivo, ventas_qr, cantidad_ventas, total_descuentos,
           total_gastos, gastos_efectivo, gastos_qr, gastos_por_categoria, flujo_operativo,
           efectivo_esperado, qr_esperado, total_esperado, efectivo_real_contado, qr_real_verificado, total_real_contado,
           diferencia_efectivo, diferencia_qr, diferencia_total, justificacion_diferencia, reabierta, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
         ON DUPLICATE KEY UPDATE
          cerrada_at = VALUES(cerrada_at), cerrada_por = VALUES(cerrada_por),
          total_ventas = VALUES(total_ventas), ventas_efectivo = VALUES(ventas_efectivo), ventas_qr = VALUES(ventas_qr),
          total_gastos = VALUES(total_gastos), gastos_efectivo = VALUES(gastos_efectivo), gastos_qr = VALUES(gastos_qr),
          efectivo_esperado = VALUES(efectivo_esperado), qr_esperado = VALUES(qr_esperado), total_esperado = VALUES(total_esperado),
          efectivo_real_contado = VALUES(efectivo_real_contado), qr_real_verificado = VALUES(qr_real_verificado),
          diferencia_efectivo = VALUES(diferencia_efectivo), diferencia_qr = VALUES(diferencia_qr),
          diferencia_total = VALUES(diferencia_total), justificacion_diferencia = VALUES(justificacion_diferencia),
          reabierta = 0`,
        [
          id,
          date,
          now,
          closedBy,
          Number(initialCash),
          Number(initialQr),
          Number(totalInitial),
          Number(totalSales),
          Number(cashSales),
          Number(qrSales),
          Number(salesCount),
          Number(totalDiscounts),
          Number(totalExpenses),
          Number(cashExpenses),
          Number(qrExpenses),
          JSON.stringify(expensesByCategory || {}),
          Number(operationalFlow),
          expectedCash,
          expectedQr,
          expectedTotal,
          realCash,
          realQr,
          realTotal,
          cashDiff,
          qrDiff,
          totalDiff,
          differenceReason || null,
          notes || null,
        ]
      );

      return {
        id,
        date,
        closedAt: now.toISOString(),
        closedBy,
        initialCash: Number(initialCash),
        initialQr: Number(initialQr),
        totalInitial: Number(totalInitial),
        totalSales: Number(totalSales),
        cashSales: Number(cashSales),
        qrSales: Number(qrSales),
        finalExpectedCash: expectedCash,
        finalExpectedQr: expectedQr,
        expectedTotalMoney: expectedTotal,
        realCashCounted: realCash,
        realQrVerified: realQr,
        realTotalMoney: realTotal,
        cashDifference: cashDiff,
        qrDifference: qrDiff,
        totalDifference: totalDiff,
        differenceReason,
      };
    });

    return res.json({ success: true, shiftClose: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// =====================================================================
// GET /api/shifts/history
// =====================================================================
shiftsRouter.get('/history', async (_req: Request, res: Response) => {
  if (!isDbConnected()) {
    return res.json(inMemoryStore.shifts);
  }

  try {
    const tables = getTableMap();
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM ${tables.shifts} WHERE cerrada_at IS NOT NULL OR closed_at IS NOT NULL ORDER BY fecha DESC, cerrada_at DESC`
    );

    const result = rows.map((r) => ({
      id: String(r.id),
      date: r.fecha ? new Date(r.fecha).toISOString().slice(0, 10) : (r.date || ''),
      openedAt: r.abierta_at ?? r.opened_at ? new Date(r.abierta_at ?? r.opened_at).toISOString() : undefined,
      openedBy: r.abierta_por ?? r.opened_by ?? undefined,
      closedAt: r.cerrada_at ?? r.closed_at ? new Date(r.cerrada_at ?? r.closed_at).toISOString() : new Date().toISOString(),
      closedBy: String(r.cerrada_por ?? r.closed_by ?? 'Roly'),
      initialCash: Number(r.caja_inicial_efectivo ?? r.initial_cash ?? 0),
      initialQr: Number(r.saldo_inicial_qr ?? r.initial_qr ?? 0),
      totalInitial: Number(r.total_inicial ?? 0),
      totalSales: Number(r.total_ventas ?? r.total_sales ?? 0),
      cashSales: Number(r.ventas_efectivo ?? r.cash_sales ?? 0),
      qrSales: Number(r.ventas_qr ?? r.qr_sales ?? 0),
      salesCount: Number(r.cantidad_ventas ?? r.sales_count ?? 0),
      totalDiscounts: Number(r.total_descuentos ?? r.total_discounts ?? 0),
      totalExpenses: Number(r.total_gastos ?? r.total_expenses ?? 0),
      cashExpenses: Number(r.gastos_efectivo ?? r.cash_expenses ?? 0),
      qrExpenses: Number(r.gastos_qr ?? r.qr_expenses ?? 0),
      operationalFlow: Number(r.flujo_operativo ?? r.operational_flow ?? 0),
      finalExpectedCash: Number(r.efectivo_esperado ?? r.final_expected_cash ?? 0),
      finalExpectedQr: Number(r.qr_esperado ?? r.final_expected_qr ?? 0),
      expectedTotalMoney: Number(r.total_esperado ?? r.expected_total_money ?? 0),
      realCashCounted: r.efectivo_real_contado ?? r.real_cash_counted !== null ? Number(r.efectivo_real_contado ?? r.real_cash_counted) : undefined,
      realQrVerified: r.qr_real_verificado ?? r.real_qr_verified !== null ? Number(r.qr_real_verificado ?? r.real_qr_verified) : undefined,
      realTotalMoney: r.total_real_contado ?? r.real_total_money !== null ? Number(r.total_real_contado ?? r.real_total_money) : undefined,
      cashDifference: r.diferencia_efectivo ?? r.cash_difference !== null ? Number(r.diferencia_efectivo ?? r.cash_difference) : undefined,
      qrDifference: r.diferencia_qr ?? r.qr_difference !== null ? Number(r.diferencia_qr ?? r.qr_difference) : undefined,
      totalDifference: r.diferencia_total ?? r.total_difference !== null ? Number(r.diferencia_total ?? r.total_difference) : undefined,
      differenceReason: r.justificacion_diferencia ?? r.difference_reason ?? undefined,
      isReopened: Boolean(r.reabierta ?? r.is_reopened ?? 0),
      notes: r.notas ?? r.notes ?? undefined,
    }));

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================================
// POST /api/shifts/reopen (Reapertura Controlada y Auditada)
// =====================================================================
shiftsRouter.post('/reopen', async (req: Request, res: Response) => {
  const { date, responsible = 'Roly', reason } = req.body;
  if (!date || !reason || !reason.trim()) {
    return res.status(400).json({ success: false, message: 'Fecha y Motivo justificado de reapertura son obligatorios' });
  }

  const now = new Date();

  if (!isDbConnected()) {
    const shift = inMemoryStore.shifts.find((s) => s.date === date);
    if (!shift) return res.status(404).json({ success: false, message: 'Jornada no encontrada' });
    shift.isReopened = true;
    shift.reopenedAt = now.toISOString();
    shift.reopenedBy = responsible;
    shift.reopenReason = reason;
    return res.json({ success: true, message: `Jornada ${date} reabierta para ajustes controlados.` });
  }

  try {
    const tables = getTableMap();
    await query(
      `UPDATE ${tables.shifts} SET
        reabierta = 1, reabierta_at = ?, reabierta_por = ?, motivo_reapertura = ?
       WHERE fecha = ? OR date = ?`,
      [now, responsible, reason, date, date]
    );
    return res.json({ success: true, message: `Jornada ${date} reabierta con justificación registrada.` });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});
