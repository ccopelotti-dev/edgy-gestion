// ============================================================
// Modulo Compras — Entry point
// Provider + Routes
// ============================================================

import { Route, Routes } from 'react-router-dom';
import { ComprasProvider } from './data/store';
import ComprasLayout from './ComprasLayout';

import Dashboard from './pages/Dashboard';
import Proveedores from './pages/Proveedores';
import Cotizaciones from './pages/Cotizaciones';
import OrdenesCompra from './pages/OrdenesCompra';
import Comprobantes from './pages/Comprobantes';

export default function ComprasModule() {
  return (
    <ComprasProvider>
      <Routes>
        <Route element={<ComprasLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="cotizaciones" element={<Cotizaciones />} />
          <Route path="ordenes-compra" element={<OrdenesCompra />} />
          <Route path="comprobantes" element={<Comprobantes />} />
        </Route>
      </Routes>
    </ComprasProvider>
  );
}
