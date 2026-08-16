'use client'

// ─────────────────────────────────────────────────────────────────────────
// Fase 34+ (fix): revisión y fusión de insumos duplicados.
//
// Contexto: antes de este fix, cuando se tildaba "también es insumo" en un
// Producto, el sistema creaba un insumo espejo sin buscar primero si ya
// existía un insumo suelto con el mismo nombre (ver sincronizarInsumoDeProducto
// en data/store.tsx). Si ese insumo suelto ya existía -- por ejemplo, de una
// carga anterior a que existiera el vínculo real Producto-Insumo -- queda
// como un huérfano: una fila más para la misma existencia física, sin
// vínculo, sin sincronizarse nunca, invisible en Stock (que ya excluye los
// insumos vinculados) pero visible acá en Insumos como una fila normal más.
//
// Esta pantalla detecta esos huérfanos (mismo nombre que un producto
// esInsumo, sin producto_vinculado_id hacia ÉL) y permite fusionarlos con
// el espejo real vía la función `fusionar_insumo_duplicado` (migración
// fusionar_insumo_duplicado), que reasigna toda referencia real (fórmulas,
// compras, movimientos, recepciones, control, transferencias, stock por
// punto de venta) del huérfano hacia el sobreviviente antes de borrarlo --
// no se pierde nada, no queda nada apuntando a un id que ya no existe.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { AlertTriangle, Merge, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { Amount, EmptyState } from './display'
import type { Producto, Insumo } from '../../types'

interface GrupoDuplicado {
  producto: Producto
  espejo: Insumo | undefined
  huerfanos: Insumo[]
}

export function detectarDuplicados(productos: Producto[], insumos: Insumo[]): GrupoDuplicado[] {
  const grupos: GrupoDuplicado[] = []
  for (const p of productos) {
    if (!p.esInsumo) continue
    const nombreP = p.nombre.trim().toLowerCase()
    const espejo = insumos.find((i) => i.productoVinculadoId === p.id)
    const huerfanos = insumos.filter(
      (i) =>
        i.nombre.trim().toLowerCase() === nombreP &&
        i.productoVinculadoId !== p.id &&
        (!i.productoVinculadoId || !productos.some((p2) => p2.id === i.productoVinculadoId)),
    )
    if (huerfanos.length > 0) grupos.push({ producto: p, espejo, huerfanos })
  }
  return grupos
}

interface DuplicadosDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productos: Producto[]
  insumos: Insumo[]
  onFusionado: () => Promise<void> | void
}

export function DuplicadosDialog({
  open,
  onOpenChange,
  productos,
  insumos,
  onFusionado,
}: DuplicadosDialogProps) {
  const grupos = useMemo(() => detectarDuplicados(productos, insumos), [productos, insumos])
  const [procesando, setProcesando] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleFusionar(huerfano: Insumo, grupo: GrupoDuplicado) {
    if (!grupo.espejo) {
      setError(
        `"${grupo.producto.nombre}" todavía no tiene un insumo vinculado activo -- primero guardá el producto con "también es insumo" tildado.`,
      )
      return
    }
    const ok = window.confirm(
      `¿Fusionar el insumo suelto "${huerfano.nombre}" (creado sin vincular) dentro del insumo vinculado a "${grupo.producto.nombre}"?\n\n` +
        `Se reasignan sus fórmulas, compras y movimientos al insumo vinculado, y la fila suelta se borra. No se puede deshacer.`,
    )
    if (!ok) return

    setProcesando(huerfano.id)
    setError('')
    const { error: errRpc } = await supabase.rpc('fusionar_insumo_duplicado', {
      p_descartado_id: huerfano.id,
      p_sobreviviente_id: grupo.espejo.id,
    })
    setProcesando(null)
    if (errRpc) {
      setError(`No se pudo fusionar "${huerfano.nombre}": ${errRpc.message}`)
      return
    }
    await onFusionado()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Insumos duplicados</DialogTitle>
          <DialogDescription>
            Insumos sueltos que comparten nombre con un producto vinculado, pero nunca quedaron
            conectados entre sí -- misma existencia física contada dos veces.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {grupos.length === 0 ? (
          <EmptyState
            icon={Merge}
            title="Sin duplicados"
            description="No encontramos insumos sueltos con el mismo nombre que un producto vinculado."
          />
        ) : (
          <div className="space-y-4">
            {grupos.map((grupo) => (
              <div key={grupo.producto.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  <p className="text-sm font-semibold">{grupo.producto.nombre}</p>
                  {grupo.espejo ? (
                    <span className="text-xs text-muted-foreground">
                      (insumo vinculado: stock {grupo.espejo.stock}, costo{' '}
                      <Amount value={grupo.espejo.costo} />)
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600">sin insumo vinculado activo</span>
                  )}
                </div>
                <div className="divide-y">
                  {grupo.huerfanos.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="text-xs text-muted-foreground">
                        Suelto: <span className="font-medium text-foreground">{h.nombre}</span> --
                        stock {h.stock}, costo <Amount value={h.costo} />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        disabled={procesando === h.id}
                        onClick={() => handleFusionar(h, grupo)}
                      >
                        {procesando === h.id ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Merge className="h-3.5 w-3.5 mr-1" />
                        )}
                        Fusionar
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
