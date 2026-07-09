-- ============================================================
-- Migración 0027: Productos · Fase 5 (Combos/promociones)
-- Edgy Gestión · schema edgy_gestion
--
-- Quinta de seis fases del refactor de Productos. Un combo agrupa
-- productos existentes en un ítem vendible a precio fijo (ej: "Combo Menú"
-- = Hamburguesa + Papas + 1 bebida a elección). Confirmado con el usuario:
--   - Composición mixta: componentes FIJOS (producto + cantidad exacta) más
--     slots de ELECCIÓN (rubro + cantidad a elegir de ese rubro). La
--     elección real del cliente sucede al vender el combo -- acá solo se
--     define el slot.
--   - Precio: fijo, cargado a mano (no se calcula a partir de los
--     componentes).
--   - Stock: el combo NO tiene stock propio. Vender un combo (Fase 6) va a
--     descontar stock de cada componente fijo y del producto que el
--     cliente elija en cada slot. Acá solo se arma la "receta".
--
-- RLS de `combos`: mismo patrón que `marcas`/`listas_precio`/
-- `plantillas_garantia` (catálogo propio del cliente, cliente_id directo).
-- RLS de `combo_componentes_fijos` y `combo_componentes_eleccion`: NO
-- tienen cliente_id propio -- se gatean vía join a combos.cliente_id,
-- mismo patrón que `producto_precios` (ver 0025).
-- ============================================================

-- ─── Combos ───────────────────────────────────────────────────

create table if not exists edgy_gestion.combos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  nombre text not null,
  descripcion text,
  precio_venta numeric not null default 0,
  disponible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cliente_id, nombre)
);

alter table edgy_gestion.combos enable row level security;

create policy "Lectura interna de combos" on edgy_gestion.combos
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'lectura'))
  );

create policy "Alta de combos" on edgy_gestion.combos
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

create policy "Edicion de combos" on edgy_gestion.combos
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

create policy "Borrado de combos" on edgy_gestion.combos
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura'))
  );

-- ─── Componentes fijos (producto + cantidad exacta) ──────────

create table if not exists edgy_gestion.combo_componentes_fijos (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references edgy_gestion.combos(id) on delete cascade,
  producto_id uuid not null references edgy_gestion.productos(id),
  cantidad numeric not null default 1,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.combo_componentes_fijos enable row level security;

create policy "Lectura interna de combo_componentes_fijos" on edgy_gestion.combo_componentes_fijos
  for select using (
    edgy_gestion.es_personal_edgy()
    or combo_id in (
      select c.id from edgy_gestion.combos c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'lectura')
    )
  );

create policy "Alta de combo_componentes_fijos" on edgy_gestion.combo_componentes_fijos
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or combo_id in (
      select c.id from edgy_gestion.combos c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Edicion de combo_componentes_fijos" on edgy_gestion.combo_componentes_fijos
  for update using (
    edgy_gestion.es_personal_edgy()
    or combo_id in (
      select c.id from edgy_gestion.combos c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Borrado de combo_componentes_fijos" on edgy_gestion.combo_componentes_fijos
  for delete using (
    edgy_gestion.es_personal_edgy()
    or combo_id in (
      select c.id from edgy_gestion.combos c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

-- ─── Componentes a elección (rubro + cantidad a elegir) ──────

create table if not exists edgy_gestion.combo_componentes_eleccion (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references edgy_gestion.combos(id) on delete cascade,
  rubro_id uuid not null references edgy_gestion.rubros(id),
  cantidad numeric not null default 1,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.combo_componentes_eleccion enable row level security;

create policy "Lectura interna de combo_componentes_eleccion" on edgy_gestion.combo_componentes_eleccion
  for select using (
    edgy_gestion.es_personal_edgy()
    or combo_id in (
      select c.id from edgy_gestion.combos c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'lectura')
    )
  );

create policy "Alta de combo_componentes_eleccion" on edgy_gestion.combo_componentes_eleccion
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or combo_id in (
      select c.id from edgy_gestion.combos c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Edicion de combo_componentes_eleccion" on edgy_gestion.combo_componentes_eleccion
  for update using (
    edgy_gestion.es_personal_edgy()
    or combo_id in (
      select c.id from edgy_gestion.combos c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );

create policy "Borrado de combo_componentes_eleccion" on edgy_gestion.combo_componentes_eleccion
  for delete using (
    edgy_gestion.es_personal_edgy()
    or combo_id in (
      select c.id from edgy_gestion.combos c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
    )
  );
