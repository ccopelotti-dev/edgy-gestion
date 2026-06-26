import { useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Clock,
  FileCheck,
  Filter,
  Landmark,
  MoreVertical,
  ScrollText,
  XCircle,
} from 'lucide-react'
import { useChequeResumen, useTreasury } from '../data/store'
import {
  CHEQUE_ESTADOS_POR_TIPO,
  type BankAccount,
  type Cheque,
  type ChequeEstado,
  type ChequeKind,
} from '../types'
import { ChequeDialog } from '../components/treasury/ChequeDialog'
import { ChequeEstadoBadge, EmptyState } from '../components/treasury/display'
import { KpiCard } from '../components/treasury/KpiCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatARS, formatDate, daysUntil } from '../lib/format'
import { cn } from '@/lib/utils'

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:border-foreground/30',
      )}
    >
      {label}
    </button>
  )
}

function ChequeActions({
  cheque,
  accounts,
  onTransition,
}: {
  cheque: Cheque
  accounts: BankAccount[]
  onTransition: (chequeId: string, nuevoEstado: ChequeEstado, cuentaId?: string) => void
}) {
  const [depositOpen, setDepositOpen] = useState(false)
  const [cuentaId, setCuentaId] = useState(accounts[0]?.id ?? '')
  const transitions = CHEQUE_ESTADOS_POR_TIPO[cheque.tipo][cheque.estado] ?? []

  if (transitions.length === 0) return null

  function handleDirect(estado: ChequeEstado) {
    if (estado === 'depositado') {
      setDepositOpen(true)
    } else {
      onTransition(cheque.id, estado)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {transitions.map((est) => (
            <DropdownMenuItem key={est} onClick={() => handleDirect(est)}>
              Marcar como {est.replace('_', ' ')}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Depositar cheque</DialogTitle>
            <DialogDescription>
              Seleccioná la cuenta donde se deposita el cheque N.º {cheque.numero} por{' '}
              {formatARS(cheque.monto)}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Cuenta de depósito</Label>
            <Select value={cuentaId} onValueChange={setCuentaId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.banco} — {a.alias}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                onTransition(cheque.id, 'depositado', cuentaId)
                setDepositOpen(false)
              }}
            >
              Confirmar depósito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function Cheques() {
  const { state, dispatch } = useTreasury()
  const resumen = useChequeResumen()

  const [tab, setTab] = useState<ChequeKind | 'todos'>('todos')
  const [estadoFilter, setEstadoFilter] = useState<ChequeEstado | 'todos'>('todos')

  const filtered = useMemo(() => {
    let list = state.cheques
    if (tab !== 'todos') list = list.filter((c) => c.tipo === tab)
    if (estadoFilter !== 'todos') list = list.filter((c) => c.estado === estadoFilter)
    return [...list].sort((a, b) => (a.fechaCobro < b.fechaCobro ? 1 : -1))
  }, [state.cheques, tab, estadoFilter])

  const estadosVisibles: ChequeEstado[] = ['en_cartera', 'depositado', 'cobrado', 'rechazado']
  const estadoLabels: Record<ChequeEstado, string> = {
    en_cartera: 'En cartera',
    depositado: 'Depositado',
    cobrado: 'Cobrado',
    rechazado: 'Rechazado',
  }

  function handleTransition(chequeId: string, nuevoEstado: ChequeEstado, cuentaId?: string) {
    dispatch({ type: 'CHEQUE_TRANSITION', payload: { chequeId, nuevoEstado, cuentaId } })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Cheques en cartera"
          value={formatARS(resumen.enCarteraRecibido)}
          icon={ScrollText}
          accent="income"
          hint={`${resumen.countRecibidoCartera} recibidos`}
        />
        <KpiCard
          label="A pagar (emitidos)"
          value={formatARS(resumen.enCarteraEmitido)}
          icon={ArrowUpFromLine}
          accent="expense"
          hint={`${resumen.countEmitidoCartera} cheques`}
        />
        <KpiCard
          label="Próximo vencimiento"
          value={
            resumen.proximoVencimiento
              ? formatDate(resumen.proximoVencimiento.fechaCobro)
              : '—'
          }
          icon={Clock}
          accent="warning"
          hint={
            resumen.proximoVencimiento
              ? `${formatARS(resumen.proximoVencimiento.monto)} — ${resumen.proximoVencimiento.librador}`
              : 'Sin vencimientos'
          }
        />
        <KpiCard
          label="Total cheques"
          value={String(state.cheques.length)}
          icon={FileCheck}
          accent="primary"
          hint={`${resumen.countRecibido} recibidos · ${resumen.countEmitido} emitidos`}
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-4">
          <CardTitle>Cartera de cheques</CardTitle>
          <div className="flex items-center gap-3">
            <ChequeDialog
              accounts={state.bankAccounts}
              onSubmit={(v) => dispatch({ type: 'ADD_CHEQUE', payload: v })}
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as ChequeKind | 'todos')}
            >
              <TabsList>
                <TabsTrigger value="todos">Todos</TabsTrigger>
                <TabsTrigger value="recibido">
                  <ArrowDownToLine className="mr-1 size-3.5" /> Recibidos
                </TabsTrigger>
                <TabsTrigger value="emitido">
                  <ArrowUpFromLine className="mr-1 size-3.5" /> Emitidos
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="bg-border h-5 w-px" />
            <div className="flex items-center gap-1.5">
              <Filter className="text-muted-foreground size-3.5" />
              <FilterChip
                label="Todos"
                active={estadoFilter === 'todos'}
                onClick={() => setEstadoFilter('todos')}
              />
              {estadosVisibles.map((est) => (
                <FilterChip
                  key={est}
                  label={estadoLabels[est]}
                  active={estadoFilter === est}
                  onClick={() =>
                    setEstadoFilter(estadoFilter === est ? 'todos' : est)
                  }
                />
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Sin cheques"
              description="No hay cheques que coincidan con los filtros."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>N.º</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>{tab === 'emitido' ? 'Beneficiario' : 'Librador'}</TableHead>
                    <TableHead>Fecha cobro</TableHead>
                    <TableHead>Días</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const dias = daysUntil(c.fechaCobro)
                    const isIngreso = c.tipo === 'recibido'
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
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
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {c.numero}
                        </TableCell>
                        <TableCell className="text-sm">{c.banco}</TableCell>
                        <TableCell className="max-w-[12rem] truncate text-sm font-medium">
                          {c.librador}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(c.fechaCobro)}
                        </TableCell>
                        <TableCell>
                          {c.estado === 'en_cartera' && (
                            <span
                              className={cn(
                                'text-xs font-medium',
                                dias <= 3
                                  ? 'text-expense'
                                  : dias <= 7
                                    ? 'text-warning-foreground'
                                    : 'text-muted-foreground',
                              )}
                            >
                              {dias < 0
                                ? `${Math.abs(dias)}d atrás`
                                : dias === 0
                                  ? 'hoy'
                                  : `${dias}d`}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ChequeEstadoBadge estado={c.estado} tipo={c.tipo} />
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              'text-sm font-medium tabular-nums',
                              isIngreso ? 'text-income' : 'text-expense',
                            )}
                          >
                            {formatARS(c.monto)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <ChequeActions
                            cheque={c}
                            accounts={state.bankAccounts}
                            onTransition={handleTransition}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
