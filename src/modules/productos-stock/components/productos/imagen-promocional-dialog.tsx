'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, Loader2, Check, Columns2, Rows2 } from 'lucide-react'
import { useClienteActual } from '@/hooks/useClienteActual'
import { generarImagenPromocionalCombo } from '../../lib/imagenPromocional'
import type { Combo } from '../../types'

// ─── ImagenPromocionalDialog ──────────────────────────────────────────────────
//
// Fase 5b (mejoras a Combos, a pedido del usuario -- "feature premium"):
// genera una imagen JPG lista para compartir (redes sociales, WhatsApp) con
// el logo del comercio, la foto principal del combo, nombre, precio bien
// resaltado y descripción. Se genera 100% en el navegador con Canvas
// (ver lib/imagenPromocional.ts), sin subir nada a ningún servidor.

interface ImagenPromocionalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  combo?: Combo
}

export function ImagenPromocionalDialog({
  open,
  onOpenChange,
  combo,
}: ImagenPromocionalDialogProps) {
  const { cliente } = useClienteActual()
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')
  const [dataUrl, setDataUrl] = useState('')
  // Indices (en combo.imagenes) de las fotos elegidas para la imagen
  // promocional -- se puede tildar hasta 2 para armar una "pantalla
  // dividida" (lado a lado o arriba/abajo); con 1 sola foto ocupa todo el
  // ancho como antes.
  const [fotosIdx, setFotosIdx] = useState<number[]>([0])
  const [layout, setLayout] = useState<'lado_a_lado' | 'arriba_abajo'>('lado_a_lado')

  // Al abrir el dialog (o cambiar de combo) siempre arranca solo con la
  // foto principal tildada.
  useEffect(() => {
    if (open) {
      setFotosIdx([0])
      setLayout('lado_a_lado')
    }
  }, [open, combo])

  function toggleFoto(idx: number) {
    setFotosIdx((prev) => {
      if (prev.includes(idx)) {
        const sinEsta = prev.filter((i) => i !== idx)
        // Siempre tiene que quedar al menos una tildada.
        return sinEsta.length > 0 ? sinEsta : prev
      }
      // Maximo 2 -- si ya hay 2 tildadas, la nueva reemplaza a la mas vieja
      // (FIFO), como al elegir el "split screen" con solo dos casilleros.
      return prev.length >= 2 ? [prev[1], idx] : [...prev, idx]
    })
  }

  useEffect(() => {
    if (!open || !combo) return
    let activo = true
    setGenerando(true)
    setError('')
    setDataUrl('')
    const fotos = fotosIdx.map((idx) => combo.imagenes?.[idx]).filter((u): u is string => !!u)
    generarImagenPromocionalCombo({
      nombre: combo.nombre,
      precio: combo.precioVenta,
      descripcion: combo.descripcion,
      fotos,
      layout,
      logoUrl: cliente?.logo_url ?? undefined,
      colorMarca: cliente?.color_marca ?? undefined,
    })
      .then((url) => {
        if (activo) setDataUrl(url)
      })
      .catch((err) => {
        if (activo) {
          setError(err instanceof Error ? err.message : 'No se pudo generar la imagen.')
        }
      })
      .finally(() => {
        if (activo) setGenerando(false)
      })
    return () => {
      activo = false
    }
  }, [open, combo, cliente, fotosIdx, layout])

  const nombreArchivo = combo
    ? `combo-${combo.nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`
    : 'combo.jpg'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Imagen promocional</DialogTitle>
          <DialogDescription>
            Lista para compartir en redes o WhatsApp. Se genera acá mismo, sin subir nada a
            ningún servidor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          {generando && (
            <div className="flex flex-col items-center gap-2 text-muted-foreground py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Generando imagen...</span>
            </div>
          )}
          {!generando && error && (
            <p className="text-sm text-red-500 py-12 text-center">{error}</p>
          )}
          {!generando && !error && dataUrl && (
            <img
              src={dataUrl}
              alt="Imagen promocional del combo"
              className="w-full max-w-xs rounded-lg border shadow-sm"
            />
          )}

          {/* Selector de foto(s) -- solo si el combo tiene mas de una en su galeria */}
          {combo && combo.imagenes.length > 1 && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                Elegir foto(s) -- hasta 2, para pantalla dividida
              </span>
              <div className="flex flex-wrap justify-center gap-2">
                {combo.imagenes.map((url, idx) => {
                  const marcada = fotosIdx.includes(idx)
                  return (
                    <button
                      key={url + idx}
                      type="button"
                      onClick={() => toggleFoto(idx)}
                      className={`relative h-14 w-14 overflow-hidden rounded-md border-2 transition-colors ${
                        marcada ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'
                      }`}
                      title={idx === 0 ? 'Foto principal' : `Foto ${idx + 1}`}
                    >
                      <img src={url} alt={`Foto ${idx + 1} del combo`} className="h-full w-full object-cover" />
                      {marcada && (
                        <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Selector de diseño -- solo tiene sentido con 2 fotos tildadas */}
          {fotosIdx.length === 2 && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Diseño</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLayout('lado_a_lado')}
                  className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-xs transition-colors ${
                    layout === 'lado_a_lado'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-transparent bg-muted text-muted-foreground hover:border-muted-foreground/30'
                  }`}
                >
                  <Columns2 className="h-4 w-4" />
                  Lado a lado
                </button>
                <button
                  type="button"
                  onClick={() => setLayout('arriba_abajo')}
                  className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-xs transition-colors ${
                    layout === 'arriba_abajo'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-transparent bg-muted text-muted-foreground hover:border-muted-foreground/30'
                  }`}
                >
                  <Rows2 className="h-4 w-4" />
                  Arriba y abajo
                </button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button asChild disabled={!dataUrl || generando}>
            <a href={dataUrl || undefined} download={nombreArchivo}>
              <Download className="h-4 w-4 mr-1" />
              Descargar JPG
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
