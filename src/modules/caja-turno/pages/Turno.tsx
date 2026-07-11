import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { useCajaTurno, useTurnoAbierto, useHistorialTurnos } from '../data/store'
import { formatARS, formatDateTime } from '../lib/format'

// NOTA: usuarioAperturaId/usuarioCierreId quedan sin resolver por ahora
// (undefined) — no encontré todavía un hook que exponga el id de
// usuarios_cliente del usuario logueado (useClienteActual solo trae el
// cliente/tenant, no la fila de usuarios_cliente). Cuando exista, se
// suma acá en una sola línea; mientras tanto el turno se abre/cierra
// igual, solo que sin adjudicar a qué persona del staff corresponde.
//
// Fase 13b (arqueo ciego): el monto esperado (apertura + neto de
// efectivo) NUNCA se le muestra al cajero mientras carga su conteo --
// se calcula recién adentro de cerrarTurno(), después de que ya
// escribió `montoCierre`. Lo que agrega esta fase es (a) guardar ese
// esperado en el turno para poder auditar el arqueo más adelante (antes
// solo se persistía la diferencia ya calculada, sin dejar rastro de
// contra qué se comparó), y (b) mostrarle al cajero un resumen claro
// recién DESPUÉS de confirmar el cierre, en vez de que tenga que ir a
// buscarlo en el historial.
interface ResumenCierre {
  declarado: number
  esperado: number
  diferencia: number
}

export default function Turno() {
  const { cliente } = useClienteActual()
  const { dispatch } = useCajaTurno()
  const turnoAbierto = useTurnoAbierto()
  const historial = useHistorialTurnos()

  const [montoApertura, setMontoApertura] = useState(0)
  const [montoCierre, setMontoCierre] = useState(0)
  const [calculando, setCalculando] = useState(false)
  const [resumenCierre, setResumenCierre] = useState<ResumenCierre | null>(null)

  function abrirTurno() {
    setResumenCierre(null)
    dispatch({ type: 'ABRIR_TURNO', payload: { montoApertura } })
  }

  async function cerrarTurno() {
    if (!turnoAbierto || !cliente?.id) return
    setCalculando(true)

    // Arqueo ciego: lo esperado en caja es el monto de apertura más el
    // neto de efectivo (ingresos - egresos) que pasó por Tesorería
    // desde que se abrió este turno. Se usa created_at (timestamp
    // exacto) y no fecha (que en movimientos_caja es solo la fecha del
    // día, sin hora) para no mezclar con otro turno del mismo día. Este
    // cálculo se hace recién ACÁ, después de que el cajero ya declaró
    // `montoCierre` -- nunca se le mostró antes en pantalla.
    const { data } = await supabase
      .from('movimientos_caja')
      .select('tipo, monto')
      .eq('cliente_id', cliente.id)
      .eq('medio_pago', 'efectivo')
      .gte('created_at', turnoAbierto.fechaApertura)

    const neto = (data ?? []).reduce(
      (sum, m: any) => sum + (m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)),
      0,
    )
    const esperado = turnoAbierto.montoApertura + neto
    const diferencia = montoCierre - esperado

    dispatch({
      type: 'CERRAR_TURNO',
      payload: { turnoId: turnoAbierto.id, montoCierreDeclarado: montoCierre, montoEsperado: esperado, diferencia },
    })
    setResumenCierre({ declarado: montoCierre, esperado, diferencia })
    setMontoCierre(0)
    setCalculando(false)
  }

  return (
    <div className="flex flex-col gap-6">
      {!turnoAbierto ? (
        <Card className="max-w-sm">
          <CardContent className="flex flex-col gap-3 py-6">
            <h2 className="font-semibold">Abrir turno</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apertura">Monto de apertura</Label>
              <Input
                id="apertura"
                type="number"
                value={montoApertura}
                onChange={(e) => setMontoApertura(Number(e.target.value) || 0)}
              />
            </div>
            <Button onClick={abrirTurno}>Abrir turno</Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-sm border-emerald-300 bg-emerald-50">
          <CardContent className="flex flex-col gap-3 py-6">
            <div>
              <h2 className="font-semibold text-emerald-900">Turno abierto</h2>
              <p className="text-sm text-emerald-800">
                Desde {formatDateTime(turnoAbierto.fechaApertura)} · apertura {formatARS(turnoAbierto.montoApertura)}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cierre">Monto declarado al cierre</Label>
              <Input
                id="cierre"
                type="number"
                value={montoCierre}
                onChange={(e) => setMontoCierre(Number(e.target.value) || 0)}
              />
            </div>
            <Button onClick={cerrarTurno} disabled={calculando} variant="destructive">
              {calculando ? 'Calculando arqueo…' : 'Cerrar turno'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Fase 13b: resumen del arqueo recién visible DESPUÉS de
          confirmar el cierre -- el cajero nunca vio `esperado` antes
          de declarar su conteo. */}
      {resumenCierre && (
        <Card
          className={
            resumenCierre.diferencia === 0
              ? 'max-w-sm border-emerald-300 bg-emerald-50'
              : 'max-w-sm border-amber-300 bg-amber-50'
          }
        >
          <CardContent className="flex flex-col gap-2 py-4">
            <h3 className="font-semibold">Resumen del arqueo</h3>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Contado (declarado)</span>
              <span className="font-medium">{formatARS(resumenCierre.declarado)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Esperado en sistema</span>
              <span className="font-medium">{formatARS(resumenCierre.esperado)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-sm font-semibold">
              <span>Diferencia</span>
              <span className={resumenCierre.diferencia === 0 ? 'text-emerald-700' : 'text-amber-700'}>
                {resumenCierre.diferencia === 0 ? 'Sin diferencia' : formatARS(resumenCierre.diferencia)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {historial.length > 0 && (
        <div>
          <h3 className="mb-2 font-medium">Historial</h3>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Apertura</th>
                  <th className="px-3 py-2">Cierre</th>
                  <th className="px-3 py-2 text-right">Monto apertura</th>
                  <th className="px-3 py-2 text-right">Declarado</th>
                  <th className="px-3 py-2 text-right">Esperado</th>
                  <th className="px-3 py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2">{formatDateTime(t.fechaApertura)}</td>
                    <td className="px-3 py-2">{t.fechaCierre ? formatDateTime(t.fechaCierre) : '—'}</td>
                    <td className="px-3 py-2 text-right">{formatARS(t.montoApertura)}</td>
                    <td className="px-3 py-2 text-right">
                      {t.montoCierreDeclarado != null ? formatARS(t.montoCierreDeclarado) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {t.montoEsperado != null ? formatARS(t.montoEsperado) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right ${t.diferencia && t.diferencia !== 0 ? 'text-red-600' : ''}`}>
                      {t.diferencia != null ? formatARS(t.diferencia) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
