import React, { useState, useMemo } from 'react';
import {
  Clock,
  Banknote,
  QrCode,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  PlayCircle,
  ShieldAlert,
  Wallet,
  X,
  Download,
  FileText,
} from 'lucide-react';
import { Sale, Expense, ShiftClose, ShiftOpening, PaymentMethod, Reservation } from '../types';
import { formatBs, round2, formatDateTime, formatDate, formatTime, getTodayDateString, getBoliviaDateString } from '../utils/formatters';
import { exportShiftCloseToPdf } from '../utils/exporter';

interface DailyCloseModuleProps {
  sales: Sale[];
  expenses: Expense[];
  shifts: ShiftClose[];
  shiftOpenings: ShiftOpening[];
  reservations?: Reservation[];
  onOpenShift: (openingData: ShiftOpening) => void;
  onCloseShift: (shiftData: ShiftClose) => void;
  onTriggerStartShift?: () => void;
  onReopenShift?: (date: string, responsible: string, reason: string) => void;
}

export const DailyCloseModule: React.FC<DailyCloseModuleProps> = ({
  sales,
  expenses,
  shifts,
  shiftOpenings,
  reservations,
  onOpenShift,
  onCloseShift,
  onTriggerStartShift,
  onReopenShift,
}) => {
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());

  // Modal Confirmar Cierre de Jornada (con arqueo y prevención de clics falsos)
  const [isConfirmCloseModalOpen, setIsConfirmCloseModalOpen] = useState(false);
  const [closedBy, setClosedBy] = useState<'Roly' | 'Keyla'>('Roly');
  const [closingNotes, setClosingNotes] = useState('');
  const [differenceExplanation, setDifferenceExplanation] = useState('');
  const [realCashInput, setRealCashInput] = useState<string>('');
  const [realQrInput, setRealQrInput] = useState<string>('');
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);

  // Modal Reapertura Auditada
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenResponsible, setReopenResponsible] = useState<'Roly' | 'Keyla'>('Roly');
  const [reopenReason, setReopenReason] = useState('');

  // Check if shift is already closed for the selected date
  const existingShiftForDate = useMemo(() => {
    return shifts.find((s) => s.date === selectedDate);
  }, [shifts, selectedDate]);

  // Check if shift was opened for the selected date
  const currentOpening = useMemo(() => {
    return shiftOpenings.find((o) => o.date === selectedDate);
  }, [shiftOpenings, selectedDate]);

  // Sales for selected date (not cancelled)
  const dateSales = useMemo(() => {
    return sales.filter((s) => s.status !== 'ANULADA' && getBoliviaDateString(s.createdAt) === selectedDate);
  }, [sales, selectedDate]);

  // Expenses for selected date
  const dateExpenses = useMemo(() => {
    return expenses.filter((e) => getBoliviaDateString(e.date) === selectedDate);
  }, [expenses, selectedDate]);

  // Sales Breakdown
  const salesSummary = useMemo(() => {
    let cash = 0;
    let qr = 0;
    let discounts = 0;
    let total = 0;

    dateSales.forEach((s) => {
      if (s.paymentMethod === 'Efectivo') {
        cash += s.cashAmount !== undefined ? s.cashAmount : s.total;
      } else if (s.paymentMethod === 'QR') {
        qr += s.qrAmount !== undefined ? s.qrAmount : s.total;
      } else if (s.paymentMethod === 'Mixto') {
        cash += Number(s.cashAmount || 0);
        qr += Number(s.qrAmount || 0);
      }
      discounts += s.discount;
      total += s.total;
    });

    return {
      cash: round2(cash),
      qr: round2(qr),
      discounts: round2(discounts),
      total: round2(total),
      count: dateSales.length,
    };
  }, [dateSales]);

  // Reservation Deposits received on selectedDate (Adelantos recibidos en efectivo o QR)
  const dateReservationDeposits = useMemo(() => {
    if (!reservations) return { total: 0, cash: 0, qr: 0, count: 0 };
    let c = 0;
    let q = 0;
    const list = reservations.filter((r) => r.createdAt.startsWith(selectedDate));
    list.forEach((r) => {
      if (r.depositPaymentMethod === 'Efectivo') c += r.depositAmount;
      else if (r.depositPaymentMethod === 'QR') q += r.depositAmount;
    });
    return {
      total: round2(c + q),
      cash: round2(c),
      qr: round2(q),
      count: list.length,
    };
  }, [reservations, selectedDate]);

  // Retained deposits from cancelled/expired reservations on selected date
  const dateRetainedDeposits = useMemo(() => {
    if (!reservations) return { total: 0, count: 0 };
    const list = reservations.filter(
      (r) =>
        (r.status === 'CANCELADA' || r.status === 'VENCIDA') &&
        r.cancelledAt &&
        r.cancelledAt.startsWith(selectedDate)
    );
    const total = list.reduce((sum, r) => sum + (r.retainedDeposit || r.depositAmount || 0), 0);
    return {
      total: round2(total),
      count: list.length,
    };
  }, [reservations, selectedDate]);

  // Expenses Breakdown
  const expensesSummary = useMemo(() => {
    let total = 0;
    let cashExpenses = 0;
    let qrExpenses = 0;
    const catMap: Record<string, number> = {};

    dateExpenses.forEach((e) => {
      const amt = Number(e.amount) || 0;
      total += amt;
      if (e.paymentMethod === 'Efectivo') cashExpenses += amt;
      else if (e.paymentMethod === 'QR') qrExpenses += amt;
      catMap[e.category] = (catMap[e.category] || 0) + amt;
    });

    return {
      total: round2(total),
      cashExpenses: round2(cashExpenses),
      qrExpenses: round2(qrExpenses),
      byCategory: catMap,
      list: dateExpenses,
      count: dateExpenses.length,
    };
  }, [dateExpenses]);

  // Initial Petty Cash
  const initialCashAmount = currentOpening ? currentOpening.initialCash : 0;
  const initialQrAmount = currentOpening ? currentOpening.initialQr : 0;
  const initialTotal = currentOpening ? currentOpening.totalInitial : 0;

  // Expected Final Cash in Drawer = Caja inicial en efectivo + ventas en efectivo - gastos en efectivo
  const expectedFinalCash = useMemo(() => {
    return round2(initialCashAmount + salesSummary.cash - expensesSummary.cashExpenses);
  }, [initialCashAmount, salesSummary.cash, expensesSummary.cashExpenses]);

  // Expected Final QR Balance = QR inicial + ventas QR - gastos QR
  const expectedFinalQr = useMemo(() => {
    return round2(initialQrAmount + salesSummary.qr - expensesSummary.qrExpenses);
  }, [initialQrAmount, salesSummary.qr, expensesSummary.qrExpenses]);

  // Total Expected Money = Efectivo esperado + QR esperado
  const expectedTotalMoney = useMemo(() => {
    return round2(expectedFinalCash + expectedFinalQr);
  }, [expectedFinalCash, expectedFinalQr]);

  // Operational Flow (Total Vendido - Total Gastado)
  const operationalFlow = useMemo(() => {
    return round2(salesSummary.total - expensesSummary.total);
  }, [salesSummary.total, expensesSummary.total]);

  // Iniciar Jornada Submit
  // Terminar Jornada Submit (Confirmado tras diálogo anti-clic falso y arqueo físico)
  const handleExecuteCloseShift = () => {
    if (!currentOpening) {
      alert('Obligatoriamente debe iniciar la jornada antes de poder cerrarla.');
      return;
    }
    if (existingShiftForDate && !existingShiftForDate.isReopened) {
      alert(`La jornada para la fecha ${formatDate(selectedDate)} ya fue finalizada anteriormente.`);
      return;
    }

    const realCashNum = parseFloat(realCashInput) || 0;
    const realQrNum = parseFloat(realQrInput) || 0;
    const realTotalMoney = round2(realCashNum + realQrNum);
    const cashDiff = round2(realCashNum - expectedFinalCash);
    const qrDiff = round2(realQrNum - expectedFinalQr);
    const totalDiff = round2(realTotalMoney - expectedTotalMoney);
    const hasDiff = Math.abs(cashDiff) > 0.01 || Math.abs(qrDiff) > 0.01 || Math.abs(totalDiff) > 0.01;

    // Regla obligatoria: Si existe cualquier diferencia, exigir obligatoriamente una explicación antes de permitir cerrar la jornada
    if (hasDiff && !differenceExplanation.trim()) {
      alert('Existe una diferencia en el arqueo de caja o saldo QR (Faltante o Sobrante). Es OBLIGATORIO registrar una explicación o justificación antes de poder cerrar la jornada.');
      return;
    }

    const shiftData: ShiftClose = {
      id: `shift-${selectedDate}-${Date.now()}`,
      date: selectedDate,
      openedAt: currentOpening?.openedAt,
      openedBy: currentOpening?.openedBy,
      closedAt: new Date().toISOString(),
      closedBy,
      initialCash: initialCashAmount,
      initialQr: initialQrAmount,
      totalInitial: initialTotal,
      totalSales: salesSummary.total,
      cashSales: salesSummary.cash,
      qrSales: salesSummary.qr,
      salesCount: salesSummary.count,
      totalDiscounts: salesSummary.discounts,
      totalExpenses: expensesSummary.total,
      cashExpenses: expensesSummary.cashExpenses,
      qrExpenses: expensesSummary.qrExpenses,
      expensesByCategory: expensesSummary.byCategory,
      expensesSummary: dateExpenses.map((e) => ({
        category: e.category,
        description: e.description,
        amount: e.amount,
        paymentMethod: e.paymentMethod,
        responsible: e.responsible,
      })),
      operationalFlow,
      finalExpectedCash: expectedFinalCash,
      finalExpectedQr: expectedFinalQr,
      expectedTotalMoney,
      realCashCounted: realCashNum,
      realQrVerified: realQrNum,
      realTotalMoney,
      cashDifference: cashDiff,
      qrDifference: qrDiff,
      totalDifference: totalDiff,
      differenceReason: hasDiff ? differenceExplanation.trim() : undefined,
      notes: closingNotes.trim() || undefined,
    };

    onCloseShift(shiftData);
    setIsConfirmCloseModalOpen(false);
    setClosingNotes('');
    setDifferenceExplanation('');
    setActiveTab('history');
  };

  // Reapertura Controlada y Auditada
  const handleExecuteReopen = () => {
    if (!reopenReason.trim()) {
      alert('Debe especificar el motivo o justificación de la reapertura de jornada.');
      return;
    }
    if (onReopenShift) {
      onReopenShift(selectedDate, reopenResponsible, reopenReason.trim());
    }
    setIsReopenModalOpen(false);
    setReopenReason('');
  };

  return (
    <div className="space-y-6">
      {/* Barra Superior */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-neutral-900 p-6 text-white shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-6 w-6 text-amber-400" />
            <h2 className="font-brand text-2xl font-bold tracking-tight">
              CONTROL DE JORNADA DIARIA
            </h2>
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            Apertura de caja chica, registro de movimientos y cierre oficial de jornada
          </p>
        </div>

        <div className="flex items-center rounded-xl bg-neutral-800 p-1">
          <button
            onClick={() => setActiveTab('current')}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'current'
                ? 'bg-amber-400 text-neutral-950 font-bold shadow-xs'
                : 'text-neutral-300 hover:text-white'
            }`}
          >
            Jornada de Hoy
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'history'
                ? 'bg-amber-400 text-neutral-950 font-bold shadow-xs'
                : 'text-neutral-300 hover:text-white'
            }`}
          >
            Historial de Jornadas ({shifts.length})
          </button>
        </div>
      </div>

      {activeTab === 'current' ? (
        <div className="space-y-6">
          {/* Barra de Estado y Botón Iniciar Jornada */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-neutral-500" />
              <div>
                <span className="text-xs text-neutral-500">Fecha de la jornada:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="block font-mono text-sm font-bold text-neutral-900 outline-none"
                />
              </div>
            </div>

            {/* Estado de Apertura de la Jornada */}
            <div className="flex items-center gap-3">
              {existingShiftForDate ? (
                <div className="flex items-center gap-2 rounded-xl bg-neutral-100 px-3.5 py-2 text-neutral-700 text-xs font-medium">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span>Jornada finalizada por {existingShiftForDate.closedBy}</span>
                </div>
              ) : currentOpening ? (
                <div className="rounded-xl bg-emerald-50 px-3.5 py-2 border border-emerald-200 text-emerald-900 text-xs">
                  <span className="font-bold">Jornada Iniciada por {currentOpening.openedBy}</span>
                  <span className="text-emerald-700 block text-[11px]">
                    Caja chica: {formatBs(currentOpening.totalInitial)} (Ef: {formatBs(currentOpening.initialCash)} · QR: {formatBs(currentOpening.initialQr)})
                  </span>
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 px-3.5 py-2 border border-amber-200 text-amber-900 text-xs">
                  <span>Jornada en curso (caja chica no registrada)</span>
                </div>
              )}
            </div>
          </div>

          {/* Tarjeta de Caja Chica y Arqueo Físico */}
          {currentOpening && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
              <div className="flex items-center gap-2 text-rose-950 mb-3">
                <Wallet className="h-5 w-5" />
                <h3 className="text-sm font-bold text-neutral-900">
                  Caja Chica y Arqueo de Dinero en Tienda
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-neutral-50 p-3.5 border border-neutral-200">
                  <span className="text-xs text-neutral-500">Caja Chica Inicial (Apertura)</span>
                  <p className="mt-1 font-mono-numbers text-xl font-bold text-neutral-900">
                    {formatBs(initialTotal)}
                  </p>
                  <span className="text-[11px] text-neutral-500">
                    Efectivo: {formatBs(initialCashAmount)} · QR: {formatBs(initialQrAmount)}
                  </span>
                </div>

                <div className="rounded-xl bg-neutral-50 p-3.5 border border-neutral-200">
                  <span className="text-xs text-neutral-500">Efectivo Físico Esperado en Caja</span>
                  <p className="mt-1 font-mono-numbers text-xl font-bold text-emerald-800">
                    {formatBs(expectedFinalCash)}
                  </p>
                  <span className="text-[11px] text-neutral-500">
                    Inicial ({formatBs(initialCashAmount)}) + Ventas ({formatBs(salesSummary.cash)}) − Gastos ({formatBs(expensesSummary.cashExpenses)})
                  </span>
                </div>

                <div className="rounded-xl bg-neutral-50 p-3.5 border border-neutral-200">
                  <span className="text-xs text-neutral-500">Saldo QR / Banco Esperado</span>
                  <p className="mt-1 font-mono-numbers text-xl font-bold text-blue-800">
                    {formatBs(expectedFinalQr)}
                  </p>
                  <span className="text-[11px] text-neutral-500">
                    Inicial ({formatBs(initialQrAmount)}) + Ventas ({formatBs(salesSummary.qr)}) − Gastos ({formatBs(expensesSummary.qrExpenses)})
                  </span>
                </div>

                <div className="rounded-xl bg-amber-50/60 p-3.5 border border-amber-200/80">
                  <span className="text-xs font-semibold text-amber-900">Total Dinero Esperado</span>
                  <p className="mt-1 font-mono-numbers text-xl font-bold text-amber-950">
                    {formatBs(expectedTotalMoney)}
                  </p>
                  <span className="text-[11px] text-amber-700">
                    Efectivo ({formatBs(expectedFinalCash)}) + QR ({formatBs(expectedFinalQr)})
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Secciones de Ventas y Gastos */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* SECCIÓN DE VENTAS */}
            <div className="rounded-2xl border-2 border-emerald-500/30 bg-white p-6 shadow-xs space-y-5">
              <div className="border-b border-neutral-100 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  SECCIÓN DE VENTAS
                </span>
                <h3 className="mt-1 font-brand text-xl font-bold text-neutral-900">
                  TOTAL DE VENTAS DEL DÍA
                </h3>
                <div className="mt-3 font-mono-numbers text-3xl font-extrabold text-emerald-700">
                  {formatBs(salesSummary.total)}
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between rounded-xl bg-neutral-50 p-3">
                  <div className="flex items-center gap-2 text-neutral-700">
                    <Banknote className="h-4 w-4 text-emerald-600" />
                    <span>Ventas en Efectivo:</span>
                  </div>
                  <span className="font-mono-numbers text-sm font-bold text-neutral-900">
                    {formatBs(salesSummary.cash)}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-neutral-50 p-3">
                  <div className="flex items-center gap-2 text-neutral-700">
                    <QrCode className="h-4 w-4 text-blue-600" />
                    <span>Ventas mediante QR:</span>
                  </div>
                  <span className="font-mono-numbers text-sm font-bold text-neutral-900">
                    {formatBs(salesSummary.qr)}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-neutral-100 pt-2 text-neutral-600">
                  <span>Cantidad de Operaciones:</span>
                  <span className="font-mono font-bold text-neutral-900">
                    {salesSummary.count} ventas
                  </span>
                </div>

                <div className="flex items-center justify-between text-neutral-600">
                  <span>Descuentos Aplicados:</span>
                  <span className="font-mono-numbers text-rose-700 font-bold">
                    {salesSummary.discounts > 0 ? `-${formatBs(salesSummary.discounts)}` : 'Bs 0.00'}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-neutral-200 pt-2 font-bold text-neutral-900 text-sm">
                  <span>Total General de Ventas:</span>
                  <span className="font-mono-numbers text-emerald-800">
                    {formatBs(salesSummary.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* SECCIÓN DE GASTOS */}
            <div className="rounded-2xl border-2 border-rose-500/30 bg-white p-6 shadow-xs space-y-5">
              <div className="border-b border-neutral-100 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                  SECCIÓN DE GASTOS
                </span>
                <h3 className="mt-1 font-brand text-xl font-bold text-neutral-900">
                  TOTAL DE GASTOS DEL DÍA
                </h3>
                <div className="mt-3 font-mono-numbers text-3xl font-extrabold text-rose-800">
                  {formatBs(expensesSummary.total)}
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between rounded-xl bg-neutral-50 p-2.5">
                  <div className="flex items-center gap-2 text-neutral-700">
                    <Banknote className="h-4 w-4 text-rose-600" />
                    <span>Gastos en Efectivo:</span>
                  </div>
                  <span className="font-mono-numbers font-bold text-neutral-900">
                    {formatBs(expensesSummary.cashExpenses)}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-neutral-50 p-2.5">
                  <div className="flex items-center gap-2 text-neutral-700">
                    <QrCode className="h-4 w-4 text-blue-600" />
                    <span>Gastos mediante QR:</span>
                  </div>
                  <span className="font-mono-numbers font-bold text-neutral-900">
                    {formatBs(expensesSummary.qrExpenses)}
                  </span>
                </div>
              </div>

              {dateExpenses.length === 0 ? (
                <div className="py-6 text-center text-xs text-neutral-400">
                  No se registraron gastos operativos durante esta jornada.
                </div>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto divide-y divide-neutral-100 pr-1 text-xs">
                  {dateExpenses.map((exp) => (
                    <div key={exp.id} className="pt-2 flex items-center justify-between">
                      <div className="min-w-0 flex-1 pr-2">
                        <span className="font-semibold text-neutral-900 block truncate">
                          {exp.category}: {exp.description}
                        </span>
                        <span className="text-[11px] text-neutral-400">
                          {exp.responsible} · {exp.paymentMethod}
                        </span>
                      </div>
                      <span className="font-mono-numbers font-bold text-neutral-900">
                        {formatBs(exp.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-neutral-200 pt-3 flex justify-between font-bold text-neutral-900 text-sm">
                <span>Total de Gastos ({expensesSummary.count} conceptos):</span>
                <span className="font-mono-numbers text-rose-800">
                  {formatBs(expensesSummary.total)}
                </span>
              </div>
            </div>
          </div>

          {/* RESULTADO DE LA JORNADA */}
          <div className="rounded-2xl border border-neutral-300 bg-white p-6 shadow-sm">
            <h3 className="font-brand text-lg font-bold text-neutral-900 mb-4">
              RESULTADO DE LA JORNADA (Flujo Operativo Diario)
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-neutral-50 p-4 border border-neutral-200">
                <span className="text-xs text-neutral-500">Total Vendido</span>
                <p className="mt-1 font-mono-numbers text-2xl font-bold text-neutral-900">
                  {formatBs(salesSummary.total)}
                </p>
                <span className="text-[11px] text-neutral-400">Cobrado hoy</span>
              </div>

              <div className="rounded-xl bg-neutral-50 p-4 border border-neutral-200">
                <span className="text-xs text-neutral-500">Total Gastado</span>
                <p className="mt-1 font-mono-numbers text-2xl font-bold text-neutral-900">
                  {formatBs(expensesSummary.total)}
                </p>
                <span className="text-[11px] text-neutral-400">Egresos hoy</span>
              </div>

              <div className={`rounded-xl p-4 border ${
                operationalFlow >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
              }`}>
                <span className="text-xs font-semibold text-neutral-700">Diferencia (Ventas − Gastos)</span>
                <p className={`mt-1 font-mono-numbers text-2xl font-bold ${
                  operationalFlow >= 0 ? 'text-emerald-900' : 'text-rose-900'
                }`}>
                  {formatBs(operationalFlow)}
                </p>
                <span className="text-[11px] font-medium text-neutral-600">Flujo neto en caja</span>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-50/80 p-3.5 border border-amber-200 text-amber-950 text-xs">
              <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <p>
                <strong>Nota Contable:</strong> La diferencia entre ventas y gastos representa el flujo de caja operativo del día. Para conocer la rentabilidad neta oficial considerando el costo de mercadería vendida, revise el <strong>Estado de Resultados</strong>.
              </p>
            </div>

            {/* BOTÓN TERMINAR JORNADA (Obligatoriamente iniciado, no duplicado, con arqueo real) */}
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-neutral-100 pt-5">
              <span className="text-xs text-neutral-500">
                Terminar la jornada registrará el arqueo final y guardará el resumen. No se reiniciará el inventario.
              </span>

              {!currentOpening ? (
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
                  <span className="text-xs text-amber-700 font-semibold bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                    ⚠️ Debe iniciar la jornada antes de poder cerrarla
                  </span>
                  {onTriggerStartShift && (
                    <button
                      type="button"
                      onClick={onTriggerStartShift}
                      className="rounded-xl bg-amber-600 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md hover:bg-amber-700 transition active:scale-98"
                    >
                      INICIAR JORNADA AHORA
                    </button>
                  )}
                  <button
                    disabled
                    className="rounded-xl bg-neutral-200 px-6 py-3 text-xs font-bold uppercase tracking-wider text-neutral-400 cursor-not-allowed"
                    title="No se puede cerrar una jornada que no ha sido iniciada"
                  >
                    TERMINAR JORNADA (BLOQUEADO)
                  </button>
                </div>
              ) : existingShiftForDate && !existingShiftForDate.isReopened ? (
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
                  <div className="rounded-xl bg-neutral-100 px-4 py-2.5 text-xs font-semibold text-neutral-700 border border-neutral-200">
                    ✓ Jornada Oficialmente Cerrada por {existingShiftForDate.closedBy} a las {formatTime(existingShiftForDate.closedAt)}
                  </div>
                  {onReopenShift && (
                    <button
                      type="button"
                      onClick={() => setIsReopenModalOpen(true)}
                      className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-2.5 text-xs font-bold text-rose-950 hover:bg-rose-100 transition shadow-xs"
                    >
                      Reapertura Auditada de Jornada
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {existingShiftForDate?.isReopened && (
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                      🔓 Jornada en Reapertura Auditada
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setRealCashInput(expectedFinalCash.toString());
                      setRealQrInput(expectedFinalQr.toString());
                      setIsConfirmCloseModalOpen(true);
                    }}
                    className="rounded-xl bg-rose-950 px-8 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md hover:bg-rose-900 transition active:scale-98"
                  >
                    TERMINAR JORNADA
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Historial de Jornadas Anteriores */
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
          <div className="mb-4">
            <h3 className="text-base font-bold text-neutral-900">
              Historial de Jornadas Anteriores Cerradas
            </h3>
            <p className="text-xs text-neutral-500">
              Consulte resúmenes diarios cerrados para evitar duplicidad de contabilizaciones
            </p>
          </div>

          {shifts.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400">
              No hay jornadas finalizadas todavía en el historial.
            </div>
          ) : (
            <div className="space-y-3">
              {shifts.map((shift) => {
                const isExpanded = expandedShiftId === shift.id;
                return (
                  <div
                    key={shift.id}
                    className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-neutral-900">
                            Jornada: {formatDate(shift.date)}
                          </span>
                          <span className="rounded-md bg-neutral-200 px-2 py-0.5 text-[11px] font-semibold text-neutral-700">
                            Cerrada por {shift.closedBy}
                          </span>
                          {shift.openedBy && (
                            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              Abierta por {shift.openedBy}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          Registrado el {formatDateTime(shift.closedAt)} · {shift.salesCount} ventas
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-xs text-neutral-500 block">Flujo Operativo:</span>
                          <span className="font-mono-numbers text-base font-bold text-neutral-900">
                            {formatBs(shift.operationalFlow)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => exportShiftCloseToPdf(shift)}
                            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-2xs transition"
                            title="Descargar Acta de Cierre en PDF"
                          >
                            <Download className="h-3.5 w-3.5 text-rose-900" />
                            <span className="hidden sm:inline">Acta PDF</span>
                          </button>

                          <button
                            onClick={() => setExpandedShiftId(isExpanded ? null : shift.id)}
                            className="rounded-lg border border-neutral-200 bg-white p-1.5 text-neutral-600 hover:bg-neutral-100"
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 border-t border-neutral-200 pt-4 space-y-4 text-xs">
                        {/* Indicadores Principales */}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="rounded-lg bg-white p-2.5 border border-neutral-200">
                            <span className="text-neutral-500 text-[11px]">Caja Chica Inicial</span>
                            <p className="font-mono-numbers font-bold text-neutral-900">{formatBs(shift.totalInitial || 0)}</p>
                            <span className="text-[10px] text-neutral-400">Ef: {formatBs(shift.initialCash || 0)} · QR: {formatBs(shift.initialQr || 0)}</span>
                          </div>
                          <div className="rounded-lg bg-white p-2.5 border border-neutral-200">
                            <span className="text-neutral-500 text-[11px]">Total Vendido</span>
                            <p className="font-mono-numbers font-bold text-emerald-800">{formatBs(shift.totalSales)}</p>
                            <span className="text-[10px] text-neutral-400">Ef: {formatBs(shift.cashSales)} · QR: {formatBs(shift.qrSales)}</span>
                          </div>
                          <div className="rounded-lg bg-white p-2.5 border border-neutral-200">
                            <span className="text-neutral-500 text-[11px]">Total Gastado</span>
                            <p className="font-mono-numbers font-bold text-rose-800">{formatBs(shift.totalExpenses)}</p>
                            <span className="text-[10px] text-neutral-400">Ef: {formatBs(shift.cashExpenses || 0)} · QR: {formatBs(shift.qrExpenses || 0)}</span>
                          </div>
                          <div className="rounded-lg bg-white p-2.5 border border-neutral-200">
                            <span className="text-neutral-500 text-[11px]">Flujo Neto Operativo</span>
                            <p className="font-mono-numbers font-bold text-neutral-900">{formatBs(shift.operationalFlow)}</p>
                            <span className="text-[10px] text-neutral-400">Ventas - Gastos</span>
                          </div>
                        </div>

                        {/* ARQUEO DE CAJA Y CUADRE REAL */}
                        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 space-y-3">
                          <span className="font-bold text-neutral-800 block text-xs">
                            Arqueo de Caja y Comparación de Montos:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            {/* Arqueo Efectivo */}
                            <div className="rounded-lg bg-neutral-50 p-2.5 border border-neutral-200 space-y-1">
                              <span className="font-semibold text-neutral-700 block">Efectivo Físico en Gaveta:</span>
                              <div className="flex justify-between text-[11px] text-neutral-600">
                                <span>Esperado:</span>
                                <span className="font-mono font-bold text-neutral-900">{formatBs(shift.finalExpectedCash)}</span>
                              </div>
                              <div className="flex justify-between text-[11px] text-neutral-600">
                                <span>Contado Real:</span>
                                <span className="font-mono font-bold text-neutral-900">{formatBs(shift.realCashCounted ?? shift.finalExpectedCash)}</span>
                              </div>
                              <div className="flex justify-between text-[11px] pt-1 border-t border-neutral-200 font-bold">
                                <span>Diferencia:</span>
                                <span className={
                                  Math.abs(shift.cashDifference ?? 0) <= 0.01
                                    ? 'text-emerald-700 font-mono'
                                    : (shift.cashDifference ?? 0) > 0
                                    ? 'text-blue-700 font-mono'
                                    : 'text-rose-700 font-mono'
                                }>
                                  {Math.abs(shift.cashDifference ?? 0) <= 0.01
                                    ? '✓ Exacto (Cuadre)'
                                    : (shift.cashDifference ?? 0) > 0
                                    ? `+${formatBs(shift.cashDifference!)} (Sobrante)`
                                    : `-${formatBs(Math.abs(shift.cashDifference!))} (Faltante)`}
                                </span>
                              </div>
                            </div>

                            {/* Arqueo QR */}
                            <div className="rounded-lg bg-neutral-50 p-2.5 border border-neutral-200 space-y-1">
                              <span className="font-semibold text-neutral-700 block">Saldo en QR / Banco:</span>
                              <div className="flex justify-between text-[11px] text-neutral-600">
                                <span>Esperado:</span>
                                <span className="font-mono font-bold text-neutral-900">{formatBs(shift.finalExpectedQr)}</span>
                              </div>
                              <div className="flex justify-between text-[11px] text-neutral-600">
                                <span>Verificado Real:</span>
                                <span className="font-mono font-bold text-neutral-900">{formatBs(shift.realQrVerified ?? shift.finalExpectedQr)}</span>
                              </div>
                              <div className="flex justify-between text-[11px] pt-1 border-t border-neutral-200 font-bold">
                                <span>Diferencia:</span>
                                <span className={
                                  Math.abs(shift.qrDifference ?? 0) <= 0.01
                                    ? 'text-emerald-700 font-mono'
                                    : (shift.qrDifference ?? 0) > 0
                                    ? 'text-blue-700 font-mono'
                                    : 'text-rose-700 font-mono'
                                }>
                                  {Math.abs(shift.qrDifference ?? 0) <= 0.01
                                    ? '✓ Exacto (Cuadre)'
                                    : (shift.qrDifference ?? 0) > 0
                                    ? `+${formatBs(shift.qrDifference!)} (Sobrante)`
                                    : `-${formatBs(Math.abs(shift.qrDifference!))} (Faltante)`}
                                </span>
                              </div>
                            </div>

                            {/* Resumen Total Dinero */}
                            {(() => {
                              const expTotal = shift.expectedTotalMoney ?? round2(shift.finalExpectedCash + shift.finalExpectedQr);
                              const realTotal = shift.realTotalMoney ?? round2((shift.realCashCounted ?? shift.finalExpectedCash) + (shift.realQrVerified ?? shift.finalExpectedQr));
                              const diffTotal = shift.totalDifference ?? round2((shift.cashDifference ?? 0) + (shift.qrDifference ?? 0));
                              return (
                                <div className="rounded-lg bg-neutral-50 p-2.5 border border-neutral-200 space-y-1">
                                  <span className="font-semibold text-neutral-700 block">Total Dinero Arqueado:</span>
                                  <div className="flex justify-between text-[11px] text-neutral-600">
                                    <span>Esperado:</span>
                                    <span className="font-mono font-bold text-neutral-900">{formatBs(expTotal)}</span>
                                  </div>
                                  <div className="flex justify-between text-[11px] text-neutral-600">
                                    <span>Total Real:</span>
                                    <span className="font-mono font-bold text-neutral-900">{formatBs(realTotal)}</span>
                                  </div>
                                  <div className="flex justify-between text-[11px] pt-1 border-t border-neutral-200 font-bold">
                                    <span>Diferencia:</span>
                                    <span className={
                                      Math.abs(diffTotal) <= 0.01
                                        ? 'text-emerald-700 font-mono'
                                        : diffTotal > 0
                                        ? 'text-blue-700 font-mono'
                                        : 'text-rose-700 font-mono'
                                    }>
                                      {Math.abs(diffTotal) <= 0.01
                                        ? '✓ Exacto (Cuadre)'
                                        : diffTotal > 0
                                        ? `+${formatBs(diffTotal)} (Sobrante)`
                                        : `-${formatBs(Math.abs(diffTotal))} (Faltante)`}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Justificación obligatoria si existió diferencia */}
                          {shift.differenceReason && (
                            <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-950">
                              <span className="font-bold block mb-0.5">Motivo / Justificación de la Diferencia:</span>
                              <p className="italic text-rose-900">{shift.differenceReason}</p>
                            </div>
                          )}
                        </div>

                        {shift.expensesSummary && shift.expensesSummary.length > 0 && (
                          <div className="rounded-lg bg-white p-3 border border-neutral-200">
                            <span className="font-bold text-neutral-700 block mb-2">Gastos de la Jornada:</span>
                            <div className="space-y-1">
                              {shift.expensesSummary.map((exp, idx) => (
                                <div key={idx} className="flex justify-between text-[11px] text-neutral-600">
                                  <span>{exp.category}: {exp.description} ({exp.responsible})</span>
                                  <span className="font-mono-numbers font-semibold text-neutral-900">{formatBs(exp.amount)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {shift.notes && (
                          <p className="text-[11px] text-neutral-500 italic">
                            Observaciones: {shift.notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: CONFIRMACIÓN Y ARQUEO FÍSICO PARA TERMINAR JORNADA */}
      {isConfirmCloseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 text-amber-600 border-b border-neutral-100 pb-3">
              <ShieldAlert className="h-7 w-7 text-amber-600 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-neutral-900">
                  Cierre Oficial de Jornada y Arqueo Físico
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Fecha: {formatDate(selectedDate)} · Santa Cruz de la Sierra, Bolivia
                </p>
              </div>
            </div>

            {(() => {
              const modalRealCash = parseFloat(realCashInput) || 0;
              const modalRealQr = parseFloat(realQrInput) || 0;
              const modalRealTotal = round2(modalRealCash + modalRealQr);
              const modalCashDiff = round2(modalRealCash - expectedFinalCash);
              const modalQrDiff = round2(modalRealQr - expectedFinalQr);
              const modalTotalDiff = round2(modalRealTotal - expectedTotalMoney);
              const modalHasDiff = Math.abs(modalCashDiff) > 0.01 || Math.abs(modalQrDiff) > 0.01 || Math.abs(modalTotalDiff) > 0.01;

              return (
                <>
                  {/* Resumen previo de operaciones */}
                  <div className="rounded-xl bg-neutral-50 p-3.5 space-y-2 text-xs border border-neutral-200">
                    <h4 className="font-bold text-neutral-800 uppercase tracking-wide text-[11px]">
                      1. Resumen de Movimientos de la Jornada
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="bg-white p-2 rounded-lg border border-neutral-200">
                        <span className="text-neutral-500 text-[10px] block">Caja Chica Inicial:</span>
                        <span className="font-mono-numbers font-bold text-neutral-900 block">{formatBs(initialTotal)}</span>
                        <span className="text-[10px] text-neutral-400">Ef: {formatBs(initialCashAmount)} · QR: {formatBs(initialQrAmount)}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-neutral-200">
                        <span className="text-neutral-500 text-[10px] block">Ventas Cobradas:</span>
                        <span className="font-mono-numbers font-bold text-emerald-800 block">{formatBs(salesSummary.total)}</span>
                        <span className="text-[10px] text-neutral-400">Ef: {formatBs(salesSummary.cash)} · QR: {formatBs(salesSummary.qr)}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-neutral-200">
                        <span className="text-neutral-500 text-[10px] block">Gastos Pagados:</span>
                        <span className="font-mono-numbers font-bold text-rose-800 block">-{formatBs(expensesSummary.total)}</span>
                        <span className="text-[10px] text-neutral-400">Ef: -{formatBs(expensesSummary.cashExpenses)} · QR: -{formatBs(expensesSummary.qrExpenses)}</span>
                      </div>
                    </div>

                    {/* Totales Esperados por Sistema */}
                    <div className="rounded-lg bg-neutral-100 p-2.5 border border-neutral-200">
                      <span className="font-bold text-neutral-800 block mb-1 text-[11px]">
                        Dinero Esperado por Sistema:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <span className="text-neutral-500 block">Efectivo en Caja:</span>
                          <strong className="font-mono text-emerald-800">{formatBs(expectedFinalCash)}</strong>
                        </div>
                        <div>
                          <span className="text-neutral-500 block">Saldo en QR/Banco:</span>
                          <strong className="font-mono text-blue-800">{formatBs(expectedFinalQr)}</strong>
                        </div>
                        <div>
                          <span className="text-neutral-500 block">Total Dinero Esperado:</span>
                          <strong className="font-mono text-neutral-900">{formatBs(expectedTotalMoney)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Formulario de Arqueo Físico (Efectivo y QR) */}
                  <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
                    <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
                      2. Arqueo Físico y Verificación Real
                    </h4>

                    {/* Conteo Efectivo */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <label className="font-semibold text-neutral-700">
                          Efectivo Físico Contado en Caja (Bs) *
                        </label>
                        <span className="text-[11px] text-neutral-500">
                          Esperado: <strong>{formatBs(expectedFinalCash)}</strong>
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={realCashInput}
                        onChange={(e) => setRealCashInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-sm font-bold text-neutral-900 outline-none focus:border-rose-900"
                      />
                      {/* Comparación Efectivo en Tiempo Real */}
                      {realCashInput !== '' && (
                        <div className="flex items-center justify-between text-[11px] pt-0.5">
                          <span className="text-neutral-500">Diferencia Efectivo:</span>
                          <span className={`font-mono font-bold ${
                            Math.abs(modalCashDiff) <= 0.01
                              ? 'text-emerald-700'
                              : modalCashDiff > 0
                              ? 'text-blue-700'
                              : 'text-rose-700'
                          }`}>
                            {Math.abs(modalCashDiff) <= 0.01
                              ? '✓ Cuadre exacto (Bs 0.00)'
                              : modalCashDiff > 0
                              ? `+${formatBs(modalCashDiff)} (Sobrante)`
                              : `-${formatBs(Math.abs(modalCashDiff))} (Faltante)`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Verificación QR */}
                    <div className="space-y-1 pt-2 border-t border-neutral-100">
                      <div className="flex justify-between text-xs">
                        <label className="font-semibold text-neutral-700">
                          Saldo Real Verificado en QR / Banco (Bs) *
                        </label>
                        <span className="text-[11px] text-neutral-500">
                          Esperado: <strong>{formatBs(expectedFinalQr)}</strong>
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={realQrInput}
                        onChange={(e) => setRealQrInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-sm font-bold text-neutral-900 outline-none focus:border-blue-900"
                      />
                      {/* Comparación QR en Tiempo Real */}
                      {realQrInput !== '' && (
                        <div className="flex items-center justify-between text-[11px] pt-0.5">
                          <span className="text-neutral-500">Diferencia QR:</span>
                          <span className={`font-mono font-bold ${
                            Math.abs(modalQrDiff) <= 0.01
                              ? 'text-emerald-700'
                              : modalQrDiff > 0
                              ? 'text-blue-700'
                              : 'text-rose-700'
                          }`}>
                            {Math.abs(modalQrDiff) <= 0.01
                              ? '✓ Cuadre exacto (Bs 0.00)'
                              : modalQrDiff > 0
                              ? `+${formatBs(modalQrDiff)} (Sobrante)`
                              : `-${formatBs(Math.abs(modalQrDiff))} (Faltante)`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Resumen Final del Arqueo (Total Dinero) */}
                    {(realCashInput !== '' || realQrInput !== '') && (
                      <div className="mt-2 rounded-xl bg-neutral-50 p-3 border border-neutral-200 space-y-1.5">
                        <span className="text-xs font-bold text-neutral-800 block">
                          3. Resumen Final de Dinero (Efectivo + QR)
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-neutral-500 text-[11px] block">Total Esperado:</span>
                            <span className="font-mono font-bold text-neutral-900">{formatBs(expectedTotalMoney)}</span>
                          </div>
                          <div>
                            <span className="text-neutral-500 text-[11px] block">Total Real Contado:</span>
                            <span className="font-mono font-bold text-neutral-900">{formatBs(modalRealTotal)}</span>
                          </div>
                          <div>
                            <span className="text-neutral-500 text-[11px] block">Diferencia Total:</span>
                            <span className={`font-mono font-bold ${
                              Math.abs(modalTotalDiff) <= 0.01
                                ? 'text-emerald-700'
                                : modalTotalDiff > 0
                                ? 'text-blue-700'
                                : 'text-rose-700'
                            }`}>
                              {Math.abs(modalTotalDiff) <= 0.01
                                ? '✓ Exacto (Bs 0.00)'
                                : modalTotalDiff > 0
                                ? `+${formatBs(modalTotalDiff)} (Sobrante)`
                                : `-${formatBs(Math.abs(modalTotalDiff))} (Faltante)`}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SECCIÓN OBLIGATORIA: Si existe faltante o sobrante, exigir explicación */}
                    {modalHasDiff && (
                      <div className="mt-3 rounded-xl border-2 border-rose-400 bg-rose-50/90 p-3.5 space-y-2">
                        <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                          <span>DIFERENCIA DETECTADA EN EL ARQUEO DE CIERRE</span>
                        </div>
                        <div className="text-[11px] text-rose-800 space-y-0.5">
                          {Math.abs(modalCashDiff) > 0.01 && (
                            <p>
                              • Diferencia Efectivo:{' '}
                              <strong>
                                {modalCashDiff > 0
                                  ? `+${formatBs(modalCashDiff)} (Sobrante)`
                                  : `-${formatBs(Math.abs(modalCashDiff))} (Faltante)`}
                              </strong>
                            </p>
                          )}
                          {Math.abs(modalQrDiff) > 0.01 && (
                            <p>
                              • Diferencia QR / Banco:{' '}
                              <strong>
                                {modalQrDiff > 0
                                  ? `+${formatBs(modalQrDiff)} (Sobrante)`
                                  : `-${formatBs(Math.abs(modalQrDiff))} (Faltante)`}
                              </strong>
                            </p>
                          )}
                          {Math.abs(modalTotalDiff) > 0.01 && (
                            <p>
                              • Diferencia Total en Dinero:{' '}
                              <strong>
                                {modalTotalDiff > 0
                                  ? `+${formatBs(modalTotalDiff)} (Sobrante Total)`
                                  : `-${formatBs(Math.abs(modalTotalDiff))} (Faltante Total)`}
                              </strong>
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-rose-950 mb-1">
                            Explicación / Justificación Obligatoria de la Diferencia *
                          </label>
                          <textarea
                            rows={2}
                            required
                            value={differenceExplanation}
                            onChange={(e) => setDifferenceExplanation(e.target.value)}
                            placeholder="Describa el motivo del faltante o sobrante (ej: error en cambio a clienta en venta #..., billete deteriorado, ajuste bancario)..."
                            className="w-full rounded-xl border border-rose-300 bg-white p-2.5 text-xs text-neutral-900 outline-none focus:border-rose-900 shadow-2xs"
                          />
                          <p className="text-[10px] text-rose-700 mt-1">
                            ⚠️ Es obligatorio justificar la diferencia para finalizar la jornada. No se alterarán las ventas ni gastos registrados.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Responsable de Cierre */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Responsable que Cierra la Jornada *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Roly', 'Keyla'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setClosedBy(r)}
                    className={`rounded-xl py-2 text-xs font-bold border transition ${
                      closedBy === r
                        ? 'border-rose-950 bg-rose-950 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Notas u Observaciones del Cierre (Opcional)
              </label>
              <textarea
                rows={2}
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Ej: Se entregó el dinero de caja a administración, etc."
                className="w-full rounded-xl border border-neutral-200 p-2.5 text-xs outline-none focus:border-rose-900"
              />
            </div>

            {/* Botones Claros Anti-Falsos Clics */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setIsConfirmCloseModalOpen(false)}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition"
              >
                Cancelar y Continuar Jornada
              </button>
              <button
                type="button"
                onClick={handleExecuteCloseShift}
                className="rounded-xl bg-rose-950 px-5 py-2.5 text-xs font-bold text-white hover:bg-rose-900 transition shadow-xs"
              >
                Confirmar y Finalizar Jornada
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REAPERTURA CONTROLADA Y AUDITADA DE JORNADA */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-900 border-b border-neutral-100 pb-3">
              <ShieldAlert className="h-6 w-6 text-rose-900 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-neutral-900">
                  Reapertura Auditada de Jornada
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Permite reanudar temporalmente el registro de operaciones de la jornada
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              La jornada para el día <strong>{formatDate(selectedDate)}</strong> fue finalizada. Para reactivarla es obligatorio especificar el supervisor que autoriza y el motivo exacto para fines de auditoría.
            </p>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Supervisor que Autoriza la Reapertura *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Roly', 'Keyla'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReopenResponsible(r)}
                    className={`rounded-xl py-2 text-xs font-bold border transition ${
                      reopenResponsible === r
                        ? 'border-rose-950 bg-rose-950 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Motivo / Justificación de la Reapertura *
              </label>
              <textarea
                rows={3}
                required
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Ej: Clienta rezagada pasó a retirar cartera de reserva; ajuste de gasto imprevisto de transporte..."
                className="w-full rounded-xl border border-neutral-300 p-2.5 text-xs outline-none focus:border-rose-900"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => {
                  setIsReopenModalOpen(false);
                  setReopenReason('');
                }}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!reopenReason.trim()}
                onClick={handleExecuteReopen}
                className={`rounded-xl px-5 py-2 text-xs font-bold text-white transition ${
                  !reopenReason.trim()
                    ? 'bg-neutral-300 cursor-not-allowed'
                    : 'bg-rose-950 hover:bg-rose-900'
                }`}
              >
                Autorizar Reapertura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
