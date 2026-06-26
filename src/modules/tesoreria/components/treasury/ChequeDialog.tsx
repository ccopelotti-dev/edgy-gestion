import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { BankAccount, Cheque, ChequeKind } from '../../types'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { todayISO } from '../../lib/format'

const BANCOS = [
  'Banco Galicia','Santander','Banco Nación','Banco Provincia','BBVA',
  'Banco Macro','Banco Credicoop','ICBC','Banco Ciudad','HSBC',
]

type ChequeFormValue = Omit<Cheque, 'id' | 'estado'>

export function ChequeDialog({
  accounts, onSubmit,
}: { accounts: BankAccount[]; onSubmit: (value: ChequeFormValue) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus />Cargar cheque</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cargar cheque</DialogTitle>
          <DialogDescription>
            Recibido: queda en cartera. Emitido: queda "a pagar" y se debita al marcarlo pagado.
          </DialogDescription>
        </DialogHeader>
        <ChequeForm accounts={accounts} onCancel={() => setOpen(false)}
          onSubmit={(value) => { onSubmit(value); setOpen(false) }} />
      </DialogContent>
    </Dialog>
  )
}

function ChequeForm({
  accounts, onCancel, onSubmit,
}: { accounts: BankAccount[]; onCancel: () => void; onSubmit: (value: ChequeFormValue) => void }) {
  const [tipo, setTipo] = useState<ChequeKind>('recibido')
  const [numero, setNumero] = useState('')
  const [banco, setBanco] = useState('')
  const [librador, setLibrador] = useState('')
  const [fechaRecepcion, setFechaRecepcion] = useState(todayISO())
  const [fechaCobro, setFechaCobro] = useState('')
  const [monto, setMonto] = useState('')
  const [notas, setNotas] = useState('')
  const [cuentaOrigenId, setCuentaOrigenId] = useState(accounts[0]?.id ?? '')

  const montoNum = Number(monto)
  const valid = numero.trim() !== '' && banco !== '' && librador.trim() !== '' && fechaCobro !== '' && montoNum > 0 && (tipo === 'recibido' || cuentaOrigenId !== '')

  function handleSubmit() {
    if (!valid) return
    onSubmit({
      tipo, numero: numero.trim(), banco, librador: librador.trim(),
      fechaRecepcion, fechaCobro, monto: montoNum,
      notas: notas.trim() || undefined,
      cuentaOrigenId: tipo === 'emitido' ? cuentaOrigenId : undefined,
    })
  }

  return (
    <>
      <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
        {(['recibido', 'emitido'] as ChequeKind[]).map((t) => (
          <button key={t} type="button" onClick={() => setTipo(t)}
            className={cn('rounded-md py-1.5 text-sm font-medium capitalize transition-colors',
              tipo === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {t}
          </button>
        ))}
      </div>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="chq-num">N.º de cheque</Label>
            <Input id="chq-num" placeholder="00000000" value={numero} onChange={(e) => setNumero(e.target.value)} autoFocus />
          </div>
          <div className="grid gap-2">
            <Label>Banco</Label>
            <Select value={banco} onValueChange={setBanco}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>{BANCOS.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="chq-librador">{tipo === 'recibido' ? 'Librador (quien lo emite)' : 'Beneficiario'}</Label>
          <Input id="chq-librador" placeholder={tipo === 'recibido' ? 'Razón social del cliente' : 'A la orden de…'} value={librador} onChange={(e) => setLibrador(e.target.value)} />
        </div>
        {tipo === 'emitido' && (
          <div className="grid gap-2">
            <Label>Cuenta emisora (se debita al pagarse)</Label>
            <Select value={cuentaOrigenId} onValueChange={setCuentaOrigenId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
              <SelectContent>{accounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.banco} — {a.alias}</SelectItem>))}</SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="chq-rec">{tipo === 'recibido' ? 'Recepción' : 'Emisión'}</Label>
            <Input id="chq-rec" type="date" value={fechaRecepcion} onChange={(e) => setFechaRecepcion(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="chq-cobro">{tipo === 'recibido' ? 'Fecha de pago' : 'Vencimiento'}</Label>
            <Input id="chq-cobro" type="date" value={fechaCobro} onChange={(e) => setFechaCobro(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="chq-monto">Monto</Label>
            <div className="relative">
              <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm">$</span>
              <Input id="chq-monto" type="number" min="0" step="0.01" placeholder="0,00" className="pl-7" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="chq-notas">Notas (opcional)</Label>
          <Input id="chq-notas" placeholder="Referencia, operación asociada…" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button disabled={!valid} onClick={handleSubmit}>Guardar cheque</Button>
      </DialogFooter>
    </>
  )
}
