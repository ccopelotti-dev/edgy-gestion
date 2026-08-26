-- ============================================================
-- Migración 0098: Fase 50 -- Agente WhatsApp / automatización VPS
-- Edgy Gestión · schema edgy_gestion
--
-- Primera etapa del módulo que le permite a un agente externo (n8n +
-- WhatsApp corriendo en un VPS de Carlos, todavía por construir) operar
-- edgy-gestion vía HTTP: buscar productos, identificar/crear un
-- cliente por teléfono, cargar un pedido a su nombre, y guardar el
-- historial de la conversación.
--
-- Decisión de alcance (confirmada por Carlos, 26/08): el pedido creado
-- por el agente usa SIEMPRE un cliente identificado (clientes_venta
-- real, con su lista de precios si tiene una asignada) -- no el
-- circuito anónimo que ya usa el Menú Público
-- (crear_orden_venta_publica, ver 0036_retrofit_ordenes_venta_publico.sql).
--
-- El VPS/n8n todavía no existe (Carlos lo arma después, "una vez
-- concluida esta etapa") -- por eso acá se define el contrato que va a
-- tener que respetar, sin acoplarse al formato crudo de ninguna API de
-- WhatsApp en particular (Meta Cloud API y Baileys difieren bastante
-- entre sí). Los endpoints de esta fase esperan que quien les hable ya
-- les mande un JSON normalizado propio.
--
-- Both tablas nuevas quedan con RLS habilitado y CERO policies a
-- propósito -- todavía no hay ninguna pantalla en el panel que necesite
-- leerlas directo; todo el acceso es vía Netlify Functions con
-- supabaseAdmin (service_role, bypassea RLS). El día que se sume una
-- UI (ej. "ver conversación" o "generar API key" en Configuración),
-- ahí sí se agregan policies con el mismo criterio que
-- clientes_pago_config (es_personal_edgy() OR admin del propio cliente).
-- ============================================================

-- ─── 1) clientes_agente_config -- Capas 1 y 2 ──────────────────
-- Una fila por tenant: a qué número de WhatsApp del negocio hay que
-- atarle el tráfico entrante, y con qué API key el VPS se autentica
-- contra los endpoints /agente-*. No hay UI para generarla todavía --
-- se carga a mano (por SQL) cuando un cliente esté listo para probar,
-- mismo criterio que se usó para cargar credenciales de Point/Getnet
-- antes de tener pantalla propia.

create table if not exists edgy_gestion.clientes_agente_config (
  cliente_id uuid primary key references edgy_gestion.clientes(id) on delete cascade,
  numero_whatsapp_negocio text,
  api_key text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table edgy_gestion.clientes_agente_config enable row level security;

create index if not exists idx_clientes_agente_config_numero
  on edgy_gestion.clientes_agente_config (numero_whatsapp_negocio);

-- ─── 2) chat_messages -- Capa 4 ─────────────────────────────────
-- Historial de la conversación (entrante y saliente) por tenant +
-- número de teléfono del cliente. 'sender' distingue quién mandó cada
-- mensaje -- 'user' (el cliente final, por WhatsApp), 'assistant' (lo
-- que contestó la IA), 'system' (notas internas del propio flujo, ej.
-- "pedido #123 creado").

create table if not exists edgy_gestion.chat_messages (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references edgy_gestion.clientes(id) on delete cascade,
  phone_number text not null,
  sender text not null check (sender in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table edgy_gestion.chat_messages enable row level security;

create index if not exists idx_chat_messages_cliente_telefono
  on edgy_gestion.chat_messages (cliente_id, phone_number, created_at);

-- ─── 3) Índice de búsqueda de clientes_venta por teléfono ───────
-- clientes_venta.telefono ya existe -- lo único que faltaba era un
-- índice para que el lookup del agente (Capa 3, "identificar quién
-- está escribiendo") no haga table scan.

create index if not exists idx_clientes_venta_telefono
  on edgy_gestion.clientes_venta (cliente_id, telefono);

-- ─── Verificación ────────────────────────────────────────────

select table_name from information_schema.tables
where table_schema = 'edgy_gestion' and table_name in ('clientes_agente_config', 'chat_messages');
