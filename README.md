# Edgy Gestión — Módulo de Tesorería

Módulo de tesorería para un sistema de gestión de PyMEs argentinas. Construido con
**React 19 + TypeScript + Vite**, **Tailwind CSS v4** y componentes estilo **shadcn/ui**.

## Pantallas

- **Dashboard** (`/`) — KPIs de saldo de caja, total en bancos, cheques en cartera y
  resultado del período. Incluye flujo de fondos por medio de pago, disponibilidades
  consolidadas, últimos movimientos y próximos cheques a cobrar.
- **Caja** (`/caja`) — registro de movimientos de ingresos/egresos con medios de pago
  (efectivo, transferencia, cheque, tarjeta, MercadoPago). Filtros por tipo, medio y
  búsqueda.
- **Bancos** (`/bancos`) — cuentas bancarias con saldos y movimientos. Tarjetas de cuenta
  seleccionables para filtrar el detalle.
- **Cartera de Cheques** (`/cheques`) — **recibidos** con estados
  **en cartera → depositado → cobrado / rechazado**; **emitidos** tratados como **pasivo
  flotante "cheques a pagar"** (a pagar → pagado / anulado). KPIs, filtros y acciones se
  adaptan al tipo de cheque.
- **Vencimientos** (`/vencimientos`) — calendario mensual de cheques a cobrar (verde) y a
  pagar (rojo) por fecha de vencimiento, con neto proyectado del mes, alerta de vencidos y
  una agenda para liquidar (cobrar/pagar) que impacta el banco al instante.

## Diseño

- Paleta corporativa **azul oscuro** (`--primary`), **verde** para ingresos (`--income`)
  y **rojo** para egresos (`--expense`), definida en `src/index.css` con variables `oklch`.
- Soporte de tokens para modo claro/oscuro vía la clase `.dark`.
- Formato regional **es-AR / ARS** (`src/lib/format.ts`).

## Integración Caja ↔ Bancos ↔ Cheques

Los asientos están **vinculados** para evitar doble registro:

- Un movimiento de Caja con medio **transferencia, tarjeta o MercadoPago** exige una cuenta
  destino y genera automáticamente el **movimiento bancario espejo** (comparten un `linkId`).
  Borrar uno elimina su contraparte.
- **Depositar** un cheque recibido crea el **ingreso bancario** en la cuenta elegida;
  marcarlo **rechazado** o devolverlo a cartera **revierte** ese asiento.
- Un cheque **emitido** se carga con su **cuenta emisora** y queda como **pasivo flotante**
  (no toca el banco). Recién al marcarlo **pagado** se genera el **egreso bancario** en esa
  cuenta; anularlo o volverlo a "a pagar" lo **revierte**.
- En consecuencia, el **Saldo de Caja = solo efectivo** (el cajón físico). Los demás medios
  viven en sus cuentas bancarias, de modo que _Disponible total = Caja (efectivo) + Bancos_
  no cuenta los fondos dos veces. Los asientos generados se marcan con un ícono de vínculo.

## Datos

Los datos son de **demostración** y se persisten en `localStorage`
(`edgy-tesoreria-v3`). El botón _“Restablecer datos demo”_ en la barra lateral vuelve al
estado inicial (`src/data/seed.ts`). Los saldos bancarios se calculan como saldo inicial +
movimientos por cuenta.

## Estructura

```
src/
  components/
    ui/          # primitivas estilo shadcn/ui (button, card, table, dialog, select…)
    layout/      # AppLayout (sidebar + topbar + navegación)
    treasury/    # KpiCard, badges, diálogos de carga (MovementDialog, ChequeDialog)
  data/          # store (Context + reducer + localStorage), seed, selectores derivados
  lib/           # utils (cn) y formateadores es-AR
  pages/         # Dashboard, Caja, Bancos, Cheques
  types/         # modelo de dominio
```

## Scripts

```bash
npm run dev      # servidor de desarrollo
npm run build    # type-check + build de producción
npm run preview  # previsualizar el build
npm run lint     # eslint
```
