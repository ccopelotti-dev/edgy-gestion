-- Fase 19.2: Combos en Comandas
-- Edgy Gestión

-- 1) comanda_items.combo_id: vínculo opcional a un Combo del catálogo,
-- mutuamente excluyente con producto_id (ver ComandaItem en
-- comandas-cocina/types/index.ts). Al cerrar la comanda como venta, esta
-- línea descuenta stock de los componentes fijos del combo, no de un
-- producto único (ver expandirLineasConCombos en ventas/lib/descontarStockVenta.ts).
alter table edgy_gestion.comanda_items
  add column if not exists combo_id uuid references edgy_gestion.combos(id);

-- 2) RLS: el módulo Comandas y cocina necesita poder leer combos y sus
-- componentes fijos para mostrar el selector y validar/descontar stock
-- al cerrar la comanda. Mismo gap que se detectó y corrigió para el
-- permiso 'ventas' en la migración 0048 -- acá se agrega directamente
-- para el permiso 'comandas-cocina'.
create policy "combos_select_comandas_cocina_lectura" on edgy_gestion.combos
  for select using (
    cliente_id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.tiene_permiso('comandas-cocina', 'lectura')
  );

create policy "combo_componentes_fijos_select_comandas_cocina_lectura" on edgy_gestion.combo_componentes_fijos
  for select using (
    combo_id in (
      select c.id from edgy_gestion.combos c
      where c.cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('comandas-cocina', 'lectura')
    )
  );
