'use client'

import { useMemo } from 'react'
import { Loader2, BookOpen } from 'lucide-react'
import { useCuentasContables } from '../data/useCuentasContables'
import { useAsientos } from '../data/useAsientos'
import { construirLibroDiario } from '../lib/libros'
import { EmptyState, OrigenBadge } from '../components/contable/display'
import { formatARS, formatDate } from '../lib/format'

export default function LibroDiario() {
  const { cuentas, cargando: cargandoCuentas, error: errorCuentas } = useCuentasContables()
  const { asientos, cargando: cargandoAsientos, error: errorAsientos } = useAsientos()

  const cuentasPorId = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas])
  const movimientos = useMemo(() => construirLibroDiario(asientos, cuentasPorId), [asientos, cuentasPorId])

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
    return <EmptyState icon={BookOpen} title="No pudimos cargar el libro diario" description={error} />
  }

  if (movimientos.length === 0) {
    return <EmptyState icon={BookOpen} title="Sin asientos todavía" description="El libro diario se arma solo con los asientos que se vayan cargando." />
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Vista de solo lectura: todos los asientos ordenados cronológicamente, con su numeración
        correlativa. Se recalcula al vuelo -- no es una tabla propia.
      </p>

      <div className="space-y-3">
        {movimientos.map((m) => (
          <div key={m.asientoId} className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-sm">
              <span>
                <b>N° {m.numero}</b> &nbsp;·&nbsp; {formatDate(m.fecha)} &nbsp;·&nbsp; {m.descripcion || 'Sin descripción'}
              </span>
              <OrigenBadge origen={m.origen} />
            </div>
            <table className="w-full text-sm">
              <tbody>
                {m.lineas.map((l, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-1.5 text-xs font-mono text-muted-foreground w-24">{l.cuentaCodigo}</td>
                    <td className="px-4 py-1.5">{l.cuentaNombre}</td>
                    <td className="px-4 py-1.5 text-right w-32">{l.debe ? formatARS(l.debe) : ''}</td>
                    <td className="px-4 py-1.5 text-right w-32">{l.haber ? formatARS(l.haber) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
