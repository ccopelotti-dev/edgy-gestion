'use client'

import { useMemo, useState } from 'react'
import { Loader2, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReportesInventario, DEFINICIONES_INVENTARIO } from '../data/useReportesInventario'
import { ReportTable, EmptyState } from '../components/reportes/display'
import type { ResultadoReporte } from '../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

export default function Inventario() {
  const { cargando, error, rubrosProducto, rubrosServicio, generar } = useReportesInventario()

  const [reporteId, setReporteId] = useState(DEFINICIONES_INVENTARIO[0].id)
  const [rubroId, setRubroId] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const esServicios = reporteId === 'servicios-por-rubro'
  const opcionesRubro = esServicios ? rubrosServicio : rubrosProducto

  const resultado: ResultadoReporte = useMemo(
    () => generar(reporteId, { rubroId: rubroId || undefined, busqueda: busqueda || undefined }),
    [generar, reporteId, rubroId, busqueda],
  )

  const definicion = DEFINICIONES_INVENTARIO.find((d) => d.id === reporteId)

  function handleCambiarReporte(id: string) {
    setReporteId(id)
    setRubroId('')
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
    return <EmptyState icon={Package} title="No pudimos cargar los datos" description={error} />
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Reportes con datos reales -- consultan Supabase directo (Productos, Rubros y Servicios ya
        tienen tabla propia).
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">Reporte</label>
          <select className={inputClass} value={reporteId} onChange={(e) => handleCambiarReporte(e.target.value)}>
            {DEFINICIONES_INVENTARIO.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">Rubro</label>
          <select className={inputClass} value={rubroId} onChange={(e) => setRubroId(e.target.value)}>
            <option value="">Todos los rubros</option>
            {opcionesRubro.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">Buscar</label>
          <input
            className={cn(inputClass)}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre..."
          />
        </div>
      </div>

      {definicion && <p className="text-xs text-muted-foreground">{definicion.descripcion}</p>}

      <ReportTable resultado={resultado} nombreArchivo={`reporte-${reporteId}.csv`} />
    </div>
  )
}
