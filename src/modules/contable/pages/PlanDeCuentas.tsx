'use client'

import { useMemo, useState } from 'react'
import { Loader2, Plus, Pencil, Ban, RotateCcw, Trash2, Building } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCuentasContables } from '../data/useCuentasContables'
import { CuentaDialog } from '../components/contable/cuenta-dialog'
import { EmptyState } from '../components/contable/display'
import { tipoCuentaLabel } from '../types'
import type { CuentaContable } from '../types'

function calcularNivel(cuenta: CuentaContable, cuentasPorId: Map<string, CuentaContable>): number {
  let nivel = 0
  let actual = cuenta
  while (actual.cuentaPadreId) {
    const padre = cuentasPorId.get(actual.cuentaPadreId)
    if (!padre) break
    nivel += 1
    actual = padre
  }
  return nivel
}

export default function PlanDeCuentas() {
  const { cuentas, cargando, error, crear, actualizar, inactivar, reactivar, eliminar } = useCuentasContables()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cuentaEditar, setCuentaEditar] = useState<CuentaContable | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const cuentasPorId = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas])
  const ordenadas = useMemo(() => [...cuentas].sort((a, b) => a.codigo.localeCompare(b.codigo)), [cuentas])

  function abrirNueva() {
    setCuentaEditar(null)
    setDialogOpen(true)
  }

  function abrirEditar(c: CuentaContable) {
    setCuentaEditar(c)
    setDialogOpen(true)
  }

  async function handleSave(input: Parameters<typeof crear>[0]) {
    const res = cuentaEditar ? await actualizar(cuentaEditar.id, input) : await crear(input)
    if (res.error) setMensaje(res.error)
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Cargando...
      </div>
    )
  }

  if (error) {
    return <EmptyState icon={Building} title="No pudimos cargar el plan de cuentas" description={error} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Árbol de cuentas contables. Las cuentas de agrupación (no imputables) organizan el árbol;
          solo las imputables reciben movimientos en asientos.
        </p>
        <Button size="sm" onClick={abrirNueva}>
          <Plus className="h-4 w-4 mr-1" />
          Nueva cuenta
        </Button>
      </div>

      {mensaje && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {mensaje}
        </div>
      )}

      {ordenadas.length === 0 ? (
        <EmptyState
          icon={Building}
          title="Sin cuentas todavía"
          description="El plan de cuentas debería haberse sembrado automáticamente al activar el módulo. Si está vacío, creá la primera cuenta a mano."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Código</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Nombre</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Tipo</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Imputable</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Estado</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((c) => {
                const nivel = calcularNivel(c, cuentasPorId)
                return (
                  <tr key={c.id} className={cn('border-b last:border-0', !c.activa && 'opacity-50')}>
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{c.codigo}</td>
                    <td className="px-4 py-2 whitespace-nowrap" style={{ paddingLeft: `${1 + nivel * 1.25}rem` }}>
                      {c.imputable ? c.nombre : <b>{c.nombre}</b>}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{tipoCuentaLabel(c.tipo)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{c.imputable ? 'Sí' : 'No'}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{c.activa ? 'Activa' : 'Inactiva'}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => abrirEditar(c)} className="p-1 text-muted-foreground hover:text-foreground">
                          <Pencil className="h-4 w-4" />
                        </button>
                        {c.activa ? (
                          <button
                            onClick={() => inactivar(c.id).then((r) => r.error && setMensaje(r.error))}
                            className="p-1 text-muted-foreground hover:text-foreground"
                            title="Inactivar"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => reactivar(c.id).then((r) => r.error && setMensaje(r.error))}
                            className="p-1 text-muted-foreground hover:text-foreground"
                            title="Reactivar"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => eliminar(c.id).then((r) => r.error && setMensaje(r.error))}
                          className="p-1 text-muted-foreground hover:text-destructive"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CuentaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        cuentas={cuentas}
        cuentaEditar={cuentaEditar}
      />
    </div>
  )
}
