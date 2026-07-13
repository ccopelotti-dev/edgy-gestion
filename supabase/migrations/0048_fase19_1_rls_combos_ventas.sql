-- ============================================================
-- Migración 0048: Fase 19.1 (fix) — RLS: Ventas puede leer combos
-- Edgy Gestión · schema edgy_gestion
--
-- Gap detectado después de aplicar 0047: las policies de SELECT de
-- `combos` y `combo_componentes_fijos` (migración 0027) solo dejan
-- pasar al permiso 'productos-stock'. Un usuario con permiso de
-- 'ventas' pero SIN permiso en Productos y Stock asignado a su rol
-- nunca iba a poder:
--   1) ver combos en el buscador de "Nuevo comprobante" (ComprobanteDialog
--      consulta la tabla `combos` directamente), ni
--   2) descontar stock de los componentes fijos del combo al facturar
--      (expandirLineasConCombos en descontarStockVenta.ts consulta
--      `combo_componentes_fijos` -- si RLS la filtra, devuelve 0 filas
--      SIN error, así que el combo se vendería sin descontar nada de
--      stock, en silencio).
--
-- Mismo criterio que 0029 (Fase 6c): se agregan policies ADICIONALES
-- de SOLO LECTURA basadas en el permiso 'ventas', que se combinan por
-- OR con las de 'productos-stock' ya existentes -- no las reemplazan.
-- No se toca combo_componentes_eleccion: Fase 19.1 no vende combos con
-- slots de elección (limitación documentada en descontarStockVenta.ts).
-- ============================================================

create policy "combos_select_ventas_lectura" on edgy_gestion.combos
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('ventas', 'lectura')
  );

create policy "combo_componentes_fijos_select_ventas_lectura" on edgy_gestion.combo_componentes_fijos
  for select using (
    combo_id in (
      select c.id from edgy_gestion.combos c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('ventas', 'lectura')
    )
  );
