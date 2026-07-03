// ============================================================
// Módulo Configuración — Integraciones
// Preparado para conectar el cliente con verticales y plataformas
// externas. Vivía antes dentro de Ventas, pero es un concepto de
// cliente completo (fiscal, canales de venta, subsistemas entre
// módulos) -- no algo propio de un módulo en particular. Ver también
// PuntoVenta.paraIntegraciones (pestaña "Facturación"), pensado para
// este mismo propósito.
// ============================================================

import { useState } from 'react';
import {
  Plug, Globe, ShoppingCart, Truck, UtensilsCrossed,
  Wrench, Tractor, Radio, CheckCircle2, Circle, Settings,
} from 'lucide-react';

interface Integracion {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: 'vertical' | 'plataforma' | 'fiscal';
  icon: React.ReactNode;
  activa: boolean;
}

const INTEGRACIONES: Integracion[] = [
  // ─── Fiscales ───────────────────────────────────────────
  {
    id: 'afip',
    nombre: 'AFIP — Factura Electrónica',
    descripcion: 'Emitir facturas electrónicas vía API de AFIP (WSFE). Requiere certificado digital y CUIT habilitado.',
    tipo: 'fiscal',
    icon: <Radio className="w-5 h-5" />,
    activa: false,
  },
  // ─── Plataformas externas ───────────────────────────────
  {
    id: 'mercadolibre',
    nombre: 'MercadoLibre',
    descripcion: 'Sincronizar órdenes de venta desde MercadoLibre. Las ventas generan órdenes de pedido automáticamente.',
    tipo: 'plataforma',
    icon: <ShoppingCart className="w-5 h-5" />,
    activa: false,
  },
  {
    id: 'tiendanube',
    nombre: 'Tienda Nube',
    descripcion: 'Importar pedidos desde Tienda Nube. Sincronización de stock y precios bidireccional.',
    tipo: 'plataforma',
    icon: <Globe className="w-5 h-5" />,
    activa: false,
  },
  {
    id: 'mercadopago',
    nombre: 'MercadoPago',
    descripcion: 'Registrar cobros automáticamente cuando se confirman pagos en MercadoPago.',
    tipo: 'plataforma',
    icon: <ShoppingCart className="w-5 h-5" />,
    activa: false,
  },
  // ─── Verticales / Subsistemas ───────────────────────────
  {
    id: 'gastronomia',
    nombre: 'Subsistema Gastronómico',
    descripcion: 'Mesas, delivery, comandas. Genera órdenes de producción y comprobantes desde el módulo gastro vía origenModulo.',
    tipo: 'vertical',
    icon: <UtensilsCrossed className="w-5 h-5" />,
    activa: false,
  },
  {
    id: 'logistica',
    nombre: 'Subsistema Logística',
    descripcion: 'Rutas de entrega, tracking de órdenes de pedido. Lee órdenes tipo "pedido" con fechaEntrega.',
    tipo: 'vertical',
    icon: <Truck className="w-5 h-5" />,
    activa: false,
  },
  {
    id: 'servicios',
    nombre: 'Subsistema Servicios',
    descripcion: 'Agenda, turnos, presupuestos de servicios. Genera órdenes de servicio vía origenModulo.',
    tipo: 'vertical',
    icon: <Wrench className="w-5 h-5" />,
    activa: false,
  },
  {
    id: 'rural',
    nombre: 'Subsistema Rural / Contratista',
    descripcion: 'Partes de campo, liquidaciones. Genera órdenes de servicio con trazabilidad al parte de trabajo.',
    tipo: 'vertical',
    icon: <Tractor className="w-5 h-5" />,
    activa: false,
  },
];

export default function Integraciones() {
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtradas = filtroTipo
    ? INTEGRACIONES.filter(i => i.tipo === filtroTipo)
    : INTEGRACIONES;

  const selected = INTEGRACIONES.find(i => i.id === selectedId);

  const tipoLabel: Record<string, string> = {
    fiscal: 'Fiscal',
    plataforma: 'Plataformas',
    vertical: 'Subsistemas verticales',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-gray-500">
          Conectá tu cuenta con subsistemas verticales, plataformas de e-commerce y servicios fiscales.
          Las integraciones usan el patrón <code className="bg-gray-100 px-1 rounded text-xs">origenModulo</code> / <code className="bg-gray-100 px-1 rounded text-xs">origenId</code> para trazabilidad completa.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        <button
          onClick={() => setFiltroTipo('')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${!filtroTipo ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          Todas
        </button>
        {Object.entries(tipoLabel).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setFiltroTipo(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filtroTipo === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtradas.map(integ => (
          <div
            key={integ.id}
            onClick={() => setSelectedId(selectedId === integ.id ? null : integ.id)}
            className={`rounded-xl border p-4 cursor-pointer transition-all ${
              selectedId === integ.id
                ? 'border-gray-900 ring-1 ring-gray-900'
                : 'hover:border-gray-300'
            } ${integ.activa ? 'bg-green-50/50' : 'bg-white'}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${integ.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {integ.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{integ.nombre}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    integ.tipo === 'fiscal' ? 'bg-blue-50 text-blue-700' :
                    integ.tipo === 'plataforma' ? 'bg-purple-50 text-purple-700' :
                    'bg-teal-50 text-teal-700'
                  }`}>
                    {tipoLabel[integ.tipo]}
                  </span>
                </div>
              </div>
              {integ.activa
                ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                : <Circle className="w-5 h-5 text-gray-300 shrink-0" />
              }
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{integ.descripcion}</p>
          </div>
        ))}
      </div>

      {/* Panel de configuración (placeholder) */}
      {selected && (
        <div className="rounded-xl border bg-gray-50/60 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Settings className="w-5 h-5 text-gray-400" />
            <h3 className="font-semibold">Configuración: {selected.nombre}</h3>
          </div>

          {selected.id === 'afip' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Para habilitar facturación electrónica necesitás:
              </p>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>Certificado digital (.crt) y clave privada (.key) de AFIP</li>
                <li>CUIT habilitado para factura electrónica (WSFE)</li>
                <li>Punto de venta autorizado (ver pestaña "Facturación")</li>
              </ol>
              <div className="flex gap-3 pt-2">
                <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800" disabled>
                  Configurar AFIP (próximamente)
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Plug className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                La integración con <strong>{selected.nombre}</strong> estará disponible cuando se instale el subsistema correspondiente.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Los subsistemas se conectan automáticamente usando <code>origenModulo: '{selected.id}'</code>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
