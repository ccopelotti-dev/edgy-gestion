-- Fase 75m (11/09): un tenant puede necesitar MÁS DE UN canal de
-- WhatsApp de salida -- hasta ahora `clientes_agente_config` asumía
-- uno solo por tenant (cliente_id es su PK). Rúa/Punto Tex ya tiene su
-- canal de Ventas (instancia Evolution "puntotex", número del
-- negocio) y ahora necesita uno SEPARADO para Acadeu/Home Keep
-- (instancia "homekeep", chip nuevo comprado a propósito -- decisión
-- de Carlos del 09/09: "más limpio" que reusar el de Ventas).
--
-- En vez de forzar esto en clientes_agente_config (rompería su PK) se
-- crea una tabla chica de canales adicionales, con un slug libre
-- ('home_keep' por ahora, deja lugar a futuros canales sin migración
-- nueva). Mismo criterio de seguridad que el resto de las tablas del
-- agente: RLS habilitado, cero policies -- solo se toca con
-- service_role desde las Netlify Functions.

create table if not exists edgy_gestion.clientes_agente_canales (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references edgy_gestion.clientes(id),
  canal text not null,
  evolution_instance_nombre text not null,
  evolution_instance_apikey text not null,
  -- Número del adulto que recibe TODO lo que detecta este canal,
  -- además del destinatario específico de cada novedad (ver
  -- acadeu-sincronizar.js) -- durante la prueba, Carlos.
  numero_adulto text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cliente_id, canal)
);

alter table edgy_gestion.clientes_agente_canales enable row level security;

-- OJO: Home Keep/Acadeu corre bajo el tenant de La Charcutería
-- (4dc63cde-f1f9-4f73-9ea8-d46a77c4825b) -- es el cliente_id real que
-- resuelve la api_key que reutiliza el workflow n8n de Acadeu (Fase
-- 75l), NO el de Punto Tex/Rúa (9f4bb295-...) aunque el apellido de la
-- familia coincida con el de Rúa -- confundir esto rompe silenciosamente
-- el sincronizador (guarda/lee un canal que nadie consulta).
insert into edgy_gestion.clientes_agente_canales
  (cliente_id, canal, evolution_instance_nombre, evolution_instance_apikey, numero_adulto, activo)
values
  ('4dc63cde-f1f9-4f73-9ea8-d46a77c4825b', 'home_keep', 'homekeep', 'A5A05C3FEB43-4509-B18D-CF378B7EB44E', '2954464634', true)
on conflict (cliente_id, canal) do update set
  evolution_instance_nombre = excluded.evolution_instance_nombre,
  evolution_instance_apikey = excluded.evolution_instance_apikey,
  numero_adulto = excluded.numero_adulto,
  activo = excluded.activo;
