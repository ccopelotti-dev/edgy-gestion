'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Building2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useProductosStock, fetchProductosStockState } from '../data/store'
import { EmptyState } from '../components/productos/display'
import { TransferenciaDialog } from '../components/productos/dialogs'
import { formatDate } from '../lib/format'
import { useClienteActual } from '@/hooks/useClienteActual'
import { supabase } from '@/lib/supabase'

// ─── Page ────────────────────────────────────────────────────────────────────
//
// Fase 27e-1: hasta esta fase, "Nueva transferencia" era un botón
// permanentemente deshabilitado -- no existía ningún diálogo de alta y
// ADD_TRANSFERENCIA nunca se despachaba desde ningún lado (se confirmó
// leyendo el código antes de tocar nada). Ahora que existe stock por punto
// de venta (ver migración 0073), transferir mueve mercadería real entre
// locales -- por eso el alta pasa por la RPC `crear_transferencia`
// (movimiento atómico en el servidor) en vez del flujo optimista
// dispatch+syncToSupabase que usa el resto de esta pantalla.

export default function Transferencias() {
  const { state, dispatch } = useProductosStock()
  const { cliente } = useClienteActual()
  const [puntosVenta, setPuntosVenta] = useState<{ id: string; alias: string; activo: boolean }[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (!cliente?.id) return
    supabase
      .from('puntos_venta')
      .select('id, alias, activo')
      .eq('cliente_id', cliente.id)
      .eq('activo', true)
      .order('alias')
      .then(({ data }) => setPuntosVenta((data ?? []) as { id: string; alias: string; activo: boolean }[]))
  }, [cliente?.id])

  const aliasPorId = useMemo(() => new Map(puntosVenta.map((pv) => [pv.id, pv.alias])), [puntosVenta])

  const transferencias = useMemo(
    () => [...state.transferencias].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [state.transferencias],
  )

  const habilitado = puntosVenta.length >= 2

  async function handleSave(data: {
    fecha: string
    origenPuntoVentaId: string
    destinoPuntoVentaId: string
    notas: string
    lineas: { itemTipo: 'producto' | 'insumo'; itemId: string; varianteId?: string; cantidad: number }[]
  }): Promise<string | null> {
    if (!cliente?.id) return 'No se encontró el cliente actual.'

    const { error } = await supabase.rpc('crear_transferencia', {
      p_cliente_id: cliente.id,
      p_origen_punto_venta_id: data.origenPuntoVentaId,
      p_destino_punto_venta_id: data.destinoPuntoVentaId,
      p_fecha: data.fecha,
      p_notas: data.notas,
      p_lineas: data.lineas,
    })

    if (error) {
      // Los mensajes de `raise exception` en la función SQL llegan acá tal
      // cual (ej. "No hay stock suficiente en el local de origen...") --
      // se muestran directo, son pensados para el usuario final.
      return error.message || 'No pudimos crear la transferencia.'
    }

    // La RPC ya movió el stock y creó la transferencia server-side -- se
    // recarga el estado completo (mismo fetch que usa el Provider al
    // montar) en vez de duplicar esa lógica de mapeo acá.
    const fresh = await fetchProductosStockState()
    dispatch({ type: 'SET_STATE', payload: fresh })
    return null
  }

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
            Transferencias entre locales
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-400">
            {habilitado
              ? 'Movés stock real de un local a otro: se descuenta del origen y se suma al destino al confirmar.'
              : 'Las transferencias permiten mover stock entre locales. Cuando tengas 2 o más locales activos (Configuración > Puntos de venta), vas a poder transferir productos e insumos entre ellos.'}
          </p>
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center justify-end">
        <Button
          disabled={!habilitado}
          title={habilitado ? undefined : 'Requiere 2+ locales activos'}
          onClick={() => setDialogOpen(true)}
        >
          <ArrowLeftRight className="h-4 w-4 mr-1" />
          Nueva transferencia
        </Button>
      </div>

      {/* Table or empty state */}
      {transferencias.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Sin transferencias"
          description="No hay transferencias registradas. Cuando tengas múltiples locales, podés transferir stock entre ellos."
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-sm overflow-x-auto scroll-shadow-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Destino</th>
                <th className="px-4 py-3 font-medium text-right">Items</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Notas</th>
              </tr>
            </thead>
            <tbody>
              {transferencias.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="px-4 py-3 tabular-nums">{formatDate(t.fecha)}</td>
                  <td className="px-4 py-3">{aliasPorId.get(t.origenPuntoVentaId) ?? '—'}</td>
                  <td className="px-4 py-3">{aliasPorId.get(t.destinoPuntoVentaId) ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.lineas.length}</td>
                  <td className="px-4 py-3">
                    <Badge variant={t.estado === 'confirmada' ? 'default' : 'secondary'}>
                      {t.estado === 'confirmada' ? 'Confirmada' : 'Anulada'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t.notas || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TransferenciaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        puntosVenta={puntosVenta}
        productos={state.productos}
        insumos={state.insumos}
        onSave={handleSave}
      />
    </div>
  )
}
