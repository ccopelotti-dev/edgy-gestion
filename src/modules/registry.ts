import { lazy } from 'react'

// Cada entrada es un import() dinámico — Vite genera un bundle separado por
// módulo, así un cliente que no tiene "tesoreria" activo ni descarga ese
// código. Para sumar un módulo nuevo: crear su carpeta en src/modules/<slug>
// con un index.tsx que exporte el componente como default, y agregar la
// entrada acá.
export const REGISTRO_MODULOS: Record<string, ReturnType<typeof lazy>> = {
  tesoreria: lazy(() => import('@/modules/tesoreria')),
  'productos-stock': lazy(() => import('@/modules/productos-stock')),
  'ventas': lazy(() => import('./ventas')),
  'compras': lazy(() => import('./compras')),
  'configuracion': lazy(() => import('./configuracion')),
  'reportes': lazy(() => import('./reportes')),
  'utilidades': lazy(() => import('./utilidades')),
  'servicios': lazy(() => import('./servicios')),
  'contable': lazy(() => import('./contable')),
  // Vertical gastronómico (ver 0018_gastronomico_nucleo.sql y siguientes).
  'mesas-salon': lazy(() => import('./mesas-salon')),
  'comandas-cocina': lazy(() => import('./comandas-cocina')),
  'caja-turno': lazy(() => import('./caja-turno')),
  'menu-qr': lazy(() => import('./menu-qr')),
  // Antes 'delivery-whatsapp' (Fase 22): mismo módulo, renombrado a
  // "Ventas Online" porque dejó de ser exclusivo de WhatsApp -- ver
  // migración 0062_rename_delivery_whatsapp_a_ventas_online.sql.
  'ventas-online': lazy(() => import('./delivery-whatsapp')),
  'viandas': lazy(() => import('./viandas')),
}
