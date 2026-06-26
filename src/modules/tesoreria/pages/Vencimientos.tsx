import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ScrollText,
} from 'lucide-react'
import { useTreasury, useVencimientos } from '../data/store'
import type { Cheque } from '../types'
import { KpiCard } from '../components/treasury/KpiCard'
import { Amount, EmptyState } from '../components/treasury/display'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  formatARS,
  formatARSCompact,
  formatDateLong,
  todayISO,
  daysUntil,
} from '../lib/format'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function getMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startDay = (first.getDay() + 6) % 7
  const days: (number | null)[] = Array(startDay).fill(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(d)
  while (days.length % 7 !== 0) days.push(null)
  return days
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function Vencimientos() {
  const { state } = useTreasury()
  const { porCobrar, porPagar, vencidos } = useVencimientos()

  const today = todayISO()
  const [viewYear, setViewYear] = useState(() => Number(today.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => Number(today.slice(5, 7)) - 1)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  })

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
    setSelectedDay(null)
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
    setSelectedDay(null)
  }

  const chequesByDate = useMemo(() => {
    const map: Record<string, Cheque[]> = {}
    for (const c of state.cheques) {
      if (c.estado !== 'en_cartera') continue
      ;(map[c.fechaCobro] ??= []).push(c)
    }
    return map
  }, [state.cheques])

  const grid = getMonthGrid(viewYear, viewMonth)

  const selectedCheques = selectedDay ? chequesByDate[selectedDay] ?? [] : []

  const totalPorCobrar = porCobrar.reduce((a, c) => a + c.monto, 0)
  const totalPorPagar = porPagar.reduce((a, c) => a + c.monto, 0)
  const totalVencidos = vencidos.reduce((a, c) => a + c.monto, 0)

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Por cobrar"
          value={formatARS(totalPorCobrar)}
          icon={ArrowDownToLine}
          accent="income"
          hint={`${porCobrar.length} cheques recibidos en cartera`}
        />
        <KpiCard
          label="Por pagar"
          value={formatARS(totalPorPagar)}
          icon={ArrowUpFromLine}
          accent="expense"
          hint={`${porPagar.length} cheques emitidos en cartera`}
        />
        <KpiCard
          label="Flujo neto pendiente"
          value={formatARS(totalPorCobrar - totalPorPagar)}
          icon={CalendarClock}
          accent={totalPorCobrar - totalPorPagar >= 0 ? 'income' : 'expense'}
        />
        <KpiCard
          label="Vencidos"
          value={vencidos.length > 0 ? formatARS(totalVencidos) : '—'}
          icon={AlertTriangle}
          accent={vencidos.length > 0 ? 'expense' : 'primary'}
          hint={vencidos.length > 0 ? `${vencidos.length} cheques vencidos` : 'Sin vencidos'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="capitalize">{monthLabel}</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="size-8" onClick={prevMonth}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setViewYear(Number(today.slice(0, 4)))
                  setViewMonth(Number(today.slice(5, 7)) - 1)
                  setSelectedDay(null)
                }}
              >
                Hoy
              </Button>
              <Button variant="ghost" size="icon" className="size-8" onClick={nextMonth}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 text-center">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-muted-foreground py-2 text-xs font-medium">
                  {d}
                </div>
              ))}
              {grid.map((day, i) => {
                if (day === null)
                  return <div key={`empty-${i}`} className="aspect-square" />
                const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`
                const cheques = chequesByDate[dateStr]
                const isToday = dateStr === today
                const isSelected = dateStr === selectedDay
                const hasRecibido = cheques?.some((c) => c.tipo === 'recibido')
                const hasEmitido = cheques?.some((c) => c.tipo === 'emitido')
                const totalDia = cheques?.reduce((a, c) => a + c.monto, 0) ?? 0
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                    className={cn(
                      'relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm transition-colors',
                      isToday && !isSelected && 'bg-primary/10 font-semibold',
                      isSelected && 'bg-primary text-primary-foreground',
                      !isToday && !isSelected && 'hover:bg-muted',
                      cheques && !isSelected && 'font-medium',
                    )}
                  >
                    {day}
                    {cheques && (
                      <div className="flex gap-0.5">
                        {hasRecibido && (
                          <span
                            className={cn(
                              'size-1.5 rounded-full',
                              isSelected ? 'bg-primary-foreground' : 'bg-income',
                            )}
                          />
                        )}
                        {hasEmitido && (
                          <span
                            className={cn(
                              'size-1.5 rounded-full',
                              isSelected ? 'bg-primary-foreground' : 'bg-expense',
                            )}
                          />
                        )}
                      </div>
                    )}
                    {cheques && !isSelected && (
                      <span className="text-muted-foreground absolute -bottom-0.5 text-[9px] tabular-nums">
                        {formatARSCompact(totalDia)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Day detail */}
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedDay ? formatDateLong(selectedDay) : 'Seleccioná un día'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedDay ? (
              <EmptyState
                icon={CalendarClock}
                title="Seleccioná un día"
                description="Hacé clic en un día con vencimientos para ver el detalle."
              />
            ) : selectedCheques.length === 0 ? (
              <EmptyState
                icon={ScrollText}
                title="Sin vencimientos"
                description="No hay cheques venciendo este día."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {selectedCheques.map((c) => {
                  const dias = daysUntil(c.fechaCobro)
                  const isIngreso = c.tipo === 'recibido'
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'rounded-lg border p-3',
                        isIngreso ? 'border-income/20' : 'border-expense/20',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'flex size-7 items-center justify-center rounded-full',
                              isIngreso
                                ? 'bg-income-soft text-income'
                                : 'bg-expense-soft text-expense',
                            )}
                          >
                            {isIngreso ? (
                              <ArrowDownToLine className="size-3.5" />
                            ) : (
                              <ArrowUpFromLine className="size-3.5" />
                            )}
                          </span>
                          <div className="leading-tight">
                            <p className="text-sm font-medium">{c.librador}</p>
                            <p className="text-muted-foreground text-xs">
                              {isIngreso ? 'A cobrar' : 'A pagar'} · N.º {c.numero}
                            </p>
                          </div>
                        </div>
                        <Amount
                          value={c.monto}
                          tipo={isIngreso ? 'ingreso' : 'egreso'}
                          className="text-sm"
                        />
                      </div>
                      <p className="text-muted-foreground mt-2 text-xs">
                        {c.banco}
                        {dias < 0
                          ? ` · vencido hace ${Math.abs(dias)} días`
                          : dias === 0
                            ? ' · vence hoy'
                            : ` · vence en ${dias} días`}
                      </p>
                      {c.notas && (
                        <p className="text-muted-foreground mt-1 text-xs italic">
                          {c.notas}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
