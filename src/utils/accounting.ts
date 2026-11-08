import { Sale, Expense, IncomeStatement, Reservation } from '../types';
import {
  round2,
  getTodayDateString,
  getYesterdayDateString,
  getCurrentMonthString,
  getPreviousMonthString,
  getMonthDateRange,
  isDateInBoliviaRange,
} from './formatters';

export type DateFilterType =
  | 'today'
  | 'yesterday'
  | 'specific_date'
  | 'custom'
  | 'current_month'
  | 'previous_month'
  | 'specific_month'
  | 'week'
  | 'month'
  | 'year'
  | 'all';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export function getDateRangeForFilter(
  filter: DateFilterType,
  customRange?: DateRange,
  specificDate?: string,
  specificMonth?: string
): DateRange {
  const todayStr = getTodayDateString();

  if (filter === 'today') {
    return { startDate: todayStr, endDate: todayStr };
  }

  if (filter === 'yesterday') {
    const yesterdayStr = getYesterdayDateString();
    return { startDate: yesterdayStr, endDate: yesterdayStr };
  }

  if (filter === 'specific_date') {
    const target = specificDate && specificDate.trim() ? specificDate.trim() : todayStr;
    return { startDate: target, endDate: target };
  }

  if (filter === 'current_month' || filter === 'month') {
    return getMonthDateRange(getCurrentMonthString());
  }

  if (filter === 'previous_month') {
    return getMonthDateRange(getPreviousMonthString());
  }

  if (filter === 'specific_month') {
    const targetMonth = specificMonth && specificMonth.trim() ? specificMonth.trim() : getCurrentMonthString();
    return getMonthDateRange(targetMonth);
  }

  if (filter === 'week') {
    // Current week starting Monday in Bolivia
    const [y, m, d] = todayStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const day = dateObj.getUTCDay(); // 0 is Sunday, 1 is Monday
    const diff = dateObj.getUTCDate() - day + (day === 0 ? -6 : 1);
    const mondayObj = new Date(Date.UTC(y, m - 1, diff, 12, 0, 0));
    const mondayYear = mondayObj.getUTCFullYear();
    const mondayMonth = String(mondayObj.getUTCMonth() + 1).padStart(2, '0');
    const mondayDay = String(mondayObj.getUTCDate()).padStart(2, '0');
    return { startDate: `${mondayYear}-${mondayMonth}-${mondayDay}`, endDate: todayStr };
  }

  if (filter === 'year') {
    const year = todayStr.substring(0, 4);
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }

  if (filter === 'custom' && customRange) {
    return {
      startDate: customRange.startDate || todayStr,
      endDate: customRange.endDate || todayStr,
    };
  }

  // 'all'
  return { startDate: '2020-01-01', endDate: '2099-12-31' };
}

export function calculateIncomeStatement(
  sales: Sale[],
  expenses: Expense[],
  dateRange: DateRange,
  periodLabel: string,
  reservations?: Reservation[]
): IncomeStatement {
  // 1. Filtrar ventas dentro del rango de fechas en Bolivia y que no estén anuladas
  const periodSales = (sales || []).filter((s) => {
    if (s.status === 'ANULADA') return false;
    return isDateInBoliviaRange(s.createdAt, dateRange.startDate, dateRange.endDate);
  });

  // 2. Filtrar gastos dentro del rango de fechas en Bolivia
  const periodExpenses = (expenses || []).filter((e) => {
    return isDateInBoliviaRange(e.date, dateRange.startDate, dateRange.endDate);
  });

  // 3. Totales de Ventas y Costo de Mercadería Vendida (COGS)
  let grossSales = 0;
  let discounts = 0;
  let netSales = 0;
  let costOfGoodsSold = 0;
  let unitsSold = 0;

  periodSales.forEach((sale) => {
    grossSales += Number(sale.subtotal) || 0;
    discounts += Number(sale.discount) || 0;
    netSales += Number(sale.total) || 0;
    costOfGoodsSold += Number(sale.totalCostOfGoodsSold) || 0;
    (sale.items || []).forEach((item) => {
      unitsSold += Number(item.quantity) || 0;
    });
  });

  grossSales = round2(grossSales);
  discounts = round2(discounts);
  netSales = round2(netSales);
  costOfGoodsSold = round2(costOfGoodsSold);

  // A. UTILIDAD BRUTA = Ventas netas - Costo de ventas (COGS)
  const grossProfit = round2(netSales - costOfGoodsSold);
  const grossMarginPct = netSales > 0 ? round2((grossProfit / netSales) * 100) : 0;

  // B. OTROS INGRESOS VÁLIDOS (Adelantos retenidos por reservas vencidas o canceladas)
  // Reglas contables estrictas:
  // - NUNCA incluir anticipos de reservas PENDIENTES como utilidad (son pasivos/anticipos de clientes).
  // - NUNCA sumar anticipos dos veces: si una reserva fue completada y convertida en venta (status COMPLETADA,
  //   completedSaleId o venta asociada), su valor ya está integrado en 'netSales'. Retención = 0.
  // - Solo se consideran reservas formalmente CANCELADAS o VENCIDAS sin venta realizada, cuyo hecho generador
  //   (cancelación o vencimiento formal) haya ocurrido estrictamente dentro del período evaluado.
  const periodRetainedReservations = (reservations || []).filter((r) => {
    // Excluir reservas que no sean formalmente canceladas o vencidas (ej: PENDIENTE, EN_REVISION, etc.)
    if (r.status !== 'CANCELADA' && r.status !== 'VENCIDA') return false;

    // Si la reserva fue completada o convertida en venta, no existe retención ni otro ingreso independiente
    if (r.completedSaleId || r.completedAt) return false;
    const isCompletedInSales = (sales || []).some(
      (s) => s.reservationId === r.id && s.status !== 'ANULADA'
    );
    if (isCompletedInSales) return false;

    // Determinar la fecha contable del hecho económico:
    // Para CANCELADA: fecha formal de anulación (r.cancelledAt)
    // Para VENCIDA: fecha formal de vencimiento según política de 7 días (r.expiresAt o r.expirationDate)
    const effectiveTime = r.status === 'CANCELADA'
      ? r.cancelledAt
      : (r.expiresAt || r.expirationDate || r.cancelledAt);

    if (!effectiveTime) return false;

    // Debe haber ocurrido estrictamente dentro del rango de fechas del período evaluado
    return isDateInBoliviaRange(effectiveTime, dateRange.startDate, dateRange.endDate);
  });

  let retainedDepositsIncome = 0;
  periodRetainedReservations.forEach((r) => {
    const retainedAmt = r.retainedDeposit !== undefined
      ? Number(r.retainedDeposit) || 0
      : Number(r.depositAmount) || 0;
    retainedDepositsIncome += retainedAmt;
  });
  retainedDepositsIncome = round2(retainedDepositsIncome);

  // C. GASTOS OPERATIVOS desglosados por categoría
  const operatingExpenses: Record<string, number> = {};
  let totalExpenses = 0;

  periodExpenses.forEach((exp) => {
    const cat = exp.category || 'Otros';
    const amount = Number(exp.amount) || 0;
    operatingExpenses[cat] = round2((operatingExpenses[cat] || 0) + amount);
    totalExpenses += amount;
  });
  totalExpenses = round2(totalExpenses);

  // D. UTILIDAD NETA = Utilidad bruta - Gastos operativos + Otros ingresos válidos
  // Si no existen gastos operativos (0) ni otros ingresos (0), Utilidad Neta === Utilidad Bruta.
  const netProfit = round2(grossProfit - totalExpenses + retainedDepositsIncome);

  // E. MÁRGENES PORCENTUALES
  // Margen Bruto = (Utilidad Bruta / Ventas Netas) * 100
  // Margen Neto = (Utilidad Neta / Ventas Netas) * 100
  // Si ventas netas son 0 pero hubo otros ingresos, se calcula sobre el total de ingresos válidos.
  const totalRevenueBasis = round2(netSales + retainedDepositsIncome);
  const netMarginPct = netSales > 0
    ? round2((netProfit / netSales) * 100)
    : (totalRevenueBasis > 0 ? round2((netProfit / totalRevenueBasis) * 100) : 0);

  return {
    periodLabel,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    grossSales,
    discounts,
    netSales,
    costOfGoodsSold,
    grossProfit,
    grossMarginPct,
    retainedDepositsIncome,
    retainedDepositsCount: periodRetainedReservations.length,
    operatingExpenses,
    totalExpenses,
    netProfit,
    netMarginPct,
    salesCount: periodSales.length,
    unitsSold,
    periodSales,
    periodExpenses,
  };
}

