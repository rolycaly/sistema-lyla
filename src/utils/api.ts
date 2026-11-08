/**
 * SISTEMA LYLA - Cliente de Conexión API / MySQL Local
 * Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
 * 
 * Servicios RESTful para conectar el frontend React 19 directamente a MySQL
 * a través de las APIs Express.
 */

import {
  Product,
  ProductCategoryItem,
  Sale,
  InventoryPurchase,
  Expense,
  ShiftClose,
  ShiftOpening,
  Reservation,
  IncomeStatement,
} from '../types';

export interface BackendStatus {
  status: string;
  systemName: string;
  city: string;
  timezone: string;
  mysqlConnected: boolean;
  dbHost?: string;
  dbName?: string;
  error?: string | null;
  mode: 'mysql' | 'offline-storage';
}

const API_TIMEOUT = 5000;

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      let errMessage = `Error ${res.status}: ${res.statusText}`;
      try {
        const errJson = await res.json();
        if (errJson && errJson.message) {
          errMessage = errJson.message;
        }
      } catch (_) {}
      throw new Error(errMessage);
    }

    return (await res.json()) as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`La petición a ${url} excedió el tiempo límite de espera.`);
    }
    throw err;
  }
}

// =====================================================================
// ESTADO Y CONEXIÓN
// =====================================================================
export async function checkBackendStatus(): Promise<BackendStatus> {
  try {
    return await apiFetch<BackendStatus>('/api/status');
  } catch (err: any) {
    return {
      status: 'offline',
      systemName: 'SISTEMA LYLA',
      city: 'Santa Cruz de la Sierra, Bolivia',
      timezone: 'America/La_Paz',
      mysqlConnected: false,
      error: err.message || 'No se pudo conectar con el servidor backend Express.',
      mode: 'offline-storage',
    };
  }
}

// =====================================================================
// PRODUCTOS Y CATEGORÍAS
// =====================================================================
export async function apiGetProducts(params?: {
  category?: string;
  search?: string;
  hideCost?: boolean;
}): Promise<Product[]> {
  const query = new URLSearchParams();
  if (params?.category) query.set('category', params.category);
  if (params?.search) query.set('search', params.search);
  if (params?.hideCost) query.set('hideCost', 'true');

  const qStr = query.toString();
  return await apiFetch<Product[]>(`/api/products${qStr ? `?${qStr}` : ''}`);
}

export async function apiGetProductById(id: string): Promise<Product> {
  return await apiFetch<Product>(`/api/products/${encodeURIComponent(id)}`);
}

export async function apiCreateProduct(
  productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<{ success: boolean; product: Product }> {
  return await apiFetch<{ success: boolean; product: Product }>('/api/products', {
    method: 'POST',
    body: JSON.stringify(productData),
  });
}

export async function apiUpdateProduct(
  id: string,
  productData: Partial<Product>
): Promise<{ success: boolean; product: Product }> {
  return await apiFetch<{ success: boolean; product: Product }>(`/api/products/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(productData),
  });
}

export async function apiDeleteProduct(id: string): Promise<{ success: boolean; message: string }> {
  return await apiFetch<{ success: boolean; message: string }>(`/api/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function apiGetProductCategories(): Promise<ProductCategoryItem[]> {
  return await apiFetch<ProductCategoryItem[]>('/api/products/categories/all');
}

export async function apiCreateProductCategory(name: string): Promise<{ success: boolean; category: ProductCategoryItem }> {
  return await apiFetch<{ success: boolean; category: ProductCategoryItem }>('/api/products/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function apiUpdateProductCategory(
  id: string,
  updates: { name?: string; active?: boolean }
): Promise<{ success: boolean; message?: string }> {
  return await apiFetch<{ success: boolean; message?: string }>(`/api/products/categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

// =====================================================================
// VENTAS
// =====================================================================
export async function apiGetSales(): Promise<Sale[]> {
  return await apiFetch<Sale[]>('/api/sales');
}

export async function apiCreateSale(
  saleData: Omit<Sale, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<{ success: boolean; sale: Sale }> {
  return await apiFetch<{ success: boolean; sale: Sale }>('/api/sales', {
    method: 'POST',
    body: JSON.stringify(saleData),
  });
}

export async function apiUpdateSale(
  id: string,
  updateData: any,
  reason: string
): Promise<{ success: boolean; result: any }> {
  return await apiFetch<{ success: boolean; result: any }>(`/api/sales/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...updateData, reason }),
  });
}

export async function apiCancelSale(
  id: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  return await apiFetch<{ success: boolean; message: string }>(`/api/sales/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// =====================================================================
// COMPRAS
// =====================================================================
export async function apiGetPurchases(): Promise<InventoryPurchase[]> {
  return await apiFetch<InventoryPurchase[]>('/api/purchases');
}

export async function apiCreatePurchase(
  purchaseData: Omit<InventoryPurchase, 'id' | 'createdAt'> & {
    id?: string;
    newProductData?: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
  }
): Promise<{ success: boolean; purchase: InventoryPurchase }> {
  return await apiFetch<{ success: boolean; purchase: InventoryPurchase }>('/api/purchases', {
    method: 'POST',
    body: JSON.stringify(purchaseData),
  });
}

// =====================================================================
// RESERVAS
// =====================================================================
export async function apiGetReservations(): Promise<Reservation[]> {
  return await apiFetch<Reservation[]>('/api/reservations');
}

export async function apiCreateReservation(resData: any): Promise<{ success: boolean; reservation: Reservation }> {
  return await apiFetch<{ success: boolean; reservation: Reservation }>('/api/reservations', {
    method: 'POST',
    body: JSON.stringify(resData),
  });
}

export async function apiCancelReservation(
  id: string,
  reason: string,
  responsible = 'Roly'
): Promise<{ success: boolean; message: string }> {
  return await apiFetch<{ success: boolean; message: string }>(`/api/reservations/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason, responsible }),
  });
}

// =====================================================================
// GASTOS OPERATIVOS
// =====================================================================
export async function apiGetExpenses(params?: { date?: string; category?: string }): Promise<Expense[]> {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.category) query.set('category', params.category);
  const qStr = query.toString();
  return await apiFetch<Expense[]>(`/api/expenses${qStr ? `?${qStr}` : ''}`);
}

export async function apiCreateExpense(
  expenseData: Omit<Expense, 'id' | 'date'> & { id?: string; date?: string }
): Promise<{ success: boolean; expense: Expense }> {
  return await apiFetch<{ success: boolean; expense: Expense }>('/api/expenses', {
    method: 'POST',
    body: JSON.stringify(expenseData),
  });
}

export async function apiDeleteExpense(id: string): Promise<{ success: boolean; message: string }> {
  return await apiFetch<{ success: boolean; message: string }>(`/api/expenses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function apiGetExpenseCategories(): Promise<string[]> {
  return await apiFetch<string[]>('/api/expenses/categories/all');
}

export async function apiCreateExpenseCategory(name: string): Promise<{ success: boolean; name: string }> {
  return await apiFetch<{ success: boolean; name: string }>('/api/expenses/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// =====================================================================
// PROVEEDORES
// =====================================================================
export async function apiGetSuppliers(): Promise<any[]> {
  return await apiFetch<any[]>('/api/suppliers');
}

export async function apiCreateSupplier(supplierData: any): Promise<{ success: boolean; supplier: any }> {
  return await apiFetch<{ success: boolean; supplier: any }>('/api/suppliers', {
    method: 'POST',
    body: JSON.stringify(supplierData),
  });
}

// =====================================================================
// JORNADAS
// =====================================================================
export async function apiGetActiveShift(): Promise<{ hasActiveShift: boolean; activeShift: ShiftOpening | null }> {
  return await apiFetch<{ hasActiveShift: boolean; activeShift: ShiftOpening | null }>('/api/shifts/active');
}

export async function apiOpenShift(
  openingData: ShiftOpening
): Promise<{ success: boolean; opening: ShiftOpening }> {
  return await apiFetch<{ success: boolean; opening: ShiftOpening }>('/api/shifts/open', {
    method: 'POST',
    body: JSON.stringify(openingData),
  });
}

export async function apiCloseShift(
  shiftData: ShiftClose
): Promise<{ success: boolean; shiftClose: ShiftClose }> {
  return await apiFetch<{ success: boolean; shiftClose: ShiftClose }>('/api/shifts/close', {
    method: 'POST',
    body: JSON.stringify(shiftData),
  });
}

export async function apiGetShiftsHistory(): Promise<ShiftClose[]> {
  return await apiFetch<ShiftClose[]>('/api/shifts/history');
}

export async function apiReopenShift(
  date: string,
  responsible: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  return await apiFetch<{ success: boolean; message: string }>('/api/shifts/reopen', {
    method: 'POST',
    body: JSON.stringify({ date, responsible, reason }),
  });
}

// =====================================================================
// REPORTES
// =====================================================================
export async function apiGetIncomeStatement(
  startDate?: string,
  endDate?: string,
  periodLabel?: string
): Promise<IncomeStatement> {
  const query = new URLSearchParams();
  if (startDate) query.set('startDate', startDate);
  if (endDate) query.set('endDate', endDate);
  if (periodLabel) query.set('periodLabel', periodLabel);
  const qStr = query.toString();
  return await apiFetch<IncomeStatement>(`/api/reports/income-statement${qStr ? `?${qStr}` : ''}`);
}

export async function apiGetDashboardSummary(): Promise<any> {
  return await apiFetch<any>('/api/reports/dashboard-summary');
}

// =====================================================================
// RESPALDO Y MIGRACIÓN MASIVA
// =====================================================================
export async function syncAllToMySql(payload: {
  products: any[];
  sales: any[];
  reservations: any[];
  purchases: any[];
  expenses: any[];
  shiftOpenings: any[];
  shifts: any[];
}): Promise<{ success: boolean; message: string }> {
  return await apiFetch<{ success: boolean; message: string }>('/api/sync/migrate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
