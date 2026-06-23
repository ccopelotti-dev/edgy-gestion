# Edgy Gestión — Dashboard

Shell del sistema de gestión modular de Edgy Sistemas. Es un solo código que
sirve a todos los clientes: cada cliente es una fila en la tabla `clientes`
de Supabase, y el sidebar + las rutas se arman solos según qué módulos tenga
activos (`cliente_modulos`).

## Estructura

```
src/
  components/        Layout, Sidebar, componentes de UI base (button, input, card, switch)
  hooks/             useClienteActual — trae el cliente logueado y sus módulos activos
  lib/               cliente de Supabase + utilidades
  modules/           un módulo por carpeta (ver más abajo)
    registry.ts      mapea slug -> componente, con lazy() para code-splitting
    tesoreria/       placeholder a reemplazar por el código real del VPS
  pages/
    DashboardHome.tsx
    ModuloRoute.tsx  resuelve /m/:slug contra el registro de módulos
    onboarding/      los 4 pasos del wizard "nuevo proyecto"
supabase/
  migrations/0001_init.sql   esquema completo + políticas RLS
```

## Cómo correrlo

Este proyecto guarda todo en un schema propio de Postgres, `edgy_gestion`, en vez
de `public`. Así podés alojarlo en un proyecto de Supabase que ya tenga otra
app corriendo (por ejemplo el Edgy Trading Hub) sin que las tablas se mezclen.

```bash
npm install
cp .env.example .env   # completar con tu URL y anon key de Supabase
npm run dev
```

Antes de levantarlo:

1. Correr la migración: pegar `supabase/migrations/0001_init.sql` completo en
   el SQL editor del proyecto de Supabase que vayas a usar, y ejecutarlo.
2. **Exponer el schema en la API** — sin este paso, Supabase devuelve error
   porque por default solo expone `public`. En el dashboard de Supabase:
   `Project Settings → API → Exposed schemas` → agregar `edgy_gestion` a la
   lista → guardar.

Sin estos dos pasos el dashboard carga pero no puede leer ni escribir nada.

## Cómo migrar el módulo Tesorería que ya corre en el VPS

El código de Tesorería no está acá — vive en `/root/edgy-gestion` en el VPS.
Para sumarlo a este dashboard:

1. Copiá esa carpeta dentro de `src/modules/tesoreria/`, reemplazando el
   placeholder (`index.tsx` tiene el detalle de qué ajustar).
2. Cambiá las importaciones internas para que usen `@/lib/supabase` en vez
   de un cliente propio — así Tesorería comparte la misma sesión y el mismo
   `cliente_id` que el resto del dashboard.
3. Confirmá que el componente principal se exporte como `default` desde
   `src/modules/tesoreria/index.tsx`. El router ya lo va a levantar solo en
   `/m/tesoreria` sin tocar nada más.

Para agregar cualquier módulo nuevo (Mesas, Comandas, etc.) es el mismo
patrón: carpeta en `src/modules/<slug>`, entrada en `REGISTRO_MODULOS`
(`src/modules/registry.ts`), y una fila en la tabla `modulos`.

## Publicarlo en un repo nuevo de GitHub

Como el repo todavía no existe, creálo así (elegí una de las dos formas):

**Con la CLI de GitHub** (`gh`, si la tenés instalada en el VPS):
```bash
cd edgy-gestion
git init
git add .
git commit -m "Dashboard inicial: onboarding, sidebar dinámico y registro de módulos"
gh repo create ccopelotti-dev/edgy-gestion --private --source=. --remote=origin --push
```

**Desde la web** (si no tenés `gh` a mano):
1. Entrá a github.com/new, nombre `edgy-gestion`, dejalo privado, no tildes
   "Add a README" (ya tiene uno).
2. Después, en el VPS:
```bash
cd edgy-gestion
git init
git add .
git commit -m "Dashboard inicial: onboarding, sidebar dinámico y registro de módulos"
git branch -M main
git remote add origin https://github.com/ccopelotti-dev/edgy-gestion.git
git push -u origin main
```

Una vez creado el repo, movés la carpeta de Tesorería adentro (paso anterior),
hacés un commit nuevo y lo subís — `git add src/modules/tesoreria && git commit -m "Sumar módulo Tesorería" && git push`.
