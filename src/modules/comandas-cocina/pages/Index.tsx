import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { useComandasCocina } from '../data/store'
import { formatARS, formatHora } from '../lib/format'

// Landing del modulo: lista las comandas activas (abierta/cobro) de
// todas las mesas, para cuando alguien entra a Comandas sin venir desde
// una mesa puntual del Salon. El numero de mesa se resuelve con una
// consulta directa a la tabla `mesas` (no via MesasSalonProvider, que
// no esta montado aca -- mismo criterio cross-modulo que
// useTurnoActivo).
//
// Fase 7a: "Lista para cobrar" es el mismo derivado que usa Mesa.tsx
// (todos los ítems en listo/entregado) -- se calcula acá también para
// que el resto del equipo vea de un vistazo qué mesas ya puede cerrar
// el mozo, sin tener que entrar a cada una.
export default function ComandasIndex() {
  const navigate = useNavigate()
  const { cliente } = useClienteActual()
  const { state } = useComandasCocina()
  const [numeroPorMesa, setNumeroPorMesa] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!cliente?.id) return
    supabase
      .from('mesas')
      .select('id, numero')
      .then(({ data }) => {
        const mapa: Record<string, number> = {}
        for (const m of data ?? []) mapa[m.id] = m.numero
        setNumeroPorMesa(mapa)
      })
  }, [cliente?.id])

  const comandasActivas = state.comandas
    .filter((c) => c.estado === 'abierta' || c.estado === 'cobro')
    .sort((a, b) => a.fechaApertura.localeCompare(b.fechaApertura))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comandas</h1>
        <p className="text-muted-foreground text-sm">Comandas abiertas o en cobro en este momento.</p>
      </div>

      {comandasActivas.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No hay comandas activas. Abrí una desde el plano de Mesas y Salón.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Mesa</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Abierta desde</th>
                <th className="px-3 py-2 text-right">Ítems</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {comandasActivas.map((c) => {
                const todosListos =
                  c.items.length > 0 && c.items.every((i) => i.estadoCocina === 'listo' || i.estadoCocina === 'entregado')
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-t hover:bg-gray-50"
                    onClick={() => navigate(`/m/comandas-cocina/mesa/${c.mesaId}`)}
                  >
                    <td className="px-3 py-2 font-medium">Mesa {numeroPorMesa[c.mesaId] ?? '—'}</td>
                    <td className="px-3 py-2">
                      {c.estado === 'cobro' ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          En cobro
                        </span>
                      ) : todosListos ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Lista para cobrar
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Abierta
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{formatHora(c.fechaApertura)}</td>
                    <td className="px-3 py-2 text-right">{c.items.length}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatARS(c.total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
