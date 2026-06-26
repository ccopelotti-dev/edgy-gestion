import { useMemo, useState } from 'react'
import {
  ScrollText,
  Wallet,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Landmark,
  ArrowDownToLine,
  Undo2,
  Link2,
  Send,
  AlertTriangle,
  Banknote,
} from 'lucide-react'
import { useChequeResumen, useTreasury } from '@/data/store'
import {
  CHEQUE_ESTADOS_POR_TIPO,
  type Cheque,
  type ChequeEstado,
  type ChequeKind,
} from '@/types'
import { ChequeDialog } from '@/components/treasury/ChequeDialog'
import { ChequeEstadoBadge, EmptyState } from '@/components/treasury/display'
import { KpiCard } from '@/components/treasury/KpiCard'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatARS, formatDate, daysUntil } from '@/lib/format'
import { cn } from '@/lib/utils'

type EstadoFilter = ChequeEstado | 'todos'

export function Cheques() {
  const { state, dispatch } = useTreasury()

  const [kind, setKind] = useState<ChequeKind>('recibido')
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('todos')
  const [depositing, setDepositing] = useState<Cheque | null>(null)
  const [depAccount, setDepAccount] = useState('')

  const resumen = useChequeResumen(kind)
  const estados = CHEQUE_ESTADOS_POR_TIPO[kind]

  const cheques = useMemo(() => {
    return state.cheques
      .filter((c) => c.tipo === kind)
      .filter((c) => estadoFilter === 'todos' || c.estado === estadoFilter)
      .sort((a, b) => (a.fechaCobro < b.fechaCobro ? -1 : 1))
  }, [state.cheques, kind, estadoFilter])

  // Pasivo flotante vencido: emitidos a pagar con vencimiento pasado.
  const vencidosAPagar = useMemo(() => {
    const list = state.cheques.filter(
      (c) =>
        c.tipo === 'emitido' &&
        c.estado === 'en_cartera' &&
        daysUntil(c.fechaCobro) < 0,
    )
    return { valor: list.reduce((a, c) => a + c.monto, 0), count: list.length }
  }, [state.cheques])

  const countByEstado = useMemo(() => {
    const within = state.cheques.filter((c) => c.tipo === kind)
    const map: Record<string, number> = { todos: within.length }
    for (const e of estados)
      map[e.value] = within.filter((c) => c.estado === e.value).length
    return map
  }, [state.cheques, kind, estados])

  // Reset del filtro al cambiar de tipo si el estado no aplica.
  function changeKind(k: ChequeKind) {
    setKind(k)
    setEstadoFilter('todos')
  }

  function setEstado(id: string, estado: ChequeEstado, cuentaDepositoId?: string) {
    dispatch({ type: 'SET_CHEQUE_ESTADO', id, estado, cuentaDepositoId })
  }

  function confirmDeposit() {
    if (!depositing || !depAccount) return
    setEstado(depositing.id, 'depositado', depAccount)
    setDepositing(null)
    setDepAccount('')
  }

  const accountName = (id?: string) =>
    state.bankAccounts.find((a) => a.id === id)?.banco ?? '—'

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kind === 'recibido' ? (
          <>
            <KpiCard
              label="En cartera"
              value={formatARS(resumen.enCarteraValor)}
              icon={Wallet}
              accent="warning"
              hint={`${resumen.enCarteraCount} cheques por cobrar`}
            />
            <KpiCard
              label="Depositados"
              value={formatARS(resumen.depositadosValor)}
              icon={ArrowDownToLine}
              accent="primary"
              hint={`${resumen.depositadosCount} en proceso`}
            />
            <KpiCard
              label="Cobrados"
              value={formatARS(resumen.cobradosValor)}
              icon={CheckCircle2}
              accent="income"
              hint={`${resumen.cobradosCount} acreditados`}
            />
            <KpiCard
              label="Rechazados"
              value={formatARS(resumen.rechazadosValor)}
              icon={XCircle}
              accent="expense"
              hint={`${resumen.rechazadosCount} cheques`}
            />
          </>
        ) : (
          <>
            <KpiCard
              label="A pagar (pasivo flotante)"
              value={formatARS(resumen.enCarteraValor)}
              icon={Send}
              accent="warning"
              hint={`${resumen.enCarteraCount} cheques pendientes`}
            />
            <KpiCard
              label="Vencidos a pagar"
              value={formatARS(vencidosAPagar.valor)}
              icon={AlertTriangle}
              accent="expense"
              hint={`${vencidosAPagar.count} sin debitar`}
            />
            <KpiCard
              label="Pagados"
              value={formatARS(resumen.cobradosValor)}
              icon={Banknote}
              accent="primary"
              hint={`${resumen.cobradosCount} debitados`}
            />
            <KpiCard
              label="Anulados"
              value={formatARS(resumen.rechazadosValor)}
              icon={XCircle}
              accent="expense"
              hint={`${resumen.rechazadosCount} cheques`}
            />
          </>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={kind} onValueChange={(v) => changeKind(v as ChequeKind)}>
              <TabsList>
                <TabsTrigger value="recibido">Recibidos</TabsTrigger>
                <TabsTrigger value="emitido">Emitidos</TabsTrigger>
              </TabsList>
            </Tabs>
            <ChequeDialog
              accounts={state.bankAccounts}
              onSubmit={(value) =>
                dispatch({
                  type: 'ADD_CHEQUE',
                  payload: { ...value, estado: 'en_cartera' },
                })
              }
            />
          </div>

          {/* Filtros por estado */}
          <div className="flex flex-wrap gap-2">
            <FilterChip
              active={estadoFilter === 'todos'}
              onClick={() => setEstadoFilter('todos')}
              label="Todos"
              count={countByEstado.todos}
            />
            {estados.map((e) => (
              <FilterChip
                key={e.value}
                active={estadoFilter === e.value}
                onClick={() => setEstadoFilter(e.value)}
                label={e.label}
                count={countByEstado[e.value]}
              />
            ))}
          </div>

          {cheques.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Sin cheques"
              description="No hay cheques que coincidan con el filtro seleccionado."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N.º / Banco</TableHead>
                  <TableHead>
                    {kind === 'recibido' ? 'Librador' : 'Beneficiario'}
                  </TableHead>
                  <TableHead>{kind === 'recibido' ? 'Recepción' : 'Emisión'}</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cheques.map((c) => {
                  const dias = daysUntil(c.fechaCobro)
                  const showVenc = c.estado === 'en_cartera'
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <p className="font-medium">N.º {c.numero}</p>
                        <p className="text-muted-foreground flex items-center gap-1 text-xs">
                          <Landmark className="size-3" />
                          {c.banco}
                        </p>
                      </TableCell>
                      <TableCell className="font-medium">
                        {c.librador}
                        {c.notas && (
                          <p className="text-muted-foreground text-xs font-normal">
                            {c.notas}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatDate(c.fechaRecepcion)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDate(c.fechaCobro)}
                        {showVenc && (
                          <p
                            className={cn(
                              'text-xs',
                              dias < 0
                                ? 'text-expense'
                                : dias <= 7
                                  ? 'text-warning-foreground dark:text-warning'
                                  : 'text-muted-foreground',
                            )}
                          >
                            {dias < 0
                              ? `vencido hace ${Math.abs(dias)} d`
                              : dias === 0
                                ? 'vence hoy'
                                : `en ${dias} días`}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatARS(c.monto)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-0.5">
                          <ChequeEstadoBadge estado={c.estado} tipo={c.tipo} />
                          {c.tipo === 'recibido' &&
                            (c.estado === 'depositado' ||
                              c.estado === 'cobrado') &&
                            c.cuentaDepositoId && (
                              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                                <Link2 className="size-3" />
                                en {accountName(c.cuentaDepositoId)}
                              </span>
                            )}
                          {c.tipo === 'emitido' &&
                            c.estado === 'cobrado' &&
                            c.cuentaOrigenId && (
                              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                                <Link2 className="size-3" />
                                debitado de {accountName(c.cuentaOrigenId)}
                              </span>
                            )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ChequeActions
                          cheque={c}
                          onDeposit={() => {
                            setDepositing(c)
                            setDepAccount(
                              state.bankAccounts.find(
                                (a) => a.tipo === 'cuenta_corriente',
                              )?.id ??
                                state.bankAccounts[0]?.id ??
                                '',
                            )
                          }}
                          onSetEstado={setEstado}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de depósito */}
      <Dialog
        open={depositing !== null}
        onOpenChange={(o) => !o && setDepositing(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Depositar cheque</DialogTitle>
            <DialogDescription>
              Cheque N.º {depositing?.numero} ·{' '}
              {depositing && formatARS(depositing.monto)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Cuenta de depósito</Label>
            <Select value={depAccount} onValueChange={setDepAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cuenta" />
              </SelectTrigger>
              <SelectContent>
                {state.bankAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.banco} — {a.alias}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositing(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmDeposit} disabled={!depAccount}>
              Confirmar depósito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent border-border',
      )}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 text-xs tabular-nums',
          active ? 'bg-primary-foreground/20' : 'bg-muted',
        )}
      >
        {count}
      </span>
    </button>
  )
}

function ChequeActions({
  cheque,
  onDeposit,
  onSetEstado,
}: {
  cheque: Cheque
  onDeposit: () => void
  onSetEstado: (id: string, estado: ChequeEstado) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Acciones</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Cambiar estado</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {cheque.tipo === 'recibido' ? (
          <>
            {cheque.estado === 'en_cartera' && (
              <DropdownMenuItem onClick={onDeposit}>
                <ArrowDownToLine />
                Depositar
              </DropdownMenuItem>
            )}
            {cheque.estado !== 'cobrado' && (
              <DropdownMenuItem onClick={() => onSetEstado(cheque.id, 'cobrado')}>
                <CheckCircle2 />
                Marcar cobrado
              </DropdownMenuItem>
            )}
            {cheque.estado !== 'rechazado' && (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onSetEstado(cheque.id, 'rechazado')}
              >
                <XCircle />
                Marcar rechazado
              </DropdownMenuItem>
            )}
            {cheque.estado !== 'en_cartera' && (
              <DropdownMenuItem
                onClick={() => onSetEstado(cheque.id, 'en_cartera')}
              >
                <Undo2 />
                Volver a cartera
              </DropdownMenuItem>
            )}
          </>
        ) : (
          <>
            {cheque.estado !== 'cobrado' && (
              <DropdownMenuItem onClick={() => onSetEstado(cheque.id, 'cobrado')}>
                <Banknote />
                Marcar pagado (debita banco)
              </DropdownMenuItem>
            )}
            {cheque.estado !== 'rechazado' && (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onSetEstado(cheque.id, 'rechazado')}
              >
                <XCircle />
                Anular cheque
              </DropdownMenuItem>
            )}
            {cheque.estado !== 'en_cartera' && (
              <DropdownMenuItem
                onClick={() => onSetEstado(cheque.id, 'en_cartera')}
              >
                <Undo2 />
                Volver a “a pagar”
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
