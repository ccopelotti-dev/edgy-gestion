'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileBarChart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAlquileres } from '../data/store'
import { EmptyState } from '../components/display'
import { formatARS, formatMesAnio, claveMes, todayISO } from '../lib/format'

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

// Liquidación mensual por propietario: agrupa las cobranzas del mes y
// muestra bruto - comisión = neto a liquidar. Mismo cálculo que hacía el
// sistema viejo (Settlements.tsx), acá sin el PDF todavía -- se suma en
// una fase siguiente reusando @/lib/comprobantes-pdf/pdfHelpers (igual
// que el resto de los módulos), no el jsPDF ad hoc que tenía el viejo.

export default function Liquidaciones() {
  const { state } = useAlquileres()
  const [mes, setMes] = useState(() => claveMes(todayISO()))

  const pagosDelMes = useMemo(() => state.pagos.filter((p) => claveMes(p.fecha) === mes), [state.pagos, mes])

  const porPropietario = useMemo(() => {
    const map = new Map<string, { total: number; comision: number; neto: number; cantidad: number }>()
    for (const p of pagosDelMes) {
      if (!p.propietarioId) continue
      const actual = map.get(p.propietarioId) ?? { total: 0, comision: 0, neto: 0, cantidad: 0 }
      actual.total += p.montoTotal
      actual.comision += p.comisionAdmin ?? 0
      actual.neto += p.saldoPropietario ?? p.montoTotal
      actual.cantidad += 1
      map.set(p.propietarioId, actual)
    }
    return map
  }, [pagosDelMes])

  const propietariosConMovimiento = state.propietarios.filter((p) => porPropietario.has(p.id))
  const totales = Array.from(porPropietario.values()).reduce(
    (acc, v) => ({ total: acc.total + v.total, comision: acc.comision + v.comision, neto: acc.neto + v.neto }),
    { total: 0, comision: 0, neto: 0 },
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMes(mesAnterior(mes))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold min-w-40 text-center">{formatMesAnio(`${mes}-01`)}</h2>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMes(mesSiguiente(mes))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {propietariosConMovimiento.length === 0 ? (
        <EmptyState icon={FileBarChart} title="Sin liquidaciones este mes" description="No hay cobranzas registradas para este mes todavía." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Propietario</th>
                  <th className="px-4 py-3 font-medium text-right">Cobranzas</th>
                  <th className="px-4 py-3 font-medium text-right">Bruto cobrado</th>
                  <th className="px-4 py-3 font-medium text-right">Comisión</th>
                  <th className="px-4 py-3 font-medium text-right">Neto a liquidar</th>
                </tr>
              </thead>
              <tbody>
                {propietariosConMovimiento.map((p) => {
                  const v = porPropietario.get(p.id)!
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{p.nombreCompleto}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{v.cantidad}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatARS(v.total)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatARS(v.comision)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatARS(v.neto)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">{formatARS(totales.total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatARS(totales.comision)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatARS(totales.neto)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            El recibo/liquidación en PDF para enviar a cada propietario todavía no está armado en esta primera versión -- es el siguiente paso.
          </p>
        </>
      )}
    </div>
  )
}
