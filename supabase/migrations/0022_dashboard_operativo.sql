-- ============================================================
-- Migración 0022: Dashboard operativo por rol
-- Edgy Gestión · schema edgy_gestion
--
-- Hasta ahora `roles.es_admin` solo controlaba permisos de gestión de
-- roles/equipo (ver 0003_consolidado_v2_a_v8.sql, es_admin_cliente()).
-- Esta migración agrega un campo separado, `vista`, que decide qué
-- pantalla de /dashboard ve cada usuario al entrar: el resumen
-- ejecutivo (caja/bancos/ventas) para roles administrativos, o un
-- panel de accesos operativos (mesas, comandas, delivery, etc. según
-- el rubro) para roles operativos (Mozo, Cocina, Cajero, Delivery...).
--
-- Se separa de es_admin a propósito: son dos preguntas distintas
-- ("¿puede administrar roles/equipo?" vs "¿qué dashboard ve al
-- entrar?"). Hoy coinciden 1 a 1 (backfill por es_admin, decisión
-- acordada con el usuario), pero no tienen por qué seguir coincidiendo
-- siempre -- por eso es un campo aparte y no una derivación en el
-- frontend.
-- ============================================================

alter table edgy_gestion.roles
  add column if not exists vista text not null default 'operativo'
    check (vista in ('administrativo', 'operativo'));

-- Backfill de roles ya existentes (ej. los de La Charcutería Express):
-- es_admin=true -> administrativo, el resto -> operativo. Ya es el
-- default de la columna, pero se deja el update explícito para que el
-- criterio quede documentado y sea idempotente si se corre de nuevo.
update edgy_gestion.roles
set vista = case when es_admin then 'administrativo' else 'operativo' end;
