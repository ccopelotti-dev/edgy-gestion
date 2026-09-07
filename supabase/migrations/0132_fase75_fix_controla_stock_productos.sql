-- Fase 75 (07/09): en Punto Tex, la mayoría de los productos NO dejaban
-- "Ajustar stock" -- Control de Stock (Stock.tsx / ControlStock.tsx) sólo
-- arma filas a partir de producto_variantes cuando tipo = 'con_variantes',
-- sin ningún fallback si ese producto no tiene ninguna variante cargada.
--
-- Causa real (encontrada gracias a Sofía, que carga los productos): al dar
-- de alta un producto "completo" ella usa "variante de Color", pero en 8 de
-- los 10 productos de Punto Tex quedó tildado tipo = 'con_variantes' sin
-- haberse llegado a cargar ningún color/talle real. Esos 8 productos
-- desaparecían en silencio de Control de Stock (0 filas generadas) y por
-- lo tanto no se les podía ajustar el stock -- sólo los 2 productos que
-- SÍ quedaron como tipo = 'unico' (sin variante) podían.
--
-- Se corrige llevando a 'unico' cualquier producto marcado 'con_variantes'
-- que no tenga ninguna fila real en producto_variantes. El fix de código
-- (Stock.tsx / ControlStock.tsx) evita que esto vuelva a pasar en silencio
-- si se repite el mismo patrón de carga en el futuro.

update productos
set tipo = 'unico'
where tipo = 'con_variantes'
  and not exists (
    select 1 from producto_variantes
    where producto_variantes.producto_id = productos.id
  );
