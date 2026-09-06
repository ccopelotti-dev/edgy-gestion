// ============================================================
// Fix: react-router@7.18.0 publica un package.json roto -- varios de
// sus exports (el principal "." y el subpath "./dom") declaran para
// las condiciones "module"/"import" un archivo ESM
// (dist/{development,production}/{index,dom-export}.mjs) que en la
// práctica NO viene incluido en el paquete. Solo existe la versión
// CommonJS (.js). Cualquier bundler que resuelva ESM (Vite, rolldown,
// esbuild) tira:
//   "Failed to resolve import react-router ... Does the file exist?"
// porque literalmente no existe.
//
// Esto rompió `npm run dev` el 06/09/2026 después de instalar
// dependencias nuevas (Fase 72, recharts) -- el node_modules viejo
// de Carlos tenía por casualidad una versión anterior de
// react-router que no tenía este bug; el npm install lo sincronizó
// con el lockfile (que ya declaraba 7.18.0) y ahí apareció.
//
// -- Segunda vuelta (mismo día) --
// Crear el .mjs como `export * from './index.js'` (un simple
// re-export "wildcard" de la versión CommonJS) NO alcanza: Rolldown
// (el bundler que usa esta versión de Vite) sí lo resuelve para el
// primer archivo que lo usa directamente, pero react-router-dom
// encadena un SEGUNDO wildcard sobre ese mismo archivo
// (`export * from "react-router"` dentro de su propio index.mjs) --
// y ese segundo salto de `export *` sobre un shim que a su vez
// envuelve un CommonJS no lo resuelve: el bundle final termina sin
// `NavLink`, `Link`, `useNavigate`, etc., y el navegador tira
// "does not provide an export named 'NavLink'".
//
// La solución que sí funciona: en vez de un wildcard, listar los
// nombres exportados EXPLÍCITAMENTE (`export { A, B, C } from ...`).
// Los re-exports explícitos sí los propaga Rolldown correctamente a
// través de cualquier cantidad de saltos. Este script arma esa lista
// automáticamente leyendo el .js real (buscando `exports.NOMBRE =`),
// así que no depende de una lista escrita a mano y sigue funcionando
// si una futura versión de react-router agrega o saca exports.
//
// Se corre solo despues de `npm install` (ver "postinstall" en
// package.json) para que el fix sobreviva a una reinstalación limpia
// de node_modules. Siempre regenera los .mjs (no solo si faltan),
// por si el bug de arriba ya los había dejado creados pero rotos.
// ============================================================

const fs = require('fs');
const path = require('path');

const ARCHIVOS_A_PARCHEAR = ['index', 'dom-export'];

/** Extrae los nombres de `exports.NOMBRE = ...` del código CJS. */
function nombresExportados(codigoJs) {
  const nombres = new Set();
  const re = /exports\.([A-Za-z0-9_$]+)\s*=/g;
  let m;
  while ((m = re.exec(codigoJs))) {
    nombres.add(m[1]);
  }
  return Array.from(nombres).sort();
}

for (const build of ['development', 'production']) {
  const dir = path.join(__dirname, '..', 'node_modules', 'react-router', 'dist', build);

  for (const nombre of ARCHIVOS_A_PARCHEAR) {
    const jsFile = path.join(dir, `${nombre}.js`);
    const mjsFile = path.join(dir, `${nombre}.mjs`);

    if (!fs.existsSync(jsFile)) {
      // react-router no está instalado (o cambió de estructura) -- no
      // hay nada que parchear, no rompemos el install por esto.
      continue;
    }

    const codigoJs = fs.readFileSync(jsFile, 'utf8');
    const nombres = nombresExportados(codigoJs);
    if (nombres.length === 0) {
      // No pudimos detectar exports -- no tocamos nada para no dejar
      // un archivo vacío/roto; mejor que quede como estaba.
      continue;
    }

    const contenido = `export {\n${nombres.map((n) => `  ${n},`).join('\n')}\n} from './${nombre}.js';\n`;

    if (fs.existsSync(mjsFile) && fs.readFileSync(mjsFile, 'utf8') === contenido) {
      continue; // ya está igual, no hace falta reescribir
    }

    fs.writeFileSync(mjsFile, contenido);
    console.log(`[fix-react-router-dom-export] (Re)generado ${mjsFile} (${nombres.length} exports)`);
  }
}
