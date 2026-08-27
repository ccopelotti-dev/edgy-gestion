# Fase 50 — Agente WhatsApp / Automatización vía VPS

Estado (27/08): **en producción para La Charcutería** (Ventas, "solo consultas", workflow de n8n ya publicado). Sumando **Punto Tex** como segundo tenant y la rama administrativa (whitelist + documentos recibidos, Fase 50c) -- ver sección "Estado" más abajo.

## Idea original (esquema de Carlos, 26/08)

Un agente de IA corriendo en un VPS (orquestado con n8n) opera edgy-gestion por HTTP, en 4 capas:

1. **Capa 1 — Portal**: recepción y ruteo de mensajes de WhatsApp entrantes, multi-tenant.
2. **Capa 2 — Auth server-to-server**: el VPS se autentica contra edgy-gestion sin sesión de usuario.
3. **Capa 3 — Herramientas de negocio**: function-calling endpoints (buscar productos, crear pedido, buscar cliente).
4. **Capa 4 — Memoria**: persistencia de los mensajes de la conversación.

## Decisiones confirmadas por Carlos

- El pedido que crea el agente usa siempre un **cliente identificado** (`clientes_venta` real), no el circuito anónimo del Menú Público.
- El VPS/n8n ya existe y está en producción para La Charcutería (Evolution API + n8n, self-hosted). Los endpoints siguen sin parsear ningún formato crudo de WhatsApp (ni Meta Cloud API ni Baileys) — esperan JSON ya normalizado, y es el workflow de n8n el que traduce el payload de Evolution a ese contrato.
- **Pendiente de confirmar**: si un mismo número de WhatsApp puede atender a varios negocios de Carlos a la vez, o si cada negocio tiene su propio número. El diseño actual asume **un número por tenant** (columna única `numero_whatsapp_negocio` en `clientes_agente_config`) — ajustar si la respuesta es otra.

## Esquema de datos (migraciones 0098 y 0099, aplicadas en Supabase)

- `edgy_gestion.clientes_agente_config` — una fila por tenant: `cliente_id` (PK/FK), `numero_whatsapp_negocio`, `api_key` (unique), `activo`. Sin UI todavía — se carga a mano por SQL cuando un cliente esté listo para probar.
- `edgy_gestion.chat_messages` — historial de conversación: `cliente_id`, `phone_number`, `sender` (`user`/`assistant`/`system`), `content`, `created_at`.
- Índice `idx_clientes_venta_telefono` sobre `clientes_venta (cliente_id, telefono)` para que el lookup del agente no haga table scan.
- Ambas tablas nuevas: RLS habilitado, **cero policies** — acceso solo vía `service_role` desde las Netlify Functions. El día que haya una pantalla en el panel (ej. "ver conversación" o "generar API key"), ahí se agregan policies con el mismo criterio que `clientes_pago_config`.
- Función SQL `edgy_gestion.crear_orden_venta_agente(...)` — motor atómico de creación de pedidos (mismo patrón que `crear_orden_venta_publica` del Menú Público), pero resuelve/crea el cliente por teléfono y usa la lista de precios de su categoría. **No** se otorga a `anon`/`authenticated` — solo ejecutable vía `service_role`, porque recibe `cliente_id` directo (si fuera pública, cualquiera podría crear pedidos en cuentas ajenas).

## Auth (Capa 2)

Todos los endpoints `/agente-*` (menos ninguno — todos la requieren) validan el header `X-Api-Key` contra `clientes_agente_config.api_key`, vía el helper compartido `netlify/functions/_lib/agenteAuth.js`. Devuelve `{ clienteId }` si la key es válida y el tenant está activo, o `null` (→ 401) si no.

## Contrato de cada endpoint

Base: `https://<sitio>.netlify.app/.netlify/functions/<nombre>`
Header obligatorio en todos: `X-Api-Key: <api key del tenant>`

### `agente-webhook` (Capa 1)

```
POST /agente-webhook
Body:  { "telefono": "5491122334455", "mensaje": "texto del cliente" }
```

Guarda el mensaje entrante (`sender: 'user'`) en `chat_messages` y devuelve el historial reciente (20 mensajes, orden cronológico) para que el orquestador tenga contexto antes de decidir qué hacer.

```
200 → { ok: true, clienteId, telefono, historial: [{ sender, content, created_at }, ...] }
```

### `agente-productos-buscar` (Capa 3)

```
POST /agente-productos-buscar
Body:  { "q": "texto a buscar" }
```

Busca en `productos` (ilike nombre, `disponible=true`, `estado='activo'`), máximo 15 resultados.

```
200 → { ok: true, productos: [{ id, nombre, descripcion, precio }, ...] }
```

No devuelve stock puntual por local (Fase 27e) — solo el flag `disponible`, igual que el Menú Público.

### `agente-clientes-lookup` (Capa 3)

```
POST /agente-clientes-lookup
Body:  { "telefono": "5491122334455" }
```

Busca un `clientes_venta` existente por teléfono dentro del tenant. **No crea** el cliente — eso lo hace `agente-ordenes-crear` recién cuando hay un pedido real que cargarle.

```
200 → { ok: true, encontrado: false }
200 → { ok: true, encontrado: true, cliente: { id, nombre, email?, direccion?, saldoCuentaCorriente, limiteCredito } }
```

### `agente-ordenes-crear` (Capa 3)

```
POST /agente-ordenes-crear
Body:  {
  "telefono": "5491122334455",
  "nombre": "Juana Pérez",              // opcional, solo si hay que dar de alta al cliente
  "canalCumplimiento": "retiro",         // "retiro" | "delivery"
  "direccion": "Av. Siempreviva 742",    // requerida siempre
  "notas": "sin cebolla",                // opcional
  "items": [ { "productoId": "<uuid>", "cantidad": 2 } ]
}
```

Identifica o crea el `clientes_venta` por teléfono (con valores por defecto si es alta nueva: `tipo_documento='otro'`, `documento`=el teléfono, `condicion_iva='consumidor_final'`), resuelve precio por la lista de la categoría del cliente (o `precio_venta` si no tiene categoría), crea `ordenes_venta` + `orden_venta_items` + `pedidos_delivery`, y deja una nota `system` en `chat_messages`.

```
200 → { ok: true, ordenId, numero, total, clienteVentaId, clienteCreado }
400 → { ok: false, error: "..." }   // ej. producto ya no disponible, cantidad inválida, falta dirección
```

### `agente-mensajes-guardar` (Capa 4)

```
POST /agente-mensajes-guardar
Body:  { "telefono": "5491122334455", "mensaje": "texto", "sender": "assistant" }
```

Guarda lo que contestó la IA (o una nota interna del flujo). `sender` acepta `assistant` o `system` — `user` se rechaza a propósito (ya lo cubre `agente-webhook`).

```
200 → { ok: true }
```

### `agente-mensajes-historial` (Capa 4)

```
POST /agente-mensajes-historial
Body:  { "telefono": "5491122334455", "limite": 20 }   // limite opcional, default 20, tope 100
```

Para reconsultar el historial sin mandar un mensaje nuevo (ej. retomar contexto tras un timeout).

```
200 → { ok: true, telefono, historial: [{ sender, content, created_at }, ...] }
```

### `agente-comprobante-recibir` (Capa 3, rama administrativa -- Fase 50c, 27/08)

Segunda rama del agente, en paralelo a la de Ventas: un subconjunto de números por tenant ("Números que pueden enviarle doc. administrativa") puede mandar facturas/remitos como foto. El endpoint valida la whitelist (`clientes_agente_admins`) antes de aceptar el documento.

```
POST /agente-comprobante-recibir
Body:  {
  "telefono": "5492954610221",     // quién mandó la imagen
  "imagenBase64": "iVBORw0KG...",  // base64 crudo (sin el prefijo data:...;base64,),
                                    // tal cual lo devuelve Evolution API en
                                    // /chat/getBase64FromMediaMessage/{instance}
  "mimeType": "image/jpeg",        // opcional, default image/jpeg
  "tipo": "factura",               // opcional, texto libre
  "datosExtraidos": { ... },       // opcional -- lo que haya extraído Claude Vision
  "notas": "..."                   // opcional
}
```

El upload a Supabase Storage lo hace el endpoint (con `service_role`), no n8n -- así el workflow nunca necesita la service_role key, solo la `X-Api-Key` del tenant. Reutiliza el bucket privado `comprobantes-gastos` (mismo criterio que `comprobantesGastos.ts`): se guarda el **path** en `comprobantes_recibidos.imagen_url`, no una URL pública -- para verla hay que generar un `createSignedUrl` al momento (todavía no hay UI para esto, es la bandeja de entrada cruda).

Si el teléfono NO está en la whitelist del tenant, no se sube la imagen (se descarta) pero igual se guarda el registro (con `estado: 'rechazado_no_autorizado'`, sin `admin_id` ni imagen) para que quede rastro de quién intentó mandar algo sin estar autorizado -- y se devuelve `autorizado: false` para que n8n decida qué contestarle.

```
200 → { ok: true, autorizado, remitenteNombre, comprobanteId, estado }
```

Todavía NO carga nada automático en Compras (comprobantes, stock, etc.) ni corre extracción con Claude Vision -- es solo una bandeja de entrada (con la imagen ya guardada) para revisión humana. El perfilado en detalle del agente administrativo (extracción automática, a quién avisa, etc.) es una etapa siguiente, a propósito.

## Archivos

```
supabase/migrations/0098_fase50_agente_whatsapp.sql
supabase/migrations/0099_fase50_crear_orden_venta_agente.sql
supabase/migrations/0100_fase50c_agente_administrativo.sql
netlify/functions/_lib/agenteAuth.js
netlify/functions/agente-webhook.js
netlify/functions/agente-productos-buscar.js
netlify/functions/agente-clientes-lookup.js
netlify/functions/agente-ordenes-crear.js
netlify/functions/agente-mensajes-guardar.js
netlify/functions/agente-mensajes-historial.js
netlify/functions/agente-comprobante-recibir.js
```

Todos verificados con `node --check`. Migraciones aplicadas en el proyecto Supabase `ipnufyqwbjbocsezdkiw` (schema `edgy_gestion`).

## Estado (27/08)

El VPS/n8n del lado de Carlos ya existe y está en producción con **dos tenants activos en simultáneo** sobre el mismo workflow (`My workflow`, `FSc6MetDmgCH3Jqh`), ambos con Evolution API instances propias:

- **La Charcutería** — instancia Evolution `charcuteria`, número dueño `5492954367009`. Ventas "solo consultas".
- **Punto Tex** — instancia Evolution `puntotex`, número dueño `2954610221`, vinculada el 27/08. Ventas "solo consultas" (cortinas/textiles).

**Bug encontrado y corregido (27/08):** el webhook único de n8n (`WEBHOOK_GLOBAL_URL`, compartido por todas las instancias de Evolution en el `.env` del VPS) recibía los mensajes de ambos números, pero el workflow no distinguía de qué instancia venían -- siempre corría el pipeline de Charcutería (API key, prompt del agente y número de respuesta hardcodeados). Resultado: un "Hola" a Punto Tex contestaba como si fuera Charcutería. Se agregó un nodo `Ruteo por instancia` justo después del `Webhook`, que lee `$json.body.instance` y separa en dos ramas totalmente independientes (API key, prompt del agente, tool de búsqueda de productos y el nodo de respuesta -- cada uno apuntando a la instancia de Evolution correcta). Probado de punta a punta con una ejecución manual simulando un mensaje entrante de `puntotex` -- respondió correctamente como Punto Tex y por el número correcto. Publicado en producción.

La rama administrativa de Punto Tex (whitelist + documentos recibidos, Fase 50c) ya tiene workflow de n8n armado y publicado (dentro de `My workflow`, branch por `data.messageType` debajo de `If Punto Tex`): un mensaje tipo `imageMessage` de uno de los 3 números whitelisteados dispara `Descargar Imagen Punto Tex` (Evolution `getBase64FromMediaMessage`) → `Guardar Comprobante Punto Tex` (`agente-comprobante-recibir`, que valida whitelist y sube la imagen a Storage) → `Responder WhatsApp Admin Punto Tex` (confirma o avisa que el número no está autorizado). Todavía sin probar con una foto real (`getBase64FromMediaMessage` necesita un mensaje real en la base de Evolution, no se puede simular a mano) -- ver próximos pasos.

## Próximos pasos

1. Probar la rama administrativa con una foto real: que uno de los 3 números whitelisteados de Punto Tex mande una foto de un comprobante y revisar la ejecución en n8n (`My workflow`) por si el contrato real de `getBase64FromMediaMessage` no calza 1:1 con lo asumido (`{ base64, mimetype }`).
2. Una vez estable: extracción automática de datos con Claude Vision (`datosExtraidos`) y, más adelante, alta automática en Compras a partir del comprobante revisado -- a propósito fuera de esta primera vuelta.
3. Confirmar si el número dueño de La Charcutería (`numero_whatsapp_negocio` en `clientes_agente_config`) debería completarse -- hoy está `null` para ese tenant.
4. Eventualmente: UI en el panel para generar/rotar API keys, gestionar la whitelist y ver la conversación/bandeja de documentos (ahí sí se agregan policies RLS).
