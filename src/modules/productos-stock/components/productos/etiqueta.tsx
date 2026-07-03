'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Loader2, Printer } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatARS } from '../../lib/format'
import type { Producto } from '../../types'

interface EtiquetaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  producto: Producto | null
  /**
   * Si el producto no tiene codigoBarras todavia, este callback genera uno,
   * lo persiste (dispatch UPDATE_PRODUCTO en el llamador) y devuelve el
   * codigo generado para poder renderizar el QR de inmediato.
   */
  onGenerarCodigo: (producto: Producto) => string
}

// Dialogo de etiqueta imprimible: QR + nombre + precio + codigo en texto
// (por si alguien necesita tipearlo a mano). Pensado para productos propios
// sin codigo de fabrica -- para productos que YA vienen con EAN-13 de
// fabrica, el codigo cargado en el producto se usa tal cual, sin generar
// nada nuevo.
export function EtiquetaDialog({
  open,
  onOpenChange,
  producto,
  onGenerarCodigo,
}: EtiquetaDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [codigo, setCodigo] = useState('')
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    if (!open || !producto) return

    let activo = true
    setGenerando(true)

    const codigoFinal = producto.codigoBarras || onGenerarCodigo(producto)
    setCodigo(codigoFinal)

    QRCode.toDataURL(codigoFinal, { margin: 1, width: 220 })
      .then((url) => {
        if (activo) setQrDataUrl(url)
      })
      .catch(() => {
        if (activo) setQrDataUrl('')
      })
      .finally(() => {
        if (activo) setGenerando(false)
      })

    return () => {
      activo = false
    }
  }, [open, producto, onGenerarCodigo])

  function handleImprimir() {
    window.print()
  }

  if (!producto) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Etiqueta para imprimir</DialogTitle>
          <DialogDescription>
            {producto.codigoBarras
              ? 'Código ya cargado para este producto.'
              : 'Se generó un código nuevo (este producto no tenía).'}
          </DialogDescription>
        </DialogHeader>

        <div
          id="etiqueta-imprimible"
          className="flex flex-col items-center gap-2 rounded-md border p-4"
        >
          {generando ? (
            <div className="flex h-[220px] w-[220px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : qrDataUrl ? (
            <img src={qrDataUrl} alt="Código QR" className="h-[220px] w-[220px]" />
          ) : (
            <p className="text-sm text-red-500">No se pudo generar el código.</p>
          )}
          <p className="text-center text-sm font-semibold">{producto.nombre}</p>
          <p className="text-center text-lg font-bold">{formatARS(producto.precioVenta)}</p>
          <p className="text-center font-mono text-xs text-muted-foreground">{codigo}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={handleImprimir} disabled={generando || !qrDataUrl}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Al imprimir, se oculta todo lo demás y solo queda la etiqueta. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #etiqueta-imprimible, #etiqueta-imprimible * { visibility: visible; }
          #etiqueta-imprimible {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
          }
        }
      `}</style>
    </Dialog>
  )
}
