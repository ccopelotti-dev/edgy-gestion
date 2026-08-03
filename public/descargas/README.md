# /descargas

Carpeta pública (Vite la sirve tal cual, sin procesar) para archivos
descargables desde la web app.

## App de escritorio (Fase 14)

El botón "Descargar app de escritorio" de Utilidades > Impresora
(`src/modules/utilidades/pages/Impresora.tsx`) apunta a:

```
/descargas/EdgyGestion-Setup.exe
```

Ese archivo NO se genera acá -- hay que compilarlo aparte con
electron-builder (ver `electron/README.md`, `npm run build:win` desde
`electron/`) y copiar el `.exe` resultante (queda en
`electron/dist-installer/`) a esta carpeta con ese nombre exacto antes
de desplegar. Mientras no esté, el botón de descarga da 404.
