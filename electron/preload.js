// ============================================================
// Edgy Gestión · App de escritorio (Fase 14)
// Preload -- puente seguro entre la web (contextIsolation activado,
// nodeIntegration apagado) y el proceso principal.
// ============================================================
//
// Todo lo que necesita el código de src/lib/electronBridge.ts vive
// acá: window.electronAPI.* -- ver ese archivo para el lado TypeScript
// (tipos, y `corriendoEnElectron()` que chequea que esto exista antes
// de usarlo, para que el resto de la app siga andando igual en un
// navegador normal).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  esElectron: true,
  guardarNegocio: (slug) => ipcRenderer.invoke('guardar-negocio', slug),
  imprimir: (pdfBytes, nombreArchivo) => ipcRenderer.invoke('imprimir-pdf', pdfBytes, nombreArchivo),
  listarImpresoras: () => ipcRenderer.invoke('listar-impresoras'),
  obtenerImpresoraPredeterminada: () => ipcRenderer.invoke('obtener-impresora-predeterminada'),
  guardarImpresoraPredeterminada: (nombre) => ipcRenderer.invoke('guardar-impresora-predeterminada', nombre),
});
