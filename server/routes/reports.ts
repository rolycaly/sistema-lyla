/**
 * SISTEMA LYLA - Rutas de Reportes Financieros y Estado de Resultados
 * Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected, query, getTableMap, inMemoryStore } from '../db.js';
import type { RowDataPacket } from 'mysql2/promise';

export const reportsRouter = Router();

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// =====================================================================
// GET /api/reports/income-statement
// Fórmula Contable Oficial:
// Utilidad Bruta = Ventas netas - Costo de ventas (COGS)
// Utilidad Neta = Utilidad bruta - Gastos operativos + Anticipos retenidos
// =====================================================================
reportsRouter.get('/income-statement', async (req: Request, res: Response) => {
  const { startDate, endDate, periodLabel = 'Período Seleccionado' } = req.query;

  const now = new Date();
  const start = startDate ? String(startDate) : new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = endDate ? String(endDate) : now.toISOString().slice(0, 10);

  if (!isDbConnected()) {
    // Cálculo en memoria
    const filteredSales = inMemoryStore.sales.filter((s) => {
      const d = s.createdAt.slice(0, 10);
      return d >= start && d <= end && s.status !== 'ANULADA';
    });

    const filteredExpenses = inMemoryStore.expenses.filter((e) => {
      const d = e.date.slice(0, 10);
      return d >= start && d <= end;
    });

    const filteredRetained = (inMemoryStore.retainedDeposits || []).filter((r) => {
      const d = (r.fechaRetencion || '').slice(0, 10);
      return d >= start && d <= end;
    });

    const grossSales = round2(filteredSales.reduce((acc, s) => acc + (s.subtotal || s.total), 0));
    const discounts = round2(filteredSales.reduce((acc, s) => acc + (s.discount || 0), 0));
    const netSales = round2(filteredSales.reduce((acc, s) => acc + s.total, 0));
    const costOfGoodsSold = round2(filteredSales.reduce((acc, s) => acc + (s.totalCostOfGoodsSold || 0), 0));
    const grossProfit = round2(netSales - costOfGoodsSold);

    const retainedDepositsIncome = round2(filteredRetained.reduce((acc, r) => acc + (Number(r.monto) || 0), 0));

    const operatingExpenses: Record<string, number> = {};
    let totalExpenses = 0;
    filteredExpenses.forEach((exp) => {
      const cat = exp.category || 'Otros';
      operatingExpenses[cat] = round2((operatingExpenses[cat] || 0) + exp.amount);
      totalExpenses += exp.amount;
    });
    totalExpenses = round2(totalExpenses);

    const netProfit = round2(grossProfit - totalExpenses + retainedDepositsIncome);
    const grossMarginPct = netSales > 0 ? round2((grossProfit / netSales) * 100) : 0;
    const netMarginPct = netSales > 0 ? round2((netProfit / netSales) * 100) : 0;

    return res.json({
      periodLabel,
      startDate: start,
      endDate: end,
      grossSales,
      discounts,
      netSales,
      costOfGoodsSold,
      grossProfit,
      grossMarginPct,
      retainedDepositsIncome,
      retainedDepositsCount: filteredRetained.length,
      operatingExpenses,
      totalExpenses,
      netProfit,
      netMarginPct,
      salesCount: filteredSales.length,
    });
  }

  try {
    const tables = getTableMap();

    // 1. Consultar ventas confirmadas del período
    const salesRows = await query<RowDataPacket[]>(
      `SELECT 
        COALESCE(SUM(subtotal), 0) as grossSales,
        COALESCE(SUM(descuento), 0) as discounts,
        COALESCE(SUM(total), 0) as netSales,
        COALESCE(SUM(costo_total_ventas), 0) as costOfGoodsSold,
        COUNT(id) as salesCount
       FROM ${tables.sales}
       WHERE DATE(created_at) BETWEEN ? AND ?
         AND (estado = 'CONFIRMADA' OR estado = 'EDITADA' OR status = 'CONFIRMADA' OR status = 'EDITADA')`,
      [start, end]
    );

    const s = salesRows[0] || {};
    const grossSales = round2(Number(s.grossSales || 0));
    const discounts = round2(Number(s.discounts || 0));
    const netSales = round2(Number(s.netSales || 0));
    const costOfGoodsSold = round2(Number(s.costOfGoodsSold || 0));
    const grossProfit = round2(netSales - costOfGoodsSold);

    // 2. Consultar otros ingresos: Anticipos retenidos (100% de señas de reservas vencidas o canceladas)
    let retainedDepositsIncome = 0;
    let retainedDepositsCount = 0;
    try {
      const retainedRows = await query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(monto), 0) as totalRetained, COUNT(id) as retainedCount
         FROM ${tables.retainedDeposits}
         WHERE DATE(fecha_retencion) BETWEEN ? AND ?`,
        [start, end]
      );
      if (retainedRows.length > 0) {
        retainedDepositsIncome = round2(Number(retainedRows[0].totalRetained || 0));
        retainedDepositsCount = Number(retainedRows[0].retainedCount || 0);
      }
    } catch (e) {
      // Fallback a reservas canceladas o vencidas si la tabla anticipos_retenidos estuviera vacía
      const resRows = await query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(anticipo_retenido), 0) as totalRetained, COUNT(id) as count
         FROM ${tables.reservations}
         WHERE (estado = 'VENCIDA' OR estado = 'CANCELADA')
           AND DATE(COALESCE(fecha_cancelacion, created_at)) BETWEEN ? AND ?`,
        [start, end]
      ).catch(() => []);
      if (resRows && resRows.length > 0) {
        retainedDepositsIncome = round2(Number(resRows[0].totalRetained || 0));
        retainedDepositsCount = Number(resRows[0].count || 0);
      }
    }

    // 3. Consultar gastos operativos del período agrupados por categoría
    const expenseRows = await query<RowDataPacket[]>(
      `SELECT categoria, COALESCE(SUM(monto), 0) as totalCat
       FROM ${tables.expenses}
       WHERE DATE(fecha) BETWEEN ? AND ?
       GROUP BY categoria`,
      [start, end]
    );

    const operatingExpenses: Record<string, number> = {};
    let totalExpenses = 0;
    expenseRows.forEach((r) => {
      const val = round2(Number(r.totalCat || 0));
      operatingExpenses[r.categoria] = val;
      totalExpenses += val;
    });
    totalExpenses = round2(totalExpenses);

    // 4. Utilidad Neta Real
    const netProfit = round2(grossProfit - totalExpenses + retainedDepositsIncome);
    const grossMarginPct = netSales > 0 ? round2((grossProfit / netSales) * 100) : 0;
    const netMarginPct = netSales > 0 ? round2((netProfit / netSales) * 100) : 0;

    return res.json({
      periodLabel,
      startDate: start,
      endDate: end,
      grossSales,
      discounts,
      netSales,
      costOfGoodsSold,
      grossProfit,
      grossMarginPct,
      retainedDepositsIncome,
      retainedDepositsCount,
      operatingExpenses,
      totalExpenses,
      netProfit,
      netMarginPct,
      salesCount: Number(s.salesCount || 0),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================================
// GET /api/reports/dashboard-summary
// =====================================================================
reportsRouter.get('/dashboard-summary', async (_req: Request, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);

  if (!isDbConnected()) {
    const todaySales = inMemoryStore.sales.filter((s) => s.createdAt.slice(0, 10) === today && s.status !== 'ANULADA');
    const todayExpenses = inMemoryStore.expenses.filter((e) => e.date.slice(0, 10) === today);

    const totalSalesToday = round2(todaySales.reduce((acc, s) => acc + s.total, 0));
    const cogsToday = round2(todaySales.reduce((acc, s) => acc + (s.totalCostOfGoodsSold || 0), 0));
    const grossProfitToday = round2(totalSalesToday - cogsToday);
    const totalExpensesToday = round2(todayExpenses.reduce((acc, e) => acc + e.amount, 0));
    const netProfitToday = round2(grossProfitToday - totalExpensesToday);

    const lowStockCount = inMemoryStore.products.filter((p) => p.stock > 0 && p.stock <= 3).length;
    const pendingReservationsCount = inMemoryStore.reservations.filter((r) => r.status === 'PENDIENTE').length;

    return res.json({
      today,
      totalSalesToday,
      salesCountToday: todaySales.length,
      grossProfitToday,
      totalExpensesToday,
      netProfitToday,
      lowStockCount,
      pendingReservationsCount,
      totalProductsCount: inMemoryStore.products.length,
    });
  }

  try {
    const tables = getTableMap();

    // Ventas de hoy
    const [salesToday] = await query<RowDataPacket[]>(
      `SELECT 
        COALESCE(SUM(total), 0) as totalSales,
        COALESCE(SUM(costo_total_ventas), 0) as cogs,
        COUNT(id) as count
       FROM ${tables.sales}
       WHERE DATE(created_at) = ? AND (estado != 'ANULADA' AND status != 'ANULADA')`,
      [today]
    );

    const [expensesToday] = await query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(monto), 0) as totalExpenses
       FROM ${tables.expenses}
       WHERE DATE(fecha) = ?`,
      [today]
    );

    const [prodsSummary] = await query<RowDataPacket[]>(
      `SELECT 
        COUNT(id) as totalProducts,
        SUM(CASE WHEN stock_disponible > 0 AND stock_disponible <= 3 THEN 1 ELSE 0 END) as lowStock
       FROM ${tables.products}`
    );

    const [resSummary] = await query<RowDataPacket[]>(
      `SELECT COUNT(id) as pendingCount FROM ${tables.reservations} WHERE estado = 'PENDIENTE' OR status = 'PENDIENTE'`
    );

    const totalSales = round2(Number(salesToday?.totalSales || 0));
    const cogs = round2(Number(salesToday?.cogs || 0));
    const grossProfit = round2(totalSales - cogs);
    const totalExpenses = round2(Number(expensesToday?.totalExpenses || 0));
    const netProfit = round2(grossProfit - totalExpenses);

    return res.json({
      today,
      totalSalesToday: totalSales,
      salesCountToday: Number(salesToday?.count || 0),
      grossProfitToday: grossProfit,
      totalExpensesToday: totalExpenses,
      netProfitToday: netProfit,
      lowStockCount: Number(prodsSummary?.lowStock || 0),
      pendingReservationsCount: Number(resSummary?.pendingCount || 0),
      totalProductsCount: Number(prodsSummary?.totalProducts || 0),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
