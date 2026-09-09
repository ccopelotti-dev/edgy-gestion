-- Fase 75i (09/09, a pedido de Carlos): lo de Fase 75f-h (separación
-- total de Rubros/Productos/Insumos/Recepciones/Producciones por punto
-- de venta) había quedado activo por defecto para CUALQUIER cliente con
-- 2+ locales. Eso era correcto para el pedido puntual de Rúa, pero no
-- debe ser la regla general: la mayoría de los clientes con sucursales
-- quieren el catálogo COMPARTIDO entre locales (formato de siempre).
--
-- Este flag vuelve esa separación "opt-in" por cliente. Default false =
-- catálogo compartido (comportamiento anterior a la Fase 75f, el que
-- corresponde a la inmensa mayoría). Se prende a mano solo en clientes
-- que de verdad lo pidan, como Punto Tex (Rúa/Casa Central).
--
-- No toca el reparto de STOCK por sucursal (cantidades en
-- stock_por_punto_venta, Fase 27e) -- ese mecanismo es independiente y
-- sigue funcionando igual para cualquier cliente multi-local, aislado o
-- no. Esto es solo sobre visibilidad de catálogo (qué filas ve cada
-- local en las listas de Rubros/Productos/Insumos/Recepciones/
-- Producciones), ver filtrarPorPuntoVenta en
-- src/modules/productos-stock/data/store.tsx.

alter table edgy_gestion.clientes
  add column if not exists aislar_catalogo_por_punto_venta boolean not null default false;

update edgy_gestion.clientes
set aislar_catalogo_por_punto_venta = true
where id = '9f4bb295-eb4b-4511-ad75-a790e441fb88'; -- Punto Tex
