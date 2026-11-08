import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Receipt,
  Package,
  AlertTriangle,
  QrCode,
  Banknote,
  Calendar,
  ArrowUpRight,
  ShieldCheck,
  ChevronRight,
  PlayCircle,
  Clock,
  Wallet,
} from 'lucide-react';
import { Product, ProductCategoryItem, Sale, Expense, ShiftOpening, Reservation } from '../types';
import { formatBs, round2, getTodayDateString, formatDate, getBoliviaDateString } from '../utils/formatters';
import { calculateIncomeStatement } from '../utils/accounting';
import { NavTab } from './Sidebar';

interface DashboardProps {
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  reservations?: Reservation[];
  productCategories?: ProductCategoryItem[];
  onNavigate: (tab: NavTab) => void;
  onStartDay?: () => void;
  onQuickSale?: () => void;
  onFinishDay?: () => void;
  isShiftOpened?: boolean;
  todayOpening?: ShiftOpening | null;
}

export const Dashboard: React.FC<DashboardProps> = ({
  products,
  sales,
  expenses,
  reservations = [],
  productCategories,
  onNavigate,
  onStartDay,
  onQuickSale,
  onFinishDay,
  isShiftOpened,
  todayOpening,
}) => {
  // Current Day in Santa Cruz de la Sierra, Bolivia (America/La_Paz)
  const todayStr = getTodayDateString();

  // Today stats in Bolivia timezone
  const todaySalesList = useMemo(() => {
    return sales.filter((s) => s.status !== 'ANULADA' && getBoliviaDateString(s.createdAt) === todayStr);
  }, [sales, todayStr]);

  const todayExpensesList = useMemo(() => {
    return expenses.filter((e) => getBoliviaDateString(e.date) === todayStr);
  }, [expenses, todayStr]);

  const todaySalesTotal = useMemo(() => {
    return round2(todaySalesList.reduce((acc, s) => acc + s.total, 0));
  }, [todaySalesList]);

  const todayExpensesTotal = useMemo(() => {
    return round2(todayExpensesList.reduce((acc, e) => acc + Number(e.amount || 0), 0));
  }, [todayExpensesList]);

  // Inventory indicators
  const totalProductsCount = products.length;
  const inStockProductsCount = products.filter((p) => p.stock > 0).length;
  const outOfStockProductsCount = products.filter((p) => p.stock === 0).length;
  const lowStockProductsCount = products.filter((p) => p.stock > 0 && p.stock <= 3).length;

  // Daily Income Statement for Gross and Net Profit
  const incomeStatement = useMemo(() => {
    const range = { startDate: todayStr, endDate: todayStr };
    return calculateIncomeStatement(sales, expenses, range, 'Hoy', reservations);
  }, [sales, expenses, todayStr, reservations]);

  // Payment methods breakdown for today's active sales
  const paymentMethodStats = useMemo(() => {
    let cash = 0;
    let qr = 0;
    todaySalesList.forEach((s) => {
      if (s.paymentMethod === 'Efectivo') {
        cash += s.cashAmount !== undefined ? s.cashAmount : s.total;
      } else if (s.paymentMethod === 'QR') {
        qr += s.qrAmount !== undefined ? s.qrAmount : s.total;
      } else if (s.paymentMethod === 'Mixto') {
        cash += Number(s.cashAmount || 0);
        qr += Number(s.qrAmount || 0);
      }
    });
    const total = round2(cash + qr);
    return {
      cash: round2(cash),
      qr: round2(qr),
      total,
      cashPct: total > 0 ? Math.round((cash / total) * 100) : 0,
      qrPct: total > 0 ? Math.round((qr / total) * 100) : 0,
    };
  }, [todaySalesList]);

  // Last 7 days sales for Bar Chart (all in Bolivia timezone)
  const last7DaysChartData = useMemo(() => {
    const days: Array<{ date: string; label: string; total: number }> = [];
    const [y, m, d] = todayStr.split('-').map(Number);
    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date(Date.UTC(y, m - 1, d - i, 12, 0, 0));
      const dayBoliviaStr = getBoliviaDateString(targetDate);
      const daySales = sales
        .filter((s) => s.status !== 'ANULADA' && getBoliviaDateString(s.createdAt) === dayBoliviaStr)
        .reduce((sum, s) => sum + s.total, 0);

      const dayLabel = targetDate.toLocaleDateString('es-BO', {
        timeZone: 'America/La_Paz',
        weekday: 'short',
        day: 'numeric',
      });
      days.push({
        date: dayBoliviaStr,
        label: dayLabel,
        total: round2(daySales),
      });
    }
    return days;
  }, [sales, todayStr]);

  const max7DaySale = useMemo(() => {
    return Math.max(...last7DaysChartData.map((d) => d.total), 100);
  }, [last7DaysChartData]);

  // Expenses by Category breakdown for today
  const expensesByCategoryChart = useMemo(() => {
    const catMap: Record<string, number> = {};
    let sum = 0;
    todayExpensesList.forEach((e) => {
      const cat = e.category || 'Otros';
      const amt = Number(e.amount) || 0;
      catMap[cat] = (catMap[cat] || 0) + amt;
      sum += amt;
    });
    return Object.entries(catMap)
      .map(([category, amount]) => ({
        category,
        amount: round2(amount),
        percentage: sum > 0 ? Math.round((amount / sum) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [todayExpensesList]);

  // Top selling products
  const topSellingProducts = useMemo(() => {
    const countMap: Record<string, { productCode: string; name: string; quantity: number; totalSales: number; category: string }> = {};
    sales
      .filter((s) => s.status !== 'ANULADA')
      .forEach((sale) => {
        sale.items.forEach((item) => {
          if (!countMap[item.productId]) {
            countMap[item.productId] = {
              productCode: item.code,
              name: item.name,
              quantity: 0,
              totalSales: 0,
              category: item.category,
            };
          }
          countMap[item.productId].quantity += item.quantity;
          countMap[item.productId].totalSales += item.subtotal;
        });
      });

    return Object.values(countMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [sales]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-gradient-to-r from-rose-950 via-rose-900 to-neutral-900 p-6 text-white shadow-sm">
        <div>
          <span className="text-xs font-semibold tracking-wider uppercase text-amber-300">
            Panel de Control LYLA · Santa Cruz de la Sierra
          </span>
          <h1 className="mt-1 font-brand text-2xl font-bold tracking-tight">
            Resumen Comercial y Financiero
          </h1>
          <p className="mt-1 text-xs text-rose-200">
            Valores en bolivianos (Bs) · Monitoreo en tiempo real de inventario, ventas y rentabilidad
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-black/30 px-4 py-2 backdrop-blur-xs self-start sm:self-auto border border-white/10">
          <Calendar className="h-4 w-4 text-amber-300" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Jornada de Hoy</div>
            <div className="text-xs font-semibold text-white">{formatDate(todayStr)}</div>
          </div>
        </div>
      </div>

      {/* Barra de Acciones Rápidas: Iniciar Jornada, Nueva Venta, Terminar Jornada */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
            <Clock className="h-5 w-5 text-neutral-700" />
          </div>
          <div>
            <div className="text-xs font-bold text-neutral-900">Operaciones Rápidas del Día</div>
            <div className="text-[11px] text-neutral-500">
              {isShiftOpened && todayOpening ? (
                <span className="text-emerald-700 font-medium">
                  Jornada iniciada por {todayOpening.openedBy} · Caja chica inicial: {formatBs(todayOpening.totalInitial)} (Ef: {formatBs(todayOpening.initialCash)} · QR: {formatBs(todayOpening.initialQr)})
                </span>
              ) : (
                <span className="text-amber-700 font-medium">
                  Jornada pendiente de apertura · Ingrese caja chica para habilitar arqueo exacto
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Botón Iniciar Jornada */}
          <button
            onClick={onStartDay}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition active:scale-95 ${
              isShiftOpened
                ? 'border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                : 'border border-emerald-600 bg-emerald-700 text-white hover:bg-emerald-800 shadow-xs'
            }`}
            title="Aperturar jornada e ingresar caja chica inicial"
          >
            <PlayCircle className={`h-4 w-4 ${isShiftOpened ? 'text-emerald-700' : 'text-emerald-200'}`} />
            <span>{isShiftOpened ? 'Jornada Iniciada' : 'Iniciar Jornada'}</span>
          </button>

          {/* Botón Nueva Venta */}
          <button
            onClick={onQuickSale || (() => onNavigate('ventas'))}
            className="flex items-center gap-2 rounded-xl bg-rose-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-950 active:scale-95"
          >
            <ShoppingBag className="h-4 w-4 text-rose-200" />
            <span>Nueva Venta</span>
          </button>

          {/* Botón Terminar Jornada */}
          <button
            onClick={onFinishDay || (() => onNavigate('jornada'))}
            className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-900 active:scale-95"
          >
            <Clock className="h-4 w-4 text-amber-600" />
            <span>Terminar Jornada</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (4 Cards estrictamente del día de hoy) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Ventas Hoy */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs transition hover:border-neutral-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Ventas del Día</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 font-mono-numbers text-2xl font-bold text-neutral-900">
            {formatBs(todaySalesTotal)}
          </div>
          <div className="mt-1.5 text-xs text-neutral-500 flex items-center justify-between">
            <span>{todaySalesList.length} operaciones hoy</span>
            <span className="text-emerald-600 font-medium">En vivo</span>
          </div>
        </div>

        {/* Gastos Hoy */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs transition hover:border-neutral-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Gastos del Día</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
              <Receipt className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 font-mono-numbers text-2xl font-bold text-neutral-900">
            {formatBs(todayExpensesTotal)}
          </div>
          <div className="mt-1.5 text-xs text-neutral-500 flex items-center justify-between">
            <span>{todayExpensesList.length} egresos hoy</span>
            <span className="text-rose-600 font-medium">Egresos</span>
          </div>
        </div>

        {/* Utilidad Bruta del Día */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs transition hover:border-neutral-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Utilidad Bruta del Día</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 font-mono-numbers text-2xl font-bold text-neutral-900">
            {formatBs(incomeStatement.grossProfit)}
          </div>
          <div className="mt-1.5 text-xs text-neutral-500 flex items-center justify-between">
            <span>Margen: {incomeStatement.grossMarginPct}%</span>
            <span className="text-amber-700 font-medium">s/ Ventas</span>
          </div>
        </div>

        {/* Utilidad Neta del Día */}
        <div className={`rounded-2xl border p-5 shadow-xs transition ${
          incomeStatement.netProfit >= 0
            ? 'border-emerald-200 bg-white'
            : 'border-rose-200 bg-rose-50/30'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Utilidad Neta del Día</span>
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              incomeStatement.netProfit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}>
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <div className={`mt-3 font-mono-numbers text-2xl font-bold ${
            incomeStatement.netProfit >= 0 ? 'text-emerald-900' : 'text-rose-900'
          }`}>
            {formatBs(incomeStatement.netProfit)}
          </div>
          <div className="mt-1.5 text-xs text-neutral-500 flex items-center justify-between">
            <span>Margen neto: {incomeStatement.netMarginPct}%</span>
            <span className={`font-medium ${incomeStatement.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {incomeStatement.netProfit >= 0 ? 'Ganancia real' : 'Pérdida neta'}
            </span>
          </div>
        </div>
      </div>

      {/* Financial Results strip (Utilidad Bruta & Utilidad Neta de Hoy) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Utilidad Bruta */}
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Utilidad Bruta (Jornada de Hoy)
              </span>
              <div className="mt-2 font-mono-numbers text-3xl font-bold text-neutral-900">
                {formatBs(incomeStatement.grossProfit)}
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                Margen {incomeStatement.grossMarginPct}%
              </span>
              <p className="mt-1 text-[11px] text-neutral-400">s/ Ventas Netas</p>
            </div>
          </div>
          <div className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500 flex justify-between">
            <span>Ventas: {formatBs(incomeStatement.netSales)}</span>
            <span>Costo de Ventas (COGS): -{formatBs(incomeStatement.costOfGoodsSold)}</span>
          </div>
        </div>

        {/* Utilidad Neta */}
        <div className={`relative overflow-hidden rounded-2xl border p-6 shadow-xs ${
          incomeStatement.netProfit >= 0
            ? 'border-emerald-200 bg-emerald-50/40'
            : 'border-rose-200 bg-rose-50/40'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                {incomeStatement.netProfit >= 0 ? 'Utilidad Neta Real' : 'Pérdida Neta Real'} (Jornada de Hoy)
              </span>
              <div className={`mt-2 font-mono-numbers text-3xl font-bold ${
                incomeStatement.netProfit >= 0 ? 'text-emerald-900' : 'text-rose-900'
              }`}>
                {formatBs(incomeStatement.netProfit)}
              </div>
            </div>
            <div className="text-right">
              <span className={`inline-block rounded-lg px-2.5 py-1 text-xs font-bold ${
                incomeStatement.netProfit >= 0 ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
              }`}>
                Margen Neto {incomeStatement.netMarginPct}%
              </span>
              <button
                onClick={() => onNavigate('resultados')}
                className="mt-2 flex items-center gap-1 text-xs font-semibold text-rose-950 hover:underline"
              >
                Ver Estado <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="mt-4 border-t border-neutral-200/60 pt-3 text-xs text-neutral-600 flex justify-between flex-wrap gap-2">
            <span>
              Utilidad Bruta: {formatBs(incomeStatement.grossProfit)}
              {incomeStatement.retainedDepositsIncome > 0 && (
                <span className="text-emerald-700 ml-1.5 font-medium">
                  (+{formatBs(incomeStatement.retainedDepositsIncome)} otros ingresos)
                </span>
              )}
            </span>
            <span>Gastos Operativos: -{formatBs(incomeStatement.totalExpenses)}</span>
          </div>
        </div>
      </div>

      {/* Inventory Status Bar */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-neutral-600" />
            <h3 className="text-sm font-bold text-neutral-900">
              Estado de Inventario por Categorías
            </h3>
          </div>
          <button
            onClick={() => onNavigate('inventario')}
            className="text-xs font-semibold text-rose-900 hover:text-rose-950 flex items-center gap-1 self-start sm:self-auto"
          >
            Administrar Inventario <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-neutral-50 p-3.5 border border-neutral-100">
            <p className="text-xs text-neutral-500">Productos Registrados</p>
            <p className="mt-1 font-mono-numbers text-xl font-bold text-neutral-900">
              {totalProductsCount}
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">Catálogo total</p>
          </div>

          <div className="rounded-xl bg-emerald-50/60 p-3.5 border border-emerald-100">
            <p className="text-xs text-emerald-800 font-medium">Disponibles con Stock</p>
            <p className="mt-1 font-mono-numbers text-xl font-bold text-emerald-900">
              {inStockProductsCount}
            </p>
            <p className="text-[11px] text-emerald-700 mt-0.5">Listos para vender</p>
          </div>

          <div className="rounded-xl bg-amber-50/60 p-3.5 border border-amber-100">
            <p className="text-xs text-amber-800 font-medium">Stock Bajo (≤ 3 unid.)</p>
            <p className="mt-1 font-mono-numbers text-xl font-bold text-amber-900">
              {lowStockProductsCount}
            </p>
            <p className="text-[11px] text-amber-700 mt-0.5">Sugerir reabastecimiento</p>
          </div>

          <div className="rounded-xl bg-rose-50/60 p-3.5 border border-rose-100">
            <p className="text-xs text-rose-800 font-medium">Agotados (0 unid.)</p>
            <p className="mt-1 font-mono-numbers text-xl font-bold text-rose-900">
              {outOfStockProductsCount}
            </p>
            <p className="text-[11px] text-rose-700 mt-0.5">Sin existencias</p>
          </div>
        </div>
      </div>

      {/* Real Charts Grid (2 columns) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Gráfico 1: Ventas por día (Últimos 7 días) */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">
                Ventas de los Últimos 7 Días
              </h3>
              <p className="text-xs text-neutral-500">
                Evolución diaria de ventas netas
              </p>
            </div>
            <span className="font-mono-numbers text-xs font-semibold text-neutral-600 bg-neutral-100 px-2 py-1 rounded-md">
              Bolivianos (Bs)
            </span>
          </div>

          <div className="h-48 flex items-end justify-between gap-2 pt-4">
            {last7DaysChartData.map((bar, idx) => {
              const heightPct = Math.round((bar.total / max7DaySale) * 100);
              const isToday = bar.date === todayStr;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                  <span className="font-mono-numbers text-[10px] font-semibold text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    {formatBs(bar.total)}
                  </span>
                  <div className="w-full flex justify-center items-end h-32">
                    <div
                      style={{ height: `${Math.max(heightPct, 6)}%` }}
                      className={`w-full max-w-[36px] rounded-t-lg transition-all ${
                        isToday
                          ? 'bg-gradient-to-t from-rose-900 to-rose-700 shadow-xs'
                          : 'bg-neutral-200 hover:bg-neutral-300'
                      }`}
                    />
                  </div>
                  <span className={`text-[11px] font-medium truncate max-w-[50px] ${
                    isToday ? 'text-rose-900 font-bold' : 'text-neutral-500'
                  }`}>
                    {bar.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gráfico 2: Ventas por Método de Pago (Efectivo vs QR) */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">
                Ventas por Método de Pago
              </h3>
              <p className="text-xs text-neutral-500">
                Distribución entre Efectivo y QR (Jornada de Hoy)
              </p>
            </div>
            <span className="font-mono-numbers text-xs font-semibold text-neutral-700">
              Total: {formatBs(paymentMethodStats.total)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="rounded-xl border border-neutral-200 p-4 bg-neutral-50">
              <div className="flex items-center gap-2 text-emerald-700">
                <Banknote className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-wider">Efectivo</span>
              </div>
              <p className="mt-2 font-mono-numbers text-xl font-bold text-neutral-900">
                {formatBs(paymentMethodStats.cash)}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
                <span>Participación:</span>
                <span className="font-semibold text-neutral-800">{paymentMethodStats.cashPct}%</span>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 p-4 bg-neutral-50">
              <div className="flex items-center gap-2 text-blue-700">
                <QrCode className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-wider">Cobro QR</span>
              </div>
              <p className="mt-2 font-mono-numbers text-xl font-bold text-neutral-900">
                {formatBs(paymentMethodStats.qr)}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
                <span>Participación:</span>
                <span className="font-semibold text-neutral-800">{paymentMethodStats.qrPct}%</span>
              </div>
            </div>
          </div>

          {/* Ratio Visual Bar */}
          <div className="mt-6">
            <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100 flex">
              <div
                style={{ width: `${paymentMethodStats.cashPct}%` }}
                className="bg-emerald-600 transition-all"
                title={`Efectivo: ${paymentMethodStats.cashPct}%`}
              />
              <div
                style={{ width: `${paymentMethodStats.qrPct}%` }}
                className="bg-blue-600 transition-all"
                title={`QR: ${paymentMethodStats.qrPct}%`}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-neutral-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Efectivo
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-600" />
                QR Bancario / Simple
              </span>
            </div>
          </div>
        </div>

        {/* Gráfico 3: Gastos por Categoría */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">
                Gastos por Categoría
              </h3>
              <p className="text-xs text-neutral-500">
                Distribución de egresos operativos (Jornada de Hoy)
              </p>
            </div>
            <button
              onClick={() => onNavigate('gastos')}
              className="text-xs font-semibold text-rose-900 hover:text-rose-950 flex items-center gap-1"
            >
              Ver Gastos <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {expensesByCategoryChart.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400">
              No hay gastos registrados en este período.
            </div>
          ) : (
            <div className="space-y-3 mt-4">
              {expensesByCategoryChart.map((cat, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-neutral-700">{cat.category}</span>
                    <span className="font-mono-numbers text-neutral-900 font-bold">
                      {formatBs(cat.amount)} ({cat.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                    <div
                      style={{ width: `${cat.percentage}%` }}
                      className="h-full rounded-full bg-rose-800 transition-all"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ranking de Productos Más Vendidos */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">
                Productos Más Vendidos
              </h3>
              <p className="text-xs text-neutral-500">
                Top artículos con mayor rotación en tienda
              </p>
            </div>
            <button
              onClick={() => onNavigate('ventas')}
              className="text-xs font-semibold text-rose-900 hover:text-rose-950 flex items-center gap-1"
            >
              Ir a Ventas <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {topSellingProducts.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400">
              Aún no se han completado ventas para generar el ranking.
            </div>
          ) : (
            <div className="space-y-3 mt-4">
              {topSellingProducts.map((p, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-xl border border-neutral-100 p-3 bg-neutral-50/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-950 text-amber-300 font-mono text-xs font-bold">
                      #{index + 1}
                    </span>
                    <div>
                      <h4 className="text-xs font-semibold text-neutral-900">
                        {p.name}
                      </h4>
                      <p className="text-[11px] text-neutral-400">
                        {p.productCode} · {p.category}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono-numbers text-xs font-bold text-neutral-900">
                      {p.quantity} unid.
                    </span>
                    <p className="font-mono-numbers text-[11px] text-neutral-500">
                      {formatBs(p.totalSales)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
