import React, { useState, useRef, useEffect } from 'react';
import {
  Database,
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  X,
  CheckCircle,
  RefreshCw,
  Server,
  FileCode,
} from 'lucide-react';
import {
  exportBackupData,
  importBackupData,
  loadProducts,
  loadSales,
  loadReservations,
  loadPurchases,
  loadExpenses,
  loadShiftOpenings,
  loadShifts,
} from '../utils/storage';
import { checkBackendStatus, syncAllToMySql, BackendStatus } from '../utils/api';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored: () => void;
  stats: {
    productsCount: number;
    salesCount: number;
    reservationsCount?: number;
    purchasesCount: number;
    expensesCount: number;
    shiftsCount: number;
  };
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onDataRestored,
  stats,
}) => {
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      checkBackendStatus().then((res) => setBackendStatus(res));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Export Backup JSON
  const handleExport = () => {
    try {
      const json = exportBackupData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SISTEMA_LYLA_RESPALDO_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatusMessage({ text: 'Copia de seguridad descargada exitosamente en formato JSON.', type: 'success' });
    } catch (err) {
      setStatusMessage({ text: 'Error al exportar los datos.', type: 'error' });
    }
  };

  // Handle Import Backup
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const result = importBackupData(content);
        if (result.success) {
          setStatusMessage({ text: result.message, type: 'success' });
          onDataRestored();
        } else {
          setStatusMessage({ text: result.message, type: 'error' });
        }
      } catch (err) {
        setStatusMessage({ text: 'Error al leer el archivo de respaldo.', type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  // Sincronizar todos los datos actuales hacia MySQL Local
  const handleSyncToMySql = async () => {
    setIsSyncing(true);
    setStatusMessage({ text: 'Iniciando sincronización transaccional con MySQL local...', type: 'info' });

    try {
      const payload = {
        products: loadProducts(),
        sales: loadSales(),
        reservations: loadReservations(),
        purchases: loadPurchases(),
        expenses: loadExpenses(),
        shiftOpenings: loadShiftOpenings(),
        shifts: loadShifts(),
      };

      const res = await syncAllToMySql(payload);
      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        const refreshed = await checkBackendStatus();
        setBackendStatus(refreshed);
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: `Error de sincronización: ${err.message}`, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  // Descargar script SQL para importar en phpMyAdmin o MySQL Workbench
  const handleDownloadSchema = () => {
    const link = document.createElement('a');
    link.href = '/database/schema.sql';
    link.download = 'sistema_lyla_schema.sql';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatusMessage({ text: 'Script SQL preparado para importar en MySQL Workbench o phpMyAdmin.', type: 'info' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-2 text-rose-950">
            <Database className="h-5 w-5" />
            <h3 className="font-brand text-lg font-bold text-neutral-900">
              Base de Datos y Copias de Seguridad
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {statusMessage && (
          <div
            className={`flex items-center gap-2 rounded-xl p-3 text-xs border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : statusMessage.type === 'info'
                ? 'bg-blue-50 text-blue-800 border-blue-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : statusMessage.type === 'info' ? (
              <Server className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Estado del Backend y MySQL Local */}
        <div className="rounded-xl border border-neutral-200 p-3.5 text-xs bg-neutral-50/70 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-neutral-800 flex items-center gap-1.5">
              <Server className="h-4 w-4 text-neutral-600" />
              Estado de Conectividad con MySQL Local:
            </span>
            {backendStatus?.mysqlConnected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                Conectado (localhost:3306)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                <span className="h-2 w-2 rounded-full bg-amber-600" />
                Modo Local Autónomo
              </span>
            )}
          </div>
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            {backendStatus?.mysqlConnected
              ? `Base de datos '${backendStatus.dbName || 'sistema_lyla'}' activa en '${backendStatus.dbHost || 'localhost'}'. Las transacciones financieras y de stock se sincronizan de manera segura.`
              : 'El sistema funciona de forma 100% autónoma y offline en este equipo. Toda la información se conserva intacta en almacenamiento local y está lista para sincronizarse a MySQL.'}
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleSyncToMySql}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-neutral-800 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sincronizar Datos a MySQL Local</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadSchema}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 transition"
            >
              <FileCode className="h-3 w-3 text-neutral-500" />
              <span>Descargar Script SQL (schema.sql)</span>
            </button>
          </div>
        </div>

        {/* Estadísticas de Entidades Registradas */}
        <div className="rounded-xl bg-neutral-50 p-3.5 border border-neutral-200 text-xs">
          <span className="font-bold text-neutral-700 block mb-2">Entidades en Base de Datos LYLA:</span>
          <div className="grid grid-cols-2 gap-2 text-neutral-600">
            <div>• Productos en Inventario: <strong>{stats.productsCount}</strong></div>
            <div>• Ventas Registradas: <strong>{stats.salesCount}</strong></div>
            <div>• Reservas y Apartados: <strong>{stats.reservationsCount ?? 0}</strong></div>
            <div>• Compras de Mercadería: <strong>{stats.purchasesCount}</strong></div>
            <div>• Gastos Operativos: <strong>{stats.expensesCount}</strong></div>
            <div>• Jornadas Registradas: <strong>{stats.shiftsCount}</strong></div>
          </div>
        </div>

        {/* Acciones de Respaldo */}
        <div className="space-y-3">
          {/* Exportar */}
          <div className="rounded-xl border border-neutral-200 p-4 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-neutral-900">
                Exportar Copia de Seguridad JSON
              </h4>
              <p className="text-[11px] text-neutral-500">
                Descarga un archivo JSON completo con productos, ventas, reservas y jornadas
              </p>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-xl bg-rose-950 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-900 transition"
            >
              <Download className="h-4 w-4" />
              <span>Exportar</span>
            </button>
          </div>

          {/* Restaurar */}
          <div className="rounded-xl border border-neutral-200 p-4 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-neutral-900">
                Restaurar desde Respaldo
              </h4>
              <p className="text-[11px] text-neutral-500">
                Carga un archivo JSON previamente exportado para recuperar la información de forma segura
              </p>
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 transition"
              >
                <Upload className="h-4 w-4 text-neutral-500" />
                <span>Restaurar</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-neutral-100">
          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
