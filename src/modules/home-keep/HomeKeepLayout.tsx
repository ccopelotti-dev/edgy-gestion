// ============================================================
// Modulo Home Keep ("Kit Hogar") — Layout principal
// Header + navegacion por tabs + Outlet
// Clon recortado de ComprasLayout.tsx: 4 tabs en vez de 6.
// ============================================================

import { NavLink, Outlet } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Building2,
  Receipt,
  Wallet,
} from 'lucide-react';

interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const BASE = '/m/home_keep';

const tabs: TabDef[] = [
  { to: BASE,                  label: 'Dashboard',    icon: LayoutDashboard, end: true },
  { to: `${BASE}/proveedores`, label: 'Proveedores',  icon: Building2 },
  { to: `${BASE}/comprobantes`, label: 'Comprobantes', icon: Receipt },
  // Mismo ícono que usa Compras para "Ordenes de Pago" (Wallet) -- acá el
  // texto visible es simplemente "Pagos" (a pedido de Carlos), el modelo
  // de datos interno sigue llamándose "pago".
  { to: `${BASE}/pagos`,        label: 'Pagos',        icon: Wallet },
];

export default function HomeKeepLayout() {
  return (
    <div className="min-h-screen bg-gray-50/30">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <h1 className="text-lg font-bold tracking-tight">Home Keep</h1>
            <span className="text-xs text-gray-400">Edgy Gestion</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto pb-px -mb-px" aria-label="Secciones">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end ?? false}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`
                }
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
