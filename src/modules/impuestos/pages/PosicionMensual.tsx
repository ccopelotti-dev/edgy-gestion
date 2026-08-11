import { useState } from 'react'
import { CalendarClock, Lock, LockOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useClienteId } from '../data/useClienteId'
import { usePosicionMensual } from '../data/usePosicionMensual'
import { formatARS, periodoActualISO, formatPeriodo } from '../lib/format'

export default function PosicionMensual() {
  const [periodo, setPeriodo] = useState(periodoActualISO())
  const { clienteId } = useClienteId()
  const {
    resultado,
    debitoFiscal,
    creditoFiscalComputable,
    retencionesSufridas,
    saldoTecnicoAnterior,
    periodoCerrado,
    cargando,
    error,
    cerrar,
  } = usePosicionMensual(periodo)

  const [cerrando, setCerrando] = useState(false)
  const [creandoRecordatorio, setCreandoRecordatorio] = useState(false)
  const [recordatorioFecha, setRecordatorioFecha] = useState('')
  const [recordatorioOk, setRecordatorioOk] = useState(false)

  async function handleCerrar() {
    if (!confirm(`¿Cerrar la posición de ${formatPeriodo(periodo)}? Esto guarda el saldo técnico para que el próximo período lo use como saldo a favor arrastrado.`)) return
    setCerrando(true)
    await cerrar()
    setCerrando(false)
  }

  async function crearRecordatorio() {
    if (!clienteId || !recordatorioFecha || !resultado) return
    setCreandoRecordatorio(true)
    const { error: errInsert } = await supabase.from('agenda_tareas').insert({
      cliente_id: clienteId,
      titulo: `Vencimiento IVA -- ${formatPeriodo(periodo)}`,
      descripcion: `Posición mensual de IVA del período ${periodo}. IVA a ingresar estimado: ${formatARS(resultado.ivaAIngresar)}. Verificar fecha de vencimiento exacta según terminación de CUIT en el calendario de ARCA.`,
      fecha: recordatorioFecha,
      categoria: 'pago',
      prioridad: 'alta',
      estado: 'pendiente',
    })
    setCreandoRecordatorio(false)
    if (!errInsert) setRecordatorioOk(true)
  }

  if (cargando) return <p className="text-muted-foreground text-sm">Calculando posición mensual...</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="month"
          value={periodo}
          onChange={(e) => {
            setPeriodo(e.target.value)
            setRecordatorioOk(false)
          }}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            periodoCerrado ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {periodoCerrado ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
          {periodoCerrado ? 'Período cerrado' : 'Período abierto (calculadora en tiempo real)'}
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {resultado && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold">Cálculo de {formatPeriodo(periodo)}</h3>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between border-b border-dashed border-gray-100 pb-2">
                <span className="text-muted-foreground">Débito Fiscal (Ventas)</span>
                <span className="font-medium">{formatARS(debitoFiscal)}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-gray-100 pb-2">
                <span className="text-muted-foreground">(-) Crédito Fiscal Computable (Compras A/M)</span>
                <span className="font-medium">{formatARS(creditoFiscalComputable)}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-gray-100 pb-2">
                <span className="text-muted-foreground">(-) Saldo Técnico a favor del período anterior</span>
                <span className="font-medium">{formatARS(saldoTecnicoAnterior)}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-gray-100 pb-2">
                <span className="font-semibold">Saldo Técnico</span>
                <span className={`font-semibold ${resultado.saldoTecnico > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatARS(resultado.saldoTecnico)} {resultado.saldoTecnico > 0 ? '(a pagar)' : '(a favor)'}
                </span>
              </div>
              <div className="flex justify-between border-b border-dashed border-gray-100 pb-2">
                <span className="text-muted-foreground">(-) Retenciones/Percepciones de IVA sufridas</span>
                <span className="font-medium">{formatARS(retencionesSufridas)}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-base font-bold">IVA a ingresar</span>
                <span className="text-base font-bold text-red-600">{formatARS(resultado.ivaAIngresar)}</span>
              </div>
              {resultado.saldoLibreDisponibilidad > 0 && (
                <p className="text-muted-foreground text-xs">
                  Saldo de libre disponibilidad (retenciones no absorbidas): {formatARS(resultado.saldoLibreDisponibilidad)}
                </p>
              )}
              {resultado.saldoTecnicoAFavorProximoPeriodo > 0 && (
                <p className="text-muted-foreground text-xs">
                  Se arrastra como saldo a favor al próximo período: {formatARS(resultado.saldoTecnicoAFavorProximoPeriodo)}
                </p>
              )}
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            Calculadora fiscal preliminar -- no reemplaza la liquidación oficial. Verificar contra el aplicativo/Portal IVA de ARCA
            antes de presentar.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleCerrar} disabled={cerrando || periodoCerrado}>
              {periodoCerrado ? 'Período ya cerrado' : cerrando ? 'Cerrando...' : 'Cerrar período'}
            </Button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-700">
              <CalendarClock className="h-3.5 w-3.5" />
              Recordatorio de vencimiento en Agenda
            </p>
            {recordatorioOk ? (
              <p className="text-xs text-green-700">Recordatorio creado en Agenda.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={recordatorioFecha}
                  onChange={(e) => setRecordatorioFecha(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
                />
                <Button size="sm" variant="outline" onClick={crearRecordatorio} disabled={!recordatorioFecha || creandoRecordatorio}>
                  {creandoRecordatorio ? 'Creando...' : 'Crear en Agenda'}
                </Button>
                <span className="text-muted-foreground text-xs">
                  El vencimiento exacto depende de la terminación del CUIT -- verificar en el calendario de ARCA.
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
