'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileBarChart, FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAlquileres } from '../data/store'
import { useClienteActual } from '@/hooks/useClienteActual'
import { EmptyState } from '../components/display'
import { formatARS, formatMesAnio, claveMes, todayISO } from '../lib/format'
import { generarLiquidacionPdf } from '../lib/generarLiquidacionPdf'

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
// sistema viejo (Settlements.tsx), con el PDF armado ahora con el motor
// propio de Edgy Gestión (@/lib/comprobantes-pdf/pdfHelpers) en vez del
// jsPDF+autoTable ad hoc del viejo.

export default function Liquidaciones() {
  const { state } = useAlquileres()
  const { cliente } = useClienteActual()
  const [mes, setMes] = useState(() => claveMes(todayISO()))
  const [generando, setGenerando] = useState<string | null>(null)

  function nombreUnidad(unidadId?: string) {
    const u = state.unidades.find((x) => x.id === unidadId)
    if (!u) return '—'
    const propiedad = state.propiedades.find((p) => p.id === u.propiedadId)
    return propiedad ? `${propiedad.nombre} · ${u.nombre}` : u.nombre
  }

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

  async function handleGenerarPdf(propietarioId: string) {
    if (!cliente) return
    const propietario = state.propietarios.find((p) => p.id === propietarioId)
    if (!propietario) return
    const v = porPropietario.get(propietarioId)!
    const lineasDelPropietario = pagosDelMes
      .filter((p) => p.propietarioId === propietarioId)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((p) => ({
        fecha: p.fecha,
        concepto: p.concepto ?? '',
        unidadNombre: nombreUnidad(p.unidadId),
        montoTotal: p.montoTotal,
      }))

    setGenerando(propietarioId)
    try {
      await generarLiquidacionPdf(
        {
          nombre: cliente.nombre,
          cuit: cliente.cuit,
          direccion: cliente.direccion,
          telefono: cliente.telefono,
          logoUrl: cliente.logo_url,
          colorMarca: cliente.color_marca,
        },
        {
          propietarioNombre: propietario.nombreCompleto,
          mesLabel: formatMesAnio(`${mes}-01`),
          comisionPorcentaje: propietario.comisionPorcentaje,
          lineas: lineasDelPropietario,
          totalBruto: v.total,
          totalComision: v.comision,
          totalNeto: v.neto,
        },
        `Liquidacion_${propietario.nombreCompleto.replace(/\s+/g, '_')}_${mes}`,
      )
    } finally {
      setGenerando(null)
    }
  }

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
                  <th className="px-4 py-3 w-12" />
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
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleGenerarPdf(p.id)}
                          disabled={generando === p.id || !cliente}
                          title="Generar PDF de liquidación"
                        >
                          {generando === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                        </Button>
                      </td>
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
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
