'use client'

import { useMemo, useState } from 'react'
import { ReportTable, ExampleBanner } from '../components/reportes/display'
import { DEFINICIONES_FINANCIERO, generarReporteEjemplo } from '../data/reportesEjemplo'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

export default function Financiero() {
  const [reporteId, setReporteId] = useState(DEFINICIONES_FINANCIERO[0].id)

  const resultado = useMemo(() => generarReporteEjemplo(reporteId), [reporteId])
  const definicion = DEFINICIONES_FINANCIERO.find((d) => d.id === reporteId)

  return (
    <div className="space-y-4">
      <ExampleBanner />

      <div className="grid gap-1.5 max-w-xs">
        <label className="text-sm font-medium">Reporte</label>
        <select className={inputClass} value={reporteId} onChange={(e) => setReporteId(e.target.value)}>
          {DEFINICIONES_FINANCIERO.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
      </div>

      {definicion && <p className="text-xs text-muted-foreground">{definicion.descripcion}</p>}

      <ReportTable resultado={resultado} nombreArchivo={`reporte-${reporteId}.csv`} />
    </div>
  )
}
