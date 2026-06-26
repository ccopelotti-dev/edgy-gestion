import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Wallet,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from 'lucide-react'
import { signedAmount, useSaldoCaja, useTreasury } from '../data/store'
import {
  PAYMENT_METHODS,
  isBankSettled,
  type MovementType,
  type PaymentMethod,
} from '../types'
import { MovementDialog } from '../components/treasury/MovementDialog'
import {
  Amount,
  EmptyState,
  PaymentMethodBadge,
  TipoIcon,
} from '../components/treasury/display'
import { KpiCard } from '../components/treasury/KpiCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { formatARS, formatDate } from '../lib/format'

const TIPO_OPTIONS: { value: 'todos' | MovementType; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'ingreso', label: 'Ingresos' },
  { value: 'egreso', label: 'Egresos' },
]

export function Caja() {
  const { state, dispatch } = useTreasury()
  const saldo = useSaldoCaja()
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<'todos' | MovementType>('todos')
  const [medioFilter, setMedioFilter] = useState<'todos' | PaymentMethod>('todos')

  const ingresos = useMemo(
    () => state.cajaMovements.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0),
    [state.cajaMovements],
  )
  const egresos = useMemo(
    () => state.cajaMovements.filter((m) => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0),
    [state.cajaMovements],
  )

  const filtered = useMemo(() => {
    let list = state.cajaMovements
    if (tipoFilter !== 'todos') list = list.filter((m) => m.tipo === tipoFilter)
    if (medioFilter !== 'todos') list = list.filter((m) => m.medioPago === medioFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (m) =>
          m.concepto.toLowerCase().includes(q) ||
          m.categoria.toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  }, [state.cajaMovements, tipoFilter, medioFilter, search])

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Saldo de caja" value={formatARS(saldo)} icon={Wallet} accent="primary" />
        <KpiCard label="Ingresos" value={formatARS(ingresos)} icon={TrendingUp} accent="income" />
        <KpiCard label="Egresos" value={formatARS(egresos)} icon={TrendingDown} accent="expense" />
        <KpiCard
          label="Movimientos"
          value={String(state.cajaMovements.length)}
          icon={BarChart3}
          accent="primary"
          hint={`${filtered.length} visible${filtered.length !== state.cajaMovements.length ? ' (filtrado)' : ''}`}
        />
      </div>

      {/* Toolbar */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-4">
          <CardTitle>Movimientos de caja</CardTitle>
          <MovementDialog
            mode="caja"
            title="Nuevo movimiento de caja"
            description="Un movimiento con medio transferencia, tarjeta o MercadoPago genera automáticamente el asiento bancario espejo."
            accounts={state.bankAccounts}
            onSubmit={(v) => {
              dispatch({ type: 'ADD_CAJA', payload: v })
              if (isBankSettled(v.medioPago) && v.cuentaId) {
                dispatch({
                  type: 'ADD_BANK' as const,
                  payload: { ...v, cuentaId: v.cuentaId, medioPago: v.medioPago, monto: v.monto, fecha: v.fecha, tipo: v.tipo, concepto: v.concepto, categoria: v.categoria },
                })
              }
            }}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative max-w-xs flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                placeholder="Buscar concepto o categoría…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={tipoFilter}
              onValueChange={(v) => setTipoFilter(v as 'todos' | MovementType)}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPO_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={medioFilter}
              onValueChange={(v) => setMedioFilter(v as 'todos' | PaymentMethod)}
            >
              <SelectTrigger className="w-44">
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
            {(tipoFilter !== 'todos' || medioFilter !== 'todos' || search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTipoFilter('todos')
                  setMedioFilter('todos')
                  setSearch('')
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Sin movimientos"
              description="No se encontraron movimientos con los filtros seleccionados."
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
                  {filtered.map((m) => (
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
             