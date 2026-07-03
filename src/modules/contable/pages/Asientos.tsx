'use client'

import { useMemo, useState } from 'react'
import { Loader2, Plus, Lock, TrendingUp, Trash2, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCuentasContables } from '../data/useCuentasContables'
import { useAsientos } from '../data/useAsientos'
import { AsientoDialog } from '../components/contable/asiento-dialog'
import { CierreDialog } from '../components/contable/cierre-dialog'
import { AjusteInflacionDialog } from '../components/contable/ajuste-inflacion-dialog'
import { EmptyState, OrigenBadge } from '../components/contable/display'
import { formatARS, formatDate } from '../lib/format'
import type { AsientoInput } from '../types'

export default function Asientos() {
  const { cuentas, cargando: cargandoCuentas, error: errorCuentas } = useCuentasContables()
  const { asientos, cargando: cargandoAsientos, error: errorAsientos, crearAsientoDesdeOrigen, eliminarAsiento } =
    useAsientos()

  const [dialogAsientoOpen, setDialogAsientoOpen] = useState(false)
  const [dialogCierreOpen, setDialogCierreOpen] = useState(false)
  const [dialogAjusteOpen, setDialogAjusteOpen] = useState(false)
  const [expandido, setExpandido] = useState<Set<string>>(new Set())
  const [mensaje, setMensaje] = useState<string | null>(null)

  const cuentasPorId = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas])

  function toggleExpandido(id: string) {
    setExpandido((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleGuardarAsiento(input: AsientoInput) {
    const res = await crearAsientoDesdeOrigen(input, 'manual')
    if (res.error) setMensaje(res.error)
  }

  async function handleCierre(input: AsientoInput) {
    const res = await crearAsientoDesdeOrigen(input, 'cierre')
    if (res.error) setMensaje(res.error)
  }

  async function handleAjuste(input: AsientoInput) {
    const res = await crearAsientoDesdeOrigen(input, 'ajuste_inflacion')
    if (res.error) setMensaje(res.error)
  }

  async function handleEliminar(id: string) {
    const res = await eliminarAsiento(id)
    if (res.error) setMensaje(res.error)
  }

  const cargando = cargandoCuentas || cargandoAsientos
  const error = errorCuentas || errorAsientos

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Cargando...
      </div>
    )
  }

  if (error) {
    return <EmptyState icon={FileText} title="No pudimos cargar los asientos" description={error} />
  }

  const ordenados = [...asientos].sort((a, b) => b.numero - a.numero)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Alta manual de asientos, más las acciones de cierre de ejercicio y ajuste por inflación
          (que también generan asientos, con origen propio).
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialogAjusteOpen(true)}>
            <TrendingUp className="h-4 w-4 mr-1" />
            Ajuste por inflación
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialogCierreOpen(true)}>
            <Lock className="h-4 w-4 mr-1" />
            Cerrar ejercicio
          </Button>
          <Button size="sm" onClick={() => setDialogAsientoOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo asiento
          </Button>
        </div>
      </div>

      {mensaje && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {mensaje}
        </div>
      )}

      {ordenados.length === 0 ? (
        <EmptyState icon={FileText} title="Sin asientos todavía" description="Creá el primer asiento manual para empezar." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium whitespace-nowrap w-8" />
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">N°</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Fecha</th>
                <th className="px-4 py-2.5 font-medium">Descripción</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Origen</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap text-right">Total</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((a) => {
                const abierto = expandido.has(a.id)
                const total = a.lineas.reduce((sum, l) => sum + l.debe, 0)
                return (
                  <>
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <button onClick={() => toggleExpandido(a.id)} className="text-muted-foreground">
                          {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{a.numero}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDate(a.fecha)}</td>
                      <td className="px-4 py-2">{a.descripcion || '-'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <OrigenBadge origen={a.origen} />
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-right">{formatARS(total)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-right">
                        <button
                          onClick={() => handleEliminar(a.id)}
                          className="p-1 text-muted-foreground hover:text-destructive"
                          title="Eliminar asiento"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                    {abierto && (
                      <tr key={`${a.id}-detalle`} className="border-b last:border-0 bg-muted/30">
                        <td />
                        <td colSpan={6} className="px-4 py-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left font-medium py-1">Cuenta</th>
                                <th className="text-left font-medium py-1">Debe</th>
                                <th className="text-left font-medium py-1">Haber</th>
                                <th className="text-left font-medium py-1">Descripción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {a.lineas.map((l) => (
                                <tr key={l.id}>
                                  <td className="py-1">
                                    {cuentasPorId.get(l.cuentaId)?.codigo} - {cuentasPorId.get(l.cuentaId)?.nombre ?? 'Cuenta eliminada'}
                                  </td>
                                  <td className="py-1">{l.debe ? formatARS(l.debe) : '-'}</td>
                                  <td className="py-1">{l.haber ? formatARS(l.haber) : '-'}</td>
                                  <td className="py-1">{l.descripcion ?? '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AsientoDialog open={dialogAsientoOpen} onOpenChange={setDialogAsientoOpen} onSave={handleGuardarAsiento} cuentas={cuentas} />
      <CierreDialog
        open={dialogCierreOpen}
        onOpenChange={setDialogCierreOpen}
        onConfirmar={handleCierre}
        cuentas={cuentas}
        asientos={asientos}
      />
      <AjusteInflacionDialog
        open={dialogAjusteOpen}
        onOpenChange={setDialogAjusteOpen}
        onConfirmar={handleAjuste}
        cuentas={cuentas}
        asientos={asientos}
      />
    </div>
  )
}
