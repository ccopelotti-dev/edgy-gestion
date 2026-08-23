-- Migración 0088 · Producción: estado borrador/confirmada
--
-- A pedido de Carlos (23/08): separar "Registrar producción" (queda un
-- borrador con lo calculado, sin tocar stock todavía) de "Confirmar
-- producción" (recién ahí se descuentan los insumos y se suma el producto
-- terminado). Mismo patrón que ya usan Recepción y Transferencias.
--
-- Los lotes ya existentes (histórico) nacieron con el flujo viejo -- el
-- stock YA se movió para ellos al momento de registrarlos. Por eso el
-- default/backfill es 'confirmada', no 'borrador': no hay que volver a
-- confirmarlos, ya están confirmados de hecho.

alter table edgy_gestion.producciones
  add column if not exists estado text not null default 'confirmada';

update edgy_gestion.producciones set estado = 'confirmada' where estado is null;

alter table edgy_gestion.producciones drop constraint if exists producciones_estado_check;
alter table edgy_gestion.producciones add constraint producciones_estado_check
  check (estado in ('borrador', 'confirmada', 'anulada'));

-- A partir de ahora, las filas nuevas nacen como borrador -- el código
-- (registrarProduccionBorrador) también lo manda explícito, este default
-- es solo un cinturón de seguridad si algo inserta sin especificarlo.
alter table edgy_gestion.producciones alter column estado set default 'borrador';

-- ─── Verificación ────────────────────────────────────────────

select estado, count(*) from edgy_gestion.producciones group by estado;
select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'producciones_estado_check';

