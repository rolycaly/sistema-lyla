/**
 * SISTEMA LYLA - Servidor Express y API Backend
 * Tienda de Moda y Accesorios (Santa Cruz de la Sierra, Bolivia)
 * 
 * Conexión a MySQL local mediante mysql2 con soporte para transacciones seguras
 * e integración con Vite para desarrollo y producción.
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';

import { initDb, isDbConnected, getLastError, dbConfig, inMemoryStore } from './server/db.js';
import { productsRouter } from './server/routes/products.js';
import { salesRouter } from './server/routes/sales.js';
import { purchasesRouter } from './server/routes/purchases.js';
import { reservationsRouter, processExpiredReservations } from './server/routes/reservations.js';
import { expensesRouter } from './server/routes/expenses.js';
import { suppliersRouter } from './server/routes/suppliers.js';
import { shiftsRouter } from './server/routes/shifts.js';
import { reportsRouter } from './server/routes/reports.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Inicializar conexión a MySQL
initDb();

// Iniciar procesamiento en segundo plano de reservas vencidas (cada 60 segundos)
setInterval(async () => {
  try {
    await processExpiredReservations();
  } catch (err) {
    console.error('Error en tarea programada de vencimientos:', err);
  }
}, 60000);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// =====================================================================
// API DE ESTADO Y CONECTIVIDAD
// =====================================================================
app.get('/api/status', async (_req: Request, res: Response) => {
  const connected = isDbConnected();
  const error = getLastError();

  res.json({
    status: 'ok',
    systemName: 'SISTEMA LYLA',
    city: 'Santa Cruz de la Sierra, Bolivia',
    timezone: 'America/La_Paz',
    mysqlConnected: connected,
    dbHost: dbConfig.host,
    dbName: dbConfig.database,
    error,
    mode: connected ? 'mysql' : 'offline-storage',
  });
});

// =====================================================================
// REGISTRO DE RUTAS MODULARES RESTFUL
// =====================================================================
app.use('/api/products', productsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/reports', reportsRouter);

// =====================================================================
// API DE VALIDACIÓN DE REGLAS DE NEGOCIO (PRE-VALIDACIONES)
// =====================================================================
app.post('/api/shifts/validate-open', (req: Request, res: Response) => {
  const { date, openedBy } = req.body;
  const openings = inMemoryStore.shiftOpenings || [];
  const closes = inMemoryStore.shifts || [];

  const existingActive = openings.find((o) => {
    if (o.date === date) return false;
    const closed = closes.find((s) => s.date === o.date);
    return !closed || closed.isReopened;
  });

  if (existingActive) {
    return res.status(400).json({
      success: false,
      message: `Ya existe una jornada abierta actualmente (Fecha: ${existingActive.date} por ${existingActive.openedBy}). No se permiten dos jornadas abiertas simultáneamente. Debe cerrar la jornada anterior antes de abrir una nueva.`,
    });
  }

  return res.json({ success: true, message: 'Apertura de jornada autorizada.' });
});

app.post('/api/shifts/validate-close', (req: Request, res: Response) => {
  const { cashDifference = 0, qrDifference = 0, differenceReason } = req.body;
  const hasDiff = Math.abs(Number(cashDifference)) > 0.01 || Math.abs(Number(qrDifference)) > 0.01;

  if (hasDiff && (!differenceReason || !String(differenceReason).trim())) {
    return res.status(400).json({
      success: false,
      message: 'Existe una diferencia entre los montos esperados y contados (Faltante o Sobrante). Es OBLIGATORIO registrar una explicación o justificación antes de cerrar la jornada.',
    });
  }

  return res.json({ success: true, message: 'Cierre de jornada validado correctamente.' });
});

app.post('/api/sales/validate', (req: Request, res: Response) => {
  const { isShiftOpen } = req.body;
  if (isShiftOpen === false) {
    return res.status(403).json({
      success: false,
      message: 'No se puede registrar la venta porque no existe una jornada abierta. Por favor, inicie la jornada primero.',
    });
  }
  return res.json({ success: true, message: 'Venta autorizada para registro.' });
});

app.post('/api/expenses/validate', (req: Request, res: Response) => {
  const { isShiftOpen } = req.body;
  if (isShiftOpen === false) {
    return res.status(403).json({
      success: false,
      message: 'No se pueden registrar gastos operativos porque no existe una jornada abierta.',
    });
  }
  return res.json({ success: true, message: 'Gasto autorizado para registro.' });
});

// =====================================================================
// API DE MIGRACIÓN MASIVA / SINCRONIZACIÓN DE RESPALDOS
// =====================================================================
app.post('/api/sync/migrate', async (req: Request, res: Response) => {
  const {
    products = [],
    sales = [],
    reservations = [],
    purchases = [],
    expenses = [],
    shiftOpenings = [],
    shifts = [],
  } = req.body;

  // Actualizar memoria
  inMemoryStore.products = products;
  inMemoryStore.sales = sales;
  inMemoryStore.reservations = reservations;
  inMemoryStore.purchases = purchases;
  inMemoryStore.expenses = expenses;
  inMemoryStore.shiftOpenings = shiftOpenings;
  inMemoryStore.shifts = shifts;

  return res.json({
    success: true,
    message: 'Sincronización respaldada exitosamente en el servidor. Los datos están seguros.',
  });
});

// =====================================================================
// MANEJO CENTRALIZADO DE ERRORES
// =====================================================================
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ [Error no capturado en servidor]:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Error interno del servidor en SISTEMA LYLA.',
  });
});

// =====================================================================
// INTEGRACIÓN CON VITE (DEV) Y ARCHIVOS ESTÁTICOS (PRODUCCIÓN)
// =====================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve('dist');
    app.use('/src/assets', express.static(path.resolve('src/assets')));
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [SISTEMA LYLA] Servidor ejecutándose en el puerto ${PORT}`);
  });
}

startServer();
