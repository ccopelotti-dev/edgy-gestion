'use client'

import { useMemo } from 'react'
import { Loader2, Scale } from 'lucide-react'
import { useCuentasContables } from '../data/useCuentasContables'
import { useAsientos } from '../data/useAsientos'
import { calcularBalanceGeneral } from '../lib/estadosContables'
import { EmptyState } from '../components/contable/display'
import { formatARS } from '../lib/format'
import type { FilaBalanceGeneral } from '../types'

function TablaRama({ titulo, filas, total }: { titulo: string; filas: FilaBalanceGeneral[]; total: number }) {
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
              <td className="px-4 py-1.5 text-right">{f.imputable ? formatARS(f.saldo) : ''}</td>
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

export default function BalanceGeneral() {
  const { cuentas, cargando: cargandoCuentas, error: errorCuentas } = useCuentasContables()
  const { asientos, cargando: cargandoAsientos, error: errorAsientos } = useAsientos()

  const balance = useMemo(() => calcularBalanceGeneral(cuentas, asientos), [cuentas, asientos])

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
    return <EmptyState icon={Scale} title="No pudimos calcular el balance" description={error} />
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Activo = Pasivo + Patrimonio Neto, calculado con el saldo acumulado de todos los asientos
        cargados hasta hoy (esta v1 no filtra por fecha de corte).
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <TablaRama titulo="Activo" filas={balance.activo} total={balance.totalActivo} />
        <div className="space-y-4">
          <TablaRama titulo="Pasivo" filas={balance.pasivo} total={balance.totalPasivo} />
          <TablaRama titulo="Patrimonio Neto" filas={balance.patrimonioNeto} total={balance.totalPatrimonioNeto} />
        </div>
      </div>

      <div
        className={
          Math.abs(balance.diferencia) < 0.01
            ? 'rounded-md border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400'
            : 'rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400'
        }
      >
        {Math.abs(balance.diferencia) < 0.01
          ? `Balancea correctamente: Activo ${formatARS(balance.totalActivo)} = Pasivo + Patrimonio Neto ${formatARS(balance.totalPasivo + balance.totalPatrimonioNeto)}.`
          : `Atención: hay una diferencia de ${formatARS(balance.diferencia)} entre Activo y Pasivo + Patrimonio Neto -- no debería pasar si todos los asientos se cargaron por esta app (partida doble validada al guardar).`}
      </div>
    </div>
  )
}
