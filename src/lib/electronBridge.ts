// ============================================================
// Puente con la app de escritorio (Electron) -- Fase 14
// Edgy Gestión
// ============================================================
//
// Si Edgy Gestión corre dentro de la app de escritorio (ver /electron
// en la raíz del repo -- es un proyecto Node aparte, con sus propias
// dependencias, que NO se mezcla con este package.json), el preload.js
// de ahí expone `window.electronAPI` vía contextBridge. En un navegador
// normal esa propiedad no existe -- todo el código de acá la trata
// siempre como opcional, para no romper nada fuera de la app de
// escritorio.
//
// El único lugar que llama a esto es imprimirOGuardarPdf() en
// pdfHelpers.ts -- así, agregar la app de escritorio no tocó ni un
// call-site de Ventas/Compras/Presupuestos/Recibos: todos siguen
// generando exactamente el mismo PDF de siempre (mismo jsPDF, mismo
// motor fiscal con QR/CAE), solo que ese helper decide recién al final
// si sale por impresora silenciosa o por la descarga de navegador de
// siempre.

export interface ImpresoraDisponible {
  /** Nombre interno (el que hay que mandarle a Windows para imprimir). */
  name: string;
  /** Nombre para mostrarle al usuario en el selector. */
  displayName: string;
  isDefault: boolean;
}

export interface ResultadoImpresion {
  ok: boolean;
  error?: string;
}

export interface ElectronAPI {
  esElectron: true;
  /** Imprime un PDF (bytes crudos, tal cual sale de jsPDF) en la
   * impresora predeterminada configurada en la app -- sin diálogo, sin
   * que el usuario tenga que tocar nada. */
  imprimir: (pdfBytes: ArrayBuffer, nombreArchivo: string) => Promise<ResultadoImpresion>;
  /** Impresoras USB/red que Windows ve instaladas en esta PC. */
  listarImpresoras: () => Promise<ImpresoraDisponible[]>;
  obtenerImpresoraPredeterminada: () => Promise<string | null>;
  guardarImpresoraPredeterminada: (nombre: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/** true solo dentro de la app de escritorio -- en cualquier navegador
 * (Chrome, Edge, Firefox, el mismo Chrome de un celular) da false. */
export function corriendoEnElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.esElectron;
}
