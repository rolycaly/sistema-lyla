import React, { useState, useEffect } from 'react';
import { Menu, PlayCircle, ShoppingBag, Clock } from 'lucide-react';
import { NavTab } from './Sidebar';
import { checkBackendStatus } from '../utils/api';

interface NavbarProps {
  currentTab: NavTab;
  onOpenMobileMenu: () => void;
  onStartDay: () => void;
  onQuickSale: () => void;
  onFinishDay: () => void;
  isShiftOpened?: boolean;
}

const TAB_TITLES: Record<NavTab, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard General', subtitle: 'Métricas clave y estado operativo' },
  inventario: { title: 'Control de Inventario', subtitle: 'Catálogo de productos, existencias y costos internos' },
  ventas: { title: 'Punto de Venta (POS)', subtitle: 'Registro rápido, cobro en efectivo/QR/mixto y descuentos' },
  reservas: { title: 'Reservas y Apartados', subtitle: 'Control de señas en Live/WhatsApp, apartado de stock y recojo en tienda' },
  compras: { title: 'Compras de Inventario', subtitle: 'Ingreso de mercadería y costo promedio ponderado' },
  gastos: { title: 'Control de Gastos', subtitle: 'Egresos operativos clasificados por concepto y responsable' },
  jornada: { title: 'Terminar Jornada', subtitle: 'Cierre de caja diario, resumen de cobros y flujo de caja' },
  resultados: { title: 'Estado de Resultados', subtitle: 'Rentabilidad real: ingresos, costo de ventas y utilidad neta' },
};

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onOpenMobileMenu,
  onStartDay,
  onQuickSale,
  onFinishDay,
  isShiftOpened,
}) => {
  const currentInfo = TAB_TITLES[currentTab] || { title: 'SISTEMA LYLA', subtitle: '' };
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  useEffect(() => {
    checkBackendStatus().then((s) => setDbConnected(s.mysqlConnected));
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-neutral-200 bg-white/95 px-4 backdrop-blur-md md:px-8">
      {/* Zone 1: Mobile Hamburger & Page Context */}
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenMobileMenu}
          className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 md:hidden"
          aria-label="Abrir menú"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-neutral-900 md:text-xl">
              {currentInfo.title}
            </h2>
            {dbConnected !== null && (
              <span
                className={`hidden lg:inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                  dbConnected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                }`}
                title={dbConnected ? 'Conectado a MySQL local en localhost:3306' : 'Modo autónomo local (Almacenamiento seguro en equipo)'}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dbConnected ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                <span>{dbConnected ? 'MySQL Conectado' : 'Modo Local Seguro'}</span>
              </span>
            )}
          </div>
          <p className="hidden text-xs text-neutral-500 sm:block">
            {currentInfo.subtitle}
          </p>
        </div>
      </div>

      {/* Zone 2: Store Status and Quick Actions */}
      <div className="flex items-center gap-2.5">
        {/* Botón Iniciar Jornada */}
        <button
          onClick={onStartDay}
          className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition active:scale-95 ${
            isShiftOpened
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
              : 'border-emerald-600 bg-emerald-700 text-white hover:bg-emerald-800 shadow-xs'
          }`}
          title="Abrir jornada e ingresar caja chica inicial"
        >
          <PlayCircle className={`h-4 w-4 ${isShiftOpened ? 'text-emerald-700' : 'text-emerald-200'}`} />
          <span className="hidden sm:inline">
            {isShiftOpened ? 'Jornada Iniciada' : 'Iniciar Jornada'}
          </span>
          <span className="sm:hidden">
            {isShiftOpened ? 'Iniciada' : 'Iniciar'}
          </span>
        </button>

        {/* Botón Nueva Venta */}
        <button
          onClick={onQuickSale}
          className="flex items-center gap-2 rounded-xl bg-rose-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-950 active:scale-95"
        >
          <ShoppingBag className="h-4 w-4" />
          <span className="hidden sm:inline">Nueva Venta</span>
          <span className="sm:hidden">Venta</span>
        </button>

        {/* Botón Terminar Jornada */}
        <button
          onClick={onFinishDay}
          className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-900 active:scale-95"
        >
          <Clock className="h-4 w-4 text-amber-600" />
          <span className="hidden md:inline">Terminar Jornada</span>
          <span className="md:hidden">Cierre</span>
        </button>
      </div>
    </header>
  );
};

