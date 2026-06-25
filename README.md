# Edgy Gestión — Dashboard

Shell del sistema de gestión modular de Edgy Sistemas. Es un solo código que
sirve a todos los clientes: cada cliente es una fila en la tabla `clientes`
de Supabase, y el sidebar + las rutas se arman solos según qué módulos tenga
activos (`cliente_modulos`).

Dos partes bien separadas conviven en el mismo proyecto:

- **`/panel/*`** — el panel interno de Edgy. Protegido por `RutaStaff`: solo
  entra quien esté en `personal_edgy`. Ahí se da de alta un cliente nuevo,
  se administran los clientes existentes (módulos activos, equipo) y a
  futuro va a vivir el dashboard de métricas.
- **`/dashboard`, `/m/:slug`** — lo que ve el cliente final una vez que
  Edgy le entregó el sistema. Resuelve qué cliente es por el usuario
  logueado (`useClienteActual`), no hace falta tocar nada ahí para esto.

## Estructura

```
src/
  components/
    Layout.tsx, Sidebar.tsx       Shell del dashboard del cliente
    PanelLayout.tsx, PanelSidebar.tsx   Shell del panel interno de Edgy
    RutaStaff.tsx                 Guard de ruta — solo personal_edgy entra a /panel
    ui/                           button, input, card, switch
  hooks/
    useClienteActual.ts           Cliente logueado + sus módulos activos (dashboard cliente)
    usePersonalEdgy.ts            ¿el usuario logueado es staff de Edgy?
  lib/               cliente de Supabase + utilidades
  modules/           un módulo por carpeta (ver más abajo)
    registry.ts      mapea slug -> componente, con lazy() para code-splitting
    tesoreria/       placeholder a reemplazar por el código real del VPS
  pages/
    DashboardHome.tsx
    ModuloRoute.tsx                resuelve /m/:slug contra el registro de módulos
    onboarding/                    los 4 pasos del wizard, ahora bajo /panel/nuevo-cliente
    panel/
      ClientesListado.tsx          listado de clientes ya dados de alta
      ClienteDetalle.tsx           datos, módulos activos (reusa Paso3Modulos) y equipo
supabase/
  migrations/
    0001_init.sql                       esquema base (histórico)
    0002_fix_insert_policies.sql        políticas de autoservicio (histórico — SUPERADO, ver 0003)
    0003_consolidado_v2_a_v8.sql        estado real de producción: roles reutilizables,
                                         personal_edgy, CUIL+PIN, fixes de constraints
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

Antes de levantarlo, en el SQL editor del proyecto de Supabase que vayas a usar,
correr en este orden exacto:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_fix_insert_policies.sql`
3. `supabase/migrations/0003_consolidado_v2_a_v8.sql`

Los tres son necesarios incluso en un proyecto nuevo: el 0003 da de baja
puntualmente lo que el 0002 había creado (el autoservicio) y deja la base
en el estado real de hoy. **Exponer el schema en la API** — sin este paso,
Supabase devuelve error porque por default solo expone `public`. En el
dashboard de Supabase: `Project Settings → API → Exposed schemas` → agregar
`edgy_gestion` a la lista → guardar.

Sin estos pasos el dashboard carga pero no puede leer ni escribir nada.

### Personal de Edgy

Para que alguien pueda entrar a `/panel`, tiene que existir una fila suya en
`edgy_gestion.personal_edgy` con su `user_id` de `auth.users`. No hay UI para
esto todavía — se hace a mano por SQL editor.

### Login

`/panel` reutiliza el login que ya existe en la landing (`edgysistemas.tech`,
modal de Supabase Auth) en vez de tener uno propio: si no hay sesión activa,
`RutaStaff` redirige ahí. Si hay sesión pero la cuenta no está en
`personal_edgy`, bloquea con un mensaje en vez de redirigir a ciegas.


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
