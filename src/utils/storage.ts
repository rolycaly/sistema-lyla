import {
  Product,
  ProductCategoryItem,
  Sale,
  InventoryPurchase,
  Expense,
  ShiftClose,
  ShiftOpening,
  Reservation,
} from '../types';
import { round2 } from './formatters';

const STORAGE_KEYS = {
  PRODUCTS: 'lyla_products_v1',
  SALES: 'lyla_sales_v1',
  PURCHASES: 'lyla_purchases_v1',
  EXPENSES: 'lyla_expenses_v1',
  SHIFTS: 'lyla_shifts_v1',
  OPENINGS: 'lyla_shift_openings_v1',
  CATEGORIES: 'lyla_expense_categories_v1',
  PRODUCT_CATEGORIES: 'lyla_product_categories_v1',
  RESERVATIONS: 'lyla_reservations_v1',
};

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Alquiler',
  'Luz',
  'Internet',
  'Transporte',
  'Limpieza',
  'Material de oficina',
  'Comida',
];

export function normalizeProductColorStock(p: Product): Product {
  let colorStock: Record<string, number> = { ...(p.colorStock || {}) };

  // Si no tiene colorStock registrado, migrar a partir de availableColors o color descriptivo
  if (Object.keys(colorStock).length === 0) {
    const rawColors = p.availableColors && p.availableColors.length > 0
      ? p.availableColors
      : p.color
      ? p.color.split(',').map((c) => c.trim()).filter(Boolean)
      : ['Único'];

    const totalStock = typeof p.stock === 'number' ? Math.max(0, p.stock) : 0;
    if (rawColors.length === 1) {
      colorStock[rawColors[0]] = totalStock;
    } else if (rawColors.length > 1) {
      const basePerColor = Math.floor(totalStock / rawColors.length);
      let remainder = totalStock % rawColors.length;
      rawColors.forEach((c) => {
        colorStock[c] = basePerColor + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
      });
    } else {
      colorStock['Único'] = totalStock;
    }
  }

  // Filtrar únicamente los colores con stock estrictamente mayor a 0 para disponibles en venta
  const availableColors = Object.entries(colorStock)
    .filter(([_, qty]) => Number(qty) > 0)
    .map(([col]) => col);

  const totalCalculatedStock = Object.values(colorStock).reduce(
    (sum, q) => sum + Math.max(0, Number(q) || 0),
    0
  );

  const reserved = p.reservedStock ?? 0;
  const physStock = p.physicalStock !== undefined ? Math.max(totalCalculatedStock, p.physicalStock) : totalCalculatedStock;

  return {
    ...p,
    colorStock,
    availableColors,
    stock: totalCalculatedStock,
    physicalStock: physStock,
    reservedStock: reserved,
  };
}

export function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (!raw) {
      return [];
    }
    const parsed: Product[] = JSON.parse(raw);
    const normalized = parsed.map(normalizeProductColorStock);
    return normalized;
  } catch (err) {
    console.error('Error loading products from storage:', err);
    return [];
  }
}

export function saveProducts(products: Product[]): void {
  try {
    const normalized = products.map(normalizeProductColorStock);
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(normalized));
    window.dispatchEvent(new Event('lyla_storage_update'));
  } catch (err) {
    console.error('Error saving products:', err);
  }
}

export function loadSales(): Sale[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SALES);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error loading sales:', err);
    return [];
  }
}

export function saveSales(sales: Sale[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
    window.dispatchEvent(new Event('lyla_storage_update'));
  } catch (err) {
    console.error('Error saving sales:', err);
  }
}

export function loadPurchases(): InventoryPurchase[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PURCHASES);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error loading purchases:', err);
    return [];
  }
}

export function savePurchases(purchases: InventoryPurchase[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify(purchases));
    window.dispatchEvent(new Event('lyla_storage_update'));
  } catch (err) {
    console.error('Error saving purchases:', err);
  }
}

export function loadExpenses(): Expense[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EXPENSES);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error loading expenses:', err);
    return [];
  }
}

export function saveExpenses(expenses: Expense[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
    window.dispatchEvent(new Event('lyla_storage_update'));
  } catch (err) {
    console.error('Error saving expenses:', err);
  }
}

export function loadShifts(): ShiftClose[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SHIFTS);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error loading shifts:', err);
    return [];
  }
}

export function saveShifts(shifts: ShiftClose[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    window.dispatchEvent(new Event('lyla_storage_update'));
  } catch (err) {
    console.error('Error saving shifts:', err);
  }
}

export function loadShiftOpenings(): ShiftOpening[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OPENINGS);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error loading shift openings:', err);
    return [];
  }
}

export function saveShiftOpenings(openings: ShiftOpening[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.OPENINGS, JSON.stringify(openings));
    window.dispatchEvent(new Event('lyla_storage_update'));
  } catch (err) {
    console.error('Error saving shift openings:', err);
  }
}

export function loadExpenseCategories(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
    if (!raw) {
      saveExpenseCategories(DEFAULT_EXPENSE_CATEGORIES);
      return DEFAULT_EXPENSE_CATEGORIES;
    }
    return JSON.parse(raw);
  } catch (err) {
    return DEFAULT_EXPENSE_CATEGORIES;
  }
}

export function saveExpenseCategories(categories: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    window.dispatchEvent(new Event('lyla_storage_update'));
  } catch (err) {
    console.error('Error saving expense categories:', err);
  }
}

export const DEFAULT_PRODUCT_CATEGORIES: ProductCategoryItem[] = [
  { id: 'cat-carteras', name: 'Carteras', active: true },
  { id: 'cat-joyas', name: 'Joyas', active: true },
  { id: 'cat-relojes', name: 'Relojes', active: true },
  { id: 'cat-accesorios', name: 'Accesorios', active: true },
];

export function loadProductCategories(): ProductCategoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCT_CATEGORIES);
    if (!raw) {
      saveProductCategories(DEFAULT_PRODUCT_CATEGORIES);
      return DEFAULT_PRODUCT_CATEGORIES;
    }
    const parsed: ProductCategoryItem[] = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      saveProductCategories(DEFAULT_PRODUCT_CATEGORIES);
      return DEFAULT_PRODUCT_CATEGORIES;
    }

    // Ensure initial categories exist without duplicating (Carteras, Joyas, Relojes, Accesorios)
    const defaultCategories: Array<{ id: string; name: string }> = [
      { id: 'cat-carteras', name: 'Carteras' },
      { id: 'cat-joyas', name: 'Joyas' },
      { id: 'cat-relojes', name: 'Relojes' },
      { id: 'cat-accesorios', name: 'Accesorios' },
    ];

    let hasModifications = false;
    const existingLower = new Set(parsed.map((c) => c.name.trim().toLowerCase()));

    defaultCategories.forEach((def) => {
      if (!existingLower.has(def.name.toLowerCase())) {
        parsed.push({
          id: def.id,
          name: def.name,
          active: true,
          createdAt: new Date().toISOString(),
        });
        existingLower.add(def.name.toLowerCase());
        hasModifications = true;
      }
    });

    if (hasModifications) {
      saveProductCategories(parsed);
    }
    return parsed;
  } catch (err) {
    console.error('Error loading product categories:', err);
    return DEFAULT_PRODUCT_CATEGORIES;
  }
}

export function saveProductCategories(categories: ProductCategoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PRODUCT_CATEGORIES, JSON.stringify(categories));
    window.dispatchEvent(new Event('lyla_storage_update'));
  } catch (err) {
    console.error('Error saving product categories:', err);
  }
}

export function loadReservations(): Reservation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RESERVATIONS);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading reservations:', err);
    return [];
  }
}

export function saveReservations(reservations: Reservation[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.RESERVATIONS, JSON.stringify(reservations));
    window.dispatchEvent(new Event('lyla_storage_update'));
  } catch (err) {
    console.error('Error saving reservations:', err);
  }
}

// Backup & Restore
export function exportBackupData(): string {
  const data = {
    app: 'SISTEMA_LYLA_SANTA_CRUZ',
    version: '1.1',
    exportDate: new Date().toISOString(),
    products: loadProducts(),
    sales: loadSales(),
    purchases: loadPurchases(),
    expenses: loadExpenses(),
    shifts: loadShifts(),
    shiftOpenings: loadShiftOpenings(),
    expenseCategories: loadExpenseCategories(),
    productCategories: loadProductCategories(),
    reservations: loadReservations(),
  };
  return JSON.stringify(data, null, 2);
}

export function importBackupData(jsonString: string): { success: boolean; message: string } {
  try {
    const data = JSON.parse(jsonString);
    if (!data.products || !Array.isArray(data.products)) {
      return { success: false, message: 'El archivo de respaldo no tiene el formato válido de LYLA.' };
    }
    saveProducts(data.products);
    saveSales(data.sales || []);
    savePurchases(data.purchases || []);
    saveExpenses(data.expenses || []);
    saveShifts(data.shifts || []);
    if (data.shiftOpenings && Array.isArray(data.shiftOpenings)) {
      saveShiftOpenings(data.shiftOpenings);
    }
    if (data.expenseCategories && Array.isArray(data.expenseCategories)) {
      saveExpenseCategories(data.expenseCategories);
    }
    if (data.productCategories && Array.isArray(data.productCategories)) {
      saveProductCategories(data.productCategories);
    }
    if (data.reservations && Array.isArray(data.reservations)) {
      saveReservations(data.reservations);
    }
    return { success: true, message: 'Datos restaurados correctamente con éxito.' };
  } catch (err) {
    return { success: false, message: 'Error al interpretar el archivo JSON.' };
  }
}

// Helper to check 30 minutes edit window
export function isSaleWithinEditWindow(sale: Sale): { canEdit: boolean; minutesRemaining: number; secondsRemaining: number } {
  if (sale.status === 'ANULADA') {
    return { canEdit: false, minutesRemaining: 0, secondsRemaining: 0 };
  }
  const saleTime = new Date(sale.createdAt).getTime();
  const now = Date.now();
  const diffMs = (saleTime + 30 * 60 * 1000) - now;
  if (diffMs <= 0) {
    return { canEdit: false, minutesRemaining: 0, secondsRemaining: 0 };
  }
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return { canEdit: true, minutesRemaining: minutes, secondsRemaining: seconds };
}
