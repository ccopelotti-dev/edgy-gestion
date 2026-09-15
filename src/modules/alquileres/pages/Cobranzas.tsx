'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Receipt, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAlquileres } from '../data/store'
import { EmptyState } from '../components/display'
import { PagoDialog } from '../components/dialogs'
import { formatARS, formatDate, formatMesAnio, claveMes, todayISO } from '../lib/format'
import { obtenerUrlDescarga } from '@/modules/utilidades/lib/archivos'
import type { FormaPago } from '../types'

function mesAnterior(clave: string): string {
  const [a, m] = clave.split('-').map(Number)
  const d = new Date(a, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function mesSiguiente(clave: string): string {
  const [a, m] = clave.split('-').map(Number)
  const d = new Date(a, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Cobranzas() {
  const { state, dispatch } = useAlquileres()
  const [mes, setMes] = useState(() => claveMes(todayISO()))
  const [inquilinoId, setInquilinoId] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const pagosDelMes = useMemo(
    () => state.pagos.filter((p) => claveMes(p.fecha) === mes).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [state.pagos, mes],
  )

  function nombreInquilino(id: string) {
    const i = state.inquilinos.find((x) => x.id === id)
    return i ? `${i.nombre} ${i.apellido}` : '—'
  }
  function nombreUnidad(unidadId?: string) {
    const u = state.unidades.find((x) => x.id === unidadId)
    if (!u) return '—'
    const propiedad = state.propiedades.find((p) => p.id === u.propiedadId)
    return propiedad ? `${propiedad.nombre} · ${u.nombre}` : u.nombre
  }

  const inquilinoSeleccionado = state.inquilinos.find((i) => i.id === inquilinoId)
  const propietarioDelInquilino = useMemo(() => {
    if (!inquilinoSeleccionado) return undefined
    const unidad = state.unidades.find((u) => u.id === inquilinoSeleccionado.unidadId)
    const propiedad = unidad ? state.propiedades.find((p) => p.id === unidad.propiedadId) : undefined
    return propiedad ? state.propietarios.find((p) => p.id === propiedad.propietarioId) : undefined
  }, [inquilinoSeleccionado, state.unidades, state.propiedades, state.propietarios])

  function handleAbrirDialogo() {
    if (!inquilinoId) return
    setDialogOpen(true)
  }

  function handleGuardarPago(data: {
    fecha: string
    formaPago: FormaPago
    montoAlquiler: number
    montoTasas: number
    montoExpensas: number
    montoOtros: number
    concepto?: string
    datosBancarios?: { cbuAlias?: string }
    numeroRecibo?: string
    notas?: string
    comprobantePath?: string
  }) {
    if (!inquilinoSeleccionado) return
    const total = data.montoAlquiler + data.montoTasas + data.montoExpensas + data.montoOtros
    const pct = propietarioDelInquilino?.comisionPorcentaje ?? 0
    const comisionAdmin = Math.round(total * (pct / 100) * 100) / 100
    const saldoPropietario = Math.round((total - comisionAdmin) * 100) / 100
    dispatch({
      type: 'ADD_PAGO',
      payload: {
        ...data,
        inquilinoId: inquilinoSeleccionado.id,
        unidadId: inquilinoSeleccionado.unidadId,
        propietarioId: propietarioDelInquilino?.id,
        comisionPorcentajeAplicado: pct,
        comisionAdmin,
        saldoPropietario,
        periodoFechas: [`${data.fecha.slice(0, 7)}-01`],
      },
    })
    setInquilinoId('')
  }

  function handleEliminar(id: string) {
    if (window.confirm('¿Eliminar esta cobranza?')) {
      dispatch({ type: 'DELETE_PAGO', payload: id })
    }
  }

  async function handleVerComprobante(path: string) {
    try {
      const url = await obtenerUrlDescarga(path)
      window.open(url, '_blank')
    } catch {
      window.alert('No se pudo generar el link de descarga del comprobante.')
    }
  }

  const totalMes = pagosDelMes.reduce((acc, p) => acc + p.montoTotal, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMes(mesAnterior(mes))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-40 text-center">{formatMesAnio(`${mes}-01`)}</h2>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMes(mesSiguiente(mes))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {state.inquilinos.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={inquilinoId}
              onChange={(e) => setInquilinoId(e.target.value)}
            >
              <option value="">Elegir inquilino...</option>
              {state.inquilinos.map((i) => (
                <option key={i.id} value={i.id}>{i.nombre} {i.apellido} · {nombreUnidad(i.unidadId)}</option>
              ))}
            </select>
            <Button size="sm" onClick={handleAbrirDialogo} disabled={!inquilinoId}>
              <Plus className="mr-1 h-4 w-4" />
              Nueva cobranza
            </Button>
          </div>
        )}
      </div>

      {pagosDelMes.length === 0 ? (
        <EmptyState icon={Receipt} title="Sin cobranzas este mes" description="Elegí un inquilino arriba para registrar una cobranza.">
          {state.inquilinos.length === 0 && (
            <p className="text-xs text-muted-foreground">Primero cargá inquilinos en la pestaña "Inquilinos".</p>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Inquilino</th>
                  <th className="px-4 py-3 font-medium">Unidad</th>
                  <th className="px-4 py-3 font-medium">Forma de pago</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Neto propietario</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {pagosDelMes.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(p.fecha)}</td>
                    <td className="px-4 py-3 font-medium">{nombreInquilino(p.inquilinoId)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{nombreUnidad(p.unidadId)}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{p.formaPago ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{formatARS(p.montoTotal)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {p.saldoPropietario != null ? formatARS(p.saldoPropietario) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                      {p.comprobantePath && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleVerComprobante(p.comprobantePath!)} title="Ver comprobante">
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-500" onClick={() => handleEliminar(p.id)} title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm font-medium">Total del mes: <span className="tabular-nums">{formatARS(totalMes)}</span></p>
        </>
      )}

      {inquilinoSeleccionado && (
        <PagoDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSave={handleGuardarPago}
          inquilinoNombre={`${inquilinoSeleccionado.nombre} ${inquilinoSeleccionado.apellido}`}
          comisionPorcentaje={propietarioDelInquilino?.comisionPorcentaje ?? 0}
          montoAlquilerSugerido={inquilinoSeleccionado.montoAlquiler}
        />
      )}
    </div>
  )
}
