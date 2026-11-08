import React, { useState, useMemo, useEffect } from 'react';
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Trash2,
  Banknote,
  QrCode,
  Tag,
  CheckCircle,
  AlertCircle,
  Clock,
  Edit3,
  RotateCcw,
  Receipt,
  Eye,
  X,
  ArrowRight,
  ShieldAlert,
  AlertTriangle,
  BookmarkCheck,
  Calendar,
  Filter,
} from 'lucide-react';
import { Product, ProductCategory, ProductCategoryItem, Sale, SaleItem, PaymentMethod, ReservationItem } from '../types';
import {
  formatBs,
  round2,
  formatDateTime,
  formatTime,
  formatDate,
  getTodayDateString,
  getYesterdayDateString,
  getBoliviaDateString,
} from '../utils/formatters';
import { isSaleWithinEditWindow } from '../utils/storage';

interface SalesModuleProps {
  products: Product[];
  sales: Sale[];
  productCategories?: ProductCategoryItem[];
  onConfirmSale: (sale: Omit<Sale, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateSale: (
    saleId: string,
    updatedData: {
      items: SaleItem[];
      subtotal: number;
      discount: number;
      total: number;
      paymentMethod: PaymentMethod;
      amountReceived?: number;
      changeGiven?: number;
      totalCostOfGoodsSold: number;
    },
    reason: string
  ) => void;
  onCancelSale: (saleId: string, reason: string) => void;
  onCreateReservation?: (reservationData: {
    customerName: string;
    customerPhone?: string;
    customerSocialUser?: string;
    channel: string;
    depositAmount: number;
    depositPaymentMethod: 'Efectivo' | 'QR';
    items: ReservationItem[];
    totalAmount: number;
    remainingBalance: number;
    notes?: string;
  }) => void;
  isShiftOpen?: boolean;
  isShiftClosed?: boolean;
  onTriggerStartShift?: () => void;
}

export const SalesModule: React.FC<SalesModuleProps> = ({
  products,
  sales,
  productCategories,
  onConfirmSale,
  onUpdateSale,
  onCancelSale,
  onCreateReservation,
  isShiftOpen = true,
  isShiftClosed = false,
  onTriggerStartShift,
}) => {
  // Active categories list
  const activeCategoryList = useMemo(() => {
    if (productCategories && productCategories.length > 0) {
      const active = productCategories.filter((c) => c.active).map((c) => c.name);
      return active.length > 0 ? active : ['Carteras', 'Joyas', 'Relojes', 'Accesorios'];
    }
    return ['Carteras', 'Joyas', 'Relojes', 'Accesorios'];
  }, [productCategories]);

  // Category selection (Rule: Al iniciar una venta, mostrar primero las categorías activas)
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('Carteras');
  const [searchQuery, setSearchQuery] = useState('');

  // Keep selectedCategory valid if categories change
  useEffect(() => {
    if (!activeCategoryList.some((c) => c.trim().toLowerCase() === selectedCategory.trim().toLowerCase())) {
      setSelectedCategory(activeCategoryList[0] || 'Carteras');
    }
  }, [activeCategoryList, selectedCategory]);

  // Cart state
  const [cartItems, setCartItems] = useState<SaleItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | 'Reserva'>('Efectivo');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mixed Payment State (Efectivo + QR)
  const [mixedCashAmount, setMixedCashAmount] = useState<string>('');
  const [mixedQrAmount, setMixedQrAmount] = useState<string>('');
  const [mixedCashReceived, setMixedCashReceived] = useState<string>('');

  // Reservation Mode State (Apartado de Mercadería desde POS)
  const [resDepositAmount, setResDepositAmount] = useState<string>('20');
  const [resDepositMethod, setResDepositMethod] = useState<'Efectivo' | 'QR'>('QR');
  const [resCustomerName, setResCustomerName] = useState<string>('');
  const [resCustomerPhone, setResCustomerPhone] = useState<string>('');
  const [resCustomerSocialUser, setResCustomerSocialUser] = useState<string>('');
  const [resChannel, setResChannel] = useState<string>('Live TikTok');
  const [resNotes, setResNotes] = useState<string>('');

  // Editing existing sale mode (30 min window)
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [editingSaleNumber, setEditingSaleNumber] = useState<string>('');

  // Cancellation modal
  const [cancellingSale, setCancellingSale] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Sale completed receipt modal
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // Periodic tick for live 30-min countdown
  const [, setTimerTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Filter products by selected category and search
  const availableProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.category !== selectedCategory) return false;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.color.toLowerCase().includes(q) ||
        (p.availableColors && p.availableColors.some((c) => c.toLowerCase().includes(q)))
      );
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart calculations
  const cartSubtotal = useMemo(() => {
    return round2(cartItems.reduce((acc, item) => acc + item.subtotal, 0));
  }, [cartItems]);

  const discountNum = useMemo(() => {
    const d = parseFloat(discountAmount);
    return isNaN(d) || d < 0 ? 0 : round2(d);
  }, [discountAmount]);

  const cartTotal = useMemo(() => {
    const effectiveDiscount = Math.min(discountNum, cartSubtotal);
    return round2(Math.max(0, cartSubtotal - effectiveDiscount));
  }, [cartSubtotal, discountNum]);

  const totalCOGS = useMemo(() => {
    return round2(cartItems.reduce((acc, item) => acc + item.totalPurchaseCost, 0));
  }, [cartItems]);

  // Cash payment calculations
  const amountReceivedNum = useMemo(() => {
    const r = parseFloat(amountReceived);
    return isNaN(r) ? 0 : round2(r);
  }, [amountReceived]);

  const changeDue = useMemo(() => {
    if (paymentMethod !== 'Efectivo') return 0;
    return round2(Math.max(0, amountReceivedNum - cartTotal));
  }, [paymentMethod, amountReceivedNum, cartTotal]);

  const isCashPaymentSufficient = useMemo(() => {
    if (paymentMethod !== 'Efectivo') return true;
    return amountReceivedNum >= cartTotal;
  }, [paymentMethod, amountReceivedNum, cartTotal]);

  // Mixed payment calculations (Efectivo + QR)
  const mixedCashNum = useMemo(() => {
    const val = parseFloat(mixedCashAmount);
    return isNaN(val) || val < 0 ? 0 : round2(val);
  }, [mixedCashAmount]);

  const mixedQrNum = useMemo(() => {
    const val = parseFloat(mixedQrAmount);
    return isNaN(val) || val < 0 ? 0 : round2(val);
  }, [mixedQrAmount]);

  const mixedTotalEntered = useMemo(() => {
    return round2(mixedCashNum + mixedQrNum);
  }, [mixedCashNum, mixedQrNum]);

  const mixedCashReceivedNum = useMemo(() => {
    const val = parseFloat(mixedCashReceived);
    return isNaN(val) || val < 0 ? 0 : round2(val);
  }, [mixedCashReceived]);

  const mixedChangeDue = useMemo(() => {
    if (paymentMethod !== 'Mixto') return 0;
    if (mixedCashReceivedNum > mixedCashNum) {
      return round2(mixedCashReceivedNum - mixedCashNum);
    }
    return 0;
  }, [paymentMethod, mixedCashReceivedNum, mixedCashNum]);

  const isMixedPaymentValid = useMemo(() => {
    if (paymentMethod !== 'Mixto') return true;
    return Math.abs(mixedTotalEntered - cartTotal) < 0.01 && cartTotal > 0;
  }, [paymentMethod, mixedTotalEntered, cartTotal]);

  // Helpers for mixed payment
  const handleSplitFiftyFifty = () => {
    const half = round2(cartTotal / 2);
    setMixedCashAmount(half.toString());
    setMixedQrAmount(round2(cartTotal - half).toString());
  };

  const handleAutoFillQr = () => {
    const remainder = Math.max(0, round2(cartTotal - mixedCashNum));
    setMixedQrAmount(remainder.toString());
  };

  const handleAutoFillCash = () => {
    const remainder = Math.max(0, round2(cartTotal - mixedQrNum));
    setMixedCashAmount(remainder.toString());
  };

  // Reservation calculations
  const resDepositNum = useMemo(() => {
    const val = parseFloat(resDepositAmount);
    return isNaN(val) || val < 0 ? 0 : round2(val);
  }, [resDepositAmount]);

  const resRemainingBalance = useMemo(() => {
    return round2(Math.max(0, cartTotal - resDepositNum));
  }, [cartTotal, resDepositNum]);

  const isReservationValid = useMemo(() => {
    if (paymentMethod !== 'Reserva') return true;
    return (
      resCustomerName.trim().length > 0 &&
      resDepositNum > 0 &&
      resDepositNum <= cartTotal &&
      cartItems.length > 0
    );
  }, [paymentMethod, resCustomerName, resDepositNum, cartTotal, cartItems]);

  // Helper to obtain colors that actually have stock > 0
  const getProductActiveColors = (product: Product): string[] => {
    if (product.colorStock && Object.keys(product.colorStock).length > 0) {
      return Object.entries(product.colorStock)
        .filter(([_, qty]) => (Number(qty) || 0) > 0)
        .map(([c]) => c);
    }
    return product.availableColors && product.availableColors.length > 0
      ? product.availableColors
      : product.color
      ? product.color.split(',').map((c) => c.trim()).filter(Boolean)
      : [];
  };

  // Add product to cart with strict color stock check
  const handleAddToCart = (product: Product, preferredColor?: string) => {
    if (product.stock <= 0) return;

    const activeColors = getProductActiveColors(product);

    // If preferredColor specified, ensure it has stock
    if (preferredColor && product.colorStock && (Number(product.colorStock[preferredColor]) || 0) <= 0) {
      return; // Out of stock in this specific color
    }

    const defaultColor =
      preferredColor ||
      (activeColors.length > 0
        ? activeColors[0]
        : product.color || undefined);

    setCartItems((prev) => {
      const existing = prev.find(
        (item) => item.productId === product.id && item.selectedColor === defaultColor
      );

      // Color-specific limit check
      const colorLimit =
        product.colorStock && defaultColor
          ? Number(product.colorStock[defaultColor]) || 0
          : product.stock;

      const totalThisColorInCart = prev
        .filter((item) => item.productId === product.id && item.selectedColor === defaultColor)
        .reduce((sum, i) => sum + i.quantity, 0);

      if (totalThisColorInCart >= colorLimit) {
        return prev;
      }

      const totalProductInCart = prev
        .filter((item) => item.productId === product.id)
        .reduce((sum, i) => sum + i.quantity, 0);

      if (totalProductInCart >= product.stock) {
        return prev;
      }

      if (existing) {
        return prev.map((item) =>
          item === existing
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: round2((item.quantity + 1) * item.unitPrice),
                totalPurchaseCost: round2((item.quantity + 1) * item.unitPurchaseCost),
              }
            : item
        );
      } else {
        return [
          ...prev,
          {
            productId: product.id,
            code: product.code,
            name: product.name,
            category: product.category,
            selectedColor: defaultColor,
            unitPrice: product.salePrice,
            quantity: 1,
            subtotal: product.salePrice,
            unitPurchaseCost: product.purchaseCost,
            totalPurchaseCost: product.purchaseCost,
            imageUrl: product.imageUrl,
          },
        ];
      }
    });
  };

  // Change color of an item in cart with stock validation
  const handleUpdateItemColor = (itemIndex: number, newColor: string) => {
    setCartItems((prev) => {
      const currentItem = prev[itemIndex];
      if (!currentItem) return prev;
      const product = products.find((p) => p.id === currentItem.productId);
      if (product && product.colorStock) {
        const targetColorStock = Number(product.colorStock[newColor]) || 0;
        const otherUnitsOfTargetColor = prev
          .filter(
            (it, idx) =>
              idx !== itemIndex &&
              it.productId === currentItem.productId &&
              it.selectedColor === newColor
          )
          .reduce((sum, it) => sum + it.quantity, 0);
        if (otherUnitsOfTargetColor + currentItem.quantity > targetColorStock) {
          alert(`No hay suficiente stock para el color "${newColor}" (disponible: ${targetColorStock} u.).`);
          return prev;
        }
      }
      return prev.map((item, idx) =>
        idx === itemIndex ? { ...item, selectedColor: newColor } : item
      );
    });
  };

  // Update item quantity in cart with color-specific stock bounds
  const handleUpdateQuantity = (itemIndex: number, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item, idx) => {
          if (idx === itemIndex) {
            const product = products.find((p) => p.id === item.productId);
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;

            if (product && !editingSaleId) {
              const itemColor = item.selectedColor;
              const colorLimit =
                product.colorStock && itemColor
                  ? Number(product.colorStock[itemColor]) || 0
                  : product.stock;

              const otherThisColorInCart = prev
                .filter(
                  (it, i) =>
                    it.productId === item.productId &&
                    it.selectedColor === itemColor &&
                    i !== itemIndex
                )
                .reduce((sum, it) => sum + it.quantity, 0);

              if (otherThisColorInCart + newQty > colorLimit) {
                return item;
              }

              const otherTotalProductInCart = prev
                .filter((it, i) => it.productId === item.productId && i !== itemIndex)
                .reduce((sum, it) => sum + it.quantity, 0);

              if (otherTotalProductInCart + newQty > product.stock) {
                return item;
              }
            }

            return {
              ...item,
              quantity: newQty,
              subtotal: round2(newQty * item.unitPrice),
              totalPurchaseCost: round2(newQty * item.unitPurchaseCost),
            };
          }
          return item;
        })
        .filter(Boolean) as SaleItem[]
    );
  };

  // Remove item from cart
  const handleRemoveFromCart = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Fast cash presets
  const handleQuickCash = (amount: number) => {
    setAmountReceived(amount.toString());
  };

  // Confirm Reservation Handler from POS
  const handleConfirmReservation = () => {
    if (isSubmitting) return;
    if (!isShiftOpen) {
      alert('No se puede registrar la reserva. Primero debe abrir la jornada del día desde el módulo de Jornada.');
      return;
    }
    if (isShiftClosed) {
      alert('La jornada de hoy se encuentra cerrada. Debe solicitar una reapertura auditada desde el módulo de Jornada para registrar operaciones.');
      return;
    }
    if (!isReservationValid || !onCreateReservation || cartItems.length === 0) {
      if (!resCustomerName.trim()) {
        alert('Por favor ingrese el nombre de la clienta para apartar la reserva.');
      } else if (resDepositNum <= 0) {
        alert('El monto de anticipo o seña debe ser mayor a 0 Bs.');
      }
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => setIsSubmitting(false), 800);

    const resItems: ReservationItem[] = cartItems.map((item) => ({
      productId: item.productId,
      code: item.code,
      name: item.name,
      category: item.category,
      selectedColor: item.selectedColor,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
      unitPurchaseCost: item.unitPurchaseCost,
      imageUrl: item.imageUrl,
    }));

    onCreateReservation({
      customerName: resCustomerName.trim(),
      customerPhone: resCustomerPhone.trim() || undefined,
      customerSocialUser: resCustomerSocialUser.trim() || undefined,
      channel: resChannel,
      depositAmount: resDepositNum,
      depositPaymentMethod: resDepositMethod,
      items: resItems,
      totalAmount: cartTotal,
      remainingBalance: resRemainingBalance,
      notes: resNotes.trim() || undefined,
    });

    // Reset cart and reservation state
    setCartItems([]);
    setDiscountAmount('0');
    setResCustomerName('');
    setResCustomerPhone('');
    setResCustomerSocialUser('');
    setResNotes('');
    setPaymentMethod('Efectivo');
  };

  // Confirm Sale Handler
  const handleConfirmSale = () => {
    if (isSubmitting) return;
    if (!isShiftOpen) {
      alert('No se puede registrar la venta. Primero debe abrir la jornada del día desde el módulo de Jornada.');
      return;
    }
    if (isShiftClosed) {
      alert('La jornada de hoy se encuentra cerrada. Debe solicitar una reapertura auditada desde el módulo de Jornada para registrar operaciones.');
      return;
    }
    if (cartItems.length === 0) return;
    if (paymentMethod === 'Reserva') {
      handleConfirmReservation();
      return;
    }
    if (discountNum > cartSubtotal) return;
    if (paymentMethod === 'Efectivo' && !isCashPaymentSufficient) return;
    if (paymentMethod === 'Mixto' && !isMixedPaymentValid) {
      alert(`Para pagos mixtos, la suma de Efectivo (Bs ${mixedCashNum}) y QR (Bs ${mixedQrNum}) debe ser exactamente igual al total a pagar de Bs ${cartTotal}.`);
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => setIsSubmitting(false), 800);

    const salePaymentMethod: PaymentMethod = paymentMethod;

    const cashAmountFinal =
      paymentMethod === 'Efectivo'
        ? cartTotal
        : paymentMethod === 'Mixto'
        ? mixedCashNum
        : 0;

    const qrAmountFinal =
      paymentMethod === 'QR'
        ? cartTotal
        : paymentMethod === 'Mixto'
        ? mixedQrNum
        : 0;

    const amountReceivedFinal =
      paymentMethod === 'Efectivo'
        ? amountReceivedNum
        : paymentMethod === 'Mixto'
        ? (mixedCashReceivedNum > 0 ? mixedCashReceivedNum : mixedCashNum)
        : undefined;

    const changeGivenFinal =
      paymentMethod === 'Efectivo'
        ? changeDue
        : paymentMethod === 'Mixto'
        ? mixedChangeDue
        : undefined;

    if (editingSaleId) {
      // Modifying existing sale within 30 min window
      onUpdateSale(
        editingSaleId,
        {
          items: cartItems,
          subtotal: cartSubtotal,
          discount: discountNum,
          total: cartTotal,
          paymentMethod: salePaymentMethod,
          amountReceived: amountReceivedFinal,
          changeGiven: changeGivenFinal,
          totalCostOfGoodsSold: totalCOGS,
        },
        'Venta editada dentro del período de 30 minutos autorizado'
      );

      // Reset editing
      setEditingSaleId(null);
      setEditingSaleNumber('');
      setCartItems([]);
      setDiscountAmount('0');
      setAmountReceived('');
      setMixedCashAmount('');
      setMixedQrAmount('');
      setMixedCashReceived('');
      return;
    }

    const saleNumber = `LYLA-${String(sales.length + 1).padStart(4, '0')}`;
    const newSaleData: Omit<Sale, 'id' | 'createdAt' | 'updatedAt'> = {
      receiptNumber: saleNumber,
      items: cartItems,
      subtotal: cartSubtotal,
      discount: discountNum,
      total: cartTotal,
      paymentMethod: salePaymentMethod,
      cashAmount: cashAmountFinal,
      qrAmount: qrAmountFinal,
      amountReceived: amountReceivedFinal,
      changeGiven: changeGivenFinal,
      totalCostOfGoodsSold: totalCOGS,
      status: 'CONFIRMADA',
      history: [
        {
          timestamp: new Date().toISOString(),
          action: 'CONFIRMADA',
          note:
            paymentMethod === 'Mixto'
              ? `Venta confirmada Pago Mixto: Bs ${formatBs(cashAmountFinal)} en Efectivo + Bs ${formatBs(qrAmountFinal)} en QR`
              : `Venta registrada por total de ${formatBs(cartTotal)} (${paymentMethod})`,
        },
      ],
    };

    onConfirmSale(newSaleData);

    // Show receipt confirmation
    setCompletedSale({
      ...newSaleData,
      id: `temp-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Reset cart
    setCartItems([]);
    setDiscountAmount('0');
    setAmountReceived('');
    setMixedCashAmount('');
    setMixedQrAmount('');
    setMixedCashReceived('');
  };

  // Start editing an existing sale within 30 minutes
  const handleStartEditSale = (sale: Sale) => {
    const editCheck = isSaleWithinEditWindow(sale);
    if (!editCheck.canEdit) {
      alert('El período de 30 minutos para edición directa ha vencido. Si requiere una corrección, use la anulación o devolución controlada.');
      return;
    }

    setEditingSaleId(sale.id);
    setEditingSaleNumber(sale.receiptNumber);
    setCartItems(sale.items);
    setDiscountAmount(sale.discount.toString());
    setPaymentMethod(sale.paymentMethod);
    setAmountReceived(sale.amountReceived ? sale.amountReceived.toString() : '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEditMode = () => {
    setEditingSaleId(null);
    setEditingSaleNumber('');
    setCartItems([]);
    setDiscountAmount('0');
    setAmountReceived('');
  };

  // Cancel / Anular sale handler
  const handleExecuteCancelSale = () => {
    if (!cancellingSale || !cancelReason.trim()) return;
    onCancelSale(cancellingSale.id, cancelReason.trim());
    setCancellingSale(null);
    setCancelReason('');
  };

  // Sales History Date Filters (Bolivia America/La_Paz timezone)
  const [historyFilterType, setHistoryFilterType] = useState<'today' | 'yesterday' | 'specific_date' | 'all'>('all');
  const [historySpecificDate, setHistorySpecificDate] = useState<string>(getTodayDateString());
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');

  const todayDateStr = getTodayDateString();
  const yesterdayDateStr = getYesterdayDateString();

  // Filtered sales for history table
  const recentSales = useMemo(() => {
    let result = [...sales];

    // Date filtering using Bolivia America/La_Paz timezone
    if (historyFilterType === 'today') {
      result = result.filter((s) => getBoliviaDateString(s.createdAt) === todayDateStr);
    } else if (historyFilterType === 'yesterday') {
      result = result.filter((s) => getBoliviaDateString(s.createdAt) === yesterdayDateStr);
    } else if (historyFilterType === 'specific_date' && historySpecificDate) {
      result = result.filter((s) => getBoliviaDateString(s.createdAt) === historySpecificDate);
    }

    // Text search query
    if (historySearchQuery.trim()) {
      const q = historySearchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.receiptNumber.toLowerCase().includes(q) ||
          s.paymentMethod.toLowerCase().includes(q) ||
          s.items.some((it) => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q))
      );
    }

    return result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [sales, historyFilterType, historySpecificDate, historySearchQuery, todayDateStr, yesterdayDateStr]);

  const filteredSalesTotal = useMemo(() => {
    return round2(
      recentSales
        .filter((s) => s.status !== 'ANULADA')
        .reduce((sum, s) => sum + s.total, 0)
    );
  }, [recentSales]);

  return (
    <div className="space-y-8">
      {/* Shift Not Open Warning Banner */}
      {!isShiftOpen && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl bg-rose-50 p-4 border border-rose-200 text-rose-900 shadow-xs">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-rose-600 shrink-0" />
            <div>
              <h4 className="text-sm font-bold">Jornada no iniciada</h4>
              <p className="text-xs text-rose-700">
                Primero debe abrir la jornada del día para poder registrar ventas y emitir comprobantes.
              </p>
            </div>
          </div>
          {onTriggerStartShift && (
            <button
              onClick={onTriggerStartShift}
              className="rounded-xl bg-rose-900 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-950 transition active:scale-95 shrink-0"
            >
              Iniciar Jornada Ahora
            </button>
          )}
        </div>
      )}

      {/* Edit Mode Notice Banner */}
      {editingSaleId && (
        <div className="flex items-center justify-between rounded-2xl bg-amber-50 p-4 border border-amber-300 text-amber-900 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-600 animate-pulse" />
            <div>
              <h4 className="text-sm font-bold">
                Editando Venta: {editingSaleNumber} (Período de 30 min activo)
              </h4>
              <p className="text-xs text-amber-700">
                Al confirmar, se reincorporarán al inventario los artículos originales y se descontarán los nuevos.
              </p>
            </div>
          </div>
          <button
            onClick={handleCancelEditMode}
            className="rounded-xl border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Cancelar Edición
          </button>
        </div>
      )}

      {/* Main POS Split Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Product Selection & Categories (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. SELECCIÓN DE CATEGORÍAS (Regla Maestro: Al iniciar una venta, mostrar primero las categorías) */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                1. Seleccione la Categoría de Moda
              </span>
              <span className="text-[11px] text-neutral-400">Paso 1 de la venta</span>
            </div>

            <div className={`grid gap-3 ${
              activeCategoryList.length <= 3
                ? 'grid-cols-3'
                : activeCategoryList.length === 4
                ? 'grid-cols-2 sm:grid-cols-4'
                : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
            }`}>
              {activeCategoryList.map((cat) => {
                const isSelected = selectedCategory.trim().toLowerCase() === cat.trim().toLowerCase();
                const count = products.filter(
                  (p) => p.category.trim().toLowerCase() === cat.trim().toLowerCase() && p.stock > 0
                ).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`flex flex-col items-center justify-center rounded-xl p-4 transition-all ${
                      isSelected
                        ? 'bg-rose-950 text-white shadow-md ring-2 ring-rose-950'
                        : 'border border-neutral-200 bg-neutral-50/60 text-neutral-800 hover:bg-neutral-100'
                    }`}
                  >
                    <span className="text-sm font-bold tracking-wide truncate max-w-full">{cat}</span>
                    <span
                      className={`text-[11px] mt-1 ${
                        isSelected ? 'text-amber-300 font-medium' : 'text-neutral-500'
                      }`}
                    >
                      {count} disp.
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. BUSCADOR DE PRODUCTOS */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Buscar en ${selectedCategory} por código o nombre (ej: Reloj rojo, Cartera Carbella)...`}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50/70 py-2.5 pl-10 pr-4 text-xs font-medium text-neutral-900 outline-none transition focus:border-rose-900 focus:bg-white"
              />
            </div>
          </div>

          {/* 3. PRODUCTOS DISPONIBLES EN ESTA CATEGORÍA */}
          <div>
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Productos en {selectedCategory} ({availableProducts.length})
              </h3>
              <span className="text-[11px] text-neutral-400">
                Haga clic para agregar a la venta
              </span>
            </div>

            {availableProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white py-12 text-center text-xs text-neutral-400">
                No hay productos en esta categoría con el criterio de búsqueda.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {availableProducts.map((p) => {
                  const isOutOfStock = p.stock <= 0;
                  const itemInCart = cartItems.find((item) => item.productId === p.id);
                  const inCartQty = itemInCart ? itemInCart.quantity : 0;
                  const remainingAvailable = p.stock - inCartQty;

                  return (
                    <div
                      key={p.id}
                      onClick={() => !isOutOfStock && remainingAvailable > 0 && handleAddToCart(p)}
                      className={`group relative flex flex-col justify-between rounded-2xl border p-3.5 transition-all ${
                        isOutOfStock || remainingAvailable <= 0
                          ? 'border-neutral-200 bg-neutral-100 opacity-60 cursor-not-allowed'
                          : 'border-neutral-200 bg-white hover:border-rose-900 hover:shadow-md cursor-pointer'
                      }`}
                    >
                      <div className="flex gap-3">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="h-full w-full object-cover transition group-hover:scale-105"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-neutral-400">
                              <ShoppingBag className="h-6 w-6" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-[10px] font-semibold text-rose-950">
                            {p.code}
                          </span>
                          <h4 className="font-semibold text-xs text-neutral-900 truncate">
                            {p.name}
                          </h4>
                          <p className="text-[11px] text-neutral-400 truncate">
                            {p.brand} {p.color ? `· ${p.color}` : ''}
                          </p>

                          {/* REGLA MAESTRO: Mostrar Nombre, Código, Fotografía, PRECIO DE VENTA y CANTIDAD DISPONIBLE. NO MOSTRAR COSTO DE COMPRA. */}
                          <div className="mt-1 flex items-baseline justify-between">
                            <span className="font-mono-numbers text-sm font-bold text-neutral-900">
                              {formatBs(p.salePrice)}
                            </span>
                            <span
                              className={`text-[11px] font-semibold ${
                                isOutOfStock || remainingAvailable <= 0
                                  ? 'text-rose-600'
                                  : 'text-neutral-500'
                              }`}
                            >
                              {isOutOfStock
                                ? 'Agotado'
                                : `${remainingAvailable} disponible${remainingAvailable === 1 ? '' : 's'}`}
                            </span>
                          </div>

                          {/* Botones de Colores Disponibles bajo este Código (Solo colores con stock > 0) */}
                          {(() => {
                            const activeColors = getProductActiveColors(p);
                            if (activeColors.length === 0) return null;
                            return (
                              <div className="mt-2 flex flex-wrap items-center gap-1">
                                <span className="text-[10px] text-neutral-400 font-medium">Color:</span>
                                {activeColors.map((col, idx) => {
                                  const colorStockQty = p.colorStock ? p.colorStock[col] : undefined;
                                  return (
                                    <button
                                      type="button"
                                      key={idx}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isOutOfStock && remainingAvailable > 0) {
                                          handleAddToCart(p, col);
                                        }
                                      }}
                                      className="rounded-md bg-neutral-100 hover:bg-rose-100 hover:text-rose-950 border border-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700 transition active:scale-95"
                                      title={`Agregar en color ${col}${colorStockQty !== undefined ? ` (${colorStockQty} disponibles)` : ''}`}
                                    >
                                      + {col}{colorStockQty !== undefined ? ` (${colorStockQty})` : ''}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {inCartQty > 0 && (
                        <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px] font-semibold text-rose-900">
                          <span>En esta venta:</span>
                          <span className="rounded-md bg-rose-100 px-2 py-0.5 font-mono">
                            {inCartQty} u. ({formatBs(inCartQty * p.salePrice)})
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ticket / Cart & Payment (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="sticky top-24 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-5">
            {/* Ticket Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-rose-950" />
                <h3 className="text-sm font-bold text-neutral-900">
                  {editingSaleId ? `Modificar Venta: ${editingSaleNumber}` : 'Detalle de la Venta'}
                </h3>
              </div>
              {cartItems.length > 0 && (
                <button
                  onClick={() => setCartItems([])}
                  className="text-xs text-rose-600 hover:underline"
                >
                  Vaciar
                </button>
              )}
            </div>

            {/* Cart Items List */}
            {cartItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400">
                Seleccione productos de la izquierda para agregarlos al ticket de venta.
              </div>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto divide-y divide-neutral-100 pr-1">
                {cartItems.map((item, idx) => {
                  const productRef = products.find((p) => p.id === item.productId);
                  const activeColors = productRef ? getProductActiveColors(productRef) : [];
                  const availableItemColors = Array.from(
                    new Set([...activeColors, ...(item.selectedColor ? [item.selectedColor] : [])])
                  );

                  return (
                    <div key={`${item.productId}-${item.selectedColor || 'def'}-${idx}`} className="flex items-center justify-between pt-2">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] text-neutral-400">
                            {item.code}
                          </span>
                          {availableItemColors.length > 1 ? (
                            <select
                              value={item.selectedColor || ''}
                              onChange={(e) => handleUpdateItemColor(idx, e.target.value)}
                              className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-rose-950 outline-none"
                            >
                              {availableItemColors.map((c) => (
                                <option key={c} value={c}>
                                  Color: {c}
                                </option>
                              ))}
                            </select>
                          ) : item.selectedColor ? (
                            <span className="inline-block rounded bg-rose-50 px-1.5 py-0.2 text-[10px] font-semibold text-rose-800 border border-rose-200">
                              Color: {item.selectedColor}
                            </span>
                          ) : null}
                        </div>
                        <h4 className="text-xs font-semibold text-neutral-900 truncate">
                          {item.name}
                        </h4>
                        <span className="text-[11px] text-neutral-500 font-mono-numbers">
                          {formatBs(item.unitPrice)} c/u
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Quantity Controls */}
                        <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(idx, -1)}
                            className="rounded p-1 text-neutral-500 hover:bg-neutral-200"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-7 text-center font-mono-numbers text-xs font-bold text-neutral-900">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(idx, 1)}
                            className="rounded p-1 text-neutral-500 hover:bg-neutral-200"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Subtotal */}
                        <span className="w-16 text-right font-mono-numbers text-xs font-bold text-neutral-900">
                          {formatBs(item.subtotal)}
                        </span>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(idx)}
                          className="rounded p-1 text-neutral-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Calculations & Discount Section */}
            <div className="space-y-3 border-t border-neutral-100 pt-3 text-xs">
              {/* Subtotal */}
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal ({cartItems.reduce((acc, i) => acc + i.quantity, 0)} artículos):</span>
                <span className="font-mono-numbers font-semibold text-neutral-900">
                  {formatBs(cartSubtotal)}
                </span>
              </div>

              {/* Descuentos (Requisito: Introducir manualmente el importe del descuento en bolivianos) */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-1.5 font-semibold text-neutral-700">
                    <Tag className="h-3.5 w-3.5 text-rose-900" />
                    <span>Aplicar Descuento (Bs)</span>
                  </label>
                  {discountNum > 0 && (
                    <span className="text-[11px] text-rose-700 font-bold font-mono">
                      -{formatBs(discountNum)}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                    Bs
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={cartSubtotal}
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-neutral-200 bg-white py-1.5 pl-8 pr-3 font-mono text-xs font-semibold outline-none focus:border-rose-900"
                  />
                </div>
                {discountNum > cartSubtotal && (
                  <p className="mt-1 text-[10px] text-rose-600 font-medium">
                    El descuento no puede superar el subtotal de la venta.
                  </p>
                )}
              </div>

              {/* Total Final */}
              <div className="flex items-center justify-between border-t border-neutral-200 pt-2 text-base font-bold text-neutral-900">
                <span>TOTAL A PAGAR:</span>
                <span className="font-mono-numbers text-xl text-rose-950">
                  {formatBs(cartTotal)}
                </span>
              </div>
            </div>

            {/* Método de Pago (1. Efectivo, 2. QR, 3. Mixto) */}
            <div className="space-y-3 border-t border-neutral-100 pt-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600">
                Método de Pago *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Efectivo')}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 text-xs font-bold transition ${
                    paymentMethod === 'Efectivo'
                      ? 'border-2 border-emerald-600 bg-emerald-50 text-emerald-900 shadow-xs'
                      : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  <Banknote className="h-4 w-4 text-emerald-600" />
                  <span>1. Efectivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('QR')}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 text-xs font-bold transition ${
                    paymentMethod === 'QR'
                      ? 'border-2 border-blue-600 bg-blue-50 text-blue-900 shadow-xs'
                      : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  <QrCode className="h-4 w-4 text-blue-600" />
                  <span>2. Cobro QR</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('Mixto');
                    if (!mixedCashAmount && !mixedQrAmount) {
                      const half = round2(cartTotal / 2);
                      setMixedCashAmount(half.toString());
                      setMixedQrAmount(round2(cartTotal - half).toString());
                    }
                  }}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 text-xs font-bold transition ${
                    paymentMethod === 'Mixto'
                      ? 'border-2 border-amber-600 bg-amber-50 text-amber-900 shadow-xs'
                      : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  <div className="flex items-center gap-0.5">
                    <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-[10px] text-neutral-400">+</span>
                    <QrCode className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <span>3. Mixto</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('Reserva')}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 text-xs font-bold transition ${
                    paymentMethod === 'Reserva'
                      ? 'border-2 border-purple-600 bg-purple-50 text-purple-900 shadow-xs'
                      : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  <BookmarkCheck className="h-4 w-4 text-purple-700" />
                  <span>4. Reserva</span>
                </button>
              </div>

              {/* Pago en Efectivo: Solicitar monto recibido y calcular cambio */}
              {paymentMethod === 'Efectivo' && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3.5 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Dinero Recibido del Cliente (Bs) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                        Bs
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-neutral-200 bg-white py-2 pl-9 pr-3 font-mono text-sm font-bold text-neutral-900 outline-none focus:border-rose-900"
                      />
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleQuickCash(cartTotal)}
                      className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100"
                    >
                      Exacto ({formatBs(cartTotal)})
                    </button>
                    {[50, 100, 200, 500].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleQuickCash(preset)}
                        className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100"
                      >
                        Bs {preset}
                      </button>
                    ))}
                  </div>

                  {/* Cambio a Entregar */}
                  <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-neutral-200">
                    <span className="text-xs font-semibold text-neutral-700">
                      Cambio a Entregar:
                    </span>
                    <span
                      className={`font-mono-numbers text-base font-bold ${
                        isCashPaymentSufficient ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {formatBs(changeDue)}
                    </span>
                  </div>

                  {!isCashPaymentSufficient && cartTotal > 0 && amountReceivedNum > 0 && (
                    <p className="text-[11px] font-medium text-rose-600">
                      El monto recibido es inferior al total. Faltan {formatBs(cartTotal - amountReceivedNum)}.
                    </p>
                  )}
                </div>
              )}

              {/* Pago por QR */}
              {paymentMethod === 'QR' && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-900">
                  <p className="font-semibold">Cobro mediante QR Bancario / Simple:</p>
                  <p className="text-[11px] text-blue-700 mt-0.5">
                    Se registrará el cobro directo de {formatBs(cartTotal)}. No requiere cálculo de cambio.
                  </p>
                </div>
              )}

              {/* Pago Mixto (Una parte en Efectivo y la otra en QR) */}
              {paymentMethod === 'Mixto' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-950">
                      Desglose de Pago Combinado
                    </span>
                    <span className="text-[11px] font-mono font-bold text-neutral-700">
                      Total: {formatBs(cartTotal)}
                    </span>
                  </div>

                  {/* Monto en Efectivo */}
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-emerald-800">
                        <Banknote className="h-3.5 w-3.5" />
                        Parte pagada en Efectivo (Bs) *
                      </span>
                      <button
                        type="button"
                        onClick={handleAutoFillCash}
                        className="text-[10px] text-emerald-700 hover:underline font-bold"
                      >
                        Completar con Efectivo
                      </button>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                        Bs
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={cartTotal}
                        value={mixedCashAmount}
                        onChange={(e) => setMixedCashAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-neutral-300 bg-white py-1.5 pl-8 pr-3 font-mono text-xs font-bold text-neutral-900 outline-none focus:border-emerald-600"
                      />
                    </div>
                  </div>

                  {/* Monto en QR */}
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-blue-800">
                        <QrCode className="h-3.5 w-3.5" />
                        Parte pagada en QR (Bs) *
                      </span>
                      <button
                        type="button"
                        onClick={handleAutoFillQr}
                        className="text-[10px] text-blue-700 hover:underline font-bold"
                      >
                        Completar con QR
                      </button>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                        Bs
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={cartTotal}
                        value={mixedQrAmount}
                        onChange={(e) => setMixedQrAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-neutral-300 bg-white py-1.5 pl-8 pr-3 font-mono text-xs font-bold text-neutral-900 outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {/* Botón rápido 50/50 */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSplitFiftyFifty}
                      className="flex-1 rounded-lg border border-neutral-300 bg-white py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 transition"
                    >
                      Dividir 50% Efectivo / 50% QR
                    </button>
                  </div>

                  {/* Validación de suma */}
                  <div className={`rounded-lg p-2 text-xs flex items-center justify-between border ${
                    isMixedPaymentValid
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border-rose-200'
                  }`}>
                    <span>Suma ingresada:</span>
                    <span className="font-mono font-bold">
                      {formatBs(mixedTotalEntered)} / {formatBs(cartTotal)}
                    </span>
                  </div>

                  {!isMixedPaymentValid && (
                    <p className="text-[11px] text-rose-700 font-medium">
                      {mixedTotalEntered < cartTotal
                        ? `Faltan ${formatBs(cartTotal - mixedTotalEntered)} para cubrir el total.`
                        : `La suma excede el total por ${formatBs(mixedTotalEntered - cartTotal)}.`}
                    </p>
                  )}

                  {/* Billete recibido para la parte en efectivo (opcional para dar cambio) */}
                  {mixedCashNum > 0 && (
                    <div className="border-t border-amber-200/70 pt-2.5">
                      <label className="block text-[11px] text-neutral-600 mb-1">
                        Billete entregado por cliente para la parte en Efectivo (opcional):
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={mixedCashReceived}
                        onChange={(e) => setMixedCashReceived(e.target.value)}
                        placeholder={`Monto recibido (ej. ${mixedCashNum})`}
                        className="w-full rounded-xl border border-neutral-300 bg-white py-1.5 px-3 font-mono text-xs font-semibold outline-none focus:border-emerald-600"
                      />
                      {mixedChangeDue > 0 && (
                        <div className="mt-2 flex justify-between items-center rounded-lg bg-white p-2 border border-emerald-200 text-xs">
                          <span className="text-neutral-700 font-medium">Cambio en efectivo:</span>
                          <span className="font-mono font-bold text-emerald-700">
                            {formatBs(mixedChangeDue)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Opción Reserva / Apartado de Mercadería (Vence a las 168 horas) */}
              {paymentMethod === 'Reserva' && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3.5 space-y-3">
                  <div className="flex items-center justify-between border-b border-purple-200/70 pb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-purple-950">
                      <BookmarkCheck className="h-4 w-4 text-purple-700" />
                      <span>Apartado de Mercadería (Live / Pedido)</span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-neutral-700">
                      Total: {formatBs(cartTotal)}
                    </span>
                  </div>

                  {/* Resumen de Seña y Saldo Restante */}
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-2.5 border border-purple-100 text-xs">
                    <div>
                      <span className="text-[10px] text-neutral-500 block">Anticipo / Seña a cobrar hoy:</span>
                      <span className="font-mono font-bold text-emerald-700 text-sm">
                        {formatBs(resDepositNum)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-500 block">Saldo al recoger en tienda:</span>
                      <span className="font-mono font-bold text-rose-950 text-sm">
                        {formatBs(resRemainingBalance)}
                      </span>
                    </div>
                  </div>

                  {/* Monto de Anticipo */}
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Monto con el que reserva la clienta (Bs) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                        Bs
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        max={cartTotal}
                        value={resDepositAmount}
                        onChange={(e) => setResDepositAmount(e.target.value)}
                        placeholder="20.00"
                        className="w-full rounded-xl border border-neutral-300 bg-white py-1.5 pl-8 pr-3 font-mono text-xs font-bold text-neutral-900 outline-none focus:border-purple-600"
                      />
                    </div>
                  </div>

                  {/* Método con el que paga el anticipo */}
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      ¿Cómo paga el anticipo hoy? *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setResDepositMethod('QR')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border py-1.5 px-2 text-xs font-bold transition ${
                          resDepositMethod === 'QR'
                            ? 'border-2 border-blue-600 bg-blue-50 text-blue-900 shadow-xs'
                            : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        <QrCode className="h-3.5 w-3.5 text-blue-600" />
                        <span>Pago QR</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setResDepositMethod('Efectivo')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border py-1.5 px-2 text-xs font-bold transition ${
                          resDepositMethod === 'Efectivo'
                            ? 'border-2 border-emerald-600 bg-emerald-50 text-emerald-900 shadow-xs'
                            : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Efectivo</span>
                      </button>
                    </div>
                  </div>

                  {/* Datos de la clienta */}
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-0.5">
                        Nombre de la Clienta *
                      </label>
                      <input
                        type="text"
                        value={resCustomerName}
                        onChange={(e) => setResCustomerName(e.target.value)}
                        placeholder="Ej: Valeria Méndez"
                        className="w-full rounded-xl border border-neutral-300 bg-white py-1.5 px-3 text-xs font-medium outline-none focus:border-purple-600"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-neutral-700 mb-0.5">
                          Usuario Live / Redes
                        </label>
                        <input
                          type="text"
                          value={resCustomerSocialUser}
                          onChange={(e) => setResCustomerSocialUser(e.target.value)}
                          placeholder="Ej: @valeria_scz"
                          className="w-full rounded-xl border border-neutral-300 bg-white py-1 px-2.5 text-xs font-medium outline-none focus:border-purple-600"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-neutral-700 mb-0.5">
                          Teléfono / WhatsApp
                        </label>
                        <input
                          type="text"
                          value={resCustomerPhone}
                          onChange={(e) => setResCustomerPhone(e.target.value)}
                          placeholder="Ej: 77392811"
                          className="w-full rounded-xl border border-neutral-300 bg-white py-1 px-2.5 text-xs font-medium outline-none focus:border-purple-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-neutral-700 mb-0.5">
                          Canal de origen
                        </label>
                        <select
                          value={resChannel}
                          onChange={(e) => setResChannel(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 bg-white py-1 px-2 text-xs font-medium outline-none"
                        >
                          <option value="Live TikTok">Live TikTok</option>
                          <option value="Live Facebook">Live Facebook</option>
                          <option value="Live Instagram">Live Instagram</option>
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Tienda Física">Tienda Física</option>
                          <option value="Otro">Otro</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-neutral-700 mb-0.5">
                          Notas
                        </label>
                        <input
                          type="text"
                          value={resNotes}
                          onChange={(e) => setResNotes(e.target.value)}
                          placeholder="Ej: Recoge el sábado..."
                          className="w-full rounded-xl border border-neutral-300 bg-white py-1 px-2.5 text-xs outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Vencimiento exacto 168 horas */}
                  <div className="rounded-lg bg-amber-50 p-2 border border-amber-200 text-[10px] text-amber-900 flex items-start gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Vencimiento a las 168 horas (7 días):</span> Los artículos se apartarán del inventario disponible. Si la clienta cancela o no recoge, el 100% del adelanto (Bs {formatBs(resDepositNum)}) es retenido por LYLA sin reembolso.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* AVISO DE JORNADA CERRADA */}
            {isShiftClosed && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                <div>
                  <span className="font-bold">Jornada de hoy cerrada:</span> Para registrar nuevas ventas, solicite una reapertura autorizada en el módulo de Control de Jornada.
                </div>
              </div>
            )}

            {/* BOTÓN DE ACCIÓN (CONFIRMAR VENTA O CONFIRMAR RESERVA) */}
            {paymentMethod === 'Reserva' ? (
              <button
                type="button"
                disabled={!isReservationValid || isSubmitting || isShiftClosed}
                onClick={handleConfirmReservation}
                className={`w-full rounded-xl py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition ${
                  !isReservationValid || isSubmitting || isShiftClosed
                    ? 'bg-neutral-300 cursor-not-allowed'
                    : 'bg-rose-950 hover:bg-rose-900 active:scale-98'
                }`}
              >
                {isSubmitting ? 'PROCESANDO APARTADO...' : 'APARTAR STOCK Y CONFIRMAR RESERVA (168 HORAS)'}
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  isShiftClosed ||
                  isSubmitting ||
                  cartItems.length === 0 ||
                  discountNum > cartSubtotal ||
                  (paymentMethod === 'Efectivo' && !isCashPaymentSufficient) ||
                  (paymentMethod === 'Mixto' && !isMixedPaymentValid)
                }
                onClick={handleConfirmSale}
                className={`w-full rounded-xl py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition ${
                  isShiftClosed ||
                  isSubmitting ||
                  cartItems.length === 0 ||
                  discountNum > cartSubtotal ||
                  (paymentMethod === 'Efectivo' && !isCashPaymentSufficient) ||
                  (paymentMethod === 'Mixto' && !isMixedPaymentValid)
                    ? 'bg-neutral-300 cursor-not-allowed'
                    : 'bg-rose-950 hover:bg-rose-900 active:scale-98'
                }`}
              >
                {isSubmitting
                  ? 'REGISTRANDO VENTA...'
                  : editingSaleId
                  ? 'GUARDAR MODIFICACIÓN DE VENTA'
                  : 'CONFIRMAR VENTA'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Historial de Ventas Recientes & Control de Edición durante 30 minutos */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-neutral-900">
              Historial y Consulta de Ventas por Fecha
            </h3>
            <p className="text-xs text-neutral-500">
              Consulta de operaciones por día en hora oficial de Bolivia (America/La_Paz)
            </p>
          </div>
          <span className="text-xs text-neutral-500 font-mono">
            {sales.length} ventas totales en sistema
          </span>
        </div>

        {/* Barra de Filtros por Fecha y Búsqueda */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 p-3 rounded-xl border border-neutral-200 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-neutral-500 font-semibold mr-1 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-neutral-400" />
              <span>Ver:</span>
            </span>

            <button
              type="button"
              onClick={() => setHistoryFilterType('all')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                historyFilterType === 'all'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Todas
            </button>

            <button
              type="button"
              onClick={() => setHistoryFilterType('today')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                historyFilterType === 'today'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Hoy ({sales.filter((s) => s.status !== 'ANULADA' && getBoliviaDateString(s.createdAt) === todayDateStr).length})
            </button>

            <button
              type="button"
              onClick={() => setHistoryFilterType('yesterday')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                historyFilterType === 'yesterday'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Ayer ({sales.filter((s) => s.status !== 'ANULADA' && getBoliviaDateString(s.createdAt) === yesterdayDateStr).length})
            </button>

            <button
              type="button"
              onClick={() => setHistoryFilterType('specific_date')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                historyFilterType === 'specific_date'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Día específico
            </button>

            {historyFilterType === 'specific_date' && (
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="date"
                  value={historySpecificDate}
                  onChange={(e) => setHistorySpecificDate(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-2 py-0.5 text-xs font-medium outline-none focus:border-neutral-900"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-48">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="Buscar recibo, producto..."
                className="w-full rounded-lg border border-neutral-200 bg-white py-1 pl-8 pr-2 text-xs outline-none focus:border-rose-900"
              />
            </div>

            <div className="rounded-lg bg-neutral-200/70 px-2.5 py-1 font-mono text-[11px] font-semibold text-neutral-800 whitespace-nowrap">
              {recentSales.length} ventas · {formatBs(filteredSalesTotal)}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-600">
              <tr>
                <th className="py-3 pl-4 pr-2">Nº Venta</th>
                <th className="px-2 py-3">Fecha y Hora</th>
                <th className="px-2 py-3">Artículos</th>
                <th className="px-2 py-3">Pago</th>
                <th className="px-2 py-3 text-right">Subtotal</th>
                <th className="px-2 py-3 text-right">Desc.</th>
                <th className="px-2 py-3 text-right">Total Cobrado</th>
                <th className="px-2 py-3 text-center">Edición (30 min)</th>
                <th className="py-3 pl-2 pr-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {recentSales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-xs text-neutral-400">
                    Aún no se han registrado ventas.
                  </td>
                </tr>
              ) : (
                recentSales.map((s) => {
                  const editStatus = isSaleWithinEditWindow(s);
                  const isCancelled = s.status === 'ANULADA';

                  return (
                    <tr
                      key={s.id}
                      className={`transition ${isCancelled ? 'bg-rose-50/30 line-through text-neutral-400' : 'hover:bg-neutral-50'}`}
                    >
                      {/* Recibo */}
                      <td className="py-3 pl-4 pr-2 font-mono font-bold text-neutral-900">
                        {s.receiptNumber}
                      </td>

                      {/* Fecha y Hora */}
                      <td className="px-2 py-3 text-neutral-500">
                        {formatDateTime(s.createdAt)}
                      </td>

                      {/* Artículos */}
                      <td className="px-2 py-3">
                        <div className="space-y-0.5 max-w-[220px]">
                          {s.items.map((it, idx) => (
                            <div key={idx} className="truncate text-[11px]">
                              <span className="font-semibold text-neutral-900">{it.quantity}x</span>{' '}
                              <span>{it.name}</span>
                              {it.selectedColor && (
                                <span className="ml-1 text-[10px] font-medium text-rose-800 bg-rose-50 border border-rose-200 px-1 py-0.2 rounded">
                                  {it.selectedColor}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Método de Pago */}
                      <td className="px-2 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold text-[10px] ${
                            s.paymentMethod === 'Efectivo'
                              ? 'bg-emerald-100 text-emerald-800'
                              : s.paymentMethod === 'QR'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {s.paymentMethod === 'Efectivo' && <Banknote className="h-3 w-3" />}
                          {s.paymentMethod === 'QR' && <QrCode className="h-3 w-3" />}
                          {s.paymentMethod === 'Mixto' && (
                            <div className="flex items-center gap-0.5">
                              <Banknote className="h-3 w-3 text-emerald-700" />
                              <span>+</span>
                              <QrCode className="h-3 w-3 text-blue-700" />
                            </div>
                          )}
                          <span>
                            {s.paymentMethod === 'Mixto'
                              ? `Mixto (Ef: ${formatBs(s.cashAmount || 0)} · QR: ${formatBs(s.qrAmount || 0)})`
                              : s.paymentMethod}
                          </span>
                        </span>
                      </td>

                      {/* Subtotal */}
                      <td className="px-2 py-3 text-right font-mono-numbers">
                        {formatBs(s.subtotal)}
                      </td>

                      {/* Descuento */}
                      <td className="px-2 py-3 text-right font-mono-numbers text-rose-700">
                        {s.discount > 0 ? `-${formatBs(s.discount)}` : '—'}
                      </td>

                      {/* Total Cobrado */}
                      <td className="px-2 py-3 text-right font-mono-numbers font-bold text-neutral-900">
                        {formatBs(s.total)}
                      </td>

                      {/* Temporizador de Edición de 30 minutos */}
                      <td className="px-2 py-3 text-center">
                        {isCancelled ? (
                          <span className="font-semibold text-rose-600">ANULADA</span>
                        ) : editStatus.canEdit ? (
                          <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 animate-pulse">
                            <Clock className="h-3 w-3" />
                            <span>
                              {editStatus.minutesRemaining}m {editStatus.secondsRemaining}s
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-neutral-400">
                            Bloqueada (+30m)
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3 pl-2 pr-4 text-right">
                        {!isCancelled && (
                          <div className="flex items-center justify-end gap-1.5">
                            {editStatus.canEdit && (
                              <button
                                onClick={() => handleStartEditSale(s)}
                                className="flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100"
                                title="Editar dentro de 30 min"
                              >
                                <Edit3 className="h-3 w-3" />
                                <span>Editar</span>
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setCancellingSale(s);
                                setCancelReason('');
                              }}
                              className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                              title="Anulación o Devolución controlada con motivo"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Anular</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Comprobante de Venta Exitosa */}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle className="h-7 w-7" />
              </div>
              <h3 className="mt-3 font-brand text-lg font-bold text-neutral-900">
                ¡Venta Confirmada con Éxito!
              </h3>
              <p className="text-xs text-neutral-500">
                Recibo Nº {completedSale.receiptNumber} · SISTEMA LYLA
              </p>
            </div>

            <div className="mt-5 space-y-3 rounded-xl bg-neutral-50 p-4 text-xs border border-neutral-100">
              <div className="flex justify-between text-neutral-500">
                <span>Fecha y Hora:</span>
                <span className="font-medium text-neutral-900">{formatDateTime(completedSale.createdAt)}</span>
              </div>
              <div className="flex justify-between text-neutral-500">
                <span>Método de Pago:</span>
                <span className="font-semibold text-neutral-900">
                  {completedSale.paymentMethod === 'Mixto' ? 'Pago Mixto (Efectivo + QR)' : completedSale.paymentMethod}
                </span>
              </div>
              {completedSale.paymentMethod === 'Efectivo' && (
                <>
                  <div className="flex justify-between text-neutral-500">
                    <span>Monto Recibido:</span>
                    <span className="font-mono-numbers font-medium text-neutral-900">{formatBs(completedSale.amountReceived)}</span>
                  </div>
                  <div className="flex justify-between text-neutral-500">
                    <span>Cambio Entregado:</span>
                    <span className="font-mono-numbers font-bold text-emerald-700">{formatBs(completedSale.changeGiven)}</span>
                  </div>
                </>
              )}
              {completedSale.paymentMethod === 'Mixto' && (
                <>
                  <div className="flex justify-between text-neutral-500">
                    <span>Efectivo Cobrado:</span>
                    <span className="font-mono-numbers font-semibold text-emerald-700">{formatBs(completedSale.cashAmount)}</span>
                  </div>
                  <div className="flex justify-between text-neutral-500">
                    <span>QR Cobrado:</span>
                    <span className="font-mono-numbers font-semibold text-blue-700">{formatBs(completedSale.qrAmount)}</span>
                  </div>
                  {completedSale.changeGiven && completedSale.changeGiven > 0 ? (
                    <div className="flex justify-between text-neutral-500">
                      <span>Cambio en Efectivo:</span>
                      <span className="font-mono-numbers font-bold text-emerald-700">{formatBs(completedSale.changeGiven)}</span>
                    </div>
                  ) : null}
                </>
              )}
              {completedSale.reservationDepositApplied && completedSale.reservationDepositApplied > 0 ? (
                <div className="flex justify-between text-neutral-500">
                  <span>Anticipo de Reserva Descontado:</span>
                  <span className="font-mono-numbers font-bold text-amber-700">-{formatBs(completedSale.reservationDepositApplied)}</span>
                </div>
              ) : null}
              <div className="border-t border-neutral-200 pt-2 flex justify-between font-bold text-neutral-900 text-sm">
                <span>Total Cobrado:</span>
                <span className="font-mono-numbers text-rose-950">{formatBs(completedSale.total)}</span>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-center text-amber-700 bg-amber-50 rounded-lg p-2 border border-amber-200">
              <Clock className="h-3 w-3 inline mr-1" />
              Esta venta puede ser editada durante los próximos 30 minutos desde el historial.
            </p>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setCompletedSale(null)}
                className="w-full rounded-xl bg-rose-900 py-2.5 text-xs font-semibold text-white hover:bg-rose-950 transition"
              >
                Aceptar y Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Anulación Controlada con Historial */}
      {cancellingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <ShieldAlert className="h-6 w-6" />
              <h3 className="text-base font-bold text-neutral-900">
                Anulación / Devolución Controlada
              </h3>
            </div>

            <p className="text-xs text-neutral-600">
              Se anulará la venta <strong className="font-mono">{cancellingSale.receiptNumber}</strong> por valor de{' '}
              <strong className="font-mono-numbers">{formatBs(cancellingSale.total)}</strong>. Los productos vendidos
              serán reincorporados automáticamente al inventario físico.
            </p>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Motivo de la Anulación / Devolución *
              </label>
              <textarea
                required
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Especifique el motivo (ej: Cliente devolvió cartera por cambio de color, error en monto de cobro, etc.)"
                className="w-full rounded-xl border border-neutral-200 p-3 text-xs outline-none focus:border-rose-900"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCancellingSale(null)}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!cancelReason.trim()}
                onClick={handleExecuteCancelSale}
                className={`rounded-xl px-4 py-2 text-xs font-semibold text-white ${
                  !cancelReason.trim() ? 'bg-neutral-300 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                Confirmar Anulación y Devolver Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
