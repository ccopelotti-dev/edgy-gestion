-- ============================================================
-- Migración 0073: Fase 27e-1 — Stock por punto de venta + activar
-- Transferencias
-- Edgy Gestión · schema edgy_gestion
--
-- Contexto: hasta ahora `productos.stock`/`insumos.stock` es un único
-- número por cliente, sin importar cuántos locales tenga (Punto Tex y
-- Rúa comparten catálogo pero NO comparten mercadería física). Esta
-- fase agrega una tabla "overlay" (`stock_por_punto_venta`) que
-- desglosa el stock de cada ítem POR local; el campo plano
-- `productos.stock`/`insumos.stock` pasa a ser un TOTAL calculado
-- automáticamente (trigger) a partir de esa tabla -- así el resto del
-- sistema (alertas de stock bajo, valor de inventario, Control de
-- Stock) sigue funcionando sin cambios.
--
-- Alcance de ESTA sub-fase (27e-1) -- acordado con el usuario en el
-- chat antes de escribir código:
--   1) La tabla overlay + el trigger que mantiene el total.
--   2) Activar "Nueva transferencia" de verdad (hasta hoy el botón
--      estaba permanentemente deshabilitado y no existía ningún
--      diálogo de alta -- confirmado leyendo Transferencias.tsx y
--      store.tsx: ADD_TRANSFERENCIA nunca se despachaba desde ningún
--      lado). La transferencia ahora sí mueve stock real, de forma
--      atómica, vía la función `crear_transferencia`.
--   3) Backfill: SOLO clientes con 2+ puntos de venta ACTIVOS reciben
--      filas en la tabla nueva (su stock total actual se asigna al
--      punto de venta `por_defecto`). El resto de los clientes
--      (la inmensa mayoría, un solo local) quedan con CERO filas acá
--      -- stock_por_punto_venta les es irrelevante y no cambia nada
--      de su comportamiento actual.
--
-- Deliberadamente FUERA de esta sub-fase (queda para 27e-2, sub-fase
-- de seguimiento que se va a comunicar aparte): los otros 8 puntos
-- donde hoy se escribe stock -- descontarStockVenta.ts (Ventas),
-- cerrarComandaVenta.ts (Comandas), cerrarPedidoComoVenta.ts
-- (Ventas Online), actualizarStockCompra.ts (Compras), y los
-- reducers AJUSTAR_STOCK/RECIBIR_STOCK/CONFIRMAR_RECEPCION/
-- REGISTRAR_PRODUCCION -- siguen escribiendo el total plano
-- exactamente como hoy, SIN resolver punto_venta_id todavía. Para
-- clientes de un solo local (hoy: el 100% de los clientes reales)
-- esto no cambia nada. Para un futuro cliente multi-local, hasta que
-- 27e-2 los conecte, Transferencias es la única vía que mueve stock
-- por local -- los demás módulos van a seguir tocando el total
-- agregado (el trigger no se entera y el desglose por local puede
-- quedar desactualizado respecto al total real). Como todavía no hay
-- ningún cliente multi-local en producción (Marina se onboardea
-- recién después de completar la Fase 27 entera), este riesgo es hoy
-- teórico -- no afecta datos reales de nadie.
-- ============================================================

-- ─── Tabla overlay: stock por local ──────────────────────────

create table if not exists edgy_gestion.stock_por_punto_venta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  punto_venta_id uuid not null references edgy_gestion.puntos_venta(id) on delete cascade,
  item_tipo text not null check (item_tipo in ('producto', 'insumo')),
  item_id uuid not null,
  -- Solo aplica a productos con variantes (color/talle) -- null para
  -- insumos y productos 'unico'. Igual convención que
  -- MovimientoStock.varianteId/LineaRecepcion.varianteId.
  variante_id uuid references edgy_gestion.producto_variantes(id) on delete cascade,
  cantidad numeric not null default 0,
  updated_at timestamptz not null default now()
);

-- Un solo renglón por (local, ítem[, variante]) -- coalesce con un
-- UUID sentinela porque un índice único normal no trata dos NULL como
-- iguales (no serviría para evitar duplicados en productos 'unico'/
-- insumos, que siempre tienen variante_id null).
create unique index if not exists stock_por_punto_venta_item_uniq
  on edgy_gestion.stock_por_punto_venta (
    punto_venta_id,
    item_tipo,
    item_id,
    coalesce(variante_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists stock_por_punto_venta_cliente_idx
  on edgy_gestion.stock_por_punto_venta (cliente_id);

create index if not exists stock_por_punto_venta_item_idx
  on edgy_gestion.stock_por_punto_venta (item_tipo, item_id);

alter table edgy_gestion.stock_por_punto_venta enable row level security;

-- RLS: mismo patrón aditivo que productos/movimientos_stock -- policy
-- base gateada por el permiso propio del módulo (productos-stock) y
-- policies adicionales para los módulos que en 27e-2 van a necesitar
-- leer/ajustar el desglose por local al vender/producir/recibir
-- (se combinan por OR, no se reemplazan entre sí).

create policy "stock_pv_select_productos_stock" on edgy_gestion.stock_por_punto_venta
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('productos-stock', 'lectura')
  );

create policy "stock_pv_insert_productos_stock" on edgy_gestion.stock_por_punto_venta
  for insert with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
  );

create policy "stock_pv_update_productos_stock" on edgy_gestion.stock_por_punto_venta
  for update using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
  )
  with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
  );

create policy "stock_pv_delete_productos_stock" on edgy_gestion.stock_por_punto_venta
  for delete using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('productos-stock', 'escritura')
  );

create policy "stock_pv_select_ventas" on edgy_gestion.stock_por_punto_venta
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas', 'lectura')
  );

create policy "stock_pv_update_ventas" on edgy_gestion.stock_por_punto_venta
  for update using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas', 'escritura')
  )
  with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas', 'escritura')
  );

create policy "stock_pv_select_ventas_online" on edgy_gestion.stock_por_punto_venta
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas-online', 'lectura')
  );

create policy "stock_pv_update_ventas_online" on edgy_gestion.stock_por_punto_venta
  for update using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas-online', 'escritura')
  )
  with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas-online', 'escritura')
  );

create policy "stock_pv_select_comandas" on edgy_gestion.stock_por_punto_venta
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('comandas-cocina', 'lectura')
  );

create policy "stock_pv_update_comandas" on edgy_gestion.stock_por_punto_venta
  for update using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')
  )
  with check (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('comandas-cocina', 'escritura')
  );

-- ─── Trigger: mantiene productos.stock/insumos.stock como TOTAL ──
--
-- Corre SECURITY DEFINER a propósito -- es un cálculo de sistema, no
-- una acción del usuario, y así no depende de que el que dispara el
-- trigger tenga permiso de escritura sobre productos/insumos
-- directamente (ya lo tiene sobre stock_por_punto_venta, que es la
-- tabla que de verdad está escribiendo).

create or replace function edgy_gestion.recalcular_stock_total()
returns trigger
language plpgsql
security definer
set search_path = edgy_gestion, public
as $$
declare
  v_item_tipo text;
  v_item_id uuid;
  v_variante_id uuid;
  v_total numeric;
  v_producto_id uuid;
begin
  v_item_tipo := coalesce(new.item_tipo, old.item_tipo);
  v_item_id := coalesce(new.item_id, old.item_id);
  v_variante_id := coalesce(new.variante_id, old.variante_id);

  if v_variante_id is not null then
    -- Total de ESA variante puntual, sumado entre todos los locales.
    select coalesce(sum(cantidad), 0) into v_total
      from edgy_gestion.stock_por_punto_venta
      where variante_id = v_variante_id;

    update edgy_gestion.producto_variantes
      set stock = v_total
      where id = v_variante_id
      returning producto_id into v_producto_id;

    -- El total del producto padre es la suma de sus variantes -- mismo
    -- criterio que ya usa el reducer del frontend hoy (ver
    -- CONFIRMAR_RECEPCION/AJUSTAR_STOCK en productos-stock/data/store.tsx).
    if v_producto_id is not null then
      select coalesce(sum(stock), 0) into v_total
        from edgy_gestion.producto_variantes
        where producto_id = v_producto_id;

      update edgy_gestion.productos set stock = v_total where id = v_producto_id;
    end if;
  elsif v_item_tipo = 'producto' then
    select coalesce(sum(cantidad), 0) into v_total
      from edgy_gestion.stock_por_punto_venta
      where item_tipo = 'producto' and item_id = v_item_id and variante_id is null;

    update edgy_gestion.productos set stock = v_total where id = v_item_id;
  else
    select coalesce(sum(cantidad), 0) into v_total
      from edgy_gestion.stock_por_punto_venta
      where item_tipo = 'insumo' and item_id = v_item_id;

    update edgy_gestion.insumos set stock = v_total where id = v_item_id;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_stock_por_punto_venta_recalcular on edgy_gestion.stock_por_punto_venta;
create trigger trg_stock_por_punto_venta_recalcular
  after insert or update or delete on edgy_gestion.stock_por_punto_venta
  for each row execute function edgy_gestion.recalcular_stock_total();

-- ─── Backfill: solo clientes con 2+ puntos de venta activos ──────
--
-- Al resto de los clientes esta migración no les agrega ni una sola
-- fila -- siguen exactamente igual que antes.

do $$
declare
  v_cliente record;
  v_pv_default uuid;
begin
  for v_cliente in
    select cliente_id
    from edgy_gestion.puntos_venta
    where activo = true
    group by cliente_id
    having count(*) >= 2
  loop
    select id into v_pv_default
      from edgy_gestion.puntos_venta
      where cliente_id = v_cliente.cliente_id and por_defecto = true and activo = true
      limit 1;

    -- Si nadie marcó "por defecto" todavía, se usa cualquiera de los
    -- activos como ancla del backfill (evita dejar el cliente sin
    -- ningún lugar donde asentar su stock actual).
    if v_pv_default is null then
      select id into v_pv_default
        from edgy_gestion.puntos_venta
        where cliente_id = v_cliente.cliente_id and activo = true
        order by created_at
        limit 1;
    end if;

    if v_pv_default is not null then
      insert into edgy_gestion.stock_por_punto_venta (cliente_id, punto_venta_id, item_tipo, item_id, variante_id, cantidad)
      select v_cliente.cliente_id, v_pv_default, 'producto', p.id, null, p.stock
        from edgy_gestion.productos p
        where p.cliente_id = v_cliente.cliente_id and p.tipo = 'unico'
      on conflict do nothing;

      insert into edgy_gestion.stock_por_punto_venta (cliente_id, punto_venta_id, item_tipo, item_id, variante_id, cantidad)
      select v_cliente.cliente_id, v_pv_default, 'producto', pv.producto_id, pv.id, pv.stock
        from edgy_gestion.producto_variantes pv
        join edgy_gestion.productos p on p.id = pv.producto_id
        where p.cliente_id = v_cliente.cliente_id
      on conflict do nothing;

      insert into edgy_gestion.stock_por_punto_venta (cliente_id, punto_venta_id, item_tipo, item_id, variante_id, cantidad)
      select v_cliente.cliente_id, v_pv_default, 'insumo', i.id, null, i.stock
        from edgy_gestion.insumos i
        where i.cliente_id = v_cliente.cliente_id
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

-- ─── RPC: ajuste atómico de un renglón de stock_por_punto_venta ──
--
-- UPSERT en una sola sentencia (sin leer-calcular-escribir desde el
-- cliente) -- el lock de fila de Postgres en el INSERT ... ON CONFLICT
-- evita la condición de carrera que sí tiene hoy el resto del sistema
-- (ver descontarStockVenta.ts/actualizarStockCompra.ts, que leen el
-- stock actual en JS y escriben un valor absoluto). SECURITY INVOKER
-- a propósito: las políticas de RLS de stock_por_punto_venta se
-- aplican tal cual al usuario que llama, igual que si escribiera la
-- tabla directo.

create or replace function edgy_gestion.ajustar_stock_punto_venta(
  p_cliente_id uuid,
  p_punto_venta_id uuid,
  p_item_tipo text,
  p_item_id uuid,
  p_variante_id uuid,
  p_delta numeric
) returns numeric
language plpgsql
security invoker
set search_path = edgy_gestion, public
as $$
declare
  v_nuevo numeric;
begin
  insert into edgy_gestion.stock_por_punto_venta
    (cliente_id, punto_venta_id, item_tipo, item_id, variante_id, cantidad)
  values
    (p_cliente_id, p_punto_venta_id, p_item_tipo, p_item_id, p_variante_id, p_delta)
  on conflict (punto_venta_id, item_tipo, item_id, coalesce(variante_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set
    cantidad = edgy_gestion.stock_por_punto_venta.cantidad + excluded.cantidad,
    updated_at = now()
  returning cantidad into v_nuevo;

  return v_nuevo;
end;
$$;

grant execute on function edgy_gestion.ajustar_stock_punto_venta(uuid, uuid, text, uuid, uuid, numeric) to authenticated;

-- ─── Transferencias: columnas nuevas sobre las tablas ya existentes ─
--
-- IMPORTANTE -- `transferencias`/`transferencia_lineas` YA EXISTEN en
-- la base real (se confirmó vía código: store.tsx las lee/escribe con
-- sucursal_origen/sucursal_destino de texto libre) pero, igual que
-- pasaba con `puntos_venta` antes de la 27a, NUNCA tuvieron una
-- migración versionada -- por eso acá solo se agregan columnas, sin
-- tocar las existentes (sucursal_origen/sucursal_destino quedan sin
-- uso de ahora en más, pero no se borran por las dudas).

alter table edgy_gestion.transferencias
  add column if not exists origen_punto_venta_id uuid references edgy_gestion.puntos_venta(id) on delete restrict,
  add column if not exists destino_punto_venta_id uuid references edgy_gestion.puntos_venta(id) on delete restrict,
  add column if not exists estado text not null default 'confirmada' check (estado in ('confirmada', 'anulada'));

alter table edgy_gestion.transferencia_lineas
  add column if not exists variante_id uuid references edgy_gestion.producto_variantes(id) on delete set null;

-- movimientos_stock: agrega el local donde impactó cada movimiento --
-- nullable y sin backfill (los movimientos históricos quedan sin
-- local asociado, que es correcto: pasaron antes de que existiera el
-- concepto). Lo usa `crear_transferencia` de acá en más, y lo van a
-- empezar a usar los demás módulos en 27e-2.
alter table edgy_gestion.movimientos_stock
  add column if not exists punto_venta_id uuid references edgy_gestion.puntos_venta(id) on delete set null;

-- ─── RPC: crear_transferencia (alta + movimiento de stock atómico) ─
--
-- Reemplaza al flujo anterior (ADD_TRANSFERENCIA por optimistic-UI +
-- sync a Supabase) porque acá SÍ hace falta atomicidad real: la
-- transferencia tiene que crear la cabecera, las líneas y mover el
-- stock de dos locales a la vez, o no hacer nada. SECURITY INVOKER:
-- las RLS de transferencias/transferencia_lineas/stock_por_punto_venta/
-- movimientos_stock se aplican al usuario que llama (mismo permiso
-- 'productos-stock' que ya protege el resto de esta pantalla).

create or replace function edgy_gestion.crear_transferencia(
  p_cliente_id uuid,
  p_origen_punto_venta_id uuid,
  p_destino_punto_venta_id uuid,
  p_fecha date,
  p_notas text,
  p_lineas jsonb
) returns uuid
language plpgsql
security invoker
set search_path = edgy_gestion, public
as $$
declare
  v_transferencia_id uuid;
  v_linea jsonb;
  v_item_tipo text;
  v_item_id uuid;
  v_variante_id uuid;
  v_cantidad numeric;
  v_stock_actual numeric;
  v_fecha date;
begin
  if p_origen_punto_venta_id = p_destino_punto_venta_id then
    raise exception 'El local de origen y destino no pueden ser el mismo.';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La transferencia no tiene ítems.';
  end if;

  v_fecha := coalesce(p_fecha, current_date);
  v_transferencia_id := gen_random_uuid();

  insert into edgy_gestion.transferencias
    (id, cliente_id, fecha, origen_punto_venta_id, destino_punto_venta_id, estado, notas)
  values
    (v_transferencia_id, p_cliente_id, v_fecha, p_origen_punto_venta_id, p_destino_punto_venta_id, 'confirmada', nullif(btrim(coalesce(p_notas, '')), ''));

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_item_tipo := v_linea->>'itemTipo';
    v_item_id := (v_linea->>'itemId')::uuid;
    v_variante_id := nullif(v_linea->>'varianteId', '')::uuid;
    v_cantidad := (v_linea->>'cantidad')::numeric;

    if v_item_tipo not in ('producto', 'insumo') then
      raise exception 'Tipo de ítem inválido en la transferencia.';
    end if;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida en la transferencia.';
    end if;

    select coalesce(cantidad, 0) into v_stock_actual
      from edgy_gestion.stock_por_punto_venta
      where punto_venta_id = p_origen_punto_venta_id
        and item_tipo = v_item_tipo
        and item_id = v_item_id
        and coalesce(variante_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(v_variante_id, '00000000-0000-0000-0000-000000000000'::uuid);

    if coalesce(v_stock_actual, 0) < v_cantidad then
      raise exception 'No hay stock suficiente en el local de origen para uno de los ítems.';
    end if;

    insert into edgy_gestion.transferencia_lineas (id, transferencia_id, item_tipo, item_id, variante_id, cantidad)
    values (gen_random_uuid(), v_transferencia_id, v_item_tipo, v_item_id, v_variante_id, v_cantidad);

    perform edgy_gestion.ajustar_stock_punto_venta(p_cliente_id, p_origen_punto_venta_id, v_item_tipo, v_item_id, v_variante_id, -v_cantidad);
    perform edgy_gestion.ajustar_stock_punto_venta(p_cliente_id, p_destino_punto_venta_id, v_item_tipo, v_item_id, v_variante_id, v_cantidad);

    insert into edgy_gestion.movimientos_stock
      (id, cliente_id, tipo, item_tipo, item_id, variante_id, cantidad, fecha, origen, origen_id, punto_venta_id)
    values
      (gen_random_uuid(), p_cliente_id, 'egreso', v_item_tipo, v_item_id, v_variante_id, -v_cantidad, v_fecha, 'transferencia', v_transferencia_id, p_origen_punto_venta_id);

    insert into edgy_gestion.movimientos_stock
      (id, cliente_id, tipo, item_tipo, item_id, variante_id, cantidad, fecha, origen, origen_id, punto_venta_id)
    values
      (gen_random_uuid(), p_cliente_id, 'ingreso', v_item_tipo, v_item_id, v_variante_id, v_cantidad, v_fecha, 'transferencia', v_transferencia_id, p_destino_punto_venta_id);
  end loop;

  return v_transferencia_id;
end;
$$;

grant execute on function edgy_gestion.crear_transferencia(uuid, uuid, uuid, date, text, jsonb) to authenticated;
