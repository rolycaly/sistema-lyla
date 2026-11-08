/**
 * SISTEMA LYLA - Modelos de Datos
 * Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
 */

export type ProductCategory = 'Carteras' | 'Joyas' | 'Relojes' | 'Accesorios' | string;

export interface ProductCategoryItem {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: ProductCategory;
  color: string; // Color principal o texto descriptivo
  availableColors?: string[]; // Lista de colores disponibles bajo este código (con stock > 0)
  colorStock?: Record<string, number>; // Cantidad disponible individual por color { "Negro": 5, "Beige": 3 }
  brand: string;
  purchaseCost: number; // Costo interno en Bs (no visible en ventas)
  salePrice: number;    // Precio de venta al público en Bs
  stock: number;        // Stock disponible para venta (physicalStock - reservedStock)
  physicalStock?: number; // Stock físico total en tienda
  reservedStock?: number; // Unidades apartadas en reservas activas
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  productId: string;
  code: string;
  name: string;
  category: ProductCategory;
  selectedColor?: string; // Color específico vendido/reservado
  unitPrice: number;
  quantity: number;
  subtotal: number;
  unitPurchaseCost: number; // Costo unitario al momento de la venta
  totalPurchaseCost: number; // Costo total para costo de ventas
  imageUrl?: string;
}

export type PaymentMethod = 'Efectivo' | 'QR' | 'Mixto';

export type SaleStatus = 'CONFIRMADA' | 'EDITADA' | 'ANULADA';

export interface SaleHistoryEntry {
  timestamp: string;
  action: string;
  note: string;
}

export interface Sale {
  id: string;
  receiptNumber: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashAmount?: number; // Monto cobrado en efectivo (en pagos mixtos o efectivo)
  qrAmount?: number;   // Monto cobrado en QR (en pagos mixtos o QR)
  amountReceived?: number;
  changeGiven?: number;
  totalCostOfGoodsSold: number; // COGS exacto
  status: SaleStatus;
  cancellationReason?: string;
  history: SaleHistoryEntry[];
  createdAt: string; // ISO 8601
  updatedAt: string;
  shiftClosedId?: string;
  reservationId?: string; // ID de la reserva si proviene de un apartado
  reservationDepositApplied?: number; // Anticipo descontado si vino de reserva
}

export type ReservationStatus = 'PENDIENTE' | 'COMPLETADA' | 'CANCELADA' | 'VENCIDA';
export type ReservationChannel =
  | 'Live TikTok'
  | 'Live Facebook'
  | 'Live Instagram'
  | 'WhatsApp'
  | 'Tienda Física'
  | 'Otro';

export interface ReservationItem {
  productId: string;
  code: string;
  name: string;
  category: ProductCategory;
  selectedColor?: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  unitPurchaseCost: number;
  imageUrl?: string;
}

export interface Reservation {
  id: string;
  reservationNumber: string; // ej. RES-001
  customerName: string;
  customerPhone?: string;
  customerSocialUser?: string; // ej. @mariarossi en TikTok
  channel: ReservationChannel | string;
  items: ReservationItem[];
  totalAmount: number;
  depositAmount: number; // Anticipo / Seña en Bs (ej. 20 Bs)
  depositPaymentMethod: 'Efectivo' | 'QR'; // Método de pago del anticipo
  remainingBalance: number; // Saldo a pagar al recoger (totalAmount - depositAmount)
  status: ReservationStatus;
  createdAt: string; // Fecha y hora exacta de creación (ISO 8601)
  expiresAt: string; // Fecha y hora exacta de vencimiento a las 168 horas / 7 días (ISO 8601)
  expirationDate?: string; // Fecha estimada o formato YYYY-MM-DD
  completedAt?: string;
  completedSaleId?: string;
  completionPaymentMethod?: PaymentMethod;
  completionCashAmount?: number;
  completionQrAmount?: number;
  cancelledAt?: string;
  cancellationReason?: string;
  responsible?: string; // 'Roly' | 'Keyla' | 'Sistema LYLA'
  retainedDeposit?: number; // 100% del adelanto conservado por LYLA como ingreso independiente
  notes?: string;
}

export interface InventoryPurchase {
  id: string;
  purchaseNumber: string;
  supplier: string;
  date: string;
  productId: string;
  productCode: string;
  productName: string;
  category: ProductCategory;
  selectedColor?: string;
  quantity: number;
  unitCost: number;
  total: number;
  isNewProduct: boolean;
  createdAt: string;
}

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  responsible: 'Roly' | 'Keyla' | string;
  date: string; // ISO string
  shiftClosedId?: string;
}

export interface ShiftOpening {
  id: string;
  date: string; // YYYY-MM-DD
  openedAt: string; // ISO String
  openedBy: string; // 'Roly' | 'Keyla' | string
  initialCash: number; // Monto inicial en efectivo (Caja chica)
  initialQr: number; // Saldo inicial en QR si lo hay
  totalInitial: number; // Suma inicial (Efectivo + QR)
  notes?: string;
}

export interface ShiftClose {
  id: string;
  date: string; // YYYY-MM-DD
  openedAt?: string;
  openedBy?: string;
  closedAt: string; // ISO String
  closedBy: string;
  initialCash: number;
  initialQr: number;
  totalInitial: number;
  totalSales: number;
  cashSales: number;
  qrSales: number;
  salesCount: number;
  totalDiscounts: number;
  totalExpenses: number;
  cashExpenses: number;
  qrExpenses: number;
  expensesByCategory: Record<string, number>;
  expensesSummary: Array<{
    category: string;
    description: string;
    amount: number;
    paymentMethod: PaymentMethod;
    responsible: string;
  }>;
  operationalFlow: number; // Total vendido - Total gastado (flujo del día)
  finalExpectedCash: number; // initialCash + cashSales - cashExpenses
  finalExpectedQr: number;   // initialQr + qrSales - qrExpenses
  expectedTotalMoney?: number; // finalExpectedCash + finalExpectedQr (Total dinero esperado)
  realCashCounted?: number;  // Conteo físico de efectivo en caja al cerrar
  realQrVerified?: number;   // Saldo verificado en QR / Banco al cerrar
  realTotalMoney?: number;   // realCashCounted + realQrVerified (Total dinero real contado)
  cashDifference?: number;   // realCashCounted - finalExpectedCash (>0 sobrante, <0 faltante)
  qrDifference?: number;     // realQrVerified - finalExpectedQr (>0 sobrante, <0 faltante)
  totalDifference?: number;  // realTotalMoney - expectedTotalMoney (>0 sobrante, <0 faltante)
  differenceReason?: string; // Explicación obligatoria si existe faltante o sobrante en el arqueo
  isReopened?: boolean;      // Indica si la jornada fue reabierta de manera controlada y auditada
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
  notes?: string;
}

export interface IncomeStatement {
  periodLabel: string;
  startDate: string;
  endDate: string;
  // A. Ingresos por ventas
  grossSales: number;
  discounts: number;
  netSales: number;
  // B. Costo de ventas
  costOfGoodsSold: number;
  // C. Utilidad bruta
  grossProfit: number;
  grossMarginPct: number;
  // D. Ingresos por adelantos retenidos (100% de señas conservadas de reservas canceladas o vencidas)
  retainedDepositsIncome: number;
  retainedDepositsCount: number;
  // E. Gastos operativos
  operatingExpenses: Record<string, number>;
  totalExpenses: number;
  // F. Utilidad neta
  netProfit: number;
  netMarginPct: number;
  salesCount: number;
  unitsSold: number;
  periodSales?: Sale[];
  periodExpenses?: Expense[];
}
