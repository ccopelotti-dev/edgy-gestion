-- Migración 0084 · Fichas de medida: domicilio de trabajo + modalidad de entrega
--
-- "Domicilio de trabajo": un único campo (no uno por Replanteo y otro por
-- instalación) porque en la mayoría de los casos es el mismo lugar físico
-- donde se toma la medida y después se instala. Nullable: si es null, la UI
-- usa la dirección del cliente (clientes_venta.direccion) como default: no
-- hace falta un booleano aparte para el toggle "usar otro domicilio", con
-- que el campo tenga valor o no alcanza.
--
-- "Modalidad de entrega": Retiro en local (el cliente instala) vs Obra con
-- instalación a cargo del comercio. El costo de instalación en obra hoy se
-- agrega como una línea de texto libre en $0 al generar el presupuesto (ver
-- generarPresupuesto.ts) -- todavía no hay una integración real con el
-- módulo Servicios (queda para una fase aparte, Servicios está hoy aislado
-- del resto del sistema comercial).

alter table edgy_gestion.fichas_medida
  add column if not exists domicilio_trabajo text,
  add column if not exists modalidad_entrega text default 'retiro_local';

alter table edgy_gestion.fichas_medida drop constraint if exists fichas_medida_modalidad_entrega_check;
alter table edgy_gestion.fichas_medida add constraint fichas_medida_modalidad_entrega_check
  check (modalidad_entrega in ('retiro_local', 'obra_instalacion'));

-- ─── Verificación ────────────────────────────────────────────

select column_name, column_default from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'fichas_medida'
  and column_name in ('domicilio_trabajo', 'modalidad_entrega');

select pg_get_constraintdef(oid) from pg_constraint where conname = 'fichas_medida_modalidad_entrega_check';
