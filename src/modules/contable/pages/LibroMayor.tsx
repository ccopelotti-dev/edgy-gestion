'use client'

import { useMemo, useState } from 'react'
import { Loader2, BookText } from 'lucide-react'
import { useCuentasContables } from '../data/useCuentasContables'
import { useAsientos } from '../data/useAsientos'
import { construirLibroMayor } from '../lib/libros'
import { EmptyState } from '../components/contable/display'
import { formatARS, formatDate } from '../lib/format'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

export default function LibroMayor() {
  const { cuentas, cargando: cargandoCuentas, error: errorCuentas } = useCuentasContables()
  const { asientos, cargando: cargandoAsientos, error: errorAsientos } = useAsientos()

  const cuentasImputables = useMemo(
    () => cuentas.filter((c) => c.imputable).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [cuentas],
  )
  const [cuentaId, setCuentaId] = useState('')

  const cuenta = cuentas.find((c) => c.id === cuentaId)
  const movimientos = useMemo(() => (cuenta ? construirLibroMayor(asientos, cuenta) : []), [asientos, cuenta])

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
    return <EmptyState icon={BookText} title="No pudimos cargar el libro mayor" description={error} />
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Elegí una cuenta para ver todos sus movimientos con saldo acumulado.
      </p>

      <div className="grid gap-1.5 max-w-sm">
        <label className="text-sm font-medium">Cuenta</label>
        <select className={inputClass} value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
          <option value="">Elegir cuenta...</option>
          {cuentasImputables.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} - {c.nombre}
            </option>
          ))}
        </select>
      </div>

      {!cuenta ? (
        <EmptyState icon={BookText} title="Sin cuenta seleccionada" description="Elegí una cuenta de la lista para ver su mayor." />
      ) : movimientos.length === 0 ? (
        <EmptyState icon={BookText} title="Sin movimientos" description="Esta cuenta todavía no tiene ningún movimiento cargado." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">N°</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Fecha</th>
                <th className="px-4 py-2.5 font-medium">Descripción</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap text-right">Debe</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap text-right">Haber</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{m.numero}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(m.fecha)}</td>
                  <td className="px-4 py-2">{m.descripcion || '-'}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-right">{m.debe ? formatARS(m.debe) : ''}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-right">{m.haber ? formatARS(m.haber) : ''}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-right font-medium">{formatARS(m.saldoAcumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
