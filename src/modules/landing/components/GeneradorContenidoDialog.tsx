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
import {
  Download,
  Loader2,
  Check,
  Columns2,
  Rows2,
  LayoutPanelLeft,
  ArrowUpToLine,
  ArrowDownToLine,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react'
import { useClienteActual } from '@/hooks/useClienteActual'
import { generarImagenPromocional } from '../lib/imagenPromocional'
import type { ItemContenido } from '../types'

// ─── GeneradorContenidoDialog ───────────────────────────────────────────────
//
// Fase 79 (15/09): "Capa 1" del plan de redes, a pedido de Carlos --
// generar una imagen JPG lista para compartir (Instagram, WhatsApp) a
// partir de un producto o combo REAL del catálogo. Publicarla es
// decisión y trabajo manual del cliente -- este módulo solo genera el
// contenido, nunca publica nada por su cuenta.
//
// Adaptado 1:1 de productos-stock/components/productos/imagen-promocional-dialog.tsx
// (mismo generador, ver lib/imagenPromocional.ts) -- la única diferencia
// es que acá `item` puede ser un producto (sin etiqueta) o un combo (con
// etiqueta), en vez de venir acoplado solo a Combo.
//
// Todas las elecciones de esta pantalla son efímeras -- no se guardan en
// el producto/combo, arrancan de cero cada vez que se abre el diálogo.

interface GeneradorContenidoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: ItemContenido
}

type LayoutFoto = 'lado_a_lado' | 'arriba_abajo' | 'protagonista'
type LogoPos = 'arriba' | 'abajo'
type BadgePos = 'arriba_logo' | 'abajo_logo'
type PrecioPos = 'izquierda' | 'centro' | 'derecha'

export function GeneradorContenidoDialog({
  open,
  onOpenChange,
  item,
}: GeneradorContenidoDialogProps) {
  const { cliente } = useClienteActual()
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')
  const [dataUrl, setDataUrl] = useState('')

  const [fotosIdx, setFotosIdx] = useState<number[]>([0])
  const [layout, setLayout] = useState<LayoutFoto>('lado_a_lado')

  const [logoPos, setLogoPos] = useState<LogoPos>('arriba')
  const [badgePos, setBadgePos] = useState<BadgePos>('arriba_logo')
  const [badgeColorFondo, setBadgeColorFondo] = useState('#ffffff')
  const [badgeColorTexto, setBadgeColorTexto] = useState('#0f172a')

  const [precioPos, setPrecioPos] = useState<PrecioPos>('izquierda')
  const [precioColorFondo, setPrecioColorFondo] = useState('#facc15')
  const [precioColorTexto, setPrecioColorTexto] = useState('#0f172a')

  const tieneLogo = !!cliente?.logo_url
  const tieneBadge = !!item?.etiqueta?.trim()

  useEffect(() => {
    if (open) {
      setFotosIdx([0])
      setLayout('lado_a_lado')
      setLogoPos('arriba')
      setBadgePos('arriba_logo')
      setBadgeColorFondo('#ffffff')
      setBadgeColorTexto(cliente?.color_marca || '#0f172a')
      setPrecioPos('izquierda')
      setPrecioColorFondo('#facc15')
      setPrecioColorTexto('#0f172a')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item])

  function toggleFoto(idx: number) {
    setFotosIdx((prev) => {
      if (prev.includes(idx)) {
        const sinEsta = prev.filter((i) => i !== idx)
        return sinEsta.length > 0 ? sinEsta : prev
      }
      return prev.length >= 2 ? [prev[1], idx] : [...prev, idx]
    })
  }

  useEffect(() => {
    if (!open || !item) return
    let activo = true
    setGenerando(true)
    setError('')
    setDataUrl('')
    const fotos = fotosIdx.map((idx) => item.imagenes?.[idx]).filter((u): u is string => !!u)
    generarImagenPromocional({
      nombre: item.nombre,
      precio: item.precio,
      descripcion: item.descripcion,
      etiqueta: item.etiqueta,
      fotos,
      layout,
      logoUrl: cliente?.logo_url ?? undefined,
      colorMarca: cliente?.color_marca ?? undefined,
      logoPos,
      badgePos,
      badgeColorFondo,
      badgeColorTexto,
      precioPos,
      precioColorFondo,
      precioColorTexto,
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
  }, [
    open,
    item,
    cliente,
    fotosIdx,
    layout,
    logoPos,
    badgePos,
    badgeColorFondo,
    badgeColorTexto,
    precioPos,
    precioColorFondo,
    precioColorTexto,
  ])

  const nombreArchivo = item
    ? `${item.tipo}-${item.nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`
    : 'contenido.jpg'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Imagen para redes</DialogTitle>
          <DialogDescription>
            Lista para compartir en Instagram, WhatsApp o donde prefieras -- se genera acá mismo,
            sin subir nada a ningún servidor. Publicarla queda a tu criterio.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
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
              alt={`Imagen promocional de ${item?.nombre ?? ''}`}
              className="w-full max-w-[240px] rounded-lg border shadow-sm"
            />
          )}

          {item && item.imagenes.length > 1 && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                Elegir foto(s) -- hasta 2, para pantalla dividida
              </span>
              <div className="flex flex-wrap justify-center gap-2">
                {item.imagenes.map((url, idx) => {
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
                      <img src={url} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover" />
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

          {fotosIdx.length === 2 && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Diseño de fotos</span>
              <div className="flex flex-wrap justify-center gap-2">
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
                <button
                  type="button"
                  onClick={() => setLayout('protagonista')}
                  className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-xs transition-colors ${
                    layout === 'protagonista'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-transparent bg-muted text-muted-foreground hover:border-muted-foreground/30'
                  }`}
                  title="La primera foto elegida queda más grande que la segunda"
                >
                  <LayoutPanelLeft className="h-4 w-4" />
                  Protagonista
                </button>
              </div>
            </div>
          )}

          {tieneLogo && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Posición del logo</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLogoPos('arriba')}
                  className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-xs transition-colors ${
                    logoPos === 'arriba'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-transparent bg-muted text-muted-foreground hover:border-muted-foreground/30'
                  }`}
                >
                  <ArrowUpToLine className="h-4 w-4" />
                  Arriba
                </button>
                <button
                  type="button"
                  onClick={() => setLogoPos('abajo')}
                  className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-xs transition-colors ${
                    logoPos === 'abajo'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-transparent bg-muted text-muted-foreground hover:border-muted-foreground/30'
                  }`}
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  Abajo
                </button>
              </div>
            </div>
          )}

          {tieneBadge && (
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 w-full">
              <span className="text-xs text-muted-foreground">
                Etiqueta ("{item!.etiqueta}")
              </span>

              {tieneLogo && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBadgePos('arriba_logo')}
                    className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-xs transition-colors ${
                      badgePos === 'arriba_logo'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-transparent bg-background text-muted-foreground hover:border-muted-foreground/30'
                    }`}
                  >
                    <ArrowUpToLine className="h-4 w-4" />
                    Encima del logo
                  </button>
                  <button
                    type="button"
                    onClick={() => setBadgePos('abajo_logo')}
                    className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-xs transition-colors ${
                      badgePos === 'abajo_logo'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-transparent bg-background text-muted-foreground hover:border-muted-foreground/30'
                    }`}
                  >
                    <ArrowDownToLine className="h-4 w-4" />
                    Debajo del logo
                  </button>
                </div>
              )}

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Fondo
                  <input
                    type="color"
                    value={badgeColorFondo}
                    onChange={(e) => setBadgeColorFondo(e.target.value)}
                    className="h-7 w-9 cursor-pointer rounded border border-input p-0.5"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Letra
                  <input
                    type="color"
                    value={badgeColorTexto}
                    onChange={(e) => setBadgeColorTexto(e.target.value)}
                    className="h-7 w-9 cursor-pointer rounded border border-input p-0.5"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 w-full">
            <span className="text-xs text-muted-foreground">Precio</span>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPrecioPos('izquierda')}
                className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-xs transition-colors ${
                  precioPos === 'izquierda'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-transparent bg-background text-muted-foreground hover:border-muted-foreground/30'
                }`}
              >
                <AlignLeft className="h-4 w-4" />
                Izquierda
              </button>
              <button
                type="button"
                onClick={() => setPrecioPos('centro')}
                className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-xs transition-colors ${
                  precioPos === 'centro'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-transparent bg-background text-muted-foreground hover:border-muted-foreground/30'
                }`}
              >
                <AlignCenter className="h-4 w-4" />
                Centro
              </button>
              <button
                type="button"
                onClick={() => setPrecioPos('derecha')}
                className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-xs transition-colors ${
                  precioPos === 'derecha'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-transparent bg-background text-muted-foreground hover:border-muted-foreground/30'
                }`}
              >
                <AlignRight className="h-4 w-4" />
                Derecha
              </button>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Fondo
                <input
                  type="color"
                  value={precioColorFondo}
                  onChange={(e) => setPrecioColorFondo(e.target.value)}
                  className="h-7 w-9 cursor-pointer rounded border border-input p-0.5"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Letra
                <input
                  type="color"
                  value={precioColorTexto}
                  onChange={(e) => setPrecioColorTexto(e.target.value)}
                  className="h-7 w-9 cursor-pointer rounded border border-input p-0.5"
                />
              </label>
            </div>
          </div>
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
