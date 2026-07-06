import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { AccountKind, BankAccount } from '../../types'
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

export interface AccountFormValue {
  banco: string
  alias: string
  numero: string
  cbu: string
  tipo: AccountKind
  moneda: 'ARS' | 'USD'
  saldoInicial: number
}

interface AccountDialogProps {
  onSubmit: (value: Omit<BankAccount, 'id'>) => void
}

export function AccountDialog({ onSubmit }: AccountDialogProps) {
  const [open, setOpen] = useState(false)
  const [banco, setBanco] = useState('')
  const [alias, setAlias] = useState('')
  const [numero, setNumero] = useState('')
  const [cbu, setCbu] = useState('')
  const [tipo, setTipo] = useState<AccountKind>('cuenta_corriente')
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS')
  const [saldoInicial, setSaldoInicial] = useState('')

  const valid = banco.trim() !== '' && alias.trim() !== ''

  function reset() {
    setBanco('')
    setAlias('')
    setNumero('')
    setCbu('')
    setTipo('cuenta_corriente')
    setMoneda('ARS')
    setSaldoInicial('')
  }

  function handleSubmit() {
    if (!valid) return
    onSubmit({
      banco: banco.trim(),
      alias: alias.trim(),
      numero: numero.trim(),
      cbu: cbu.trim(),
      tipo,
      moneda,
      saldoInicial: Number(saldoInicial) || 0,
    })
    reset()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Nueva cuenta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva cuenta bancaria</DialogTitle>
          <DialogDescription>
            Cargá una cuenta para poder registrar movimientos bancarios y habilitar el espejo automático
            desde Caja, Ventas y Compras.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="acc-banco">Banco</Label>
              <Input id="acc-banco" placeholder="Ej: Banco Galicia" value={banco} onChange={(e) => setBanco(e.target.value)} autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acc-alias">Alias</Label>
              <Input id="acc-alias" placeholder="Ej: galicia.charcuteria" value={alias} onChange={(e) => setAlias(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="acc-numero">N.º de cuenta</Label>
              <Input id="acc-numero" placeholder="Opcional" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acc-cbu">CBU</Label>
              <Input id="acc-cbu" placeholder="Opcional" value={cbu} onChange={(e) => setCbu(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as AccountKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cuenta_corriente">Cuenta corriente</SelectItem>
                  <SelectItem value="caja_ahorro">Caja de ahorro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Moneda</Label>
              <Select value={moneda} onValueChange={(v) => setMoneda(v as 'ARS' | 'USD')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acc-saldo">Saldo inicial</Label>
              <div className="relative">
                <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm">$</span>
                <Input id="acc-saldo" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0,00" className="pl-7" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={!valid} onClick={handleSubmit}>Crear cuenta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
