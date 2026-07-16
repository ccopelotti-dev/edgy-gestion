-- ============================================================
-- Migración 0054: Compras · Conectar con Recepción (stock)
-- Edgy Gestión · schema edgy_gestion
--
-- Hasta ahora un comprobante de compra (factura) no tenía NINGUNA relación
-- con el stock real de Productos y Stock -- era puramente fiscal/contable.
-- Esta migración agrega las columnas que necesita el modal "Nuevo
-- comprobante de compra" para:
--
-- 1) Vincular cada línea a un Insumo o Producto real del catálogo
--    (comprobante_compra_items.insumo_id / producto_id, que ya existía) y
--    dejar registrada la unidad en la que se cargó la cantidad
--    (comprobante_compra_items.unidad) -- puede diferir de la unidad de
--    stock real (ej. compraste "kg" de un insumo que lleva el stock en
--    "gramo"), y se convierte en el momento de generar la Recepción (ver
--    actualizarStockCompra.ts).
--
-- 2) "Control de Remisión": si el comprobante tiene un control de remito
--    separado pendiente (control_remision = 'si'), el botón "Actualizar
--    stock" queda deshabilitado -- la Recepción real se carga a mano más
--    adelante en Productos y Stock, para no duplicar el ingreso. Si 'no',
--    la factura representa la llegada real de la mercadería y se puede
--    empujar el stock directamente desde Compras.
--
-- 3) stock_actualizado / recepcion_id: una vez que "Actualizar stock" generó
--    la Recepción correspondiente, quedan marcados para no volver a sumar
--    el mismo stock dos veces.
--
-- proveedores/comprobantes_compra/comprobante_compra_items ya existían en
-- Supabase (creados fuera de las migraciones trackeadas, igual que
-- productos/rubros/sub_rubros -- ver comentario en 0023_productos_fase1.sql)
-- -- por eso son ALTER TABLE ... ADD COLUMN IF NOT EXISTS, sin CREATE
-- TABLE. Las políticas RLS existentes de estas tablas ya cubren las
-- columnas nuevas (no hace falta agregar políticas).
-- ============================================================

alter table edgy_gestion.comprobantes_compra
  add column if not exists control_remision text not null default 'no',
  add column if not exists numero_remito text,
  add column if not exists stock_actualizado boolean not null default false,
  add column if not exists recepcion_id uuid references edgy_gestion.recepciones(id);

alter table edgy_gestion.comprobante_compra_items
  add column if not exists insumo_id uuid references edgy_gestion.insumos(id),
  add column if not exists unidad text;

-- Mismas columnas en cotizacion_compra_items / orden_compra_items -- el
-- tipo ItemCompra es compartido entre cotización, OC y comprobante (ver
-- types/index.ts), así que las tres tablas de items deben tener las
-- mismas columnas para que itemToRow() funcione sin importar de cuál se
-- trate. Solo comprobante (factura) dispara "Actualizar stock" hoy, pero
-- dejar las columnas en las tres evita un ALTER TABLE futuro si se
-- extiende la conexión a cotizaciones/OC más adelante.
alter table edgy_gestion.cotizacion_compra_items
  add column if not exists insumo_id uuid references edgy_gestion.insumos(id),
  add column if not exists unidad text;

alter table edgy_gestion.orden_compra_items
  add column if not exists insumo_id uuid references edgy_gestion.insumos(id),
  add column if not exists unidad text;
