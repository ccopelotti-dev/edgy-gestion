# Edgy Gestión · App de escritorio (Fase 14)

Wrapper de Electron que carga la web app real de Edgy Gestión (la misma
que se ve en el navegador, en el subdominio de cada negocio, ej.
`la-charcuteria-express.edgysistemas.tech`) dentro de una ventana nativa
de Windows, y agrega un puente para imprimir comprobantes en una
impresora USB local sin diálogo de por medio.

Como cada cliente tiene su propio subdominio (no hay login genérico en
`edgysistemas.tech` -- ese dominio raíz es la landing de marketing, un
sitio aparte), la primera vez que se abre la app en una PC pregunta el
subdominio del negocio (`onboarding.html`) y lo guarda en un
`config.json` local -- así el mismo instalador sirve para cualquier
cliente.

Es un proyecto Node **aparte** del resto del repo (tiene su propio
`package.json`, con Electron y electron-builder como dependencias) --
no correr `npm install` desde acá esperando que afecte a `edgy-gestion`
ni viceversa.

## Uso durante desarrollo

```
cd electron
npm install
npm start
```

Abre la ventana apuntando a `https://edgysistemas.tech/` (o a lo que
diga `EDGY_URL` si está seteada, o `url` en el `config.json` de
`%APPDATA%/Edgy Gestión/config.json` una vez instalada).

## Generar el instalador de Windows

```
cd electron
npm install
npm run build:win
```

Genera un `.exe` (NSIS) en `electron/dist-installer/`. Ese archivo es
el que hay que copiar a `public/descargas/` del repo principal (ver
`src/modules/utilidades/pages/Impresora.tsx`) para que quede
disponible desde Utilidades > Impresora en la web.

## Qué hace el puente de impresión

- `preload.js` expone `window.electronAPI` a la web (impresión +
  listado de impresoras + guardar cuál es la predeterminada).
- `main.js` escucha esos pedidos por IPC: `listar-impresoras` devuelve
  las impresoras que Windows tiene instaladas, `imprimir-pdf` recibe
  los bytes de un PDF ya armado (los mismos 4 motores de
  `src/lib/comprobantes-pdf/`), los escribe a un archivo temporal, y
  los manda a imprimir en silencio (`silent: true`) a la impresora
  guardada en `config.json`.
- Del lado web, `src/lib/electronBridge.ts` + `imprimirOGuardarPdf()`
  en `pdfHelpers.ts` son el único punto de contacto -- si
  `window.electronAPI` no existe (navegador normal), todo sigue
  funcionando exactamente igual que antes (descarga del PDF).

## Pendiente / a definir

- Ícono propio de la app (`build/icon.ico`) -- por ahora usa el ícono
  por defecto de Electron.
- Firma de código del instalador (Windows va a mostrar la advertencia
  de "editor desconocido" hasta que se firme).
- Auto-actualización del instalador (electron-updater) -- por ahora
  hay que reinstalar a mano cuando cambie algo de esta carpeta.
