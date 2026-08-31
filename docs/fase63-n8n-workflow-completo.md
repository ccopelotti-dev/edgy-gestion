# Workflow n8n "My workflow" — mapa completo de nodos y relaciones

Estado (30/08): workflow único (`FSc6MetDmgCH3Jqh`), activo, **64 nodos**, un solo webhook de entrada
(`https://n8n.edgysistemas.tech/webhook/whatsapp-entrante`) que atiende a **dos tenants** en paralelo
(La Charcutería y Punto Tex) más la extensión piloto de Fase 63 ("agente conversacional en Ventas")
sólo para Punto Tex. Este documento describe cada nodo, para qué sirve, con qué se conecta, y las
convenciones/trampas de n8n que hay que tener en cuenta para tocar cualquiera de estas ramas sin
romper nada.

## Cómo leer este documento

- Los nombres de nodo son exactamente los que aparecen en el canvas de n8n (con mayúsculas y tildes
  incluidas) — sirven para ubicarlos ahí directo.
- "Charcutería" y "Punto Tex" son ramas gemelas: casi todo lo que existe para un tenant tiene su
  equivalente para el otro, con el mismo nombre + sufijo `Punto Tex`. Donde no hay equivalente (la
  extensión de Fase 63) se aclara explícitamente.
- Los endpoints `https://panel.edgysistemas.tech/.netlify/functions/agente-*` son Netlify Functions
  del repo `edgy-gestion` (ver `docs/fase50-agente-whatsapp.md` para el diseño de capas original).
  Autenticación server-to-server vía header `X-Api-Key` (una key distinta por tenant).
- Los endpoints `https://evolution.edgysistemas.tech/...` son la instancia self-hosted de Evolution
  API (WhatsApp) — una "instancia" (`charcuteria` / `puntotex`) por tenant, cada una con su propio
  `apikey`.

## Convenciones y trampas de n8n (leer antes de editar cualquier nodo)

1. **Un nodo `httpRequest` DESCARTA por completo su input.** El `$json` que ve el nodo siguiente es
   *solo* la respuesta HTTP de ese nodo — nada de lo que traía el item antes de pasar por él. Cualquier
   nodo que necesite un dato de más atrás en la cadena (por ejemplo el teléfono del webhook original)
   tiene que pedirlo con la sintaxis explícita `$('Nombre del Nodo').item.json...`, nunca con `$json`
   a secas. Esta es la causa raíz de la mayoría de los bugs encontrados y corregidos en la sesión del
   30/08 (ver más abajo, sección "Bugs corregidos").
2. **Convención de `.data` como texto envuelto**: las Netlify Functions devuelven `JSON.stringify(...)`
   sin declarar `Content-Type: application/json`, así que el nodo `httpRequest` de n8n (en modo
   autodetectar) las trata como texto plano y las envuelve en `{ data: "<string>" }`. Todo nodo
   downstream que lea la respuesta de un `agente-*` tiene que hacer `JSON.parse($json.data)` o
   `JSON.parse($('Nodo').item.json.data)` — nunca leer campos directo de `$json`.
3. **Draft vs. publicado**: guardar cambios (`update_workflow` desde el lado de administración) crea
   una versión *draft* — no impacta el webhook productivo hasta publicarla explícitamente
   (`publish_workflow`).
4. **Un error dentro de la expresión de condición de un nodo `If` falla en silencio a la rama FALSE**,
   sin marcar el nodo como error ni cortar la ejecución — si un `If` "no anda" pero la ejecución
   figura `success`, sospechar primero de una referencia rota dentro de la condición.

## Entrada y ruteo (compartido por ambos tenants)

```
Webhook → Ruteo por instancia → [If Punto Tex | If]
```

- **Webhook** — `POST /whatsapp-entrante`. Único punto de entrada de todo el sistema; recibe el
  payload crudo de Evolution API para cualquiera de las dos instancias.
- **Ruteo por instancia** (`If`) — separa el tráfico según `$json.body.instance`. Rama TRUE
  (`instance === 'puntotex'`) → **If Punto Tex** (arranca la rama Punto Tex). Rama FALSE → **If**
  (arranca la rama Charcutería).
- **If** / **If Punto Tex** — filtran que el evento entrante sea `messages.upsert` (Evolution manda
  otros tipos de evento — status, presence, etc. — que hay que ignorar). Si no matchea, la ejecución
  simplemente no continúa por esa rama.

De acá en más las dos ramas son estructuralmente gemelas. Se documenta primero Charcutería completa
(la más simple, sin el piloto de Fase 63) y después Punto Tex con su extensión.

## Rama Charcutería

### Tramo 1 — historial + clasificación de tipo de mensaje

```
If → HTTP Request → Chequear Documento Enviado Charcuteria → Hay Envio Reciente Charcuteria
                                                                 ├─ (true)  → Armar Decisión Documento Charcuteria → Accion Charcuteria
                                                                 └─ (false) → Preparar prompt → Agente IA → Parsear Decisión IA Charcuteria → Accion Charcuteria
```

- **HTTP Request** → `POST agente-webhook`. Guarda el mensaje entrante en `chat_messages` y devuelve
  el historial reciente + `clienteId`/`telefono` resueltos.
- **Chequear Documento Enviado Charcuteria** → `POST agente-documento-check`. Pregunta si a ese
  teléfono se le mandó algún documento (Presupuesto, Comprobante, etc.) en los últimos días —
  devuelve `tieneEnvioReciente`, `documento {tipoDocumento, numeroDocumento}` y `numeroSupervisor`.
- **Hay Envio Reciente Charcuteria** (`If`) — si `tieneEnvioReciente === true`, asume que el cliente
  está respondiendo a ESE documento y lo escala directo a un humano sin pasarlo por la IA (rama
  **Armar Decisión Documento Charcuteria**, un nodo Code que arma un mensaje genérico de "en breve te
  contactamos" + motivo `documento_respondido`). Si no, sigue el camino normal de la IA
  (**Preparar prompt**).
- **Preparar prompt** (Code) — arma `mensajeParaAgente` = historial reciente (excluyendo el mensaje
  actual) + el mensaje actual del cliente, en texto plano legible para el LLM.
- **Agente IA** (`@n8n/n8n-nodes-langchain.agent`, modelo **Modelo Claude** = Claude Sonnet 5 vía
  credencial "Anthropic account", con la tool **Buscar Productos** → `agente-productos-buscar`) —
  system prompt fija el contrato de salida: JSON con `accion` (`responder`/`escalar`), `motivo`
  (`null`/`reclamo`/`descuento`/`producto_no_encontrado`) y `mensaje_cliente`. Instruido a no tomar
  pedidos ni definir condiciones comerciales por su cuenta.
- **Parsear Decisión IA Charcuteria** (Code) — parsea el JSON de salida de la IA con manejo de
  errores (si no es JSON válido o le falta `mensaje_cliente`, cae a una respuesta genérica de
  `responder`); valida que `motivo` sea uno de los 3 válidos si `accion === 'escalar'`.

### Tramo 2 — acción final

```
Accion Charcuteria
  ├─ (accion = escalar)  → Reenviar a Responsable Charcuteria → Guardar respuesta IA → Responder WhatsApp
  └─ (accion = responder)                                     → Guardar respuesta IA → Responder WhatsApp
```

- **Accion Charcuteria** (`If`) — separa según `$json.accion`.
- **Reenviar a Responsable Charcuteria** → `POST message/sendText/charcuteria` (Evolution). Arma el
  texto según `motivo` (documento respondido / reclamo / descuento / producto no encontrado / genérico)
  y lo manda al `numeroSupervisor` del tenant, citando el teléfono del cliente.
- **Guardar respuesta IA** → `POST agente-mensajes-guardar`. Persiste el mensaje del asistente en
  `chat_messages` (`sender: 'assistant'`).
- **Responder WhatsApp** → `POST message/sendText/charcuteria`. Manda `mensaje_cliente` al cliente
  real por WhatsApp — el paso que efectivamente cierra el ciclo.

### Tramo 3 — comprobantes de compra recibidos por imagen (rama administrativa)

```
Tipo mensaje Charcuteria
  ├─ (imageMessage) → Descargar Imagen Charcuteria → Extraer Datos Comprobante Charcuteria → Parsear Extracción Charcuteria → Guardar Comprobante Charcuteria → Responder WhatsApp Admin Charcuteria
  └─ (otro tipo)     → Resolver Aclaración Comprobante Charcuteria → ¿Hubo Pendiente Charcuteria?
                                                                        ├─ (true)  → Responder Aclaración Comprobante Charcuteria
                                                                        └─ (false) → HTTP Request  (vuelve al Tramo 1, camino normal)
```

- **Tipo mensaje Charcuteria** (`If`) — separa por `body.data.messageType === 'imageMessage'`.
- **Descargar Imagen Charcuteria** → `POST chat/getBase64FromMediaMessage/charcuteria` (Evolution).
  Baja la imagen adjunta en base64.
- **Extraer Datos Comprobante Charcuteria** → llamada directa a `api.anthropic.com/v1/messages`
  (Claude Sonnet 5, con la imagen como input) pidiendo un JSON estructurado de factura/comprobante
  (proveedor, CUIT, ítems, IVA, total, forma de pago detectada).
- **Parsear Extracción Charcuteria** (Code) — parsea el bloque de texto de la respuesta de Claude a
  JSON (`datosExtraidos`), con fallback a `null` si falla.
- **Guardar Comprobante Charcuteria** → `POST agente-comprobante-recibir`. Persiste el comprobante +
  intenta cargarlo directo en Compras si hay suficiente información.
- **Responder WhatsApp Admin Charcuteria** → `POST message/sendText/charcuteria`. Le confirma al
  remitente qué pasó (cargado en Compras / falta forma de pago / proveedor no identificado / genérico
  "lo vamos a revisar"), o le avisa que el número no está autorizado para mandar documentación
  administrativa.
- **Resolver Aclaración Comprobante Charcuteria** → `POST agente-comprobante-resolver`. Cuando el
  mensaje NO es una imagen, chequea si había un comprobante pendiente de aclaración (típicamente
  "¿fue contado o cuenta corriente?") y si el texto actual la resuelve.
- **¿Hubo Pendiente Charcuteria?** (`If`) — si había una aclaración pendiente y se resolvió, responde
  por esa rama (**Responder Aclaración Comprobante Charcuteria**, confirma si quedó cargado o si no
  se entendió la respuesta); si no había nada pendiente, la ejecución sigue como un mensaje de texto
  normal, re-entrando al Tramo 1 por **HTTP Request**.

## Rama Punto Tex

Mismo esqueleto que Charcutería (Tramos 1, 2 y 3 tienen equivalente 1:1 con sufijo `Punto Tex`), más
la extensión de **Fase 63** intercalada en el Tramo 1, entre el chequeo de documento enviado y la
decisión de armar el prompt para la IA.

### Tramo 1 — historial + clasificación (con la extensión de Fase 63)

```
If Punto Tex → Tipo mensaje Punto Tex → [imagen: Tramo 3] / [texto: Resolver Aclaración... → ... → HTTP Request Punto Tex]

HTTP Request Punto Tex → Chequear Documento Enviado Punto Tex → Detectar Comando Supervisor Punto Tex → Es Comando Supervisor Punto Tex
  ├─ (es comando)     → Despausar por Comando Punto Tex → Responder Comando Supervisor Punto Tex   [FIN de esta rama]
  └─ (no es comando)  → Está Pausado Punto Tex
                           ├─ (pausado, rama TRUE)  → (sin salida — null; corta la ejecución, el agente no responde)
                           └─ (no pausado)           → Hay Envio Reciente Punto Tex
                                                          ├─ (true)  → Es Presupuesto Punto Tex
                                                          │              ├─ (es Presupuesto)     → Preparar Prompt Clasificación Presupuesto Punto Tex → Clasificar Respuesta Presupuesto Punto Tex → Parsear Clasificación Presupuesto Punto Tex → Es Confirmación Clara Punto Tex → ...
                                                          │              └─ (no es Presupuesto)   → Armar Decisión Documento Punto Tex → Accion Punto Tex
                                                          └─ (false) → Preparar prompt Punto Tex → Agente IA Punto Tex → Parsear Decisión IA Punto Tex → Accion Punto Tex
```

- **HTTP Request Punto Tex** → `POST agente-webhook` (misma función que en Charcutería, key de Punto
  Tex). *(Bug pre-existente corregido el 30/08: usaba `$json.body...` en vez de
  `$('Webhook').item.json.body...` — chronic, afectaba a toda la rama desde antes de Fase 63.)*
- **Chequear Documento Enviado Punto Tex** → `POST agente-documento-check`. Igual que su par de
  Charcutería.
- **Detectar Comando Supervisor Punto Tex** (Code, nuevo en Fase 63) — mira si el remitente es el
  número del supervisor (`numeroSupervisor` de `agente-documento-check`) y si el texto del mensaje es
  un comando reconocido (típicamente algo como `CONTINUAR-<código>`), devolviendo `esComandoSupervisor`.
- **Es Comando Supervisor Punto Tex** (`If`) — si es un comando válido del supervisor, va a
  **Despausar por Comando Punto Tex** (`POST agente-conversacion-despausar`, saca la pausa manual de
  esa conversación) → **Responder Comando Supervisor Punto Tex** (confirma por WhatsApp al supervisor
  que la conversación quedó despausada) y termina ahí — no llega a la IA en esa misma ejecución.
- **Está Pausado Punto Tex** (`If`, nuevo en Fase 63) — si la conversación está pausada (por ejemplo
  porque el cliente rechazó un Presupuesto, ver más abajo), la rama TRUE no tiene salida conectada
  (`null`): la ejecución corta ahí y el agente no le contesta nada al cliente mientras espera
  intervención humana. La rama FALSE sigue al camino normal (**Hay Envio Reciente Punto Tex**).
- **Hay Envio Reciente Punto Tex** (`If`) — igual criterio que en Charcutería, pero con una bifurcación
  extra: si hay envío reciente, en vez de escalar directo revisa primero si ese documento es
  específicamente un **Presupuesto** (**Es Presupuesto Punto Tex**), porque a los Presupuestos se les
  aplica el flujo conversacional de Fase 63 en lugar del escalamiento genérico. *(Bug introducido por
  la propia inserción de los nodos de Fase 63 y corregido el 30/08: usaba `$json.data` en vez de
  `$('Chequear Documento Enviado Punto Tex').item.json.data` — dejó de funcionar al dejar de ser el
  nodo inmediatamente anterior.)*
- **Es Presupuesto Punto Tex** (`If`, nuevo en Fase 63) — chequea
  `documento.tipoDocumento === 'presupuesto'`. Si NO es un Presupuesto, sigue el escalamiento genérico
  de siempre (**Armar Decisión Documento Punto Tex** → **Accion Punto Tex**, idéntico al patrón de
  Charcutería). Si SÍ es un Presupuesto, entra a la sub-rama de clasificación conversacional.
- **Preparar prompt Punto Tex** / **Agente IA Punto Tex** / **Parsear Decisión IA Punto Tex** —
  equivalentes exactos de sus pares Charcutería (mismo system prompt adaptado a "cortinas y textiles").
  *(Bug pre-existente corregido el 30/08 en el nodo que sigue a este tramo, ver Tramo 2.)*

### Fase 63 — sub-rama "agente conversacional en Ventas" (solo Presupuestos, solo Punto Tex)

```
Preparar Prompt Clasificación Presupuesto Punto Tex → Clasificar Respuesta Presupuesto Punto Tex → Parsear Clasificación Presupuesto Punto Tex → Es Confirmación Clara Punto Tex
  ├─ (confirmacion_clara) → Aprobar Presupuesto Punto Tex → Armar Decisión Confirmación Punto Tex → Accion Punto Tex
  └─ (no clara)           → Es Rechazo Punto Tex
                               ├─ (rechazo)  → Armar Decisión Rechazo Punto Tex → Accion Punto Tex
                               │              → Pausar Conversación Punto Tex → Armar Decisión Pausa Punto Tex → Accion Punto Tex
                               └─ (ambiguo)  → (mismo Armar Decisión Rechazo/escalamiento genérico vía Accion Punto Tex)
```

Objetivo del piloto: cuando un cliente le contesta por WhatsApp a un Presupuesto que se le mandó, en
vez de escalar automáticamente TODO a un humano, un segundo paso de IA clasifica la respuesta en 3
escenarios y actúa en consecuencia — solo lo ambiguo sigue yendo a una persona.

- **Preparar Prompt Clasificación Presupuesto Punto Tex** (Code) — arma el contexto para el
  clasificador: `numeroDocumento` (del chequeo de documento enviado), `mensajeCliente` (el último
  mensaje, tal cual llegó) y `historialTexto` (hasta 6 mensajes previos, excluyendo el actual) —
  agregado el 30/08 a pedido de Carlos para que el clasificador pueda interpretar confirmaciones que
  llegan repartidas en varios mensajes cortos (ej. "Gracias que rápido, lo miro y te digo" ... "Si"
  ... "Hacelo!!") en vez de juzgar el último mensaje aislado.
- **Clasificar Respuesta Presupuesto Punto Tex** (httpRequest directo a `api.anthropic.com/v1/messages`,
  Claude Sonnet 5) — clasifica el ÚLTIMO mensaje, a la luz del historial, en una de 3 categorías:
  `confirmacion_clara` (confirma sin condiciones nuevas), `ambiguo` (positivo pero con una condición,
  pregunta o pedido nuevo — o simplemente no queda claro), `rechazo` (rechaza explícitamente). Ante la
  duda entre `confirmacion_clara` y `ambiguo`, el prompt indica explícitamente preferir `ambiguo` (más
  seguro que lo revise una persona). Devuelve `{"escenario": ..., "razon": ...}`.
- **Parsear Clasificación Presupuesto Punto Tex** (Code) — parsea esa respuesta a JSON.
- **Es Confirmación Clara Punto Tex** (`If`) — rama TRUE si `escenario === 'confirmacion_clara'`.
  - **Aprobar Presupuesto Punto Tex** → `POST agente-presupuesto-aprobar`. Ejecuta la MISMA acción de
    negocio que el botón humano "Aprobar y crear Orden": llama a la función SQL
    `aprobar_presupuesto_agente` (migración 0111), que crea la Orden de venta a partir del Presupuesto
    y lo deja en estado `aprobado`. Devuelve el total (neto) más, desde el fix del 30/08, `totalConIva`
    ya calculado para que el mensaje al cliente y al supervisor muestren el mismo número que el cliente
    vio en el PDF del Presupuesto (con IVA), no el neto interno.
  - **Armar Decisión Confirmación Punto Tex** (Code) — arma el mensaje final para **Accion Punto Tex**
    a partir de la respuesta de `agente-presupuesto-aprobar` (agradecimiento al cliente + número de
    Orden generada, más el mensaje para el supervisor).
  - Rama FALSE → **Es Rechazo Punto Tex**.
- **Es Rechazo Punto Tex** (`If`) — rama TRUE si `escenario === 'rechazo'`.
  - **Armar Decisión Rechazo Punto Tex** (Code) — arma el escalamiento a supervisor con motivo
    "documento_respondido"/rechazo explícito.
  - **Pausar Conversación Punto Tex** → `POST agente-conversacion-pausar`. Marca esa conversación como
    pausada (para que **Está Pausado Punto Tex**, más arriba en el flujo, corte futuras respuestas
    automáticas del agente hasta que un supervisor humano la despause con el comando
    `CONTINUAR-<código>`).
  - **Armar Decisión Pausa Punto Tex** (Code) — arma el mensaje de confirmación de la pausa.
  - Rama FALSE (`ambiguo`) → mismo camino de escalamiento genérico vía **Accion Punto Tex**.

Los tres caminos de esta sub-rama (confirmación, rechazo, ambiguo) convergen todos de vuelta en el
**Accion Punto Tex** compartido, así que de ahí en más siguen el Tramo 2 normal.

### Tramo 2 — acción final (Punto Tex)

```
Accion Punto Tex
  ├─ (accion = escalar)  → Reenviar a Responsable Punto Tex → Guardar respuesta IA Punto Tex → Responder WhatsApp Punto Tex
  └─ (accion = responder)                                   → Guardar respuesta IA Punto Tex → Responder WhatsApp Punto Tex
```

- **Reenviar a Responsable Punto Tex** → `POST message/sendText/puntotex`. Igual criterio que en
  Charcutería, con una diferencia de Fase 63: si el item trae `mensajeSupervisor` ya armado (viene de
  las decisiones de confirmación/rechazo/pausa), lo usa tal cual en vez de reconstruir el texto según
  `motivo`.
- **Guardar respuesta IA Punto Tex** → `POST agente-mensajes-guardar`. *(Bug pre-existente corregido el
  30/08: leía `$json.mensaje_cliente` en vez de `$('Accion Punto Tex').item.json.mensaje_cliente` —
  afectaba ambas ramas de `Accion Punto Tex`.)*
- **Responder WhatsApp Punto Tex** → `POST message/sendText/puntotex`. El nodo que efectivamente le
  manda el mensaje final al cliente real. *(Mismo bug que el anterior, corregido el 30/08 — antes de
  esto es probable que este nodo NUNCA le haya mandado un mensaje exitosamente a un cliente real.)*

### Tramo 3 — comprobantes de compra por imagen (Punto Tex)

Equivalente 1:1 al Tramo 3 de Charcutería: **Tipo mensaje Punto Tex** → **Descargar Imagen Punto Tex**
→ **Extraer Datos Comprobante Punto Tex** → **Parsear Extracción Punto Tex** → **Guardar Comprobante
Punto Tex** → **Responder WhatsApp Admin Punto Tex**; y en paralelo **Resolver Aclaración Comprobante
Punto Tex** → **¿Hubo Pendiente Punto Tex?** → **Responder Aclaración Comprobante Punto Tex** / vuelta
a **HTTP Request Punto Tex**.

## Bugs corregidos en la sesión del 30/08 (referencia rápida)

| Nodo | Tipo de bug | Causa |
|---|---|---|
| HTTP Request Punto Tex | Pre-existente, crónico (anterior a Fase 63) | `$json.body...` en vez de `$('Webhook').item.json.body...` |
| Hay Envio Reciente Punto Tex | Introducido por Fase 63 | `$json.data` en vez de `$('Chequear Documento Enviado Punto Tex').item.json.data` — dejó de ser el nodo inmediato anterior al insertar los 3 nodos de pausa/comando |
| Guardar respuesta IA Punto Tex | Pre-existente, afectaba ambas ramas | `$json.mensaje_cliente` en vez de `$('Accion Punto Tex').item.json.mensaje_cliente` |
| Responder WhatsApp Punto Tex | Pre-existente, probablemente nunca funcionó | Mismo patrón que el anterior — este es el nodo que manda el mensaje real al cliente |
| Responder WhatsApp (Charcutería) | Corregido por paridad | Mismo patrón, ajustado a `$('Accion Charcuteria')` |

A nivel de Postgres (no n8n): las funciones SECURITY DEFINER `aprobar_presupuesto_agente` y
`crear_orden_venta_agente` tenían `revoke all from public` pero les faltaba el `grant execute ... to
service_role` — sin eso, PostgREST/Postgres no otorga EXECUTE a ningún rol por default. Corregido vía
migración `0112_fix_grant_execute_funciones_agente`.

## Riesgo abierto / pendiente de verificar

El nodo **HTTP Request** de Charcutería (par de "HTTP Request Punto Tex") todavía usa `$json.body...`
sin la referencia explícita `$('Webhook')`. No se confirmó si esto es un bug real ahí también —
Charcutería no fue testeada en vivo esta sesión y Carlos no reportó problemas — pero el patrón es
idéntico al que causaba el bug crónico del lado Punto Tex. Recomendado: aplicar la misma corrección
por paridad la próxima vez que se toque esa rama, o testear un mensaje real de Charcutería para
confirmar si hoy funciona o no.
