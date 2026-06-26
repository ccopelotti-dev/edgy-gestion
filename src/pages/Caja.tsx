import { useMemo, useState } from 'react'
import {
  Search,
  Trash2,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  ScrollText,
  Link2,
} from 'lucide-react'
import { signedAmount, useSaldoCaja, useTreasury } from '@/data/store'
import {
  PAYMENT_METHODS,
  isBankSettled,
  type MovementType,
  type PaymentMethod,
} from '@/types'
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatARS, formatDate } from '@/lib/format'

export function Caja() {
  const { state, dispatch } = useTreasury()
  const saldoCaja = useSaldoCaja()

  const [query, setQuery] = useState('')
  const [tipoFilter, setTipoFilter] = useState<MovementType | 'todos'>('todos')
  const [medioFilter, setMedioFilter] = useState<PaymentMethod | 'todos'>('todos')

  const totals = useMemo(() => {
    const ingresos = state.cajaMovements
      .filter((m) => m.tipo === 'ingreso')
      .reduce((a, m) => a + m.monto, 0)
    const egresos = state.cajaMovements
      .filter((m) => m.tipo === 'egreso')
      .reduce((a, m) => a + m.monto, 0)
    // Cuánto de las operaciones se liquidó en banco vs. quedó en efectivo.
    const enBanco = state.cajaMovements
      .filter((m) => isBankSettled(m.medioPago))
      .reduce((a, m) => a + m.monto, 0)
    return { ingresos, egresos, enBanco }
  }, [state.cajaMovements])

  const accountName = (id?: string) =>
    state.bankAccounts.find((a) => a.id === id)?.banco

  const filtered = useMemo(() => {
    return [...state.cajaMovements]
      .filter((m) => tipoFilter === 'todos' || m.tipo === tipoFilter)
      .filter((m) => medioFilter === 'todos' || m.medioPago === medioFilter)
      .filter(
        (m) =>
          query === '' ||
          m.concepto.toLowerCase().includes(query.toLowerCase()) ||
          m.categoria.toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
  }, [state.cajaMovements, tipoFilter, medioFilter, query])

  function handleAdd(v: MovementFormValue) {
    dispatch({
      type: 'ADD_CAJA',
      payload: {
        fecha: v.fecha,
        tipo: v.tipo,
        concepto: v.concepto,
        categoria: v.categoria,
        medioPago: v.medioPago,
        monto: v.monto,
        cuentaId: v.cuentaId,
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Saldo en efectivo"
          value={formatARS(saldoCaja)}
          icon={Banknote}
          accent="primary"
          hint="Solo movimientos en efectivo"
        />
        <KpiCard
          label="Total ingresos"
          value={formatARS(totals.ingresos)}
          icon={ArrowDownCircle}
          accent="income"
          hint="Todas las operaciones"
        />
        <KpiCard
          label="Total egresos"
          value={formatARS(totals.egresos)}
          icon={ArrowUpCircle}
          accent="expense"
          hint="Todas las operaciones"
        />
      </div>

      <div className="bg-accent text-accent-foreground flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm">
        <Link2 className="mt-0.5 size-4 shrink-0" />
        <p>
          Los cobros y pagos por <strong>transferencia, tarjeta o MercadoPago</strong>{' '}
          generan automáticamente su asiento en la cuenta bancaria seleccionada
          ({formatARS(totals.enBanco)} liquidados en bancos). El{' '}
          <strong>saldo en efectivo</strong> refleja únicamente los movimientos en
          efectivo.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Buscar concepto o categoría…"
                  className="pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Select
                value={tipoFilter}
                onValueChange={(v) => setTipoFilter(v as typeof tipoFilter)}
              >
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los tipos</SelectItem>
                  <SelectItem value="ingreso">Ingresos</SelectItem>
                  <SelectItem value="egreso">Egresos</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={medioFilter}
                onValueChange={(v) => setMedioFilter(v as typeof medioFilter)}
              >
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los medios</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <MovementDialog
              mode="caja"
              title="Nuevo movimiento de caja"
              description="Registrá un ingreso o egreso. Si el medio se liquida en banco, se acreditará en la cuenta elegida."
              accounts={state.bankAccounts}
              onSubmit={handleAdd}
            />
          </div>

          {/* Tabla */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Sin movimientos"
              description="No se encontraron movimientos con los filtros aplicados."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Medio</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <TipoIcon tipo={m.tipo} />
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(m.fecha)}
                    </TableCell>
                    <TableCell className="font-medium">{m.concepto}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.categoria}
                    </TableCell>
                    <TableCell>
                      <PaymentMethodBadge method={m.medioPago} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.medioPago === 'efectivo' ? (
                        <span className="flex items-center gap-1.5 text-sm">
                          <Banknote className="size-3.5" />
                          Caja
                        </span>
                      ) : m.medioPago === 'cheque' ? (
                        <span className="flex items-center gap-1.5 text-sm">
                          <ScrollText className="size-3.5" />
                          Cartera
                        </span>
                      ) : (
                        <span className="text-primary flex items-center gap-1.5 text-sm">
                          <Link2 className="size-3.5" />
                          {accountName(m.cuentaId) ?? 'Banco'}
                        </span>
                      )}
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
                          dispatch({ type: 'DELETE_CAJA', id: m.id })
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
          <p className="text-muted-foreground text-xs">
            {filtered.length} movimiento{filtered.length === 1 ? '' : 's'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
