-- ============================================================
-- Migración 0053: Fase 9 (cierre) · Tabla de Producciones
-- Edgy Gestión · schema edgy_gestion
--
-- La migración 0037 (Fase 9: recetas/merma/producción) dejó registrado
-- explícitamente que "no agrega tabla nueva para esto -- reutiliza
-- movimientos_stock". En la práctica eso significaba que un lote de
-- producción no existía como registro propio: solo quedaban movimientos
-- de stock sueltos agrupados por un origen_id descartable, sin ninguna
-- fila que se pudiera listar como "historial de producción".
--
-- Esta migración cierra ese hueco: cada ejecución de REGISTRAR_PRODUCCION
-- ahora inserta una fila acá (factor de lote, cantidad teórica vs. real
-- producida, fecha, notas) ANTES de generar los movimientos de stock, que
-- siguen usando ese id como origen_id (mismo patrón que recepciones).
--
-- RLS: mismo patrón que listas_precio (0025) -- catálogo propio del
-- cliente, gateado por permiso 'productos-stock'.
-- ============================================================

create table if not exists edgy_gestion.producciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  formula_id uuid not null references edgy_gestion.formulas(id),
  producto_id uuid not null references edgy_gestion.productos(id),
  factor numeric not null,
  cantidad_teorica numeric not null,
  cantidad_real_producida numeric not null,
  fecha date not null,
  notas text,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.producciones enable row level security;

create policy "Lectura interna de producciones" on edgy_gestion.producciones
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'lectura'))
  );

create policy "Alta de producciones" on edgy_gestion.producciones
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

create policy "Edicion de producciones" on edgy_gestion.producciones
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

create policy "Borrado de producciones" on edgy_gestion.producciones
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

create index if not exists producciones_cliente_id_idx on edgy_gestion.producciones(cliente_id);
create index if not exists producciones_formula_id_idx on edgy_gestion.producciones(formula_id);
create index if not exists producciones_producto_id_idx on edgy_gestion.producciones(producto_id);
