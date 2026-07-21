-- ============================================================
-- Migración 0061: Comandas/Órdenes de venta -- despacho/logística
-- (Fase 21, Etapa 1) · Edgy Gestión · schema edgy_gestion
--
-- Capa de envío ORTOGONAL al ciclo de vida principal de la orden
-- (`estado`): no toda Orden se despacha -- una comanda de salón servida
-- en mesa o un service no tienen "en camino". Por eso no se suma como
-- un paso más de `estado`, sino como columnas aparte, todas opcionales
-- (el operador las completa a mano solo cuando corresponde, típicamente
-- después de facturar).
--
-- Etapa 1 (esta migración): sin integración real con transportistas
-- todavía. `proveedor_logistica` es solo una etiqueta y
-- `numero_seguimiento`/`url_seguimiento` se cargan a mano (el número de
-- pedido de Rappi/PedidosYa, o la guía de un correo con tracking). Una
-- futura Etapa 2 (webhook/API por proveedor) actualizaría estas mismas
-- columnas en vez de depender de carga manual -- no hace falta cambiar
-- el modelo para eso.
-- ============================================================

set search_path to edgy_gestion, public;

alter table edgy_gestion.ordenes_venta
  add column if not exists estado_logistica text not null default 'sin_despacho'
    check (estado_logistica in ('sin_despacho', 'en_camino', 'entregado')),
  add column if not exists proveedor_logistica text
    check (
      proveedor_logistica is null
      or proveedor_logistica in ('propio', 'rappi', 'pedidosya', 'andreani', 'correo_argentino', 'oca', 'otro')
    ),
  add column if not exists numero_seguimiento text,
  add column if not exists url_seguimiento text,
  add column if not exists fecha_despacho date;
