// ============================================================
// Edgy Gestión · App de escritorio (Fase 14)
// Proceso principal de Electron
// ============================================================
//
// Es un wrapper fino, no un bundle propio: esta ventana carga la URL
// real de la web app en producción (misma que se ve en el navegador),
// así que cualquier cambio que se despliegue en la web (Netlify) se ve
// acá sin tener que reconstruir ni redistribuir nada -- solo hace
// falta un nuevo instalador cuando cambia algo DE ESTA carpeta (el
// puente de impresión, básicamente).
//
// El login, el dashboard, todos los módulos: exactamente el mismo
// código de siempre (src/, ver App.tsx) -- "/" ya resuelve solo a
// dónde mandar a cada usuario según su sesión (Ingresar si no hay
// sesión, /dashboard o /panel si la hay), así que esta ventana no
// necesita saber nada de qué cliente/tenant es -- eso lo sigue
// resolviendo Supabase Auth + useClienteActual como siempre.
//
// Lo único nuevo de verdad es el puente de impresión (preload.js +
// los handlers de acá abajo): imprimir un PDF ya generado (jsPDF, los
// mismos 4 motores de src/lib/comprobantes-pdf/) directo a una
// impresora USB configurada, sin el diálogo de impresión del
// navegador de por medio. Ver src/lib/electronBridge.ts +
// imprimirOGuardarPdf() en pdfHelpers.ts para el lado web.

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Edgy Gestión es multi-tenant: cada negocio tiene su propio subdominio
// (ej. https://la-charcuteria-express.edgysistemas.tech/ingresar) -- no
// existe una URL de login genérica (el dominio raíz edgysistemas.tech es
// OTRO sitio, la landing de marketing, no la app). Por eso la primera vez
// que se abre esta app en una PC se pregunta el subdominio del negocio
// (ver onboarding.html) y se guarda en config.json -- así el mismo
// instalador sirve para cualquier cliente, sin tocar código por cada uno.
// `config.url` es un escape hatch manual (pisa todo lo demás) para casos
// raros -- editar a mano el config.json si hiciera falta apuntar a otro
// lado sin pasar por el subdominio.
function urlDelNegocio(config) {
  if (config.url) return config.url;
  if (process.env.EDGY_URL) return process.env.EDGY_URL;
  if (config.slug) return `https://${config.slug}.edgysistemas.tech/ingresar`;
  return null;
}

function rutaConfig() {
  return path.join(app.getPath('userData'), 'config.json');
}

function leerConfig() {
  try {
    return JSON.parse(fs.readFileSync(rutaConfig(), 'utf-8'));
  } catch {
    return {};
  }
}

function guardarConfig(config) {
  fs.writeFileSync(rutaConfig(), JSON.stringify(config, null, 2));
}

let ventanaPrincipal;

function crearVentanaPrincipal() {
  ventanaPrincipal = new BrowserWindow({
    width: 1360,
    height: 860,
    title: 'Edgy Gestión',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Sin barra de menú (Archivo/Editar/Ver...) -- que se sienta app, no
  // navegador, como TradingView Desktop / X Desktop.
  Menu.setApplicationMenu(null);

  const config = leerConfig();
  const urlApp = urlDelNegocio(config);
  if (urlApp) {
    ventanaPrincipal.loadURL(urlApp);
  } else {
    ventanaPrincipal.loadFile(path.join(__dirname, 'onboarding.html'));
  }
}

app.whenReady().then(() => {
  crearVentanaPrincipal();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentanaPrincipal();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: onboarding (subdominio del negocio) ────────────────

ipcMain.handle('guardar-negocio', (_evt, slug) => {
  const config = leerConfig();
  config.slug = slug;
  guardarConfig(config);
  const urlApp = urlDelNegocio(config);
  if (ventanaPrincipal && urlApp) ventanaPrincipal.loadURL(urlApp);
});

// ── IPC: impresoras + impresión silenciosa ──────────────────

ipcMain.handle('listar-impresoras', async () => {
  if (!ventanaPrincipal) return [];
  const impresoras = await ventanaPrincipal.webContents.getPrintersAsync();
  return impresoras.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
    isDefault: !!p.isDefault,
  }));
});

ipcMain.handle('obtener-impresora-predeterminada', () => {
  return leerConfig().impresoraPredeterminada || null;
});

ipcMain.handle('guardar-impresora-predeterminada', (_evt, nombre) => {
  const config = leerConfig();
  config.impresoraPredeterminada = nombre;
  guardarConfig(config);
});

ipcMain.handle('imprimir-pdf', async (_evt, pdfBytes, nombreArchivo) => {
  const config = leerConfig();
  const deviceName = config.impresoraPredeterminada;
  if (!deviceName) {
    return {
      ok: false,
      error: 'No hay una impresora configurada todavía (Utilidades > Impresora).',
    };
  }

  const nombreSeguro = String(nombreArchivo || 'comprobante').replace(/[^a-zA-Z0-9_-]/g, '_');
  const tmpPath = path.join(os.tmpdir(), `edgy-${Date.now()}-${nombreSeguro}.pdf`);

  try {
    fs.writeFileSync(tmpPath, Buffer.from(pdfBytes));

    // Ventana oculta que solo existe para renderizar el PDF con el
    // visor nativo de Chromium y mandarlo a imprimir -- se cierra sola
    // apenas termina.
    const ventanaOculta = new BrowserWindow({
      show: false,
      webPreferences: { plugins: true },
    });

    await ventanaOculta.loadURL(`file://${tmpPath}`);

    await new Promise((resolve, reject) => {
      ventanaOculta.webContents.print(
        { silent: true, deviceName, printBackground: true },
        (success, failureReason) => {
          if (success) resolve();
          else reject(new Error(failureReason || 'Fallo desconocido de impresión'));
        },
      );
    });

    ventanaOculta.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    fs.unlink(tmpPath, () => {});
  }
});
