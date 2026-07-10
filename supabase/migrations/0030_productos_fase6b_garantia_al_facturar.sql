-- ============================================================
-- Migración 0030: Productos · Fase 6b (Garantía al facturar)
-- Edgy Gestión · schema edgy_gestion
--
-- Última sub-fase de la Fase 6 del refactor de Productos (6a Comandas,
-- 6c Ventas con catálogo -- reordenada antes que esta porque el
-- vínculo producto↔venta necesitaba ser permanente para descontar
-- stock --, y ahora 6b Garantía al facturar, que se apoya en ese
-- mismo vínculo real ya resuelto en 6c).
--
-- Crea garantias_emitidas: un registro por cada línea facturada en
-- Ventas cuyo producto vinculado al catálogo tenga una plantilla de
-- garantía asignada (propia o heredada de su rubro, mismo criterio
-- que resolverPlantillaGarantia() en productos-stock/data/store.tsx).
-- Se genera automáticamente al facturar -- es un registro de solo
-- lectura, no se edita ni se borra a mano (se administra la pantalla
-- de solo-lectura "Garantías emitidas" en el módulo Productos).
--
-- Diseño (confirmado con el usuario):
-- - Nombre y teléfono del cliente final son obligatorios. Si se
--   factura a un cliente real (no "Consumidor Final"), se usan los
--   datos ya cargados en su ficha (Ventas → Clientes); si es
--   "Consumidor Final" y hay garantía en la venta, Ventas pide esos
--   datos en un mini-formulario antes de habilitar "Facturar".
-- - Los datos de la plantilla (nombre, duración, cobertura) se
--   guardan DUPLICADOS acá (snapshot al momento de la venta), para
--   que la garantía emitida no cambie si después se edita o borra la
--   plantilla del catálogo.
-- - NO hay foreign key a comprobantes_venta / comprobante_venta_items:
--   esas filas se insertan de forma asincrónica y encadenada dentro
--   de syncToSupabase (Ventas), y la garantía se activa como un
--   side-effect INDEPENDIENTE justo después de despachar
--   ADD_COMPROBANTE en PuntoDeVenta.tsx -- no hay garantía de que la
--   fila padre ya exista en el instante en que se inserta esto. Se
--   guarda el número de factura como referencia de texto (no FK),
--   mismo criterio ya usado por movimientos_stock con origen 'venta'
--   en la migración 0029.
-- ============================================================

create table if not exists edgy_gestion.garantias_emitidas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  comprobante_numero integer not null,
  producto_id uuid not null references edgy_gestion.productos(id),
  variante_id uuid references edgy_gestion.producto_variantes(id) on delete set null,
  producto_nombre text not null,
  cantidad numeric not null default 1,
  plantilla_garantia_id uuid references edgy_gestion.plantillas_garantia(id) on delete set null,
  nombre_plantilla text not null,
  duracion_meses integer not null,
  cobertura text,
  cliente_final_nombre text not null,
  cliente_final_telefono text not null default '',
  fecha_inicio date not null,
  fecha_vencimiento date not null,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.garantias_emitidas enable row level security;

create policy "garantias_emitidas_select" on edgy_gestion.garantias_emitidas
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and (edgy_gestion.tiene_permiso('ventas', 'lectura')
             or edgy_gestion.tiene_permiso('productos-stock', 'lectura')))
  );

create policy "garantias_emitidas_insert" on edgy_gestion.garantias_emitidas
  for insert with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas', 'escritura')
  );
