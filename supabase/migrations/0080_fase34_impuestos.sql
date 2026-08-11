-- ============================================================
-- Migración 0080 · Fase 34: módulo Impuestos (núcleo) -- IVA v1
-- Edgy Gestión · schema edgy_gestion
--
-- Alcance de esta entrega (beta, ver conversación): Libro IVA
-- Ventas/Compras y posición mensual como REPORTE sobre lo que ya
-- existe en Ventas/Compras (comprobantes_venta/compra +
-- comprobante_venta/compra_items, que ya traen alicuota_iva por
-- línea) -- no se duplica esa carga acá. Lo genuinamente nuevo es:
--
--   a) `tipo_comprobante_codigo` en comprobantes_compra: el código
--      ARCA de 3 dígitos del comprobante que nos dio el proveedor
--      (001=Factura A, 006=Factura B, 011=Factura C, etc. -- tabla
--      oficial "Tipo de Comprobante" del Libro IVA Digital). Hoy
--      Compras no lo capturaba y es el dato que determina si ese
--      comprobante genera crédito fiscal computable (A sí, B/C en
--      general no). Se deja como texto libre (sin CHECK) porque la
--      tabla oficial tiene ~80 códigos incluyendo rubros muy
--      específicos (avícola, pesquero, tabacalero) que no tiene
--      sentido restringir acá -- el frontend ofrece un Select con
--      el subconjunto relevante para un comercio.
--
--   b) `retenciones_percepciones`: no existía nada parecido. Cubre
--      tanto lo que nos retienen/perciben a nosotros (direccion
--      'sufrida', restan en la posición de IVA) como lo que nosotros
--      le retenemos/percibimos a un proveedor actuando de agente
--      (direccion 'practicada'). Se vincula opcionalmente al
--      comprobante de origen (venta o compra, nunca ambos) para
--      trazabilidad, pero el sujeto (nombre/documento) se guarda
--      como snapshot de texto -- evita una FK polimórfica y no se
--      rompe si el cliente/proveedor se edita o borra después.
--
-- Ganancias como agente de retención (RG 830) queda explícitamente
-- fuera de este beta (ver conversación) -- no hay campos para eso
-- todavía.
--
-- vertical = 'core', gateado en el frontend por
-- clientes_arca_config.condicion_iva = 'responsable_inscripto' (un
-- monotributista no liquida IVA, no necesita este módulo -- ver
-- investigación de esta fase).
-- ============================================================

insert into edgy_gestion.modulos (nombre, slug, vertical, descripcion) values
  ('Impuestos', 'impuestos', 'core', 'Libro IVA, posición mensual, retenciones y percepciones')
on conflict (slug) do nothing;

insert into edgy_gestion.cliente_modulos (cliente_id, modulo_id, activo, activado_en)
select c.id, m.id, true, now()
from edgy_gestion.clientes c
cross join (select id from edgy_gestion.modulos where slug = 'impuestos') m
where not exists (
  select 1 from edgy_gestion.cliente_modulos cm
  where cm.cliente_id = c.id and cm.modulo_id = m.id
);

-- ─── Compras: código de comprobante ARCA (letra + tipo) ───────

alter table edgy_gestion.comprobantes_compra
  add column if not exists tipo_comprobante_codigo text;

comment on column edgy_gestion.comprobantes_compra.tipo_comprobante_codigo is
  'Código ARCA de 3 dígitos del comprobante recibido del proveedor (tabla oficial "Tipo de Comprobante" del Libro IVA Digital, ej. 001=Factura A, 006=Factura B, 011=Factura C). Determina si genera crédito fiscal computable. Texto libre, sin CHECK -- se valida en el frontend contra el subconjunto relevante.';

-- ─── Retenciones y Percepciones (sufridas y practicadas) ──────

create table if not exists edgy_gestion.retenciones_percepciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  fecha date not null,
  periodo text not null, -- 'YYYY-MM', para agrupar en la posición mensual
  tipo text not null check (tipo in ('retencion', 'percepcion')),
  -- 'sufrida': nos la practicó un cliente/agente (resta en nuestra
  -- posición de IVA / es pago a cuenta de Ganancias).
  -- 'practicada': nosotros actuamos de agente sobre un proveedor.
  direccion text not null check (direccion in ('sufrida', 'practicada')),
  impuesto text not null check (impuesto in ('iva', 'ganancias', 'iibb', 'suss', 'otro')),
  sujeto_nombre text not null,
  sujeto_documento text,
  numero_certificado text,
  base_calculo numeric(12,2),
  alicuota numeric(5,2),
  monto numeric(12,2) not null,
  comprobante_venta_id uuid references edgy_gestion.comprobantes_venta(id),
  comprobante_compra_id uuid references edgy_gestion.comprobantes_compra(id),
  notas text,
  creado_por uuid references edgy_gestion.usuarios_cliente(id),
  created_at timestamptz not null default now(),
  check (comprobante_venta_id is null or comprobante_compra_id is null)
);

alter table edgy_gestion.retenciones_percepciones enable row level security;

create policy "Lectura interna de retenciones_percepciones" on edgy_gestion.retenciones_percepciones
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('impuestos', 'lectura'))
  );

create policy "Alta de retenciones_percepciones" on edgy_gestion.retenciones_percepciones
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('impuestos', 'escritura'))
  );

create policy "Edicion de retenciones_percepciones" on edgy_gestion.retenciones_percepciones
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('impuestos', 'escritura'))
  );

create policy "Borrado de retenciones_percepciones" on edgy_gestion.retenciones_percepciones
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('impuestos', 'escritura'))
  );

-- ─── Saldo técnico de IVA arrastrado entre períodos ────────────
-- 1 fila por cliente+período ya cerrado -- el motor de posición
-- mensual necesita saber el saldo a favor que quedó del mes
-- anterior. Se carga a mano el primer período (arranque en caliente
-- de un cliente que ya venía liquidando) y de ahí en más el propio
-- motor puede sugerir el valor siguiente.

create table if not exists edgy_gestion.posiciones_iva_mensuales (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  periodo text not null, -- 'YYYY-MM'
  debito_fiscal numeric(12,2) not null default 0,
  credito_fiscal numeric(12,2) not null default 0,
  retenciones_percepciones_sufridas numeric(12,2) not null default 0,
  saldo_tecnico_anterior numeric(12,2) not null default 0,
  saldo_tecnico numeric(12,2) not null default 0,
  saldo_libre_disponibilidad numeric(12,2) not null default 0,
  cerrado boolean not null default false,
  creado_por uuid references edgy_gestion.usuarios_cliente(id),
  created_at timestamptz not null default now(),
  unique (cliente_id, periodo)
);

alter table edgy_gestion.posiciones_iva_mensuales enable row level security;

create policy "Lectura interna de posiciones_iva_mensuales" on edgy_gestion.posiciones_iva_mensuales
  for select using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('impuestos', 'lectura'))
  );

create policy "Alta de posiciones_iva_mensuales" on edgy_gestion.posiciones_iva_mensuales
  for insert with check (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('impuestos', 'escritura'))
  );

create policy "Edicion de posiciones_iva_mensuales" on edgy_gestion.posiciones_iva_mensuales
  for update using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('impuestos', 'escritura'))
  );

create policy "Borrado de posiciones_iva_mensuales" on edgy_gestion.posiciones_iva_mensuales
  for delete using (
    edgy_gestion.es_personal_edgy()
    or (cliente_id = edgy_gestion.cliente_del_usuario_actual()
        and edgy_gestion.tiene_permiso('impuestos', 'escritura'))
  );

-- ─── Verificación ────────────────────────────────────────────

select column_name from information_schema.columns
where table_schema = 'edgy_gestion' and table_name = 'comprobantes_compra' and column_name = 'tipo_comprobante_codigo';

select table_name from information_schema.tables
where table_schema = 'edgy_gestion' and table_name in ('retenciones_percepciones', 'posiciones_iva_mensuales');

select slug, vertical from edgy_gestion.modulos where slug = 'impuestos';

select count(*) as clientes_con_impuestos_activo
from edgy_gestion.cliente_modulos cm
join edgy_gestion.modulos m on m.id = cm.modulo_id
where m.slug = 'impuestos' and cm.activo = true;
