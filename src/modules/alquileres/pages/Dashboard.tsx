'use client'

import { useMemo } from 'react'
import { Building2, Home, Wallet, AlertTriangle } from 'lucide-react'
import { useAlquileres } from '../data/store'
import { KpiCard, EmptyState } from '../components/display'
import { formatARS, formatDate, formatMesAnio, claveMes, todayISO, diasHasta } from '../lib/format'

export default function Dashboard() {
  const { state } = useAlquileres()

  const mesActual = claveMes(todayISO())

  const totalUnidades = state.unidades.length
  const unidadesOcupadas = state.unidades.filter((u) => u.estado === 'ocupada').length
  const ocupacion = totalUnidades > 0 ? Math.round((unidadesOcupadas / totalUnidades) * 100) : 0

  const recaudacionMes = useMemo(
    () => state.pagos.filter((p) => claveMes(p.fecha) === mesActual).reduce((acc, p) => acc + p.montoTotal, 0),
    [state.pagos, mesActual],
  )

  const contratosPorVencer = useMemo(
    () =>
      state.inquilinos
        .filter((i) => i.finContrato && diasHasta(i.finContrato) <= 60)
        .sort((a, b) => (a.finContrato ?? '').localeCompare(b.finContrato ?? '')),
    [state.inquilinos],
  )

  function nombreUnidad(unidadId: string) {
    const u = state.unidades.find((x) => x.id === unidadId)
    if (!u) return '—'
    const propiedad = state.propiedades.find((p) => p.id === u.propiedadId)
    return propiedad ? `${propiedad.nombre} · ${u.nombre}` : u.nombre
  }

  if (state.propiedades.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Todavía no hay nada cargado"
        description='Empezá por la pestaña "Propietarios" y después "Propiedades y unidades" para armar la estructura.'
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Ocupación" value={`${ocupacion}%`} subtitle={`${unidadesOcupadas} de ${totalUnidades} unidades`} accent="primary" icon={Home} />
        <KpiCard title={`Recaudación de ${formatMesAnio(`${mesActual}-01`)}`} value={formatARS(recaudacionMes)} accent="income" icon={Wallet} />
        <KpiCard title="Propiedades" value={String(state.propiedades.length)} subtitle={`${state.propietarios.length} propietario(s)`} accent="primary" icon={Building2} />
        <KpiCard
          title="Contratos por vencer"
          value={String(contratosPorVencer.length)}
          subtitle="En los próximos 60 días"
          accent={contratosPorVencer.length > 0 ? 'warning' : 'primary'}
          icon={AlertTriangle}
        />
      </div>

      {contratosPorVencer.length > 0 && (
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Contratos por vencer</h3>
          </div>
          <div className="divide-y">
            {contratosPorVencer.map((i) => {
              const dias = diasHasta(i.finContrato!)
              return (
                <div key={i.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{i.nombre} {i.apellido}</p>
                    <p className="text-muted-foreground text-xs">{nombreUnidad(i.unidadId)}</p>
                  </div>
                  <div className="text-right">
                    <p className={dias < 0 ? 'font-medium text-red-600' : 'font-medium text-yellow-700 dark:text-yellow-400'}>
                      {formatDate(i.finContrato!)}
                    </p>
                    <p className="text-muted-foreground text-xs">{dias < 0 ? 'vencido' : `en ${dias} días`}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
