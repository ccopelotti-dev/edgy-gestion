// Reportes de Financiero y Gestión: datos DE EJEMPLO, estáticos.
//
// Tesorería, Ventas y Compras todavía viven 100% en localStorage -- no
// tienen ninguna tabla en Supabase que este módulo (separado, sin acceso al
// Context de esos módulos) pueda consultar. En vez de dejar la pestaña vacía,
// se muestran filas de ejemplo (claramente etiquetadas con <ExampleBanner/>
// en la página) para que se vea el formato final del reporte. Se
// reemplazan por consultas reales el día que Tesorería/Ventas/Compras
// tengan su propia migración a Supabase.

import type { DefinicionReporte, ResultadoReporte } from '../types'

export const DEFINICIONES_FINANCIERO: DefinicionReporte[] = [
  {
    id: 'movimientos-tesoreria',
    nombre: 'Movimientos de Tesorería',
    categoria: 'financiero',
    descripcion: 'Ingresos y egresos de caja/banco por período.',
    datosReales: false,
  },
  {
    id: 'ingresos-egresos',
    nombre: 'Ingresos vs Egresos',
    categoria: 'financiero',
    descripcion: 'Comparativo de ingresos y egresos por período, con resultado.',
    datosReales: false,
  },
  {
    id: 'saldos-cuenta',
    nombre: 'Saldos por cuenta',
    categoria: 'financiero',
    descripcion: 'Saldo actual de cada cuenta de Tesorería.',
    datosReales: false,
  },
]

export const DEFINICIONES_GESTION: DefinicionReporte[] = [
  {
    id: 'cuenta-corriente-clientes',
    nombre: 'Cuenta corriente de clientes',
    categoria: 'gestion',
    descripcion: 'Saldo y último movimiento por cliente.',
    datosReales: false,
  },
  {
    id: 'cobranzas-pendientes',
    nombre: 'Cobranzas pendientes',
    categoria: 'gestion',
    descripcion: 'Comprobantes de venta pendientes de cobro, con vencimiento.',
    datosReales: false,
  },
  {
    id: 'pagos-proveedores',
    nombre: 'Pagos a proveedores pendientes',
    categoria: 'gestion',
    descripcion: 'Comprobantes de compra pendientes de pago, con vencimiento.',
    datosReales: false,
  },
]

const RESULTADOS_EJEMPLO: Record<string, ResultadoReporte> = {
  'movimientos-tesoreria': {
    columnas: ['Fecha', 'Cuenta', 'Tipo', 'Descripción', 'Monto'],
    filas: [
      { Fecha: '01/07/2026', Cuenta: 'Caja', Tipo: 'Ingreso', Descripción: 'Venta mostrador', Monto: '$ 45.000,00' },
      { Fecha: '01/07/2026', Cuenta: 'Banco Nación', Tipo: 'Egreso', Descripción: 'Pago proveedor', Monto: '$ -120.000,00' },
      { Fecha: '02/07/2026', Cuenta: 'Caja', Tipo: 'Ingreso', Descripción: 'Venta mostrador', Monto: '$ 38.500,00' },
    ],
  },
  'ingresos-egresos': {
    columnas: ['Período', 'Ingresos', 'Egresos', 'Resultado'],
    filas: [
      { Período: 'Mayo 2026', Ingresos: '$ 1.250.000,00', Egresos: '$ 890.000,00', Resultado: '$ 360.000,00' },
      { Período: 'Junio 2026', Ingresos: '$ 1.410.000,00', Egresos: '$ 1.020.000,00', Resultado: '$ 390.000,00' },
    ],
  },
  'saldos-cuenta': {
    columnas: ['Cuenta', 'Saldo'],
    filas: [
      { Cuenta: 'Caja', Saldo: '$ 85.300,00' },
      { Cuenta: 'Banco Nación', Saldo: '$ 640.200,00' },
      { Cuenta: 'MercadoPago', Saldo: '$ 22.900,00' },
    ],
  },
  'cuenta-corriente-clientes': {
    columnas: ['Cliente', 'Saldo', 'Último movimiento'],
    filas: [
      { Cliente: 'Distribuidora del Sur', Saldo: '$ 180.000,00', 'Último movimiento': '28/06/2026' },
      { Cliente: 'Kiosco La Esquina', Saldo: '$ 12.500,00', 'Último movimiento': '30/06/2026' },
    ],
  },
  'cobranzas-pendientes': {
    columnas: ['Cliente', 'Comprobante', 'Vencimiento', 'Monto'],
    filas: [
      { Cliente: 'Distribuidora del Sur', Comprobante: 'FC-0001-00001234', Vencimiento: '15/07/2026', Monto: '$ 180.000,00' },
      { Cliente: 'Kiosco La Esquina', Comprobante: 'FC-0001-00001250', Vencimiento: '10/07/2026', Monto: '$ 12.500,00' },
    ],
  },
  'pagos-proveedores': {
    columnas: ['Proveedor', 'Comprobante', 'Vencimiento', 'Monto'],
    filas: [
      { Proveedor: 'Distribuidora Norte S.A.', Comprobante: 'FC-A-0003-00004512', Vencimiento: '12/07/2026', Monto: '$ 320.000,00' },
      { Proveedor: 'Insumos del Litoral', Comprobante: 'FC-A-0003-00004530', Vencimiento: '20/07/2026', Monto: '$ 75.400,00' },
    ],
  },
}

export function generarReporteEjemplo(reporteId: string): ResultadoReporte {
  return RESULTADOS_EJEMPLO[reporteId] ?? { columnas: [], filas: [] }
}
