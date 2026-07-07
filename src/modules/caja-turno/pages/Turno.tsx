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

export default function Turno() {
  const { cliente } = useClienteActual()
  const { dispatch } = useCajaTurno()
  const turnoAbierto = useTurnoAbierto()
  const historial = useHistorialTurnos()

  const [montoApertura, setMontoApertura] = useState(0)
  const [montoCierre, setMontoCierre] = useState(0)
  const [calculando, setCalculando] = useState(false)

  function abrirTurno() {
    dispatch({ type: 'ABRIR_TURNO', payload: { montoApertura } })
  }

  async function cerrarTurno() {
    if (!turnoAbierto || !cliente?.id) return
    setCalculando(true)

    // Arqueo: lo esperado en caja es el monto de apertura más el neto de
    // efectivo (ingresos - egresos) que pasó por Tesorería desde que se
    // abrió este turno. Se usa created_at (timestamp exacto) y no fecha
    // (que en movimientos_caja es solo la fecha del día, sin hora) para
    // no mezclar con otro turno del mismo día.
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
      payload: { turnoId: turnoAbierto.id, montoCierreDeclarado: montoCierre, diferencia },
    })
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
