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
import { Download, Loader2 } from 'lucide-react'
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
  // Indice de la foto de la galeria del combo a usar como principal en la
  // imagen promocional -- por defecto la primera (misma foto que se ve como
  // portada en el listado), pero si el combo tiene mas de una el usuario
  // puede elegir cualquiera de las otras antes de descargar.
  const [fotoIdx, setFotoIdx] = useState(0)

  // Al abrir el dialog (o cambiar de combo) siempre arranca en la foto
  // principal.
  useEffect(() => {
    if (open) setFotoIdx(0)
  }, [open, combo])

  useEffect(() => {
    if (!open || !combo) return
    let activo = true
    setGenerando(true)
    setError('')
    setDataUrl('')
    generarImagenPromocionalCombo({
      nombre: combo.nombre,
      precio: combo.precioVenta,
      descripcion: combo.descripcion,
      fotoUrl: combo.imagenes?.[fotoIdx] ?? combo.imagenes?.[0],
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
  }, [open, combo, cliente, fotoIdx])

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

          {/* Selector de foto -- solo si el combo tiene mas de una en su galeria */}
          {combo && combo.imagenes.length > 1 && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                Elegir foto ({combo.imagenes.length} disponibles)
              </span>
              <div className="flex flex-wrap justify-center gap-2">
                {combo.imagenes.map((url, idx) => (
                  <button
                    key={url + idx}
                    type="button"
                    onClick={() => setFotoIdx(idx)}
                    className={`h-14 w-14 overflow-hidden rounded-md border-2 transition-colors ${
                      idx === fotoIdx ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'
                    }`}
                    title={idx === 0 ? 'Foto principal' : `Foto ${idx + 1}`}
                  >
                    <img src={url} alt={`Foto ${idx + 1} del combo`} className="h-full w-full object-cover" />
                  </button>
                ))}
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
