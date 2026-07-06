import { useState } from 'react'
import { AlertTriangle, Link2, Plus } from 'lucide-react'
import {
  CATEGORIES,
  PAYMENT_METHODS,
  isBankSettled,
  type BankAccount,
  type MovementType,
  type PaymentMethod,
} from '../../types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { todayISO } from '../../lib/format'

export interface MovementFormValue {
  fecha: string
  tipo: MovementType
  concepto: string
  categoria: string
  medioPago: PaymentMethod
  monto: number
  cuentaId?: string
}

interface MovementDialogProps {
  mode: 'caja' | 'banco'
  title: string
  description?: string
  accounts: BankAccount[]
  defaultAccountId?: string
  triggerLabel?: string
  onSubmit: (value: MovementFormValue) => void
}

export function MovementDialog({
  mode, title, description, accounts, defaultAccountId,
  triggerLabel = 'Nuevo movimiento', onSubmit,
}: MovementDialogProps) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus />{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <MovementForm
          mode={mode} accounts={accounts} defaultAccountId={defaultAccountId}
          onCancel={() => setOpen(false)}
          onSubmit={(value) => { onSubmit(value); setOpen(false) }}
        />
      </DialogContent>
    </Dialog>
  )
}

function MovementForm({
  mode, accounts, defaultAccountId, onCancel, onSubmit,
}: {
  mode: 'caja' | 'banco'
  accounts: BankAccount[]
  defaultAccountId?: string
  onCancel: () => void
  onSubmit: (value: MovementFormValue) => void
}) {
  const [tipo, setTipo] = useState<MovementType>('ingreso')
  const [fecha, setFecha] = useState(todayISO())
  const [concepto, setConcepto] = useState('')
  const [categoria, setCategoria] = useState('')
  const [medioPago, setMedioPago] = useState<PaymentMethod>('efectivo')
  const [monto, setMonto] = useState('')
  const [cuentaId, setCuentaId] = useState(defaultAccountId ?? accounts[0]?.id ?? '')

  const categorias = CATEGORIES.filter((c) => c.type === tipo || c.type === 'ambos')
  const needsAccount = mode === 'banco' || isBankSettled(medioPago)
  const sinCuentasDisponibles = needsAccount && accounts.length === 0
  const montoNum = Number(monto)
  const valid = concepto.trim() !== '' && categoria !== '' && montoNum > 0 && (!needsAccount || cuentaId !== '')

  function handleSubmit() {
    if (!valid) return
    onSubmit({
      fecha, tipo, concepto: concepto.trim(), categoria, medioPago,
      monto: montoNum, cuentaId: needsAccount ? cuentaId : undefined,
    })
  }

  return (
    <>
      <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
        <button type="button" onClick={() => { setTipo('ingreso'); setCategoria('') }}
          className={cn('rounded-md py-1.5 text-sm font-medium transition-colors',
            tipo === 'ingreso' ? 'bg-income text-income-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          Ingreso
        </button>
        <button type="button" onClick={() => { setTipo('egreso'); setCategoria('') }}
          className={cn('rounded-md py-1.5 text-sm font-medium transition-colors',
            tipo === 'egreso' ? 'bg-expense text-expense-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          Egreso
        </button>
      </div>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="mov-concepto">Concepto</Label>
          <Input id="mov-concepto" placeholder="Ej: Venta mostrador, Pago proveedor…" value={concepto} onChange={(e) => setConcepto(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Categoría</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {categorias.map((c) => (<SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Medio de pago</Label>
            <Select value={medioPago} onValueChange={(v) => setMedioPago(v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {needsAccount && (
          <div className="grid gap-2">
            <Label>{mode === 'banco' ? 'Cuenta bancaria' : 'Cuenta de acreditación'}</Label>
            {sinCuentasDisponibles ? (
              <div className="border-warning/40 bg-warning/10 text-warning-foreground flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Todavía no hay ninguna cuenta bancaria cargada. Creá una en{' '}
                  <span className="font-medium">Tesorería &gt; Bancos</span> antes de registrar este movimiento —
                  si no, no se va a poder generar el espejo bancario.
                </span>
              </div>
            ) : (
              <Select value={cuentaId} onValueChange={setCuentaId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.banco} — {a.alias}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
            {mode === 'caja' && !sinCuentasDisponibles && (
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Link2 className="size-3.5" />
                Se generará automáticamente el movimiento espejo en esta cuenta.
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="mov-fecha">Fecha</Label>
            <Input id="mov-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mov-monto">Monto</Label>
            <div className="relative">
              <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm">$</span>
              <Input id="mov-monto" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0,00" className="pl-7" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button disabled={!valid} variant={tipo === 'ingreso' ? 'income' : 'destructive'} onClick={handleSubmit}>
          Registrar {tipo}
        </Button>
      </DialogFooter>
    </>
  )
}
