/**
 * Funciones de formato de moneda boliviana (Bs) y fechas para SISTEMA LYLA
 * Zona horaria oficial: America/La_Paz (UTC-4)
 */

export const BOLIVIA_TIMEZONE = 'America/La_Paz';

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatBs(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return 'Bs 0.00';
  }
  const formatted = Math.abs(value).toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-Bs ${formatted}` : `Bs ${formatted}`;
}

export function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('es-BO', {
      timeZone: BOLIVIA_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function formatDate(isoString: string): string {
  try {
    if (!isoString) return '';
    const trimmed = isoString.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-');
      return `${d}/${m}/${y}`;
    }
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('es-BO', {
      timeZone: BOLIVIA_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString('es-BO', {
      timeZone: BOLIVIA_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Convierte cualquier fecha o cadena ISO al formato YYYY-MM-DD
 * en la zona horaria oficial de Santa Cruz de la Sierra, Bolivia (America/La_Paz).
 */
export function getBoliviaDateString(isoStringOrDate?: string | Date | null): string {
  if (!isoStringOrDate) {
    isoStringOrDate = new Date();
  }
  if (typeof isoStringOrDate === 'string') {
    const trimmed = isoStringOrDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const d = typeof isoStringOrDate === 'string' ? new Date(isoStringOrDate) : isoStringOrDate;
  if (isNaN(d.getTime())) return '';

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: BOLIVIA_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback: compensación matemática manual UTC-4
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const boliviaTime = new Date(utc - 4 * 3600000);
    const year = boliviaTime.getFullYear();
    const month = String(boliviaTime.getMonth() + 1).padStart(2, '0');
    const day = String(boliviaTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '';
}

/**
 * Obtiene la fecha de Hoy en Bolivia (YYYY-MM-DD)
 */
export function getTodayDateString(): string {
  return getBoliviaDateString(new Date());
}

/**
 * Obtiene la fecha de Ayer en Bolivia (YYYY-MM-DD)
 */
export function getYesterdayDateString(): string {
  const todayStr = getTodayDateString();
  const [y, m, d] = todayStr.split('-').map(Number);
  // Mediodía UTC del día anterior
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
  return getBoliviaDateString(yesterday);
}

/**
 * Obtiene el mes actual en Bolivia en formato YYYY-MM
 */
export function getCurrentMonthString(): string {
  const today = getTodayDateString();
  return today.substring(0, 7);
}

/**
 * Obtiene el mes anterior en Bolivia en formato YYYY-MM
 */
export function getPreviousMonthString(): string {
  const today = getTodayDateString();
  const [y, m] = today.split('-').map(Number);
  const prevMonthDate = new Date(Date.UTC(y, m - 2, 15, 12, 0, 0));
  return getBoliviaDateString(prevMonthDate).substring(0, 7);
}

/**
 * Obtiene el rango exacto de inicio (día 01) y fin (último día del mes)
 * para una clave de mes YYYY-MM
 */
export function getMonthDateRange(yearMonth: string): { startDate: string; endDate: string } {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  // Día 0 del mes siguiente da el último día del mes actual
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${yearStr}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${yearStr}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

/**
 * Determina con exactitud si una fecha/ISO string está comprendida
 * dentro del rango [startDate, endDate] en hora boliviana.
 */
export function isDateInBoliviaRange(
  isoStringOrDate: string | Date | undefined | null,
  startDate: string,
  endDate: string
): boolean {
  if (!isoStringOrDate) return false;
  const boliviaDate = getBoliviaDateString(isoStringOrDate);
  if (!boliviaDate) return false;
  return boliviaDate >= startDate && boliviaDate <= endDate;
}

