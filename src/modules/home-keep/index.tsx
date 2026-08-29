// ============================================================
// Modulo Home Keep ("Kit Hogar") — Entry point
// Provider + Routes
// Clon recortado de Compras: solo Dashboard, Proveedores, Comprobantes
// y Pagos (sin Cotizaciones ni Órdenes de Compra, sin catálogo/stock).
// ============================================================

import { Route, Routes } from 'react-router-dom';
import { HomeKeepProvider } from './data/store';
import HomeKeepLayout from './HomeKeepLayout';

import Dashboard from './pages/Dashboard';
import Proveedores from './pages/Proveedores';
import Comprobantes from './pages/Comprobantes';
import Pagos from './pages/Pagos';

export default function HomeKeepModule() {
  return (
    <HomeKeepProvider>
      <Routes>
        <Route element={<HomeKeepLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="comprobantes" element={<Comprobantes />} />
          <Route path="pagos" element={<Pagos />} />
        </Route>
      </Routes>
    </HomeKeepProvider>
  );
}
