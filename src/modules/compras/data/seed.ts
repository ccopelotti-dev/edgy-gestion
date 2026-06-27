// ============================================================
// Módulo Compras — Datos demo: La Charcutería Express
// ============================================================

import type { ComprasState, ComprasConfig } from '../types';

const config: ComprasConfig = {
  ivaDefault: 21,
  validezCotizacionDias: 15,
};

export const SEED_STATE: ComprasState = {
  proveedores: [
    {
      id: 'prov-1', nombre: 'Frigorífico del Norte', cuit: '30711234567',
      condicionIva: 'responsable_inscripto', email: 'ventas@frigonorte.com',
      telefono: '1155001111', direccion: 'Ruta 11 km 45', localidad: 'Resistencia',
      provincia: 'Chaco', contacto: 'Mario Gómez', rubro: 'Carnes',
      saldoCuentaCorriente: 125000, activo: true,
      createdAt: '2026-06-01T10:00:00Z', updatedAt: '2026-06-25T10:00:00Z',
    },
    {
      id: 'prov-2', nombre: 'Especias del Litoral', cuit: '20298765432',
      condicionIva: 'monotributista', email: 'info@especiaslitoral.com',
      telefono: '1144002222', contacto: 'Laura Méndez', rubro: 'Insumos',
      saldoCuentaCorriente: 0, activo: true,
      createdAt: '2026-06-02T10:00:00Z', updatedAt: '2026-06-02T10:00:00Z',
    },
    {
      id: 'prov-3', nombre: 'Envases Premium SRL', cuit: '30709876543',
      condicionIva: 'responsable_inscripto', email: 'pedidos@envasespremium.com',
      telefono: '1133003333', rubro: 'Packaging',
      saldoCuentaCorriente: 45000, activo: true,
      createdAt: '2026-06-05T10:00:00Z', updatedAt: '2026-06-20T10:00:00Z',
    },
  ],

  cotizaciones: [
    {
      id: 'cot-1', numero: 1, proveedorId: 'prov-1', fecha: '2026-06-10',
      validezDias: 15, fechaVencimiento: '2026-06-25', estado: 'aprobado',
      items: [
        { id: 'ci-1', descripcion: 'Bondiola fresca x kg', cantidad: 100, precioUnitario: 5500, descuento: 0, subtotal: 550000 },
        { id: 'ci-2', descripcion: 'Lomo fresco x kg', cantidad: 50, precioUnitario: 9000, descuento: 5, subtotal: 427500 },
      ],
      subtotal: 977500, total: 977500, notas: 'Entrega semanal',
      ordenCompraId: 'oc-1',
      createdAt: '2026-06-10T09:00:00Z', updatedAt: '2026-06-12T11:00:00Z',
    },
    {
      id: 'cot-2', numero: 2, proveedorId: 'prov-3', fecha: '2026-06-20',
      validezDias: 10, fechaVencimiento: '2026-06-30', estado: 'enviado',
      items: [
        { id: 'ci-3', descripcion: 'Bolsa vacío 20x30 x1000', cantidad: 5, precioUnitario: 18000, descuento: 0, subtotal: 90000 },
      ],
      subtotal: 90000, total: 90000,
      createdAt: '2026-06-20T14:00:00Z', updatedAt: '2026-06-20T14:00:00Z',
    },
  ],

  ordenesCompra: [
    {
      id: 'oc-1', numero: 1, proveedorId: 'prov-1', cotizacionId: 'cot-1',
      fecha: '2026-06-12', fechaEntrega: '2026-06-19', estado: 'recibida',
      items: [
        { id: 'oi-1', descripcion: 'Bondiola fresca x kg', cantidad: 100, precioUnitario: 5500, descuento: 0, subtotal: 550000 },
        { id: 'oi-2', descripcion: 'Lomo fresco x kg', cantidad: 50, precioUnitario: 9000, descuento: 5, subtotal: 427500 },
      ],
      subtotal: 977500, total: 977500, comprobanteIds: ['cc-1'],
      createdAt: '2026-06-12T11:00:00Z', updatedAt: '2026-06-19T15:00:00Z',
    },
    {
      id: 'oc-2', numero: 2, proveedorId: 'prov-2', fecha: '2026-06-18',
      estado: 'pendiente',
      items: [
        { id: 'oi-3', descripcion: 'Sal gruesa x 25kg', cantidad: 10, precioUnitario: 3500, descuento: 0, subtotal: 35000 },
        { id: 'oi-4', descripcion: 'Pimienta negra x kg', cantidad: 5, precioUnitario: 28000, descuento: 10, subtotal: 126000 },
      ],
      subtotal: 161000, total: 161000, comprobanteIds: [],
      createdAt: '2026-06-18T09:00:00Z', updatedAt: '2026-06-18T09:00:00Z',
    },
  ],

  comprobantes: [
    {
      id: 'cc-1', tipo: 'factura', numero: 1, proveedorId: 'prov-1',
      ordenCompraId: 'oc-1', fecha: '2026-06-19',
      items: [
        { id: 'cci-1', descripcion: 'Bondiola fresca x kg', cantidad: 100, precioUnitario: 5500, descuento: 0, subtotal: 550000, alicuotaIva: 21, montoIva: 115500 },
        { id: 'cci-2', descripcion: 'Lomo fresco x kg', cantidad: 50, precioUnitario: 9000, descuento: 5, subtotal: 427500, alicuotaIva: 21, montoIva: 89775 },
      ],
      subtotal: 977500, montoIva: 205275, total: 1182775,
      estado: 'pagado_parcial', medioPago: 'cuenta_corriente',
      montoPagado: 1057775, saldoPendiente: 125000,
      createdAt: '2026-06-19T16:00:00Z', updatedAt: '2026-06-23T10:00:00Z',
    },
  ],

  pagos: [
    {
      id: 'pag-1', numero: 1, proveedorId: 'prov-1', fecha: '2026-06-23',
      monto: 1057775, medioPago: 'transferencia',
      imputaciones: [{ comprobanteId: 'cc-1', montoImputado: 1057775 }],
      notas: 'Transferencia parcial — saldo $125.000 a 30 días',
      createdAt: '2026-06-23T10:00:00Z',
    },
  ],

  nextNumeroCotizacion: 3,
  nextNumeroOrdenCompra: 3,
  nextNumeroComprobante: { factura: 2, nota_credito: 1, nota_debito: 1 },
  nextNumeroPago: 2,
  config,
};
