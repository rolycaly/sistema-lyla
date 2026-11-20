/**
 * SISTEMA LYLA - Módulo de Base de Datos MySQL
 * Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
 * 
 * Pool de conexiones transaccional con mysql2/promise, soporte dual de nombres
 * de tablas (español/inglés) y fallback tolerante a fallos.
 */

import mysql from 'mysql2/promise';
import type { Pool, PoolOptions, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const dbConfig: PoolOptions = {
  host: process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST || 'localhost',
  user: process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'sistema_lyla',
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '-04:00', // America/La_Paz (UTC-4)
  connectTimeout: 3000,
  decimalNumbers: true,
};

let pool: Pool | null = null;
let isConnected = false;
let lastError: string | null = null;

// Mapa de tablas detectadas en MySQL
export interface TableMap {
  products: string;      // 'productos' o 'products'
  productCategories: string; // 'categorias_productos'
  productColors: string; // 'inventario_colores' o 'productos_colores'
  sales: string;         // 'ventas' o 'sales'
  saleItems: string;     // 'detalle_ventas' o 'sale_items'
  salePayments: string;  // 'pagos_ventas'
  reservations: string;  // 'reservas' o 'reservations'
  reservationItems: string; // 'detalle_reservas' o 'reservation_items'
  retainedDeposits: string; // 'anticipos_retenidos'
  purchases: string;     // 'compras' o 'inventory_purchases'
  purchaseItems: string; // 'detalle_compras'
  expenses: string;      // 'gastos' o 'expenses'
  expenseCategories: string; // 'categorias_gastos'
  suppliers: string;     // 'proveedores'
  shifts: string;        // 'jornadas' o 'shift_closes'
}

let tableMap: TableMap = {
  products: 'productos',
  productCategories: 'categorias_productos',
  productColors: 'inventario_colores',
  sales: 'ventas',
  saleItems: 'detalle_ventas',
  salePayments: 'pagos_ventas',
  reservations: 'reservas',
  reservationItems: 'detalle_reservas',
  retainedDeposits: 'anticipos_retenidos',
  purchases: 'compras',
  purchaseItems: 'detalle_compras',
  expenses: 'gastos',
  expenseCategories: 'categorias_gastos',
  suppliers: 'proveedores',
  shifts: 'jornadas',
};

// Almacén seguro en memoria para cuando MySQL no esté disponible
export const inMemoryStore: Record<string, any[]> = {
  products: [],
  productCategories: [
    { id: 'cat-carteras', name: 'Carteras', active: true },
    { id: 'cat-joyas', name: 'Joyas', active: true },
    { id: 'cat-relojes', name: 'Relojes', active: true },
    { id: 'cat-accesorios', name: 'Accesorios', active: true },
  ],
  sales: [],
  reservations: [],
  retainedDeposits: [],
  purchases: [],
  expenses: [],
  expenseCategories: [
    'Alquiler',
    'Luz',
    'Internet',
    'Transporte',
    'Limpieza',
    'Material de oficina',
    'Comida',
  ],
  suppliers: [],
  shifts: [],
  shiftOpenings: [],
};

export async function initDb(): Promise<boolean> {
  try {
    pool = mysql.createPool(dbConfig);
    const conn = await pool.getConnection();
    await conn.ping();

    // Detectar tablas existentes
    const [rows] = await conn.query<RowDataPacket[]>('SHOW TABLES');
    const existingTables = rows.map((r) => Object.values(r)[0] as string);

    // Ajustar nombres según lo que exista en la BD
    if (existingTables.includes('productos')) {
      tableMap.products = 'productos';
    } else if (existingTables.includes('products')) {
      tableMap.products = 'products';
    }

    if (existingTables.includes('ventas')) {
      tableMap.sales = 'ventas';
      tableMap.saleItems = existingTables.includes('detalle_ventas') ? 'detalle_ventas' : 'sale_items';
    } else if (existingTables.includes('sales')) {
      tableMap.sales = 'sales';
      tableMap.saleItems = 'sale_items';
    }

    if (existingTables.includes('reservas')) {
      tableMap.reservations = 'reservas';
      tableMap.reservationItems = existingTables.includes('detalle_reservas') ? 'detalle_reservas' : 'reservation_items';
    } else if (existingTables.includes('reservations')) {
      tableMap.reservations = 'reservations';
      tableMap.reservationItems = 'reservation_items';
    }

    if (existingTables.includes('compras')) {
      tableMap.purchases = 'compras';
      tableMap.purchaseItems = existingTables.includes('detalle_compras') ? 'detalle_compras' : 'inventory_purchases';
    } else if (existingTables.includes('inventory_purchases')) {
      tableMap.purchases = 'inventory_purchases';
      tableMap.purchaseItems = 'inventory_purchases';
    }

    if (existingTables.includes('gastos')) {
      tableMap.expenses = 'gastos';
    } else if (existingTables.includes('expenses')) {
      tableMap.expenses = 'expenses';
    }

    if (existingTables.includes('jornadas')) {
      tableMap.shifts = 'jornadas';
    } else if (existingTables.includes('shift_closes')) {
      tableMap.shifts = 'shift_closes';
    }

    conn.release();
    isConnected = true;
    lastError = null;
    console.log(`✅ [SISTEMA LYLA - MySQL] Conexión establecida con ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    return true;
  } catch (err: any) {
    isConnected = false;
    lastError = err.message || 'Error de conexión MySQL';
    console.warn(`⚠️ [SISTEMA LYLA - MySQL] No se pudo conectar (${lastError}). Modo memoria/autónomo activo.`);
    return false;
  }
}

export function isDbConnected(): boolean {
  return isConnected;
}

export function getLastError(): string | null {
  return lastError;
}

export function getTableMap(): TableMap {
  return tableMap;
}

export function getPool(): Pool | null {
  return pool;
}

/**
 * Ejecuta una consulta directa con prepared statement
 */
export async function query<T = any>(sql: string, params?: any[]): Promise<T> {
  if (!pool || !isConnected) {
    throw new Error('MySQL no está conectado');
  }
  const [results] = await pool.query(sql, params);
  return results as T;
}

/**
 * Ejecuta un bloque de operaciones dentro de una transacción atómica con ROLLBACK automático
 */
export async function withTransaction<T>(
  callback: (conn: PoolConnection, tables: TableMap) => Promise<T>
): Promise<T> {
  if (!pool || !isConnected) {
    throw new Error('MySQL no disponible para transacción');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn, tableMap);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rbErr) {
      console.error('Error durante rollback:', rbErr);
    }
    throw err;
  } finally {
    conn.release();
  }
}
