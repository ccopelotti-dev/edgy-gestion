-- ============================================================
-- Migración 0100: Fase 50c -- Agente administrativo (whitelist +
-- documentos recibidos por WhatsApp)
-- Edgy Gestión · schema edgy_gestion
--
-- Segunda rama del agente de WhatsApp (ver 0098/0099, Capa 1/3 de
-- Ventas): habilita que un subconjunto de números de WhatsApp por
-- tenant ("Números que pueden enviarle doc. administrativa") mande
-- facturas/remitos/comprobantes como foto, y que el agente sepa quién
-- los mandó antes de aceptarlos -- esquema acordado con Carlos el
-- 27/08 (diagrama simplificado, sin perfilar todavía el detalle del
-- agente administrativo -- eso es una etapa siguiente).
--
-- Mismo criterio que 0098: RLS habilitado, CERO policies -- todo el
-- acceso es server-to-server vía Netlify Functions con service_role.
-- Cuando exista una pantalla en el panel (ej. "Documentos recibidos" o
-- "Números autorizados" en Configuración), ahí se agregan policies.
-- ============================================================

-- ─── 1) clientes_agente_admins -- whitelist por tenant ──────────
-- Un número de WhatsApp puede estar autorizado a mandar documentos
-- administrativos para más de un tenant (ej. un contador que atiende
-- varios negocios de Carlos) -- por eso la unicidad es por
-- (cliente_id, numero_whatsapp), no global. `nombre` es solo una
-- etiqueta para que el agente/el humano que revise sepan de quién es
-- sin tener que cruzar contra otra tabla.

create table if not exists edgy_gestion.clientes_agente_admins (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  numero_whatsapp text not null,
  nombre text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cliente_id, numero_whatsapp)
);

alter table edgy_gestion.clientes_agente_admins enable row level security;

-- ─── 2) comprobantes_recibidos -- bandeja de entrada ────────────
-- Cada documento (factura, remito, comprobante de compra) que llega
-- por WhatsApp desde un número autorizado, con lo que Claude Vision
-- pueda extraer (proveedor, CUIT, fecha, ítems, total, etc. -- ver
-- prueba de concepto del 27/08) guardado en `datos_extraidos` tal
-- cual, sin todavía intentar cargarlo automático en Compras -- eso
-- también queda para la etapa de perfilado del agente administrativo.
-- `admin_id` referencia quién lo mandó (puede ser null si el número no
-- estaba en la whitelist -- ver comentario de `estado` abajo).

create table if not exists edgy_gestion.comprobantes_recibidos (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  numero_whatsapp_remitente text not null,
  admin_id bigint references edgy_gestion.clientes_agente_admins(id) on delete set null,
  tipo text,
  imagen_url text,
  datos_extraidos jsonb,
  -- 'rechazado_no_autorizado': el número no está en la whitelist -- se
  -- deja registrado igual (para que Carlos vea si alguien intentó
  -- mandar algo sin estar autorizado) pero no entra a la cola de
  -- revisión normal.
  estado text not null default 'pendiente_revision'
    check (estado in ('pendiente_revision', 'revisado', 'descartado', 'rechazado_no_autorizado')),
  notas text,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.comprobantes_recibidos enable row level security;

create index if not exists idx_comprobantes_recibidos_cliente_estado
  on edgy_gestion.comprobantes_recibidos (cliente_id, estado, created_at);

-- ─── Verificación ────────────────────────────────────────────

select table_name from information_schema.tables
where table_schema = 'edgy_gestion' and table_name in ('clientes_agente_admins', 'comprobantes_recibidos');
