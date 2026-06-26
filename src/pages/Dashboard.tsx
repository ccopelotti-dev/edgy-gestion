import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Landmark,
  ScrollText,
  TrendingUp,
  Wallet,
  CalendarClock,
  AlertTriangle,
} from 'lucide-react'
import {
  signedAmount,
  useBankTotals,
  useChequeTotals,
  useSaldoCaja,
  useTreasury,
} from '@/data/store'
import { PAYMENT_METHODS, type PaymentMethod } from '@/types'
import { KpiCard } from '@/components/treasury/KpiCard'
import {
  Amount,
  ChequeEstadoBadge,
  PAYMENT_META,
} from '@/components/treasury/display'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatARS, formatARSCompact, formatDate, daysUntil } from '@/lib/format'
import { cn } from '@/lib/utils'

export function Dashboard() {
  const { state } = useTreasury()
  const saldoCaja = useSaldoCaja()
  const { balances, total: totalBancos } = useBankTotals()
  const cheques = useChequeTotals()

  const flujo = useMemo(() => {
    const ingresos = state.cajaMovements
      .filter((m) => m.tipo === 'ingreso')
      .reduce((a, m) => a + m.monto, 0)
    const egresos = state.cajaMovements
      .filter((m) => m.tipo === 'egreso')
      .reduce((a, m) => a + m.monto, 0)

    const porMedio = PAYMENT_METHODS.map((pm) => {
      const movs = state.cajaMovements.filter((m) => m.medioPago === pm.value)
      return {
        medio: pm.value as PaymentMethod,
        ingreso: movs
          .filter((m) => m.tipo === 'ingreso')
          .reduce((a, m) => a + m.monto, 0),
        egreso: movs
          .filter((m) => m.tipo === 'egreso')
          .reduce((a, m) => a + m.monto, 0),
      }
    }).filter((x) => x.ingreso + x.egreso > 0)

    return { ingresos, egresos, neto: ingresos - egresos, porMedio }
  }, [state.cajaMovements])

  const recientes = useMemo(
    () =>
      [...state.cajaMovements]
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
        .slice(0, 6),
    [state.cajaMovements],
  )

  const proximosCheques = useMemo(
    () =>
      state.cheques
        .filter((c) => c.estado === 'en_cartera')
        .map((c) => ({
          cheque: c,
          flujo: (c.tipo === 'emitido' ? 'egreso' : 'ingreso') as
            | 'ingreso'
            | 'egreso',
        }))
        .sort((a, b) => (a.cheque.fechaCobro < b.cheque.fechaCobro ? -1 : 1))
        .slice(0, 5),
    [state.cheques],
  )

  const totalDisponible = saldoCaja + totalBancos
  const maxMedio = Math.max(
    1,
    ...flujo.porMedio.map((x) => Math.max(x.ingreso, x.egreso)),
  )

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Saldo de Caja"
          value={formatARS(saldoCaja)}
          icon={Wallet}
          accent="primary"
          hint="Efectivo en caja"
        />
        <KpiCard
          label="Total en Bancos"
          value={formatARS(totalBancos)}
          icon={Landmark}
          accent="income"
          hint={`${balances.length} cuentas activas`}
        />
        <KpiCard
          label="Cheques en cartera"
          value={formatARS(cheques.enCarteraValor)}
          icon={ScrollText}
          accent="warning"
          hint={`${cheques.enCarteraCount} por cobrar · ${formatARSCompact(cheques.aPagarValor)} a pagar`}
        />
        <KpiCard
          label="Resultado del período"
          value={formatARS(flujo.neto)}
          icon={TrendingUp}
          accent={flujo.neto >= 0 ? 'income' : 'expense'}
          trend={{
            value: `${((flujo.neto / (flujo.ingresos || 1)) * 100).toFixed(0)}% margen`,
            positive: flujo.neto >= 0,
          }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Flujo de fondos */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Flujo de fondos</CardTitle>
            <CardDescription>
              Ingresos y egresos de caja por medio de pago
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-income-soft rounded-lg p-3">
                <p className="text-income/80 text-xs font-medium">Ingresos</p>
                <p className="text-income mt-1 text-lg font-semibold tabular-nums">
                  {formatARSCompact(flujo.ingresos)}
                </p>
              </div>
              <div className="bg-expense-soft rounded-lg p-3">
                <p className="text-expense/80 text-xs font-medium">Egresos</p>
                <p className="text-expense mt-1 text-lg font-semibold tabular-nums">
                  {formatARSCompact(flujo.egresos)}
                </p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-muted-foreground text-xs font-medium">Neto</p>
                <p
                  className={cn(
                    'mt-1 text-lg font-semibold tabular-nums',
                    flujo.neto >= 0 ? 'text-income' : 'text-expense',
                  )}
                >
                  {formatARSCompact(flujo.neto)}
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-3.5">
              {flujo.porMedio.map((row) => {
                const Icon = PAYMENT_META[row.medio].icon
                return (
                  <div key={row.medio} className="flex items-center gap-3">
                    <span className="text-muted-foreground flex w-32 shrink-0 items-center gap-2 text-sm">
                      <Icon className="size-4" />
                      {PAYMENT_META[row.medio].label}
                    </span>
                    <div className="flex flex-1 items-center gap-1.5">
                      <div className="flex flex-1 justify-end">
                        <div
                          className="bg-income h-2.5 rounded-full"
                          style={{
                            width: `${(row.ingreso / maxMedio) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="bg-border h-4 w-px" />
                      <div className="flex flex-1">
                        <div
                          className="bg-expense h-2.5 rounded-full"
                          style={{ width: `${(row.egreso / maxMedio) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="text-muted-foreground flex items-center justify-center gap-6 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="bg-income size-2.5 rounded-full" /> Ingresos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="bg-expense size-2.5 rounded-full" /> Egresos
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Disponibilidad total + cuentas */}
        <Card>
          <CardHeader>
            <CardTitle>Disponibilidades</CardTitle>
            <CardDescription>Posición consolidada</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="bg-primary text-primary-foreground rounded-xl p-4">
              <p className="text-primary-foreground/70 text-xs font-medium">
                Disponible total (Caja + Bancos)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatARS(totalDisponible)}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              {balances.map(({ account, balance }) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="bg-secondary text-secondary-foreground flex size-8 items-center justify-center rounded-md">
                      <Landmark className="size-4" />
                    </span>
                    <div className="leading-tight">
                      <p className="font-medium">{account.banco}</p>
                      <p className="text-muted-foreground text-xs">
                        {account.tipo === 'cuenta_corriente'
                          ? 'Cuenta corriente'
                          : 'Caja de ahorro'}
                      </p>
                    </div>
                  </div>
                  <span className="font-medium tabular-nums">
                    {formatARS(balance)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Últimos movimientos */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Últimos movimientos de caja</CardTitle>
              <CardDescription>Actividad reciente</CardDescription>
            </div>
            <Link
              to="/caja"
              className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              Ver todo <ArrowRight className="size-4" />
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col">
            {recientes.map((m, i) => (
              <div key={m.id}>
                {i > 0 && <Separator />}
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.concepto}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(m.fecha)} · {m.categoria}
                    </p>
                  </div>
                  <Amount value={signedAmount(m)} tipo={m.tipo} className="text-sm" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Próximos vencimientos */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Próximos vencimientos</CardTitle>
              <CardDescription>Cheques a cobrar y a pagar</CardDescription>
            </div>
            <Link
              to="/vencimientos"
              className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              Ver calendario <ArrowRight className="size-4" />
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col">
            {proximosCheques.length === 0 && (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No hay vencimientos pendientes.
              </p>
            )}
            {proximosCheques.map(({ cheque: c, flujo }, i) => {
              const dias = daysUntil(c.fechaCobro)
              const urgente = dias <= 7
              const isIngreso = flujo === 'ingreso'
              return (
                <div key={c.id}>
                  {i > 0 && <Separator />}
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          'flex size-8 items-center justify-center rounded-md',
                          isIngreso
                            ? 'bg-income-soft text-income'
                            : 'bg-expense-soft text-expense',
                        )}
                      >
                        {urgente ? (
                          <AlertTriangle className="size-4" />
                        ) : (
                          <CalendarClock className="size-4" />
                        )}
                      </span>
                      <div className="leading-tight">
                        <p className="text-sm font-medium">{c.librador}</p>
                        <p className="text-muted-foreground text-xs">
                          {isIngreso ? 'A cobrar' : 'A pagar'} · N.º {c.numero} ·{' '}
                          {dias < 0
                            ? `vencido hace ${Math.abs(dias)} d`
                            : dias === 0
                              ? 'vence hoy'
                              : `en ${dias} días`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Amount value={c.monto} tipo={flujo} className="text-sm" />
                      <div className="mt-0.5">
                        <ChequeEstadoBadge estado={c.estado} tipo={c.tipo} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
