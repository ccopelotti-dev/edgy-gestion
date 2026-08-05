-- ============================================================
-- Migración 0074: Fase 27f — Caja por turno con punto de venta +
-- permisos/RLS finales
-- Edgy Gestión · schema edgy_gestion
--
-- Última sub-fase de Fase 27 (multi-sucursal). Dos partes:
--
-- 1) Caja por turno pasa a ser POR LOCAL. Hasta ahora solo podía haber
--    un turno "abierto" a la vez por CLIENTE (useTurnoAbierto()/
--    useTurnoActivo() buscan cualquier turno con estado='abierto' sin
--    filtrar local) -- con 2+ locales operando en simultáneo (Punto Tex
--    y Rúa abren caja cada uno la suya) esto es incorrecto: el cajero
--    de un local vería el turno del otro como si fuera el suyo, y el
--    arqueo (monto esperado = apertura + neto de efectivo en Tesorería)
--    mezclaría el efectivo de los dos locales en una sola cuenta. Se
--    agrega punto_venta_id a `turnos_caja` y a `movimientos_caja` (así
--    el arqueo de cada turno puede filtrar solo el efectivo de SU
--    local) -- null en clientes de un solo local, sin cambios para
--    ellos.
--
-- 2) Auditoría final de RLS: durante 27b-27e se agregó punto_venta_id
--    a varias tablas (comprobantes_venta, ordenes_venta, productos,
--    combos, stock_por_punto_venta, transferencias) pero solo el
--    catálogo (productos/combos) quedó con el LADO DE LECTURA
--    reforzado (migración 0071) -- nada impedía hasta ahora que un
--    usuario restringido a un punto de venta escribiera/leyera datos
--    de OTRO local (ej. crear un comprobante con el punto_venta_id de
--    la otra sucursal, o ajustar stock_por_punto_venta de un local que
--    no es el suyo). Se cierra ese hueco con políticas RESTRICTIVE:
--    a diferencia de las políticas normales (permissive, se combinan
--    por OR), las restrictive se combinan por AND con TODAS las
--    políticas permissive existentes de la tabla -- no hace falta
--    conocer ni tocar los nombres de esas políticas (varias de estas
--    tablas son anteriores al historial de migraciones versionado,
--    igual que puntos_venta/movimientos_stock/transferencias antes de
--    sus respectivas fases), solo se agrega una capa final que dice
--    "además de lo que ya te deja hacer tu permiso de módulo, esto
--    tiene que ser tu propio local (o no tener límite de local)".
--    Usuarios sin punto_venta_id asignado (admin / acceso global) no
--    se ven afectados por ninguna de estas políticas.
-- ============================================================

-- ─── 1) Caja por turno: columna de local ─────────────────────

alter table edgy_gestion.turnos_caja
  add column if not exists punto_venta_id uuid references edgy_gestion.puntos_venta(id) on delete set null;

alter table edgy_gestion.movimientos_caja
  add column if not exists punto_venta_id uuid references edgy_gestion.puntos_venta(id) on delete set null;

-- ─── 2) RLS restrictivas: cierre final por punto de venta ────
--
-- Mismo criterio en las siete tablas: "el registro tiene que ser de un
-- local sin restricción, o el usuario no tiene restricción de local, o
-- el local del registro coincide con el del usuario". Se aplica a
-- INSERT y UPDATE (no a DELETE, que en este sistema no se usa en
-- ninguna de estas tablas -- los "borrados" son bajas de estado).

create policy "turnos_caja_restrict_punto_venta_sel" on edgy_gestion.turnos_caja
  as restrictive for select using (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "turnos_caja_restrict_punto_venta_ins" on edgy_gestion.turnos_caja
  as restrictive for insert with check (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "turnos_caja_restrict_punto_venta_upd" on edgy_gestion.turnos_caja
  as restrictive for update using (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  ) with check (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "comprobantes_venta_restrict_punto_venta_ins" on edgy_gestion.comprobantes_venta
  as restrictive for insert with check (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "comprobantes_venta_restrict_punto_venta_upd" on edgy_gestion.comprobantes_venta
  as restrictive for update using (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  ) with check (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "ordenes_venta_restrict_punto_venta_ins" on edgy_gestion.ordenes_venta
  as restrictive for insert with check (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "ordenes_venta_restrict_punto_venta_upd" on edgy_gestion.ordenes_venta
  as restrictive for update using (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  ) with check (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "productos_restrict_punto_venta_ins" on edgy_gestion.productos
  as restrictive for insert with check (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "productos_restrict_punto_venta_upd" on edgy_gestion.productos
  as restrictive for update using (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  ) with check (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "combos_restrict_punto_venta_ins" on edgy_gestion.combos
  as restrictive for insert with check (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "combos_restrict_punto_venta_upd" on edgy_gestion.combos
  as restrictive for update using (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  ) with check (
    punto_venta_id is null
    or edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

-- stock_por_punto_venta: acá punto_venta_id NUNCA es null (ver migración
-- 0073 -- toda fila de esta tabla ya pertenece a un local puntual), por
-- eso la condición es más simple: coincide con el local del usuario, o
-- el usuario no tiene restricción.
create policy "stock_pv_restrict_punto_venta_sel" on edgy_gestion.stock_por_punto_venta
  as restrictive for select using (
    edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "stock_pv_restrict_punto_venta_ins" on edgy_gestion.stock_por_punto_venta
  as restrictive for insert with check (
    edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "stock_pv_restrict_punto_venta_upd" on edgy_gestion.stock_por_punto_venta
  as restrictive for update using (
    edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  ) with check (
    edgy_gestion.punto_venta_del_usuario_actual() is null
    or punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

-- transferencias: no tiene una única columna punto_venta_id (tiene
-- origen y destino) -- un usuario restringido a un local puede mover
-- stock DESDE o HACIA su propio local, pero no orquestar una
-- transferencia entre dos locales que no son el suyo.
create policy "transferencias_restrict_punto_venta_ins" on edgy_gestion.transferencias
  as restrictive for insert with check (
    edgy_gestion.punto_venta_del_usuario_actual() is null
    or origen_punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
    or destino_punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );

create policy "transferencias_restrict_punto_venta_sel" on edgy_gestion.transferencias
  as restrictive for select using (
    edgy_gestion.punto_venta_del_usuario_actual() is null
    or origen_punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
    or destino_punto_venta_id = edgy_gestion.punto_venta_del_usuario_actual()
  );
