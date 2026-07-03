'use client'

import { useMemo } from 'react'
import { Briefcase, Tags, CheckCircle2, HelpCircle } from 'lucide-react'
import { useServicios, precioDesde } from '../data/store'
import { KpiCard, EstadoBadge, TipoServicioBadge } from '../components/servicios/display'
import { formatDate } from '../lib/format'

export default function Dashboard() {
  const { state } = useServicios()

  const activos = useMemo(
    () => state.servicios.filter((s) => s.estado === 'activo').length,
    [state.servicios],
  )

  const aConvenir = useMemo(
    () => state.servicios.filter((s) => precioDesde(s) == null).length,
    [state.servicios],
  )

  const ultimosServicios = useMemo(
    () =>
      [...state.servicios]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8),
    [state.servicios],
  )

  const rubrosMap = useMemo(() => new Map(state.rubros.map((r) => [r.id, r])), [state.rubros])

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Servicios"
          value={String(state.servicios.length)}
          accent="primary"
          icon={Briefcase}
        />
        <KpiCard
          title="Activos"
          value={String(activos)}
          accent="income"
          icon={CheckCircle2}
          subtitle={`${state.servicios.length - activos} inactivo(s)`}
        />
        <KpiCard title="Rubros" value={String(state.rubros.length)} accent="primary" icon={Tags} />
        <KpiCard
          title="A convenir"
          value={String(aConvenir)}
          accent="warning"
          icon={HelpCircle}
          subtitle="Sin precio público cargado"
        />
      </div>

      {/* Últimos servicios cargados */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Últimos servicios cargados</h3>
        </div>
        {ultimosServicios.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Todavía no hay servicios cargados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Título</th>
                  <th className="px-4 py-2 font-medium">Rubro</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2 font-medium">Alta</th>
                </tr>
              </thead>
              <tbody>
                {ultimosServicios.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{s.titulo}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {rubrosMap.get(s.rubroId)?.nombre ?? 'Rubro eliminado'}
                    </td>
                    <td className="px-4 py-2">
                      <TipoServicioBadge tipo={s.tipo} />
                    </td>
                    <td className="px-4 py-2">
                      <EstadoBadge estado={s.estado} />
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {formatDate(s.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
