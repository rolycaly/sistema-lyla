import React, { useState, useMemo } from 'react';
import {
  BookmarkCheck,
  Search,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
  QrCode,
  Calendar,
  User,
  Phone,
  AtSign,
  Tag,
  ArrowRight,
  Printer,
  X,
  AlertCircle,
  Store,
  Share2,
} from 'lucide-react';
import {
  Reservation,
  ReservationItem,
  ReservationChannel,
  Product,
  PaymentMethod,
} from '../types';
import { formatBs, round2, formatDateTime, formatDate, getTodayDateString } from '../utils/formatters';

interface ReservationsModuleProps {
  reservations: Reservation[];
  products: Product[];
  onAddReservation: (resData: Omit<Reservation, 'id' | 'createdAt'>) => void;
  onCompleteReservation: (
    reservationId: string,
    paymentMethod: PaymentMethod,
    cashAmount: number,
    qrAmount: number,
    amountReceived?: number
  ) => void;
  onCancelReservation: (reservationId: string, reason: string, responsible?: string) => void;
  isShiftOpen?: boolean;
  isShiftClosed?: boolean;
  onTriggerStartShift?: () => void;
}

const CHANNELS: ReservationChannel[] = [
  'Live TikTok',
  'Live Facebook',
  'Live Instagram',
  'WhatsApp',
  'Tienda Física',
  'Otro',
];

export const ReservationsModule: React.FC<ReservationsModuleProps> = ({
  reservations,
  products,
  onAddReservation,
  onCompleteReservation,
  onCancelReservation,
  isShiftOpen = true,
  isShiftClosed = false,
  onTriggerStartShift,
}) => {
  // Navigation & filters
  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'cancelled'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  // Modal: Nueva Reserva
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerPhone, setFormCustomerPhone] = useState('');
  const [formCustomerSocialUser, setFormCustomerSocialUser] = useState('');
  const [formChannel, setFormChannel] = useState<ReservationChannel>('Live TikTok');
  const [formProductId, setFormProductId] = useState('');
  const [formSelectedColor, setFormSelectedColor] = useState('');
  const [formQuantity, setFormQuantity] = useState('1');
  const [formDepositAmount, setFormDepositAmount] = useState('20');
  const [formDepositPaymentMethod, setFormDepositPaymentMethod] = useState<'Efectivo' | 'QR'>('QR');
  const [formExpirationDays, setFormExpirationDays] = useState('7');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Modal: Entregar y Cobrar Saldo (Completar Reserva)
  const [completingReservation, setCompletingReservation] = useState<Reservation | null>(null);
  const [balancePaymentMethod, setBalancePaymentMethod] = useState<PaymentMethod>('Efectivo');
  const [balanceCashAmount, setBalanceCashAmount] = useState('');
  const [balanceQrAmount, setBalanceQrAmount] = useState('');
  const [balanceAmountReceived, setBalanceAmountReceived] = useState('');

  // Modal: Cancelar Reserva (Retención del 100% del adelanto)
  const [cancellingReservation, setCancellingReservation] = useState<Reservation | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationResponsible, setCancellationResponsible] = useState<'Roly' | 'Keyla'>('Roly');

  // Modal: Ver Comprobante
  const [viewingTicketReservation, setViewingTicketReservation] = useState<Reservation | null>(null);

  // Selected product in New Reservation form
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === formProductId) || null;
  }, [products, formProductId]);

  // Product price & total in form
  const formProductTotal = useMemo(() => {
    if (!selectedProduct) return 0;
    const qty = parseInt(formQuantity, 10) || 1;
    return round2(selectedProduct.salePrice * qty);
  }, [selectedProduct, formQuantity]);

  const formDepositNum = useMemo(() => {
    const val = parseFloat(formDepositAmount);
    return isNaN(val) || val < 0 ? 0 : round2(val);
  }, [formDepositAmount]);

  const formRemainingBalance = useMemo(() => {
    return round2(Math.max(0, formProductTotal - formDepositNum));
  }, [formProductTotal, formDepositNum]);

  // Open Add Modal
  const handleOpenAddModal = () => {
    setFormCustomerName('');
    setFormCustomerPhone('');
    setFormCustomerSocialUser('');
    setFormChannel('Live TikTok');
    setFormProductId(products[0]?.id || '');
    const firstP = products[0];
    const initialColor = firstP?.availableColors?.[0] || firstP?.color || '';
    setFormSelectedColor(initialColor);
    setFormQuantity('1');
    setFormDepositAmount('20');
    setFormDepositPaymentMethod('QR');
    setFormExpirationDays('3');
    setFormNotes('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  // Submit New Reservation
  const handleSaveAddReservation = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!isShiftOpen) {
      setFormError('No se puede registrar la reserva. Primero debe abrir la jornada del día desde el módulo de Jornada.');
      return;
    }
    if (isShiftClosed) {
      setFormError('La jornada de hoy se encuentra cerrada. Debe solicitar una reapertura auditada desde el módulo de Jornada para registrar operaciones.');
      return;
    }

    if (!formCustomerName.trim()) {
      setFormError('El nombre de la clienta es obligatorio.');
      return;
    }
    if (!selectedProduct) {
      setFormError('Debe seleccionar un producto.');
      return;
    }
    const qty = parseInt(formQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setFormError('La cantidad debe ser mayor a 0.');
      return;
    }
    if (qty > selectedProduct.stock) {
      setFormError(`Stock insuficiente. Solo quedan ${selectedProduct.stock} unidades disponibles.`);
      return;
    }
    if (selectedProduct.colorStock && formSelectedColor) {
      const colStock = Number(selectedProduct.colorStock[formSelectedColor]) || 0;
      if (qty > colStock) {
        setFormError(`Stock insuficiente para el color "${formSelectedColor}". Solo quedan ${colStock} unidades disponibles de este color.`);
        return;
      }
    }
    if (formDepositNum <= 0) {
      setFormError('El monto de anticipo o seña debe ser mayor a 0 Bs.');
      return;
    }
    if (formDepositNum > formProductTotal) {
      setFormError('El anticipo no puede superar el total del producto.');
      return;
    }

    const now = new Date();
    // Rule: Cada reserva debe vencer exactamente a los 7 días (168 horas) desde su creación
    const expiresAt = new Date(now.getTime() + 168 * 3600 * 1000).toISOString();
    const expDate = expiresAt.split('T')[0];

    const item: ReservationItem = {
      productId: selectedProduct.id,
      code: selectedProduct.code,
      name: selectedProduct.name,
      category: selectedProduct.category,
      selectedColor: formSelectedColor || selectedProduct.color || undefined,
      unitPrice: selectedProduct.salePrice,
      quantity: qty,
      subtotal: formProductTotal,
      unitPurchaseCost: selectedProduct.purchaseCost,
      imageUrl: selectedProduct.imageUrl,
    };

    const resNumber = `RES-${String(reservations.length + 1).padStart(3, '0')}`;

    onAddReservation({
      reservationNumber: resNumber,
      customerName: formCustomerName.trim(),
      customerPhone: formCustomerPhone.trim() || undefined,
      customerSocialUser: formCustomerSocialUser.trim() || undefined,
      channel: formChannel,
      items: [item],
      totalAmount: formProductTotal,
      depositAmount: formDepositNum,
      depositPaymentMethod: formDepositPaymentMethod,
      remainingBalance: formRemainingBalance,
      status: 'PENDIENTE',
      expiresAt,
      expirationDate: expDate,
      notes: formNotes.trim() || undefined,
    });

    setIsAddModalOpen(false);
  };

  // Open Complete Reservation Modal
  const handleOpenCompleteModal = (res: Reservation) => {
    setCompletingReservation(res);
    setBalancePaymentMethod('Efectivo');
    setBalanceCashAmount(res.remainingBalance.toString());
    setBalanceQrAmount('0');
    setBalanceAmountReceived('');
  };

  // Submit Complete Reservation
  const handleExecuteComplete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingReservation) return;

    if (!isShiftOpen) {
      alert('No se puede completar la reserva ni cobrar el saldo. Primero debe abrir la jornada del día desde el módulo de Jornada.');
      return;
    }
    if (isShiftClosed) {
      alert('La jornada de hoy se encuentra cerrada. Debe solicitar una reapertura auditada desde el módulo de Jornada para registrar operaciones.');
      return;
    }

    const remaining = completingReservation.remainingBalance;

    let finalCash = 0;
    let finalQr = 0;
    let finalReceived = 0;

    if (balancePaymentMethod === 'Efectivo') {
      finalCash = remaining;
      finalReceived = parseFloat(balanceAmountReceived) || remaining;
      if (finalReceived < remaining) {
        alert(`El monto recibido en efectivo (Bs ${finalReceived}) no cubre el saldo de Bs ${remaining}.`);
        return;
      }
    } else if (balancePaymentMethod === 'QR') {
      finalQr = remaining;
    } else if (balancePaymentMethod === 'Mixto') {
      const c = parseFloat(balanceCashAmount) || 0;
      const q = parseFloat(balanceQrAmount) || 0;
      if (Math.abs(c + q - remaining) > 0.01) {
        alert(`La suma del efectivo (Bs ${c}) y QR (Bs ${q}) debe ser exactamente igual al saldo de Bs ${remaining}.`);
        return;
      }
      finalCash = c;
      finalQr = q;
      finalReceived = parseFloat(balanceAmountReceived) || c;
    }

    onCompleteReservation(
      completingReservation.id,
      balancePaymentMethod,
      finalCash,
      finalQr,
      finalReceived > 0 ? finalReceived : undefined
    );

    setCompletingReservation(null);
  };

  // Submit Cancel Reservation
  const handleExecuteCancel = () => {
    if (!cancellingReservation || !cancellationReason.trim()) return;
    onCancelReservation(cancellingReservation.id, cancellationReason.trim(), cancellationResponsible);
    setCancellingReservation(null);
    setCancellationReason('');
  };

  // Filtered reservations
  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      // Tab status
      if (activeTab === 'pending' && r.status !== 'PENDIENTE') return false;
      if (activeTab === 'completed' && r.status !== 'COMPLETADA') return false;
      if (activeTab === 'cancelled' && r.status !== 'CANCELADA' && r.status !== 'VENCIDA') return false;

      // Channel filter
      if (channelFilter !== 'all' && r.channel !== channelFilter) return false;

      // Search query
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        r.reservationNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        (r.customerPhone && r.customerPhone.includes(q)) ||
        (r.customerSocialUser && r.customerSocialUser.toLowerCase().includes(q)) ||
        r.items.some((it) => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q))
      );
    });
  }, [reservations, activeTab, channelFilter, searchQuery]);

  // Summary Metrics
  const summary = useMemo(() => {
    const pendingList = reservations.filter((r) => r.status === 'PENDIENTE');
    const totalReservedValue = pendingList.reduce((acc, r) => acc + r.totalAmount, 0);
    const depositsTotal = pendingList.reduce((acc, r) => acc + r.depositAmount, 0);
    const pendingBalanceTotal = pendingList.reduce((acc, r) => acc + r.remainingBalance, 0);
    const depositsInCash = pendingList
      .filter((r) => r.depositPaymentMethod === 'Efectivo')
      .reduce((acc, r) => acc + r.depositAmount, 0);
    const depositsInQr = pendingList
      .filter((r) => r.depositPaymentMethod === 'QR')
      .reduce((acc, r) => acc + r.depositAmount, 0);

    const retainedDepositsTotal = reservations
      .filter((r) => r.status === 'CANCELADA' || r.status === 'VENCIDA')
      .reduce((acc, r) => acc + (r.retainedDeposit !== undefined ? r.retainedDeposit : r.depositAmount), 0);

    return {
      pendingCount: pendingList.length,
      totalReservedValue: round2(totalReservedValue),
      depositsTotal: round2(depositsTotal),
      pendingBalanceTotal: round2(pendingBalanceTotal),
      depositsInCash: round2(depositsInCash),
      depositsInQr: round2(depositsInQr),
      retainedDepositsTotal: round2(retainedDepositsTotal),
    };
  }, [reservations]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-gradient-to-r from-rose-950 via-rose-900 to-neutral-900 p-6 text-white shadow-sm">
        <div>
          <span className="text-xs font-semibold tracking-wider uppercase text-amber-300">
            Módulo de Reservas y Apartados · SISTEMA LYLA
          </span>
          <h1 className="mt-1 font-brand text-2xl font-bold tracking-tight">
            Reservas de Mercadería & Lives
          </h1>
          <p className="mt-1 text-xs text-rose-200">
            Administración de señas por QR/Efectivo, apartado de stock físico y liquidación al recoger en tienda
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-rose-950 shadow-sm transition hover:bg-amber-300 active:scale-95 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Nueva Reserva</span>
        </button>
      </div>

      {/* KPI Cards (4 Cards) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Reservas Activas */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Reservas Activas</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <BookmarkCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 font-mono-numbers text-2xl font-bold text-neutral-900">
            {summary.pendingCount} clienta{summary.pendingCount === 1 ? '' : 's'}
          </div>
          <span className="text-[11px] text-neutral-400">Mercadería separada en tienda</span>
        </div>

        {/* Total Mercadería Reservada */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Valor Total Apartado</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 text-neutral-800">
              <Tag className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 font-mono-numbers text-2xl font-bold text-neutral-900">
            {formatBs(summary.totalReservedValue)}
          </div>
          <span className="text-[11px] text-neutral-400">Precio comercial comprometido</span>
        </div>

        {/* Anticipos Cobrados */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Anticipos Recibidos</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
              <Banknote className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 font-mono-numbers text-2xl font-bold text-emerald-800">
            {formatBs(summary.depositsTotal)}
          </div>
          <span className="text-[11px] text-neutral-500">
            QR: {formatBs(summary.depositsInQr)} · Ef: {formatBs(summary.depositsInCash)}
          </span>
        </div>

        {/* Saldo Pendiente por Cobrar */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Saldo por Cobrar en Tienda</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-800">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 font-mono-numbers text-2xl font-bold text-blue-900">
            {formatBs(summary.pendingBalanceTotal)}
          </div>
          <span className="text-[11px] text-neutral-400">Ingreso pendiente al entregar</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs space-y-5">
        {/* Filters and Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-100 pb-4">
          {/* Tab Selector */}
          <div className="flex items-center gap-1.5 rounded-xl bg-neutral-100 p-1">
            <button
              onClick={() => setActiveTab('pending')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'pending'
                  ? 'bg-rose-950 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Pendientes de Recojo ({summary.pendingCount})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'completed'
                  ? 'bg-rose-950 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Entregadas / Completadas ({reservations.filter((r) => r.status === 'COMPLETADA').length})
            </button>
            <button
              onClick={() => setActiveTab('cancelled')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'cancelled'
                  ? 'bg-rose-950 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Canceladas / Vencidas ({reservations.filter((r) => r.status === 'CANCELADA' || r.status === 'VENCIDA').length})
            </button>
          </div>

          {/* Channel Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 font-medium">Canal:</span>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 outline-none"
            >
              <option value="all">Todos los canales</option>
              {CHANNELS.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por Nº de reserva, clienta, usuario en live (@), teléfono o producto..."
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50/70 py-2.5 pl-10 pr-4 text-xs font-medium text-neutral-900 outline-none transition focus:border-rose-900 focus:bg-white"
          />
        </div>

        {/* Reservations Table / Cards */}
        {filteredReservations.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-xl">
            No se encontraron reservas con los filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-600 font-semibold">
                  <th className="py-2.5 pl-4 pr-2">Nº Reserva</th>
                  <th className="px-2 py-2.5">Clienta & Canal</th>
                  <th className="px-2 py-2.5">Producto & Color</th>
                  <th className="px-2 py-2.5 text-right">Total</th>
                  <th className="px-2 py-2.5 text-right">Anticipo Pagado</th>
                  <th className="px-2 py-2.5 text-right font-bold text-neutral-900">Saldo Pendiente</th>
                  <th className="px-2 py-2.5 text-center">Estado / Vence</th>
                  <th className="py-2.5 pl-2 pr-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredReservations.map((res) => {
                  const firstItem = res.items[0];
                  const isPending = res.status === 'PENDIENTE';
                  const isCompleted = res.status === 'COMPLETADA';
                  const isCancelled = res.status === 'CANCELADA' || res.status === 'VENCIDA';
                  const isExpired = res.status === 'VENCIDA';

                  return (
                    <tr
                      key={res.id}
                      className={`transition ${
                        isPending
                          ? 'hover:bg-neutral-50/70 text-neutral-800'
                          : isCompleted
                          ? 'bg-emerald-50/20 text-neutral-600'
                          : 'bg-rose-50/20 text-neutral-400'
                      }`}
                    >
                      {/* Nº Reserva */}
                      <td className="py-3 pl-4 pr-2 font-mono font-bold text-neutral-900">
                        {res.reservationNumber}
                      </td>

                      {/* Clienta & Canal */}
                      <td className="px-2 py-3">
                        <div className="space-y-0.5">
                          <div className="font-bold text-neutral-900 flex items-center gap-1">
                            <User className="h-3 w-3 text-neutral-400" />
                            <span>{res.customerName}</span>
                          </div>
                          {res.customerSocialUser && (
                            <div className="text-[11px] text-rose-800 font-medium flex items-center gap-1">
                              <AtSign className="h-3 w-3" />
                              <span>{res.customerSocialUser}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="inline-block rounded-md bg-neutral-100 px-1.5 py-0.2 text-[10px] font-semibold text-neutral-700 border border-neutral-200">
                              {res.channel}
                            </span>
                            {res.customerPhone && (
                              <span className="text-[10px] text-neutral-500 font-mono">
                                Tel: {res.customerPhone}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Producto & Color */}
                      <td className="px-2 py-3">
                        {firstItem && (
                          <div className="flex items-center gap-2.5">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
                              {firstItem.imageUrl ? (
                                <img
                                  src={firstItem.imageUrl}
                                  alt={firstItem.name}
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-neutral-400">
                                  <Tag className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="font-mono text-[10px] font-semibold text-rose-950">
                                {firstItem.code}
                              </span>
                              <h4 className="font-semibold text-neutral-900 truncate text-[11px]">
                                {firstItem.quantity}x {firstItem.name}
                              </h4>
                              {firstItem.selectedColor && (
                                <span className="inline-block rounded bg-rose-50 px-1.5 py-0.2 text-[10px] font-medium text-rose-800 border border-rose-200">
                                  Color: {firstItem.selectedColor}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Total */}
                      <td className="px-2 py-3 text-right font-mono-numbers">
                        {formatBs(res.totalAmount)}
                      </td>

                      {/* Anticipo Pagado */}
                      <td className="px-2 py-3 text-right">
                        <div className="font-mono-numbers font-semibold text-emerald-800">
                          {formatBs(res.depositAmount)}
                        </div>
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-neutral-500">
                          {res.depositPaymentMethod === 'Efectivo' ? (
                            <Banknote className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <QrCode className="h-3 w-3 text-blue-600" />
                          )}
                          <span>{res.depositPaymentMethod}</span>
                        </span>
                      </td>

                      {/* Saldo Pendiente */}
                      <td className="px-2 py-3 text-right">
                        <span className={`font-mono-numbers text-sm font-bold ${
                          isPending ? 'text-rose-950' : 'text-neutral-400'
                        }`}>
                          {formatBs(res.remainingBalance)}
                        </span>
                      </td>

                      {/* Estado / Vence */}
                      <td className="px-2 py-3 text-center">
                        {isPending && (
                          <div>
                            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                              Por Recoger
                            </span>
                            {res.expirationDate && (
                              <span className="block text-[10px] text-neutral-400 mt-0.5">
                                Hasta {formatDate(res.expirationDate)}
                              </span>
                            )}
                          </div>
                        )}
                        {isCompleted && (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                              <CheckCircle className="h-3 w-3" />
                              Entregada
                            </span>
                            {res.completedAt && (
                              <span className="block text-[10px] text-neutral-400 mt-0.5">
                                {formatDate(res.completedAt)}
                              </span>
                            )}
                          </div>
                        )}
                        {isCancelled && (
                          <div>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isExpired ? 'bg-purple-100 text-purple-900' : 'bg-rose-100 text-rose-900'
                            }`}>
                              {isExpired ? <Clock className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              {isExpired ? 'Vencida (168h)' : 'Cancelada'}
                            </span>
                            {res.cancellationReason && (
                              <span className="block text-[10px] text-neutral-400 truncate max-w-[120px] mt-0.5" title={res.cancellationReason}>
                                {res.cancellationReason}
                              </span>
                            )}
                            <span className="block text-[9px] text-emerald-700 font-mono font-semibold">
                              Adelanto retenido: {formatBs(res.retainedDeposit !== undefined ? res.retainedDeposit : res.depositAmount)}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3 pl-2 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && (
                            <button
                              onClick={() => handleOpenCompleteModal(res)}
                              className="flex items-center gap-1 rounded-xl bg-rose-950 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-rose-900 active:scale-95"
                              title="La clienta pasa a tienda: cobrar saldo restante y entregar producto"
                            >
                              <span>Entregar y Cobrar</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => setViewingTicketReservation(res)}
                            className="rounded-lg border border-neutral-300 bg-white p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition"
                            title="Ver / Imprimir Comprobante de Reserva"
                          >
                            <Printer className="h-4 w-4" />
                          </button>

                          {isPending && (
                            <button
                              onClick={() => {
                                setCancellingReservation(res);
                                setCancellationReason('');
                              }}
                              className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 transition"
                              title="Cancelar reserva y devolver stock al inventario"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: NUEVA RESERVA */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
              <div className="flex items-center gap-2 text-rose-950">
                <BookmarkCheck className="h-5 w-5" />
                <h3 className="font-brand text-lg font-bold text-neutral-900">
                  Registrar Nueva Reserva / Apartado
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAddReservation} className="p-6 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Canal de Reserva */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  1. Canal de Origen de la Reserva *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CHANNELS.map((ch) => (
                    <button
                      type="button"
                      key={ch}
                      onClick={() => setFormChannel(ch)}
                      className={`rounded-xl border py-2 px-2.5 text-xs font-semibold text-center transition ${
                        formChannel === ch
                          ? 'border-rose-950 bg-rose-950 text-white shadow-xs'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              {/* Datos de la Clienta */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Nombre de la Clienta *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCustomerName}
                    onChange={(e) => setFormCustomerName(e.target.value)}
                    placeholder="Ej: Valeria Méndez"
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium outline-none focus:border-rose-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Usuario Redes / Live
                  </label>
                  <input
                    type="text"
                    value={formCustomerSocialUser}
                    onChange={(e) => setFormCustomerSocialUser(e.target.value)}
                    placeholder="Ej: @valeria.scz"
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium outline-none focus:border-rose-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={formCustomerPhone}
                    onChange={(e) => setFormCustomerPhone(e.target.value)}
                    placeholder="Ej: 77392811"
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium outline-none focus:border-rose-900"
                  />
                </div>
              </div>

              {/* Selección de Producto */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  2. Producto a Reservar *
                </label>
                <select
                  value={formProductId}
                  onChange={(e) => {
                    setFormProductId(e.target.value);
                    const prod = products.find((p) => p.id === e.target.value);
                    let colorInit = '';
                    if (prod?.colorStock) {
                      const avail = Object.entries(prod.colorStock).find(([_, q]) => (Number(q) || 0) > 0);
                      if (avail) colorInit = avail[0];
                    }
                    if (!colorInit) {
                      colorInit = prod?.availableColors?.[0] || prod?.color || '';
                    }
                    setFormSelectedColor(colorInit);
                  }}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 outline-none focus:border-rose-900"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                      {p.code} · {p.name} — {formatBs(p.salePrice)} ({p.stock <= 0 ? 'AGOTADO' : `${p.stock} disponibles`})
                    </option>
                  ))}
                </select>
              </div>

              {/* Selector de Color del Producto si tiene colores */}
              {selectedProduct && (() => {
                const activeColors =
                  selectedProduct.colorStock && Object.keys(selectedProduct.colorStock).length > 0
                    ? Object.entries(selectedProduct.colorStock)
                        .filter(([_, q]) => (Number(q) || 0) > 0)
                        .map(([c]) => c)
                    : selectedProduct.availableColors || [];
                if (activeColors.length === 0) return null;
                return (
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Color Elegido por la Clienta (Solo disponibles):
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {activeColors.map((col) => {
                        const colQty = selectedProduct.colorStock ? selectedProduct.colorStock[col] : undefined;
                        return (
                          <button
                            type="button"
                            key={col}
                            onClick={() => setFormSelectedColor(col)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                              formSelectedColor === col
                                ? 'border-rose-950 bg-rose-950 text-white'
                                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                            }`}
                          >
                            {col}{colQty !== undefined ? ` (${colQty} u.)` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Montos y Anticipo */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs text-neutral-500">Precio Total del Producto:</span>
                    <p className="font-mono-numbers text-base font-bold text-neutral-900">
                      {formatBs(formProductTotal)}
                    </p>
                  </div>

                  <div>
                    <span className="text-xs text-neutral-500">Saldo que pagará al recoger:</span>
                    <p className="font-mono-numbers text-base font-bold text-rose-950">
                      {formatBs(formRemainingBalance)}
                    </p>
                  </div>
                </div>

                <div className="border-t border-neutral-200 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Anticipo */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1">
                      Monto de Anticipo / Seña (Bs) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                        Bs
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        max={formProductTotal}
                        required
                        value={formDepositAmount}
                        onChange={(e) => setFormDepositAmount(e.target.value)}
                        placeholder="20.00"
                        className="w-full rounded-xl border border-neutral-300 bg-white py-1.5 pl-8 pr-3 font-mono text-sm font-bold text-neutral-900 outline-none focus:border-rose-900"
                      />
                    </div>
                  </div>

                  {/* Método del Anticipo */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1">
                      Método con el que pagó el anticipo *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFormDepositPaymentMethod('QR')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border py-1.5 px-2 text-xs font-bold transition ${
                          formDepositPaymentMethod === 'QR'
                            ? 'border-blue-600 bg-blue-50 text-blue-900'
                            : 'border-neutral-200 bg-white text-neutral-600'
                        }`}
                      >
                        <QrCode className="h-3.5 w-3.5 text-blue-600" />
                        <span>QR</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFormDepositPaymentMethod('Efectivo')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border py-1.5 px-2 text-xs font-bold transition ${
                          formDepositPaymentMethod === 'Efectivo'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                            : 'border-neutral-200 bg-white text-neutral-600'
                        }`}
                      >
                        <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Efectivo</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Límite y notas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Días límite para recojo en tienda:
                  </label>
                  <select
                    value={formExpirationDays}
                    onChange={(e) => setFormExpirationDays(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 outline-none"
                  >
                    <option value="2">2 días</option>
                    <option value="3">3 días (Recomendado)</option>
                    <option value="5">5 días</option>
                    <option value="7">7 días (1 semana)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Notas u observaciones:
                  </label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Ej: Pasa el sábado en la tarde..."
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-950 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-900 transition active:scale-95"
                >
                  Guardar Reserva y Apartar Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ENTREGAR Y COBRAR SALDO (COMPLETAR RESERVA) */}
      {completingReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle className="h-5 w-5" />
                <h3 className="font-brand text-lg font-bold text-neutral-900">
                  Entregar Producto y Cobrar Saldo
                </h3>
              </div>
              <button
                onClick={() => setCompletingReservation(null)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl bg-neutral-50 p-4 space-y-2 text-xs border border-neutral-200">
              <div className="flex justify-between">
                <span className="text-neutral-500">Reserva:</span>
                <span className="font-mono font-bold text-neutral-900">{completingReservation.reservationNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Clienta:</span>
                <span className="font-bold text-neutral-900">{completingReservation.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Producto:</span>
                <span className="font-semibold text-neutral-900">
                  {completingReservation.items[0]?.name}
                  {completingReservation.items[0]?.selectedColor ? ` (${completingReservation.items[0]?.selectedColor})` : ''}
                </span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-2">
                <span className="text-neutral-600">Total del Producto:</span>
                <span className="font-mono font-semibold">{formatBs(completingReservation.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-emerald-800 font-medium">
                <span>Anticipo previo ({completingReservation.depositPaymentMethod}):</span>
                <span className="font-mono">-{formatBs(completingReservation.depositAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-300 pt-2 text-sm font-bold text-neutral-900">
                <span>SALDO A CANCELAR HOY:</span>
                <span className="font-mono-numbers text-rose-950 text-base">
                  {formatBs(completingReservation.remainingBalance)}
                </span>
              </div>
            </div>

            <form onSubmit={handleExecuteComplete} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                  ¿Cómo cancela la clienta el saldo de {formatBs(completingReservation.remainingBalance)}? *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setBalancePaymentMethod('Efectivo')}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 text-xs font-bold border transition ${
                      balancePaymentMethod === 'Efectivo'
                        ? 'border-2 border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <Banknote className="h-4 w-4 text-emerald-600" />
                    <span>Efectivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBalancePaymentMethod('QR')}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 text-xs font-bold border transition ${
                      balancePaymentMethod === 'QR'
                        ? 'border-2 border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <QrCode className="h-4 w-4 text-blue-600" />
                    <span>QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBalancePaymentMethod('Mixto');
                      const half = round2(completingReservation.remainingBalance / 2);
                      setBalanceCashAmount(half.toString());
                      setBalanceQrAmount(round2(completingReservation.remainingBalance - half).toString());
                    }}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 text-xs font-bold border transition ${
                      balancePaymentMethod === 'Mixto'
                        ? 'border-2 border-amber-600 bg-amber-50 text-amber-900'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center gap-0.5">
                      <Banknote className="h-3 w-3 text-emerald-600" />
                      <span>+</span>
                      <QrCode className="h-3 w-3 text-blue-600" />
                    </div>
                    <span>Mixto</span>
                  </button>
                </div>
              </div>

              {/* Si cancela en Efectivo: input de billete y cálculo de cambio */}
              {balancePaymentMethod === 'Efectivo' && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 space-y-2">
                  <label className="block text-xs font-semibold text-neutral-700">
                    Dinero entregado en efectivo por la clienta (Bs):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={completingReservation.remainingBalance}
                    value={balanceAmountReceived}
                    onChange={(e) => setBalanceAmountReceived(e.target.value)}
                    placeholder={completingReservation.remainingBalance.toString()}
                    className="w-full rounded-xl border border-neutral-300 bg-white py-1.5 px-3 font-mono text-xs font-bold text-neutral-900 outline-none"
                  />
                  {parseFloat(balanceAmountReceived) > completingReservation.remainingBalance && (
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-neutral-200">
                      <span className="text-neutral-600 font-medium">Cambio en efectivo:</span>
                      <span className="font-mono font-bold text-emerald-700 text-sm">
                        {formatBs(parseFloat(balanceAmountReceived) - completingReservation.remainingBalance)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Si cancela Mixto */}
              {balancePaymentMethod === 'Mixto' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-neutral-600">Saldo en Efectivo (Bs):</span>
                      <input
                        type="number"
                        step="0.01"
                        value={balanceCashAmount}
                        onChange={(e) => setBalanceCashAmount(e.target.value)}
                        className="w-full rounded-lg border border-neutral-300 bg-white py-1 px-2 font-mono text-xs font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-600">Saldo en QR (Bs):</span>
                      <input
                        type="number"
                        step="0.01"
                        value={balanceQrAmount}
                        onChange={(e) => setBalanceQrAmount(e.target.value)}
                        className="w-full rounded-lg border border-neutral-300 bg-white py-1 px-2 font-mono text-xs font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompletingReservation(null)}
                  className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 transition active:scale-95"
                >
                  Confirmar Entrega y Registrar Venta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CANCELAR RESERVA & RETENER 100% ADELANTO */}
      {cancellingReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-rose-800">
              <AlertCircle className="h-5 w-5" />
              <h3 className="font-brand text-base font-bold text-neutral-900">
                Anular Reserva Nº {cancellingReservation.reservationNumber}
              </h3>
            </div>

            {/* Aviso de Política de Retención No Reembolsable */}
            <div className="rounded-xl bg-amber-50 p-3.5 border border-amber-200 text-xs text-amber-950 space-y-2">
              <div className="flex items-center justify-between font-bold">
                <span>Adelanto a retener (100%):</span>
                <span className="font-mono text-sm text-emerald-800">
                  {formatBs(cancellingReservation.depositAmount)} ({cancellingReservation.depositPaymentMethod})
                </span>
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                <strong>Política comercial LYLA:</strong> Conforme a las normas de apartado, el 100% de la seña es <strong>no reembolsable</strong> y pasará a ser conservado por LYLA como ingreso independiente de ganancia. Los artículos apartados volverán al inventario disponible.
              </p>
            </div>

            {/* Responsable del registro */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Responsable que registra la anulación *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Roly', 'Keyla'] as const).map((resp) => (
                  <button
                    type="button"
                    key={resp}
                    onClick={() => setCancellationResponsible(resp)}
                    className={`rounded-xl border py-2 text-xs font-bold transition ${
                      cancellationResponsible === resp
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    {resp}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Motivo de la anulación / cancelación *
              </label>
              <textarea
                required
                rows={3}
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Ej: Clienta desistió de la compra, no pasó en los 7 días de vigencia acordados..."
                className="w-full rounded-xl border border-neutral-300 p-2.5 text-xs outline-none focus:border-rose-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCancellingReservation(null)}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleExecuteCancel}
                disabled={!cancellationReason.trim()}
                className="rounded-xl bg-rose-900 px-4 py-2 text-xs font-bold text-white hover:bg-rose-950 disabled:opacity-50 transition active:scale-95"
              >
                Confirmar Anulación y Retener 100% Seña
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VER / IMPRIMIR COMPROBANTE DE RESERVA */}
      {viewingTicketReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4 print-container">
            {/* Header del Ticket */}
            <div className="text-center border-b border-dashed border-neutral-300 pb-3">
              <div className="flex justify-center mb-1">
                <Store className="h-6 w-6 text-rose-950" />
              </div>
              <h3 className="font-brand text-lg font-bold tracking-wider text-neutral-900">
                LYLA BOUTIQUE
              </h3>
              <p className="text-[11px] text-neutral-500">
                Santa Cruz de la Sierra · Bolivia
              </p>
              <span className="inline-block mt-2 rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs font-bold text-neutral-800">
                COMPROBANTE DE APARTADO · {viewingTicketReservation.reservationNumber}
              </span>
            </div>

            {/* Datos */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>Fecha:</span>
                <span className="font-medium text-neutral-900">{formatDate(viewingTicketReservation.createdAt)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Clienta:</span>
                <span className="font-bold text-neutral-900">{viewingTicketReservation.customerName}</span>
              </div>
              {viewingTicketReservation.customerSocialUser && (
                <div className="flex justify-between text-neutral-600">
                  <span>Usuario Live:</span>
                  <span className="font-mono text-rose-900">{viewingTicketReservation.customerSocialUser}</span>
                </div>
              )}
              <div className="flex justify-between text-neutral-600">
                <span>Canal:</span>
                <span className="font-medium">{viewingTicketReservation.channel}</span>
              </div>
            </div>

            {/* Detalle Producto */}
            <div className="border-t border-b border-dashed border-neutral-300 py-3 space-y-1 text-xs">
              {viewingTicketReservation.items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <div>
                    <p className="font-semibold text-neutral-900">{it.name}</p>
                    <p className="text-[10px] text-neutral-500">
                      Cód: {it.code} {it.selectedColor ? `· Color: ${it.selectedColor}` : ''}
                    </p>
                  </div>
                  <span className="font-mono font-bold">{formatBs(it.subtotal)}</span>
                </div>
              ))}
            </div>

            {/* Desglose Financiero */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>Total de la prenda:</span>
                <span className="font-mono font-semibold">{formatBs(viewingTicketReservation.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-emerald-800 font-semibold">
                <span>Anticipo ({viewingTicketReservation.depositPaymentMethod}):</span>
                <span className="font-mono">-{formatBs(viewingTicketReservation.depositAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-neutral-950 border-t border-neutral-200 pt-1.5">
                <span>SALDO AL RECOGER:</span>
                <span className="font-mono-numbers text-rose-950">{formatBs(viewingTicketReservation.remainingBalance)}</span>
              </div>
            </div>

            {viewingTicketReservation.expirationDate && (
              <p className="text-[10px] text-center text-neutral-500 pt-2 border-t border-dashed border-neutral-200">
                Favor presentar este comprobante para retirar en tienda hasta el {formatDate(viewingTicketReservation.expirationDate)}.
              </p>
            )}

            <div className="flex gap-2 pt-2 print:hidden">
              <button
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Imprimir</span>
              </button>
              <button
                onClick={() => setViewingTicketReservation(null)}
                className="flex-1 rounded-xl bg-neutral-900 py-2 text-xs font-bold text-white hover:bg-neutral-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
