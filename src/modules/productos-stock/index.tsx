// Módulo Productos y Stock — entry point.
// Sigue el mismo patrón que Tesorería: Provider envuelve Routes.
// El router del dashboard carga este componente con lazy() desde registry.ts.

import { Routes, Route } from 'react-router-dom'
import { ProductosStockProvider } from './data/store'
import { ProductosStockLayout } from './ProductosStockLayout'
import Dashboard from './pages/Dashboard'
import Rubros from './pages/Rubros'
import Productos from './pages/Productos'
import Catalogo from './pages/Catalogo'
import Insumos from './pages/Insumos'
import FormularProducto from './pages/FormularProducto'
import Stock from './pages/Stock'
import Recepcion from './pages/Recepcion'
import Transferencias from './pages/Transferencias'
import ControlStock from './pages/ControlStock'

export default function ProductosStockModule() {
  return (
    <ProductosStockProvider>
      <Routes>
        <Route element={<ProductosStockLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="rubros" element={<Rubros />} />
          <Route path="productos" element={<Productos />} />
          <Route path="catalogo" element={<Catalogo />} />
          <Route path="insumos" element={<Insumos />} />
          <Route path="formular" element={<FormularProducto />} />
          <Route path="stock" element={<Stock />} />
          <Route path="recepcion" element={<Recepcion />} />
          <Route path="transferencias" element={<Transferencias />} />
          <Route path="control" element={<ControlStock />} />
        </Route>
      </Routes>
    </ProductosStockProvider>
  )
}
