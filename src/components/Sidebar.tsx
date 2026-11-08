import React from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Truck,
  ReceiptText,
  Clock,
  TrendingUp,
  Database,
  Menu,
  X,
  Store,
  BookmarkCheck,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'inventario'
  | 'ventas'
  | 'reservas'
  | 'compras'
  | 'gastos'
  | 'jornada'
  | 'resultados';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenBackup: () => void;
  lowStockCount: number;
  pendingReservationsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpen,
  onClose,
  onOpenBackup,
  lowStockCount,
  pendingReservationsCount,
}) => {
  const navItems: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventario', label: 'Inventario', icon: Package, badge: lowStockCount > 0 ? lowStockCount : undefined },
    { id: 'ventas', label: 'Ventas', icon: ShoppingBag },
    {
      id: 'reservas',
      label: 'Reservas y Apartados',
      icon: BookmarkCheck,
      badge: pendingReservationsCount && pendingReservationsCount > 0 ? pendingReservationsCount : undefined,
    },
    { id: 'compras', label: 'Compras de inventario', icon: Truck },
    { id: 'gastos', label: 'Gastos', icon: ReceiptText },
    { id: 'jornada', label: 'Terminar jornada', icon: Clock },
    { id: 'resultados', label: 'Estado de resultados', icon: TrendingUp },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-neutral-200 bg-white transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-20 items-center justify-between border-b border-neutral-200 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-rose-900 to-rose-950 text-amber-200 shadow-sm">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-brand text-xl font-bold tracking-wider text-neutral-900">
                LYLA
              </h1>
              <p className="text-xs font-medium text-neutral-500">
                Santa Cruz de la Sierra
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto p-4">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Navegación Principal
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onClose();
                }}
                className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-rose-950 text-white shadow-sm'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-5 w-5 transition-colors ${
                      isActive ? 'text-amber-300' : 'text-neutral-400 group-hover:text-neutral-700'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      isActive
                        ? 'bg-amber-400 text-rose-950'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Tools & Backup */}
        <div className="border-t border-neutral-200 p-4">
          <button
            onClick={onOpenBackup}
            className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            <div className="flex items-center gap-2.5">
              <Database className="h-4 w-4 text-neutral-500" />
              <span>Respaldo y Seguridad</span>
            </div>
            <span className="text-[10px] text-neutral-400 font-mono">JSON</span>
          </button>
          <div className="mt-3 px-1 text-[11px] text-neutral-400 flex justify-between items-center">
            <span>Bolivia · Bs (BOB)</span>
            <span>v1.0 Oficial</span>
          </div>
        </div>
      </aside>
    </>
  );
};
