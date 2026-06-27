// ============================================================
// Módulo Ventas — Entry point
// Provider + Routes
// ============================================================

import { Route, Routes } from 'react-router-dom';
import { VentasProvider } from './data/store';
import VentasLayout from './VentasLayout';

import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import PuntoDeVenta from './pages/PuntoDeVenta';
import Presupuestos from './pages/Presupuestos';
import Ordenes from './pages/Ordenes';
import Comprobantes from './pages/Comprobantes';
import Cobranzas from './pages/Cobranzas';
import Integraciones from './pages/Integraciones';

export default function VentasModule() {
  return (
    <VentasProvider>
      <Routes>
        <Route element={<VentasLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="punto-de-venta" element={<PuntoDeVenta />} />
          <Route path="presupuestos" element={<Presupuestos />} />
          <Route path="ordenes" element={<Ordenes />} />
          <Route path="comprobantes" element={<Comprobantes />} />
          <Route path="cobranzas" element={<Cobranzas />} />
          <Route path="integraciones" element={<Integraciones />} />
        </Route>
      </Routes>
    </VentasProvider>
  );
}
