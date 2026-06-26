import { useMemo, useState } from 'react'
import { Landmark, Trash2, Wallet, CreditCard, Link2 } from 'lucide-react'
import { signedAmount, useBankTotals, useTreasury } from '@/data/store'
import {
  MovementDialog,
  type MovementFormValue,
} from '@/components/treasury/MovementDialog'
import {
  Amount,
  EmptyState,
  PaymentMethodBadge,
  TipoIcon,
} from '@/components/treasury/display'
import { KpiCard } from '@/components/treasury/KpiCard'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatARS, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export function Bancos() {
  const { state, dispatch } = useTreasury()
  const { balances, total } = useBankTotals()
  const [selected, setSelected] = useState<string>('todas')

  const movimientos = useMemo(() => {
    return [...state.bankMovements]
      .filter((m) => selected === 'todas' || m.cuentaId === selected)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
  }, [state.bankMovements, selected])

  const accountName = (id: string) => {
    const acc = state.bankAccounts.find((a) => a.id === id)
    return acc ? acc.banco : '—'
  }

  function handleAdd(v: MovementFormValue) {
    if (!v.cuentaId) return
    dispatch({
      type: 'ADD_BANK_MOV',
      payload: {
        cuentaId: v.cuentaId,
        fecha: v.fecha,
        tipo: v.tipo,
        concepto: v.concepto,
        categoria: v.categoria,
        medioPago: v.medioPago,
        monto: v.monto,
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Saldo total en bancos"
          value={formatARS(total)}
          icon={Landmark}
          accent="primary"
          hint={`${balances.length} cuentas`}
        />
        <KpiCard
          label="Cuenta con mayor saldo"
          value={formatARS(
            balances.reduce((max, b) => Math.max(max, b.balance), 0),
          )}
          icon={Wallet}
          accent="income"
          hint={
            balances.slice().sort((a, b) => b.balance - a.balance)[0]?.account
              .banco ?? '—'
          }
        />
        <KpiCard
          label="Movimientos del período"
          value={String(state.bankMovements.length)}
          icon={CreditCard}
          accent="warning"
          hint="Registrados en todas las cuentas"
        />
      </div>

      {/* Cuentas */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {balances.map(({ account, balance }) => {
          const isSel = selected === account.id
          return (
            <button
              key={account.id}
              onClick={() => setSelected(isSel ? 'todas' : account.id)}
              className={cn(
                'group bg-card relative overflow-hidden rounded-xl border p-5 text-left shadow-sm transition-all hover:shadow-md',
                isSel && 'ring-primary ring-2',
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{account.banco}</p>
                  <p className="text-muted-foreground text-xs">
                    {account.tipo === 'cuenta_corriente'
                      ? 'Cuenta corriente'
                      : 'Caja de ahorro'}
                    {' · '}
                    {account.moneda}
                  </p>
                </div>
                <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                  <Landmark className="size-5" />
                </span>
              </div>
              <p className="text-foreground mt-4 text-xl font-semibold tabular-nums">
                {formatARS(balance)}
              </p>
              <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                {account.alias}
              </p>
            </button>
          )
        })}
      </div>

      {/* Movimientos */}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">
                {selected === 'todas'
                  ? 'Movimientos de todas las cuentas'
                  : `Movimientos · ${accountName(selected)}`}
              </p>
              <p className="text-muted-foreground text-sm">
                {selected === 'todas'
                  ? 'Tocá una cuenta para filtrar'
                  : 'Mostrando una cuenta · tocá de nuevo para ver todas'}
              </p>
            </div>
            <MovementDialog
              mode="banco"
              title="Nuevo movimiento bancario"
              description="Registrá un movimiento en una cuenta."
              accounts={state.bankAccounts}
              defaultAccountId={selected !== 'todas' ? selected : undefined}
              onSubmit={handleAdd}
            />
          </div>

          {movimientos.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="Sin movimientos"
              description="Esta cuenta todavía no tiene movimientos registrados."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  {selected === 'todas' && <TableHead>Cuenta</TableHead>}
                  <TableHead>Categoría</TableHead>
                  <TableHead>Medio</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <TipoIcon tipo={m.tipo} />
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(m.fecha)}
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {m.concepto}
                        {m.origen && m.origen !== 'manual' && (
                          <span
                            className="text-primary inline-flex items-center"
                            title={
                              m.origen === 'caja'
                                ? 'Generado desde un movimiento de caja'
                                : 'Generado al depositar un cheque'
                            }
                          >
                            <Link2 className="size-3.5" />
                          </span>
                        )}
                      </span>
                    </TableCell>
                    {selected === 'todas' && (
                      <TableCell className="text-muted-foreground">
                        {accountName(m.cuentaId)}
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">
                      {m.categoria}
                    </TableCell>
                    <TableCell>
                      <PaymentMethodBadge method={m.medioPago} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={signedAmount(m)} tipo={m.tipo} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-expense size-8"
                        onClick={() =>
                          dispatch({ type: 'DELETE_BANK_MOV', id: m.id })
                        }
                        aria-label="Eliminar movimiento"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
