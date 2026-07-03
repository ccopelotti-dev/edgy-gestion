'use client'

import { useState } from 'react'
import { Loader2, Plus, Pencil, Trash2, Play, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCuentasContables } from '../data/useCuentasContables'
import { useAsientosModelo } from '../data/useAsientosModelo'
import { useAsientos } from '../data/useAsientos'
import { ModeloDialog } from '../components/contable/modelo-dialog'
import { AsientoDialog } from '../components/contable/asiento-dialog'
import { EmptyState } from '../components/contable/display'
import { formatARS } from '../lib/format'
import type { AsientoModelo, AsientoInput } from '../types'

export default function AsientosModelo() {
  const { cuentas, cargando: cargandoCuentas, error: errorCuentas } = useCuentasContables()
  const { modelos, cargando: cargandoModelos, error: errorModelos, crear, actualizar, eliminar } = useAsientosModelo()
  const { crearAsientoDesdeOrigen } = useAsientos()

  const [dialogModeloOpen, setDialogModeloOpen] = useState(false)
  const [modeloEditar, setModeloEditar] = useState<AsientoModelo | null>(null)
  const [dialogAplicarOpen, setDialogAplicarOpen] = useState(false)
  const [modeloAplicar, setModeloAplicar] = useState<AsientoModelo | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const cuentasPorId = new Map(cuentas.map((c) => [c.id, c]))

  function abrirNuevo() {
    setModeloEditar(null)
    setDialogModeloOpen(true)
  }

  function abrirEditar(m: AsientoModelo) {
    setModeloEditar(m)
    setDialogModeloOpen(true)
  }

  function abrirAplicar(m: AsientoModelo) {
    setModeloAplicar(m)
    setDialogAplicarOpen(true)
  }

  async function handleGuardarModelo(input: Parameters<typeof crear>[0]) {
    const res = modeloEditar ? await actualizar(modeloEditar.id, input) : await crear(input)
    if (res.error) setMensaje(res.error)
  }

  async function handleEliminarModelo(id: string) {
    const res = await eliminar(id)
    if (res.error) setMensaje(res.error)
  }

  async function handleAplicar(input: AsientoInput) {
    const res = await crearAsientoDesdeOrigen(input, 'modelo', modeloAplicar?.id)
    if (res.error) setMensaje(res.error)
  }

  const cargando = cargandoCuentas || cargandoModelos
  const error = errorCuentas || errorModelos

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Cargando...
      </div>
    )
  }

  if (error) {
    return <EmptyState icon={Copy} title="No pudimos cargar los modelos" description={error} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Plantillas de asiento reutilizables para movimientos que se repiten (ej. alquiler
          mensual). "Aplicar" abre un asiento nuevo prellenado con las líneas del modelo.
        </p>
        <Button size="sm" onClick={abrirNuevo}>
          <Plus className="h-4 w-4 mr-1" />
          Nuevo modelo
        </Button>
      </div>

      {mensaje && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {mensaje}
        </div>
      )}

      {modelos.length === 0 ? (
        <EmptyState icon={Copy} title="Sin modelos todavía" description="Creá un modelo para no tener que tipear los mismos asientos cada mes." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {modelos.map((m) => (
            <div key={m.id} className="rounded-lg border bg-card shadow-sm p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-sm">{m.nombre}</h3>
                  {m.descripcion && <p className="text-xs text-muted-foreground">{m.descripcion}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => abrirEditar(m)} className="p-1 text-muted-foreground hover:text-foreground">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleEliminarModelo(m.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {m.lineas.map((l) => (
                  <li key={l.id}>
                    {cuentasPorId.get(l.cuentaId)?.nombre ?? '?'}: {l.debe ? `Debe ${formatARS(l.debe)}` : `Haber ${formatARS(l.haber)}`}
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="outline" onClick={() => abrirAplicar(m)}>
                <Play className="h-4 w-4 mr-1" />
                Aplicar
              </Button>
            </div>
          ))}
        </div>
      )}

      <ModeloDialog
        open={dialogModeloOpen}
        onOpenChange={setDialogModeloOpen}
        onSave={handleGuardarModelo}
        cuentas={cuentas}
        modeloEditar={modeloEditar}
      />

      {modeloAplicar && (
        <AsientoDialog
          open={dialogAplicarOpen}
          onOpenChange={setDialogAplicarOpen}
          onSave={handleAplicar}
          cuentas={cuentas}
          lineasIniciales={modeloAplicar.lineas.map((l) => ({
            cuentaId: l.cuentaId,
            debe: l.debe,
            haber: l.haber,
            descripcion: l.descripcion,
          }))}
          descripcionInicial={modeloAplicar.nombre}
        />
      )}
    </div>
  )
}
