-- ============================================================
-- Migración 0039: Configuración de Facturación Electrónica ARCA
-- Edgy Gestión · Fase 11
--
-- Contexto: hasta ahora todo comprobante es modoEmision='interno'
-- (sin AFIP/ARCA). Esta migración agrega el lugar donde vive la
-- configuración de ARCA por cliente (punto de venta, certificado
-- digital y clave privada para WSAA/WSFEv1).
--
-- El CUIT NO se duplica acá -- ya existe en edgy_gestion.clientes.cuit
-- (dato protegido, lo carga Edgy en el onboarding, ver Configuración >
-- Empresa > "Datos protegidos"). Las Netlify Functions lo leen de ahí
-- directamente para evitar que quede un CUIT distinto cargado acá por
-- error.
--
-- Es DATO SENSIBLE (la clave privada firma en nombre del cliente ante
-- ARCA), así que esta tabla queda con RLS activada y SIN ninguna
-- policy para anon/authenticated -- ni se lee ni se escribe desde el
-- navegador. Solo la leen/escriben las Netlify Functions arca-*.js,
-- que usan la service role key (bypassea RLS). El frontend solo ve un
-- resumen no sensible vía arca-estado-config.js (habilitado, modo,
-- punto de venta, condición de IVA) -- nunca certificado ni clave
-- privada.
-- ============================================================

create table edgy_gestion.clientes_arca_config (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null unique references edgy_gestion.clientes(id) on delete cascade,

  punto_venta integer not null,
  -- Condición de IVA del propio cliente (emisor) ante ARCA -- determina
  -- qué tipos de comprobante puede emitir (RI: A y B; Monotributo/
  -- Exento: solo C). Es la condición IVA del NEGOCIO, distinta de la
  -- condición IVA de cada cliente_venta (el destinatario de cada
  -- factura).
  condicion_iva text not null check (
    condicion_iva in ('responsable_inscripto', 'monotributista', 'exento')
  ),
  modo text not null default 'homologacion' check (modo in ('homologacion', 'produccion')),
  habilitado boolean not null default false,

  -- Certificado X.509 y clave privada en formato PEM, provistos por el
  -- propio cliente (WSASS para homologación, Administrador de
  -- Certificados Digitales de ARCA para producción). Nunca se exponen
  -- al frontend.
  certificado_pem text,
  clave_privada_pem text,

  -- Cache del Ticket de Acceso (TA) de WSAA -- dura 12hs, se reusa
  -- entre llamadas para no re-autenticar en cada comprobante.
  ta_token text,
  ta_sign text,
  ta_expiracion timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table edgy_gestion.clientes_arca_config enable row level security;
-- Sin policies a propósito -- ver comentario arriba.

select id, cliente_id, habilitado, modo from edgy_gestion.clientes_arca_config;
