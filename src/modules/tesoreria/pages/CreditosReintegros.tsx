// ============================================================
// Tesorería — Créditos y Reintegros (Fase 67, 01/09)
// Edgy Gestión · Vista mixta de `creditos_pendientes` -- reintegros
// bancarios esperados (ej. Promo Pampa) cargados desde una línea de
// pago en Compras u Home Keep (ver src/lib/creditos.ts). Esta pantalla
// es donde se los sigue hasta que el banco los acredita en el resumen
// de tarjeta -- deliberadamente separada de los comprobantes de compra
// para no tocar nunca el costo fiscal de lo comprado (ver migración
// 0114_fase67_creditos_pendientes.sql).
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import {
  BadgePercent,
  CheckCircle2,
  Loader2,
  PiggyBank,
  ThumbsDown,
  Trash2,
  Wallet,
} from 'lucide-react'

import { useClienteActual } from '@/hooks/useClienteActual'
import {
  listarCreditosPendientes,
  marcarCreditoAcreditado,
  marcarCreditoPerdido,
  eliminarCreditoPendiente,
  MODULO_CREDITO_LABEL,
  ESTADO_CREDITO_LABEL,
  type CreditoPendiente,
  type EstadoCredito,
  type ModuloCredito,
} from '@/lib/creditos'
import { KpiCard } from '../components/treasury/KpiCard'
import { EmptyState } from '../components/treasury/display'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatARS, formatDateLong, todayISO } from '../lib/format'

const ESTADO_BADGE: Record<EstadoCredito, 'warning' | 'income' | 'expense'> = {
  pendiente: 'warning',
  acreditado: 'income',
  perdido: 'expense',
}

export function CreditosReintegros() {
  const { cliente } = useClienteActual()
  const clienteId = cliente?.id

  const [creditos, setCreditos] = useState<CreditoPendiente[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<EstadoCredito | ''>('')
  const [filtroModulo, setFiltroModulo] = useState<ModuloCredito | ''>('')

  const [acreditarTarget, setAcreditarTarget] = useState<CreditoPendiente | null>(null)
  const [montoAcreditado, setMontoAcreditado] = useState('')
  const [fechaAcreditacion, setFechaAcreditacion] = useState(todayISO())
  const [guardando, setGuardando] = useState(false)
  const [accionandoId, setAccionandoId] = useState<string | null>(null)

  async function cargar() {
    if (!clienteId) return
    setLoading(true)
    const data = await listarCreditosPendientes(clienteId)
    setCreditos(data)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  const filtrados = useMemo(() => {
    return creditos.filter((c) => {
      if (filtroEstado && c.estado !== filtroEstado) return false
      if (filtroModulo && c.modulo !== filtroModulo) return false
      return true
    })
  }, [creditos, filtroEstado, filtroModulo])

  const totalPendiente = creditos
    .filter((c) => c.estado === 'pendiente')
    .reduce((a, c) => a + c.montoEsperado, 0)
  const totalAcreditado = creditos
    .filter((c) => c.estado === 'acreditado')
    .reduce((a, c) => a + (c.montoAcreditado ?? 0), 0)
  const countPerdido = creditos.filter((c) => c.estado === 'perdido').length

  function abrirAcreditar(c: CreditoPendiente) {
    setAcreditarTarget(c)
    setMontoAcreditado(String(c.montoEsperado))
    setFechaAcreditacion(todayISO())
  }

  async function confirmarAcreditado() {
    if (!acreditarTarget) return
    const monto = Number(montoAcreditado)
    if (!monto || monto <= 0) return
    setGuardando(true)
    const ok = await marcarCreditoAcreditado(acreditarTarget.id, monto, fechaAcreditacion)
    setGuardando(false)
    if (ok) {
      setAcreditarTarget(null)
      cargar()
    }
  }

  async function handleMarcarPerdido(c: CreditoPendiente) {
    if (!confirm(`¿Marcar como perdido el crédito "${c.concepto}" por ${formatARS(c.montoEsperado)}? Queda en el historial, no se borra.`)) return
    setAccionandoId(c.id)
    await marcarCreditoPerdido(c.id)
    setAccionandoId(null)
    cargar()
  }

  async function handleEliminar(c: CreditoPendiente) {
    if (!confirm(`¿Eliminar definitivamente el registro "${c.concepto}"?`)) return
    setAccionandoId(c.id)
    await eliminarCreditoPendiente(c.id)
    setAccionandoId(null)
    cargar()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Pendiente de acreditar"
          value={formatARS(totalPendiente)}
          icon={Wallet}
          accent="warning"
          hint={`${creditos.filter((c) => c.estado === 'pendiente').length} créditos esperados`}
        />
        <KpiCard
          label="Acreditado"
          value={formatARS(totalAcreditado)}
          icon={PiggyBank}
          accent="income"
          hint={`${creditos.filter((c) => c.estado === 'acreditado').length} ya confirmados`}
        />
        <KpiCard
          label="Perdidos"
          value={countPerdido > 0 ? String(countPerdido) : '—'}
          icon={ThumbsDown}
          accent={countPerdido > 0 ? 'expense' : 'primary'}
          hint="No llegaron a acreditarse"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2">
            <BadgePercent className="size-5" />
            Créditos y Reintegros
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={filtroModulo}
              onChange={(e) => setFiltroModulo(e.target.value as ModuloCredito | '')}
            >
              <option value="">Todos los módulos</option>
              <option value="compras">Compras</option>
              <option value="home_keep">Home Keep</option>
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as EstadoCredito | '')}
            >
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="acreditado">Acreditado</option>
              <option value="perdido">Perdido</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : filtrados.length === 0 ? (
            <EmptyState
              icon={BadgePercent}
              title="Sin créditos cargados"
              description="Los reintegros esperados (ej. promociones bancarias) que se cargan al confirmar un pago en Compras u Home Keep van a aparecer acá."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Fecha esperada</TableHead>
                  <TableHead className="text-right">Esperado</TableHead>
                  <TableHead className="text-right">Acreditado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {MODULO_CREDITO_LABEL[c.modulo]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-sm font-medium">{c.concepto}</p>
                      {c.notas && <p className="text-xs text-muted-foreground">{c.notas}</p>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {c.fechaEsperada ? formatDateLong(c.fechaEsperada) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatARS(c.montoEsperado)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {c.montoAcreditado != null ? formatARS(c.montoAcreditado) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_BADGE[c.estado]}>{ESTADO_CREDITO_LABEL[c.estado]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {c.estado === 'pendiente' && (
                          <>
                            <Button
                              size="sm"
                              variant="income"
                              className="h-8"
                              onClick={() => abrirAcreditar(c)}
                              disabled={accionandoId === c.id}
                            >
                              <CheckCircle2 className="size-3.5" />
                              Acreditado
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => handleMarcarPerdido(c)}
                              disabled={accionandoId === c.id}
                            >
                              {accionandoId === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <ThumbsDown className="size-3.5" />}
                            </Button>
                          </>
                        )}
                        {c.estado !== 'pendiente' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleEliminar(c)}
                            disabled={accionandoId === c.id}
                            title="Eliminar registro"
                          >
                            {accionandoId === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Marcar acreditado */}
      <Dialog open={acreditarTarget !== null} onOpenChange={(v) => { if (!v) setAcreditarTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como acreditado</DialogTitle>
          </DialogHeader>
          {acreditarTarget && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{acreditarTarget.concepto}</p>
              <div>
                <Label htmlFor="monto-acreditado">Monto acreditado</Label>
                <Input
                  id="monto-acreditado"
                  type="number"
                  className="mt-1"
                  value={montoAcreditado}
                  onChange={(e) => setMontoAcreditado(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Esperado: {formatARS(acreditarTarget.montoEsperado)} -- puede diferir si el banco acreditó de menos.
                </p>
              </div>
              <div>
                <Label htmlFor="fecha-acreditacion">Fecha de acreditación</Label>
                <Input
                  id="fecha-acreditacion"
                  type="date"
                  className="mt-1"
                  value={fechaAcreditacion}
                  onChange={(e) => setFechaAcreditacion(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcreditarTarget(null)}>Cancelar</Button>
            <Button onClick={confirmarAcreditado} disabled={guardando}>
              {guardando && <Loader2 className="size-3.5 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CreditosReintegros
