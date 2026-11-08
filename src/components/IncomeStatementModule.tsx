import React, { useState, useMemo } from 'react';
import { Download, Printer, Calendar, ChevronDown, ChevronUp, ShoppingBag, Receipt, ArrowUpDown } from 'lucide-react';
import { Sale, Expense, IncomeStatement, Reservation } from '../types';
import {
  formatBs,
  formatDate,
  formatDateTime,
  getTodayDateString,
  getYesterdayDateString,
  getCurrentMonthString,
  getPreviousMonthString,
} from '../utils/formatters';
import { calculateIncomeStatement, DateFilterType, DateRange, getDateRangeForFilter } from '../utils/accounting';
import { exportIncomeStatementToWord, exportIncomeStatementToPdf } from '../utils/exporter';

interface IncomeStatementModuleProps {
  sales: Sale[];
  expenses: Expense[];
  reservations?: Reservation[];
}

export const IncomeStatementModule: React.FC<IncomeStatementModuleProps> = ({
  sales,
  expenses,
  reservations,
}) => {
  // Filtros de período requeridos
  const [filterType, setFilterType] = useState<DateFilterType>('today');
  const [specificDate, setSpecificDate] = useState<string>(getTodayDateString());
  const [customStartDate, setCustomStartDate] = useState<string>(getTodayDateString());
  const [customEndDate, setCustomEndDate] = useState<string>(getTodayDateString());
  const [specificMonth, setSpecificMonth] = useState<string>(getCurrentMonthString());

  // Pestaña de detalle del período (Ventas o Gastos)
  const [detailTab, setDetailTab] = useState<'sales' | 'expenses'>('sales');
  const [isDetailExpanded, setIsDetailExpanded] = useState<boolean>(true);

  // Rango de fechas calculado con zona horaria de Bolivia
  const dateRange: DateRange = useMemo(() => {
    return getDateRangeForFilter(
      filterType,
      { startDate: customStartDate, endDate: customEndDate },
      specificDate,
      specificMonth
    );
  }, [filterType, customStartDate, customEndDate, specificDate, specificMonth]);

  // Etiqueta formal del período seleccionado
  const periodLabel = useMemo(() => {
    switch (filterType) {
      case 'today':
        return `Hoy (${formatDate(dateRange.startDate)})`;
      case 'yesterday':
        return `Ayer (${formatDate(dateRange.startDate)})`;
      case 'specific_date':
        return `Fecha: ${formatDate(dateRange.startDate)}`;
      case 'custom':
        return `${formatDate(dateRange.startDate)} al ${formatDate(dateRange.endDate)}`;
      case 'current_month': {
        const [y, m] = getCurrentMonthString().split('-');
        const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-BO', {
          month: 'long',
          year: 'numeric',
        });
        return `Mes Actual (${monthName})`;
      }
      case 'previous_month': {
        const [y, m] = getPreviousMonthString().split('-');
        const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-BO', {
          month: 'long',
          year: 'numeric',
        });
        return `Mes Anterior (${monthName})`;
      }
      case 'specific_month': {
        const target = specificMonth || getCurrentMonthString();
        const [y, m] = target.split('-');
        const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-BO', {
          month: 'long',
          year: 'numeric',
        });
        return `Mes de ${monthName}`;
      }
      default:
        return 'Período';
    }
  }, [filterType, dateRange, specificMonth]);

  // Cálculo financiero estricto sobre el período y en zona horaria America/La_Paz
  const statement: IncomeStatement = useMemo(() => {
    return calculateIncomeStatement(sales, expenses, dateRange, periodLabel, reservations);
  }, [sales, expenses, dateRange, periodLabel, reservations]);

  return (
    <div className="space-y-6">
      {/* Barra superior de herramientas y filtros */}
      <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5">
        {/* Selector de Período con todos los modos requeridos */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'today', label: 'Hoy' },
              { id: 'yesterday', label: 'Ayer' },
              { id: 'specific_date', label: 'Fecha específica' },
              { id: 'custom', label: 'Rango personalizado' },
              { id: 'current_month', label: 'Mes actual' },
              { id: 'previous_month', label: 'Mes anterior' },
              { id: 'specific_month', label: 'Mes específico' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => setFilterType(item.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition active:scale-95 ${
                filterType === item.id
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Inputs dinámicos según el tipo de período */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 p-3 rounded-xl border border-neutral-200 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-neutral-700 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-neutral-500" />
              <span>Período activo:</span>
            </span>

            {/* Fecha específica mediante calendario */}
            {filterType === 'specific_date' && (
              <div className="flex items-center gap-2">
                <span className="text-neutral-500">Seleccionar día:</span>
                <input
                  type="date"
                  value={specificDate}
                  onChange={(e) => setSpecificDate(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium outline-none focus:border-neutral-900 shadow-2xs"
                />
              </div>
            )}

            {/* Rango personalizado de fechas */}
            {filterType === 'custom' && (
              <div className="flex items-center gap-2">
                <span className="text-neutral-500">Desde:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs font-medium outline-none focus:border-neutral-900 shadow-2xs"
                />
                <span className="text-neutral-400">Hasta:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs font-medium outline-none focus:border-neutral-900 shadow-2xs"
                />
              </div>
            )}

            {/* Mes específico */}
            {filterType === 'specific_month' && (
              <div className="flex items-center gap-2">
                <span className="text-neutral-500">Seleccionar Año y Mes:</span>
                <input
                  type="month"
                  value={specificMonth}
                  onChange={(e) => setSpecificMonth(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium outline-none focus:border-neutral-900 shadow-2xs"
                />
              </div>
            )}

            {/* Resumen del rango evaluado en Santa Cruz de la Sierra */}
            <span className="rounded-md bg-neutral-200/70 px-2 py-0.5 text-[11px] font-mono font-medium text-neutral-800">
              {formatDate(statement.startDate)} al {formatDate(statement.endDate)}
            </span>
          </div>

          {/* Acciones de exportación e impresión */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportIncomeStatementToWord(statement)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 transition shadow-2xs"
              title="Descargar documento de Word"
            >
              <Download className="h-3.5 w-3.5 text-neutral-500" />
              <span>DESCARGAR WORD</span>
            </button>

            <button
              onClick={() => exportIncomeStatementToPdf(statement)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 transition shadow-2xs"
              title="Descargar documento PDF"
            >
              <Download className="h-3.5 w-3.5 text-neutral-300" />
              <span>DESCARGAR PDF</span>
            </button>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition"
              title="Imprimir estado"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>
      </div>

      {/* ESTADO DE RESULTADOS: ESTILO SOBRIO, ELEGANTE Y CLARO */}
      <div className="max-w-3xl py-4 print-container space-y-8 text-neutral-900">
        {/* Cabecera sobria */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            SISTEMA LYLA
          </h1>
          <p className="text-sm font-medium text-neutral-500 mt-1">
            ESTADO DE RESULTADOS · {periodLabel.toUpperCase()} ({formatDate(statement.startDate)} al {formatDate(statement.endDate)})
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">
            Santa Cruz de la Sierra, Bolivia · Moneda oficial: Bolivianos (Bs)
          </p>
        </div>

        {/* Contenido financiero en texto corrido y limpio */}
        <div className="space-y-6 text-base">
          {/* VENTAS */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-bold text-lg tracking-wide uppercase text-neutral-950">
                INGRESOS POR VENTAS
              </span>
              <span className="font-mono-numbers text-xl font-bold text-neutral-950">
                {formatBs(statement.netSales)}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between text-xs text-neutral-500 mt-0.5">
              <span>
                Total de lo que se vendió en el período ({statement.salesCount} ventas · {statement.unitsSold} artículos)
              </span>
              {statement.discounts > 0 && (
                <span className="text-rose-700 font-medium font-mono">
                  (Ventas brutas: {formatBs(statement.grossSales)} · Descuentos comerciales: -{formatBs(statement.discounts)})
                </span>
              )}
            </div>
          </div>

          <div className="h-px bg-neutral-200" />

          {/* COSTO DE VENTAS (COGS) */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-bold text-lg tracking-wide uppercase text-neutral-950">
                COSTO DE VENTAS (COGS)
              </span>
              <span className="font-mono-numbers text-xl font-bold text-neutral-950">
                -{formatBs(statement.costOfGoodsSold)}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Total de lo que costó todo lo que se vendió (costo promedio ponderado de compra)
            </p>
          </div>

          <div className="h-px bg-neutral-200" />

          {/* UTILIDAD BRUTA */}
          <div>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="font-bold text-xl tracking-wide uppercase text-neutral-950">
                  UTILIDAD BRUTA
                </span>
                <span className="ml-3 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  Margen Bruto {statement.grossMarginPct}%
                </span>
              </div>
              <span className="font-mono-numbers text-2xl font-bold text-neutral-950">
                {formatBs(statement.grossProfit)}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Resta de las ventas netas menos los costos de mercadería (Ventas Netas − Costo de Ventas)
            </p>
          </div>

          {/* OTROS INGRESOS / ADELANTOS RETENIDOS (Si los hay en el período) */}
          {statement.retainedDepositsIncome > 0 && (
            <>
              <div className="h-px bg-neutral-200" />
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-lg tracking-wide uppercase text-neutral-950">
                    OTROS INGRESOS (ADELANTOS RETENIDOS)
                  </span>
                  <span className="font-mono-numbers text-xl font-bold text-emerald-800">
                    +{formatBs(statement.retainedDepositsIncome)}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  100% de señas conservadas por cancelaciones o vencimientos de 7 días ({statement.retainedDepositsCount} reserva{statement.retainedDepositsCount === 1 ? '' : 's'})
                </p>
              </div>
            </>
          )}

          <div className="h-px bg-neutral-200" />

          {/* GASTOS OPERATIVOS / EGRESOS */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-bold text-lg tracking-wide uppercase text-neutral-950">
                GASTOS OPERATIVOS (EGRESOS)
              </span>
              <span className="font-mono-numbers text-xl font-bold text-neutral-950">
                -{formatBs(statement.totalExpenses)}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Total de todos los gastos que se hicieron en el período
            </p>
            {Object.keys(statement.operatingExpenses).length > 0 && (
              <div className="mt-2.5 space-y-1 pl-4 text-xs text-neutral-600">
                {Object.entries(statement.operatingExpenses).map(([cat, amount]) => (
                  <div key={cat} className="flex justify-between max-w-sm">
                    <span>{cat}:</span>
                    <span className="font-mono-numbers">{formatBs(amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="h-0.5 bg-neutral-900" />

          {/* UTILIDAD NETA */}
          <div>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="font-bold text-2xl tracking-wide uppercase text-neutral-950">
                  UTILIDAD NETA
                </span>
                <span className={`ml-3 rounded-md px-2 py-0.5 text-xs font-bold ${
                  statement.netProfit >= 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'
                }`}>
                  Margen Neto {statement.netMarginPct}%
                </span>
              </div>
              <span className={`font-mono-numbers text-3xl font-extrabold ${statement.netProfit >= 0 ? 'text-neutral-950' : 'text-rose-700'}`}>
                {formatBs(statement.netProfit)}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Resultado final: Utilidad bruta {statement.retainedDepositsIncome > 0 ? '+ adelantos retenidos ' : ''}menos gastos operativos (Utilidad Bruta {statement.retainedDepositsIncome > 0 ? '+ Adelantos ' : ''}− Gastos)
            </p>
          </div>
        </div>

        {/* SECCIÓN REQUERIDA: DETALLE DE VENTAS Y GASTOS DEL PERÍODO */}
        <div className="pt-6 border-t border-neutral-200 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">
                Detalle de Operaciones Comprendidas en el Período
              </h3>
              <p className="text-xs text-neutral-500">
                Desglose individual de ventas y egresos del rango ({formatDate(statement.startDate)} al {formatDate(statement.endDate)})
              </p>
            </div>
            <button
              onClick={() => setIsDetailExpanded((prev) => !prev)}
              className="flex items-center gap-1 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
            >
              <span>{isDetailExpanded ? 'Ocultar Detalle' : 'Mostrar Detalle'}</span>
              {isDetailExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {isDetailExpanded && (
            <div className="space-y-3">
              {/* Selector de Pestaña de Detalle */}
              <div className="flex items-center gap-2 border-b border-neutral-200">
                <button
                  onClick={() => setDetailTab('sales')}
                  className={`flex items-center gap-1.5 pb-2 text-xs font-bold border-b-2 transition ${
                    detailTab === 'sales'
                      ? 'border-neutral-900 text-neutral-950'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span>Ventas del Período ({statement.periodSales?.length || 0})</span>
                </button>

                <button
                  onClick={() => setDetailTab('expenses')}
                  className={`flex items-center gap-1.5 pb-2 text-xs font-bold border-b-2 transition ${
                    detailTab === 'expenses'
                      ? 'border-neutral-900 text-neutral-950'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <Receipt className="h-3.5 w-3.5" />
                  <span>Gastos del Período ({statement.periodExpenses?.length || 0})</span>
                </button>
              </div>

              {/* Contenido Pestaña 1: Ventas del Período */}
              {detailTab === 'sales' && (
                <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-neutral-200">
                      <tr>
                        <th className="py-2.5 pl-3 pr-2">Nº Recibo</th>
                        <th className="px-2 py-2.5">Fecha y Hora</th>
                        <th className="px-2 py-2.5">Artículos</th>
                        <th className="px-2 py-2.5">Pago</th>
                        <th className="px-2 py-2.5 text-right">Subtotal</th>
                        <th className="px-2 py-2.5 text-right">Desc.</th>
                        <th className="px-2 py-2.5 text-right">Total</th>
                        <th className="py-2.5 pl-2 pr-3 text-right">COGS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-neutral-800">
                      {!statement.periodSales || statement.periodSales.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-xs text-neutral-400">
                            No existen ventas registradas en el período seleccionado ({periodLabel}).
                          </td>
                        </tr>
                      ) : (
                        statement.periodSales.map((s) => (
                          <tr key={s.id} className="hover:bg-neutral-50/70 transition">
                            <td className="py-2.5 pl-3 pr-2 font-mono font-bold text-neutral-900">
                              {s.receiptNumber}
                            </td>
                            <td className="px-2 py-2.5 text-neutral-500 whitespace-nowrap">
                              {formatDateTime(s.createdAt)}
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="space-y-0.5 max-w-[220px]">
                                {s.items.map((it, idx) => (
                                  <div key={idx} className="truncate text-[11px]">
                                    <span className="font-semibold text-neutral-900">{it.quantity}x</span>{' '}
                                    <span>{it.name}</span>
                                    {it.selectedColor && (
                                      <span className="ml-1 text-[10px] text-rose-800 bg-rose-50 border border-rose-200 px-1 rounded">
                                        {it.selectedColor}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="px-2 py-2.5 font-medium whitespace-nowrap">
                              {s.paymentMethod}
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono-numbers">
                              {formatBs(s.subtotal)}
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono-numbers text-rose-700">
                              {s.discount > 0 ? `-${formatBs(s.discount)}` : '—'}
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono-numbers font-bold text-neutral-900">
                              {formatBs(s.total)}
                            </td>
                            <td className="py-2.5 pl-2 pr-3 text-right font-mono-numbers text-neutral-500">
                              {formatBs(s.totalCostOfGoodsSold)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Contenido Pestaña 2: Gastos del Período */}
              {detailTab === 'expenses' && (
                <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-neutral-200">
                      <tr>
                        <th className="py-2.5 pl-3 pr-2">Fecha y Hora</th>
                        <th className="px-2 py-2.5">Categoría</th>
                        <th className="px-2 py-2.5">Descripción / Concepto</th>
                        <th className="px-2 py-2.5">Responsable</th>
                        <th className="px-2 py-2.5">Método</th>
                        <th className="py-2.5 pl-2 pr-3 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-neutral-800">
                      {!statement.periodExpenses || statement.periodExpenses.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-xs text-neutral-400">
                            No existen gastos registrados en el período seleccionado ({periodLabel}).
                          </td>
                        </tr>
                      ) : (
                        statement.periodExpenses.map((e) => (
                          <tr key={e.id} className="hover:bg-neutral-50/70 transition">
                            <td className="py-2.5 pl-3 pr-2 text-neutral-500 whitespace-nowrap">
                              {formatDateTime(e.date)}
                            </td>
                            <td className="px-2 py-2.5 font-semibold text-neutral-900">
                              {e.category}
                            </td>
                            <td className="px-2 py-2.5 text-neutral-700 max-w-xs truncate">
                              {e.description}
                            </td>
                            <td className="px-2 py-2.5 text-neutral-600">
                              {e.responsible}
                            </td>
                            <td className="px-2 py-2.5 text-neutral-600">
                              {e.paymentMethod}
                            </td>
                            <td className="py-2.5 pl-2 pr-3 text-right font-mono-numbers font-bold text-rose-700">
                              -{formatBs(e.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pie sobrio */}
        <div className="pt-6 border-t border-neutral-200 text-xs text-neutral-400">
          SISTEMA LYLA · Santa Cruz de la Sierra, Bolivia · Reporte Financiero Auditado
        </div>
      </div>
    </div>
  );
};
