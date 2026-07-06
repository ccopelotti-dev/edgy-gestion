import { useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  Landmark,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { signedAmount, useBankTotals, useTreasury } from '../data/store'
import type { BankAccount, MovementType } from '../types'
import { MovementDialog } from '../components/treasury/MovementDialog'
import { AccountDialog } from '../components/treasury/AccountDialog'
import {
  Amount,
  EmptyState,
  PaymentMethodBadge,
  TipoIcon,
} from '../components/treasury/display'
import { KpiCard } from '../components/treasury/KpiCard'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatARS, formatDate } from '../lib/format'
import { cn } from '@/lib/utils'

export function Bancos() {
  const { state, dispatch } = useTreasury()
  const { balances, total } = useBankTotals()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = selectedId
    ? balances.find((b) => b.account.id === selectedId) ?? null
    : null

  const movimientos = useMemo(() => {
    if (!selectedId) return []
    return [...state.bankMovements]
      .filter((m) => m.cuentaId === selectedId)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  }, [state.bankMovements, selectedId])

  const { ingresos, egresos } = useMemo(() => {
    const movs = selectedId
      ? state.bankMovements.filter((m) => m.cuentaId === selectedId)
      : state.bankMovements
    return {
      ingresos: movs.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0),
      egresos: movs.filter((m) => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0),
    }
  }, [state.bankMovements, selectedId])

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={selected ? `Saldo ${selected.account.banco}` : 'Total en bancos'}
          value={formatARS(selected ? selected.balance : total)}
          icon={Landmark}
          accent="primary"
          hint={selected ? selected.account.alias : `${balances.length} cuentas`}
        />
        <KpiCard label="Ingresos" value={formatARS(ingresos)} icon={TrendingUp} accent="income" />
        <KpiCard label="Egresos" value={formatARS(egresos)} icon={TrendingDown} accent="expense" />
        <KpiCard
          label="Movimientos"
          value={String(selectedId ? movimientos.length : state.bankMovements.length)}
          icon={ArrowRightLeft}
          accent="primary"
        />
      </div>

      {/* Cuentas */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Cuentas bancarias</h2>
          <p className="text-muted-foreground text-sm">
            {balances.length === 0
              ? 'Todavía no hay ninguna cuenta cargada.'
              : `${balances.length} cuenta${balances.length === 1 ? '' : 's'} cargada${balances.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <AccountDialog onSubmit={(payload) => dispatch({ type: 'ADD_ACCOUNT', payload })} />
      </div>

      {balances.length === 0 ? (
        <Card>
          <CardContent className="py-4">
            <EmptyState
              icon={Landmark}
              title="Sin cuentas bancarias"
              description="Creá la primera cuenta para poder registrar movimientos bancarios y habilitar el espejo automático desde Caja, Ventas y Compras."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {balances.map(({ account, balance }) => (
            <button
              key={account.id}
              type="button"
              onClick={() => setSelectedId(selectedId === account.id ? null : account.id)}
              className={cn(
                'flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors',
                selectedId === account.id
                  ? 'border-primary bg-primary/5 ring-primary/20 ring-2'
                  : 'hover:border-primary/40',
              )}
            >
              <p className="text-sm font-medium">{account.banco}</p>
              <p className="text-muted-foreground text-xs">{account.alias}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatARS(balance)}</p>
              <p className="text-muted-foreground text-xs">
                {account.tipo === 'cuenta_corriente' ? 'Cuenta corriente' : 'Caja de ahorro'} · {account.numero}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Movimientos */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>
              {selected ? `Movimientos — ${selected.account.banco}` : 'Seleccioná una cuenta'}
            </CardTitle>
            {selected && (
              <CardDescription>{selected.account.alias} · CBU {selected.account.cbu}</CardDescription>
            )}
          </div>
          {selected && (
            <MovementDialog
              mode="banco"
              title={`Nuevo movimiento — ${selected.account.banco}`}
              accounts={state.bankAccounts}
              defaultAccountId={selected.account.id}
              onSubmit={(v) =>
                dispatch({
                  type: 'ADD_BANK',
                  payload: { ...v, cuentaId: selected.account.id },
                })
              }
            />
          )}
        </CardHeader>
        <CardContent>
          {!selected ? (
            <EmptyState
              icon={Landmark}
              title="Seleccioná una cuenta"
              description="Hacé clic en una de las tarjetas de arriba para ver sus movimientos."
            />
          ) : movimientos.length === 0 ? (
            <EmptyState
              icon={ArrowRightLeft}
              title="Sin movimientos"
              description="Esta cuenta no tiene movimientos registrados."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Fecha</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Medio</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <TipoIcon tipo={m.tipo} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(m.fecha)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm font-medium">
                        {m.concepto}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {m.categoria}
                      </TableCell>
                      <TableCell>
                        <PaymentMethodBadge method={m.medioPago} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={signedAmount(m)} tipo={m.tipo} className="text-sm" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
