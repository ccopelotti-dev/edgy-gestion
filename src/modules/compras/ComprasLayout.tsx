// ============================================================
// Modulo Compras — Layout principal
// Header + navegacion por tabs + Outlet
// ============================================================

import { NavLink, Outlet } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Building2,
  FileSearch,
  ClipboardList,
  Receipt,
} from 'lucide-react';

interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const BASE = '/m/compras';

const tabs: TabDef[] = [
  { to: BASE,                       label: 'Dashboard',          icon: LayoutDashboard, end: true },
  { to: `${BASE}/proveedores`,      label: 'Proveedores',        icon: Building2 },
  { to: `${BASE}/cotizaciones`,     label: 'Cotizaciones',       icon: FileSearch },
  { to: `${BASE}/ordenes-compra`,   label: 'Ordenes de Compra',  icon: ClipboardList },
  { to: `${BASE}/comprobantes`,     label: 'Comprobantes',       icon: Receipt },
];

export default function ComprasLayout() {
  return (
    <div className="min-h-screen bg-gray-50/30">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <h1 className="text-lg font-bold tracking-tight">Compras</h1>
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
