import { useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  TrendingUp,
  Banknote,
  CheckCircle2,
} from 'lucide-react'
import { useTreasury, useVencimientos } from '@/data/store'
import type { Cheque } from '@/types'
import { KpiCard } from '@/components/treasury/KpiCard'
import { Amount, EmptyState } from '@/components/treasury/display'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  formatARS,
  formatARSCompact,
  formatDateLong,
  todayISO,
  daysUntil,
} from '@/lib/format'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const pad = (n: number) => String(n).padStart(2, '0')
const toISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const monthFmt = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  year: 'numeric',
})

interface VencItem {
  cheque: Cheque
  flujo: 'ingreso' | 'egreso'
}

export function Vencimientos() {
  const { state, dispatch } = useTreasury()
  const vencimientos = useVencimientos()

  const hoy = todayISO()
  const [yy, mm] = hoy.split('-').map(Number)
  const [cursor, setCursor] = useState({ year: yy, month: mm - 1 })

  // Cheques pendientes agrupados por fecha de vencimiento.
  const byDate = useMemo(() => {
    const map: Record<string, VencItem[]> = {}
    for (const v of vencimientos) {
      ;(map[v.cheque.fechaCobro] ??= []).push(v)
    }
    return map
  }, [vencimientos])

  // Matriz de 6 semanas (inicio lunes) para el mes en curso.
  const weeks = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1)
    const mondayOffset = (first.getDay() + 6) % 7
    const start = new Date(cursor.year, cursor.month, 1 - mondayOffset)
    const cells: { date: Date; iso: string; inMonth: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      cells.push({ date: d, iso: toISO(d), inMonth: d.getMonth() === cursor.month })
    }
    const rows: (typeof cells)[] = []
    for (let i = 0; i < 42; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }, [cursor])

  // Totales del mes visible y vencidos (global).
  const resumen = useMemo(() => {
    const prefix = `${cursor.year}-${pad(cursor.month + 1)}`
    const mes = vencimientos.filter((v) => v.cheque.fechaCobro.startsWith(prefix))
    const aCobrar = mes
      .filter((v) => v.flujo === 'ingreso')
      .reduce((a, v) => a + v.cheque.monto, 0)
    const aPagar = mes
      .filter((v) => v.flujo === 'egreso')
      .reduce((a, v) => a + v.cheque.monto, 0)
    const vencidos = vencimientos
      .filter((v) => v.flujo === 'egreso' && daysUntil(v.cheque.fechaCobro) < 0)
      .reduce((a, v) => a + v.cheque.monto, 0)
    return { aCobrar, aPagar, neto: aCobrar - aPagar, vencidos }
  }, [vencimientos, cursor])

  // Agenda: próximos vencimientos ordenados por fecha.
  const agenda = useMemo(
    () =>
      [...vencimientos].sort((a, b) =>
        a.cheque.fechaCobro < b.cheque.fechaCobro ? -1 : 1,
      ),
    [vencimientos],
  )

  const accountName = (id?: string) =>
    state.bankAccounts.find((a) => a.id === id)?.banco

  function liquidar(v: VencItem) {
    // Recibido → cobrado (acredita); emitido → pagado (debita cuenta emisora).
    dispatch({ type: 'SET_CHEQUE_ESTADO', id: v.cheque.id, estado: 'cobrado' })
  }

  const monthLabel = monthFmt.format(new Date(cursor.year, cursor.month, 1))
  const goPrev = () =>
    setCursor((c) =>
      c.month === 0
        ? { year: c.year - 1, month: 11 }
        : { year: c.year, month: c.month - 1 },
    )
  const goNext = () =>
    setCursor((c) =>
      c.month === 11
        ? { year: c.year + 1, month: 0 }
        : { year: c.year, month: c.month + 1 },
    )
  const goHoy = () => setCursor({ year: yy, month: mm - 1 })

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="A cobrar (mes)"
          value={formatARS(resumen.aCobrar)}
          icon={ArrowDownLeft}
          accent="income"
          hint="Cheques recibidos en cartera"
        />
        <KpiCard
          label="A pagar (mes)"
          value={formatARS(resumen.aPagar)}
          icon={ArrowUpRight}
          accent="expense"
          hint="Cheques emitidos pendientes"
        />
        <KpiCard
          label="Neto proyectado (mes)"
          value={formatARS(resumen.neto)}
          icon={TrendingUp}
          accent={resumen.neto >= 0 ? 'income' : 'expense'}
        />
        <KpiCard
          label="Vencidos a pagar"
          value={formatARS(resumen.vencidos)}
          icon={AlertTriangle}
          accent="warning"
          hint="Sin debitar, vencimiento pasado"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="capitalize">{monthLabel}</CardTitle>
            <CardDescription>
              Calendario de vencimientos de cheques
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={goHoy}>
              Hoy
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={goPrev}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={goNext}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Encabezado de días */}
          <div className="text-muted-foreground mb-1 grid grid-cols-7 gap-1.5 text-center text-xs font-medium">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          {/* Grilla */}
          <div className="grid grid-cols-7 gap-1.5">
            {weeks.flat().map((cell) => {
              const items = byDate[cell.iso] ?? []
              const isToday = cell.iso === hoy
              return (
                <div
                  key={cell.iso}
                  className={cn(
                    'min-h-20 rounded-lg border p-1.5 transition-colors sm:min-h-24',
                    cell.inMonth ? 'bg-card' : 'bg-muted/40',
                    isToday && 'border-primary ring-primary/30 ring-2',
                  )}
                >
                  <div
                    className={cn(
                      'mb-1 text-right text-xs font-medium',
                      cell.inMonth
                        ? 'text-foreground'
                        : 'text-muted-foreground/50',
                      isToday &&
                        'text-primary-foreground bg-primary ml-auto flex size-5 items-center justify-center rounded-full',
                    )}
                  >
                    {cell.date.getDate()}
                  </div>
                  <div className="flex flex-col gap-1">
                    {items.slice(0, 2).map((v) => (
                      <div
                        key={v.cheque.id}
                        className={cn(
                          'truncate rounded px-1 py-0.5 text-[10px] font-medium tabular-nums leading-tight',
                          v.flujo === 'ingreso'
                            ? 'bg-income-soft text-income'
                            : 'bg-expense-soft text-expense',
                        )}
                        title={`${v.cheque.librador} · ${formatARS(v.cheque.monto)}`}
                      >
                        {v.flujo === 'ingreso' ? '+' : '−'}
                        {formatARSCompact(v.cheque.monto).replace('$ ', '')}
                      </div>
                    ))}
                    {items.length > 2 && (
                      <span className="text-muted-foreground px-1 text-[10px]">
                        +{items.length - 2} más
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="text-muted-foreground mt-3 flex items-center justify-center gap-6 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="bg-income size-2.5 rounded-full" /> A cobrar
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-expense size-2.5 rounded-full" /> A pagar
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Agenda de próximos vencimientos */}
      <Card>
        <CardHeader>
          <CardTitle>Agenda de vencimientos</CardTitle>
          <CardDescription>
            Cheques pendientes ordenados por fecha. Liquidá para impactar el banco.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col">
          {agenda.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Sin vencimientos pendientes"
              description="No hay cheques en cartera ni cheques a pagar."
            />
          ) : (
            agenda.map((v, i) => {
              const dias = daysUntil(v.cheque.fechaCobro)
              const vencido = dias < 0
              const isIngreso = v.flujo === 'ingreso'
              const cuenta = isIngreso
                ? accountName(v.cheque.cuentaDepositoId)
                : accountName(v.cheque.cuentaOrigenId)
              return (
                <div
                  key={v.cheque.id}
                  className={cn(
                    'flex items-center justify-between gap-3 py-3',
                    i > 0 && 'border-t',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg',
                        isIngreso
                          ? 'bg-income-soft text-income'
                          : 'bg-expense-soft text-expense',
                      )}
                    >
                      {isIngreso ? (
                        <ArrowDownLeft className="size-4.5" />
                      ) : (
                        <ArrowUpRight className="size-4.5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {v.cheque.librador}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {isIngreso ? 'Cobrar' : 'Pagar'} · N.º {v.cheque.numero} ·{' '}
                        {formatDateLong(v.cheque.fechaCobro)}
                        {cuenta ? ` · ${cuenta}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <Amount
                        value={v.cheque.monto}
                        tipo={v.flujo}
                        className="text-sm"
                      />
                      <p
                        className={cn(
                          'text-xs',
                          vencido
                            ? 'text-expense font-medium'
                            : dias <= 7
                              ? 'text-warning-foreground dark:text-warning'
                              : 'text-muted-foreground',
                        )}
                      >
                        {vencido
                          ? `vencido hace ${Math.abs(dias)} d`
                          : dias === 0
                            ? 'vence hoy'
                            : `en ${dias} días`}
                      </p>
                    </div>
                    <Button
                      variant={isIngreso ? 'income' : 'outline'}
                      size="sm"
                      onClick={() => liquidar(v)}
                    >
                      {isIngreso ? (
                        <>
                          <CheckCircle2 /> Cobrar
                        </>
                      ) : (
                        <>
                          <Banknote /> Pagar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
