// ============================================================
// Módulo Delivery por WhatsApp — descarga de PDF del pedido
// Edgy Gestión · Fase 8 (cierre)
//
// Mismo motor compartido (src/lib/comprobantes-pdf) y mismo criterio
// que descargarPresupuestoPdf() en Ventas (Fase 17): un pedido de
// Delivery todavía no es un comprobante fiscal (no tiene CAE, no tiene
// IVA discriminado por línea) -- es más parecido a un Presupuesto en
// ese sentido, así que se arma un ComprobanteParaPdf mínimo, sin el
// bloque `afip`.
// ============================================================

import {
  generarComprobantePdf,
  type EmpresaParaPdf,
} from '@/lib/comprobantes-pdf/generarComprobantePdf'
import type { Cliente as ClienteEmpresa } from '@/types'
import type { PedidoDelivery } from '../types'
import { formatFecha } from './format'

function empresaParaPdf(empresaActual: ClienteEmpresa): EmpresaParaPdf {
  return {
    nombre: empresaActual.nombre,
    cuit: empresaActual.cuit,
    direccion: empresaActual.direccion,
    telefono: empresaActual.telefono,
    logoUrl: empresaActual.logo_url,
    colorMarca: empresaActual.color_marca,
  }
}

/** Descarga el PDF de un pedido de Delivery por WhatsApp -- incluye
 * los que llegaron solos desde el Menú QR (`origen === 'menu_qr'`).
 * `numero` puede faltar en un pedido recién creado a mano que todavía
 * no se releyó de Supabase -- en ese caso el número queda en 0 hasta
 * que se recargue el listado. */
export async function descargarPedidoPdf(
  empresaActual: ClienteEmpresa,
  pedido: PedidoDelivery,
): Promise<void> {
  const numero = `PED-${String(pedido.numero ?? 0).padStart(5, '0')}`
  await generarComprobantePdf(
    empresaParaPdf(empresaActual),
    {
      tipoLabel: 'Pedido',
      numero,
      fecha: formatFecha(pedido.fecha),
      clienteNombre: pedido.clienteNombre,
      items: pedido.items.map((i) => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal: i.cantidad * i.precioUnitario,
      })),
      subtotal: pedido.total,
      total: pedido.total,
      notas: pedido.notas ?? null,
    },
    numero,
  )
}
