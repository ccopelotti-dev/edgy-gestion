import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Download, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { BankAccount } from '../../types'

interface AliasQrDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: BankAccount | null
}

// Fase 45e (21/08, a pedido de Carlos): QR "simple" con el alias de la
// cuenta en texto plano -- NO es un QR interoperable (esos los emite el
// PSP -- Naranja X/Mercado Pago/el banco -- siguiendo el estándar del
// BCRA, y ninguna app de terceros lo reconoce como "pagar" a menos que
// venga de ahí). Este solo evita que el cliente tenga que tipear el
// alias a mano: lo escanea con la cámara, la mayoría de los lectores
// (o la propia cámara del celu) lo interpreta como texto y se lo copia
// listo para pegar en su billetera/banco al hacer la transferencia.
export function AliasQrDialog({ open, onOpenChange, account }: AliasQrDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    if (!open || !account) return
    let activo = true
    setGenerando(true)
    setQrDataUrl('')

    QRCode.toDataURL(account.alias, { margin: 1, width: 320 })
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
  }, [open, account])

  function handleDescargar() {
    if (!qrDataUrl || !account) return
    const link = document.createElement('a')
    link.href = qrDataUrl
    link.download = `qr-alias-${account.alias.replace(/[^a-zA-Z0-9.-]+/g, '-')}.png`
    link.click()
  }

  if (!account) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR del alias — {account.banco}</DialogTitle>
          <DialogDescription>
            Para mandar junto con el pedido en vez de escribir el alias. Al escanearlo, el
            cliente recibe el texto del alias -- todavía tiene que abrir su banco/billetera y
            hacer la transferencia a mano, esto no cobra automático.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-2 rounded-md border p-4">
          {generando ? (
            <div className="flex h-[220px] w-[220px] items-center justify-center">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR alias ${account.alias}`} className="h-[220px] w-[220px]" />
          ) : (
            <p className="text-sm text-red-500">No se pudo generar el código.</p>
          )}
          <p className="text-center font-mono text-sm font-semibold">{account.alias}</p>
          <p className="text-muted-foreground text-center text-xs">{account.banco}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={handleDescargar} disabled={generando || !qrDataUrl}>
            <Download className="mr-2 h-4 w-4" />
            Descargar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
