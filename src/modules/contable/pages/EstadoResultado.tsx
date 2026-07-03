'use client'

import { useMemo } from 'react'
import { Loader2, TrendingUp } from 'lucide-react'
import { useCuentasContables } from '../data/useCuentasContables'
import { useAsientos } from '../data/useAsientos'
import { calcularEstadoResultado } from '../lib/estadosContables'
import { EmptyState } from '../components/contable/display'
import { formatARS } from '../lib/format'
import type { FilaEstadoResultado } from '../types'

function TablaRama({ titulo, filas, total }: { titulo: string; filas: FilaEstadoResultado[]; total: number }) {
  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <div className="border-b bg-muted/40 px-4 py-2 text-sm font-medium">{titulo}</div>
      <table className="w-full text-sm">
        <tbody>
          {filas.map((f) => (
            <tr key={f.cuentaId} className="border-b last:border-0">
              <td className="px-4 py-1.5 text-xs font-mono text-muted-foreground w-20">{f.codigo}</td>
              <td className="px-4 py-1.5" style={{ paddingLeft: `${1 + f.nivel * 1.25}rem` }}>
                {f.imputable ? f.nombre : <b>{f.nombre}</b>}
              </td>
              <td className="px-4 py-1.5 text-right">{f.imputable ? formatARS(f.monto) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/30 font-medium">
            <td className="px-4 py-2" colSpan={2}>
              Total {titulo}
            </td>
            <td className="px-4 py-2 text-right">{formatARS(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default function EstadoResultado() {
  const { cuentas, cargando: cargandoCuentas, error: errorCuentas } = useCuentasContables()
  const { asientos, cargando: cargandoAsientos, error: errorAsientos } = useAsientos()

  const estado = useMemo(() => calcularEstadoResultado(cuentas, asientos), [cuentas, asientos])

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
    return <EmptyState icon={TrendingUp} title="No pudimos calcular el estado de resultado" description={error} />
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Ingresos − Costos − Gastos = Resultado, con el saldo acumulado de todos los asientos
        cargados hasta hoy (esta v1 no filtra por período -- para eso está "Cerrar ejercicio",
        que cancela estas cuentas contra Patrimonio Neto).
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <TablaRama titulo="Ingresos" filas={estado.ingresos} total={estado.totalIngresos} />
        <TablaRama titulo="Costos" filas={estado.costos} total={estado.totalCostos} />
        <TablaRama titulo="Gastos" filas={estado.gastos} total={estado.totalGastos} />
      </div>

      <div
        className={
          estado.resultado >= 0
            ? 'rounded-md border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400'
            : 'rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400'
        }
      >
        Resultado del período: <b>{formatARS(estado.resultado)}</b> ({estado.resultado >= 0 ? 'ganancia' : 'pérdida'})
      </div>
    </div>
  )
}
