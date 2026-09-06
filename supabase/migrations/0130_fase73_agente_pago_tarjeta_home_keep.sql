-- Fase 73 -- Etapa C: el agente de WhatsApp de Home Keep ahora pregunta
-- SIEMPRE la forma de pago (se sacó la detección automática por pedido
-- de Carlos, 06/09 -- "prefiero quitar la detección automática, si veo
-- que es muy trabado el método, lo volvemos a introducir"), y agrega
-- "tarjeta" como tercera opción (antes solo efectivo/cuenta_corriente).
-- Cuando es tarjeta, además pregunta CUÁL tarjeta (de las cargadas en
-- Perfil Familiar, Fase 72c) y si espera reintegro -- y registra un
-- consumo abierto en esa tarjeta (consumos_tarjeta_hogar, Fase 72) en
-- vez de un pago o una deuda con el proveedor.
--
-- Esto agrega dos pasos nuevos a la conversación de aclaración
-- (comprobantes_recibidos.pendiente_aclaracion), que hay que sumar al
-- CHECK existente. De paso se suma 'confirmar_recepcion_oc' -- estaba
-- en el código desde Fase 69b (agente-comprobante-resolver.js ya la
-- consulta y la escribe) pero nunca se agregó al CHECK constraint, así
-- que cualquier intento de dejarla marcada fallaba en silencio (el
-- error queda logueado por marcarPendiente() pero no interrumpe el
-- alta del comprobante) -- el flujo de "¿cerramos esta OC aunque no
-- cerró exacto?" quedaba roto de fábrica. Se corrige acá de paso.
--
-- NOTA (06/09): esta migración se aplicó directo a Supabase con
-- apply_migration -- se guarda acá también para que el repo local no
-- se siga desincronizando de la base real (ver aviso a Carlos: faltan
-- varias migraciones de Fase 71/72 que nunca se bajaron a este
-- directorio, quedaron solo aplicadas del lado del servidor).
alter table edgy_gestion.comprobantes_recibidos
  drop constraint if exists comprobantes_recibidos_pendiente_aclaracion_check;

alter table edgy_gestion.comprobantes_recibidos
  add constraint comprobantes_recibidos_pendiente_aclaracion_check
  check (pendiente_aclaracion is null or pendiente_aclaracion in (
    'forma_pago',
    'cuit',
    'confirmar_recepcion_oc',
    'cual_tarjeta',
    'reintegro_tarjeta'
  ));

comment on column edgy_gestion.comprobantes_recibidos.pendiente_aclaracion is
  'Qué le está preguntando el agente al admin por WhatsApp sobre este comprobante, a la espera de su próxima respuesta de texto: forma_pago (contado/cta cte/tarjeta), cuit (proveedor no identificado), confirmar_recepcion_oc (SI/NO cierre de OC que no cerró exacto, Fase 69b), cual_tarjeta (cuál tarjeta familiar, Fase 73), reintegro_tarjeta (monto/% de reintegro esperado en ese consumo, Fase 73). NULL = no hay nada pendiente de aclarar.';
