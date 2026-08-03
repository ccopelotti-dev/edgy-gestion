// ============================================================
// Módulo Utilidades — Impresora (Fase 14)
// Edgy Gestión
// ============================================================
//
// Dos escenarios bien distintos según desde dónde se abra esta
// pantalla:
//
// 1) Adentro de la app de escritorio (window.electronAPI presente):
//    selector de la impresora USB que va a usar esta PC para imprimir
//    comprobantes en silencio -- ver imprimirOGuardarPdf() en
//    src/lib/comprobantes-pdf/pdfHelpers.ts, que es quien realmente
//    dispara la impresión, esta pantalla solo guarda la preferencia.
//    La preferencia es POR PC (vive en electron/main.js, en un
//    config.json local, no en Supabase) -- cada mostrador puede tener
//    su propia impresora.
//
// 2) En un navegador normal: no hay nada que configurar (no hay forma
//    de imprimir en silencio desde un navegador), así que se explica
//    eso y se ofrece la descarga del instalador de la app de
//    escritorio -- ver electron/README.md para cómo se genera ese
//    .exe y dónde se aloja.

import { useEffect, useState } from 'react'
import { Printer, Download, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { corriendoEnElectron, type ImpresoraDisponible } from '@/lib/electronBridge'

const URL_DESCARGA_INSTALADOR = '/descargas/EdgyGestion-Setup.exe'

export default function Impresora() {
  const enElectron = corriendoEnElectron()

  if (!enElectron) {
    return <PantallaSinEscritorio />
  }

  return <PantallaConfiguracion />
}

function PantallaSinEscritorio() {
  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Printer className="h-5 w-5 text-muted-foreground" />
          <p className="font-medium text-sm">Impresión automática</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Para imprimir comprobantes directo en la impresora del mostrador (sin el diálogo de
          impresión del navegador de por medio) hace falta instalar la app de escritorio de Edgy
          Gestión en esta PC. Es la misma Edgy Gestión de siempre, con una ventana propia y este
          puente extra a la impresora.
        </p>
        <Button asChild className="mt-4">
          <a href={URL_DESCARGA_INSTALADOR} download>
            <Download className="mr-2 h-4 w-4" />
            Descargar app de escritorio (Windows)
          </a>
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Después de instalarla, abrí la app y volvé a esta misma pantalla (Utilidades &gt;
          Impresora) para elegir cuál impresora USB usar.
        </p>
      </div>
    </div>
  )
}

function PantallaConfiguracion() {
  const [impresoras, setImpresoras] = useState<ImpresoraDisponible[]>([])
  const [seleccionada, setSeleccionada] = useState<string>('')
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    async function cargar() {
      const [lista, actual] = await Promise.all([
        window.electronAPI!.listarImpresoras(),
        window.electronAPI!.obtenerImpresoraPredeterminada(),
      ])
      if (!activo) return
      setImpresoras(lista)
      setSeleccionada(actual || lista.find((i) => i.isDefault)?.name || '')
      setCargando(false)
    }
    cargar()
    return () => {
      activo = false
    }
  }, [])

  async function guardar() {
    if (!seleccionada) return
    setGuardando(true)
    setGuardadoOk(false)
    await window.electronAPI!.guardarImpresoraPredeterminada(seleccionada)
    setGuardando(false)
    setGuardadoOk(true)
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Printer className="h-5 w-5 text-muted-foreground" />
          <p className="font-medium text-sm">Impresora de esta PC</p>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Elegí con qué impresora se van a imprimir automáticamente los comprobantes desde esta
          computadora (Facturar, Cobrar, Resumen de cuenta, etc). Es una configuración de esta PC
          puntual -- cada mostrador puede tener la suya.
        </p>

        {cargando ? (
          <p className="text-sm text-muted-foreground">Buscando impresoras instaladas...</p>
        ) : impresoras.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Windows no reporta ninguna impresora instalada en esta PC todavía.
          </p>
        ) : (
          <div className="space-y-3">
            <Select value={seleccionada} onValueChange={setSeleccionada}>
              <SelectTrigger>
                <SelectValue placeholder="Elegir impresora..." />
              </SelectTrigger>
              <SelectContent>
                {impresoras.map((i) => (
                  <SelectItem key={i.name} value={i.name}>
                    {i.displayName}
                    {i.isDefault ? ' (predeterminada en Windows)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-3">
              <Button onClick={guardar} disabled={!seleccionada || guardando}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </Button>
              {guardadoOk && (
                <span className="flex items-center gap-1 text-sm text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> Guardado
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
