// ============================================================
// Módulo Ventas — Layout principal
// Header + navegación por tabs + Outlet
// ============================================================

import { NavLink, Outlet } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Users, ShoppingCart, FileText,
  ClipboardList, Receipt, Banknote, Bike,
} from 'lucide-react';
import { useClienteActual } from '@/hooks/useClienteActual';
import { terminologiaOrdenVenta } from '@/lib/terminologia';

interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const BASE = '/m/ventas';

export default function VentasLayout() {
  // Fase 8e (cierre de 8d): la pestaña "Órdenes" es la primera pantalla
  // que usa terminologiaOrdenVenta() -- en un cliente con Kit
  // Gastronómico activo (comandas-cocina) pasa a decir "Comandas", en
  // el resto sigue diciendo "Órdenes" como siempre.
  const { modulosActivos } = useClienteActual();
  const term = terminologiaOrdenVenta(modulosActivos);

  // Nota: "Integraciones" se mudó al módulo Configuración -- no es un
  // concepto propio de Ventas (fiscal + canales de venta + subsistemas
  // entre módulos, a nivel de cliente completo). Ver Configuración >
  // Integraciones.
  const tabs: TabDef[] = [
    { to: BASE,                       label: 'Dashboard',      icon: LayoutDashboard, end: true },
    { to: `${BASE}/clientes`,         label: 'Clientes',       icon: Users },
    { to: `${BASE}/punto-de-venta`,   label: 'Punto de Venta', icon: ShoppingCart },
    { to: `${BASE}/presupuestos`,     label: 'Presupuestos',   icon: FileText },
    { to: `${BASE}/ordenes`,          label: term.plural,      icon: ClipboardList },
    { to: `${BASE}/comprobantes`,     label: 'Comprobantes',   icon: Receipt },
    { to: `${BASE}/cobranzas`,        label: 'Cobranzas',      icon: Banknote },
    // Fase 23c: rendición de cadete -- solo tiene contenido cuando hay
    // pedidos con reparto propio marcados "cobra contra entrega" (Fase
    // 23b), pero se deja siempre visible (igual que el resto de tabs) en
    // vez de condicionarla, para no complicar el layout con lógica extra.
    { to: `${BASE}/rendicion`,        label: 'Rendición',      icon: Bike },
  ];

  return (
    <div className="min-h-screen bg-gray-50/30">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <h1 className="text-lg font-bold tracking-tight">Ventas</h1>
            <span className="text-xs text-gray-400">Edgy Gestión</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto pb-px -mb-px" aria-label="Secciones">
            {tabs.map(tab => (
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
