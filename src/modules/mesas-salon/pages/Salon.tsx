import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, Map as MapIcon, Flame, AlertTriangle, BellRing, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useTurnoActivo } from '@/hooks/useTurnoActivo'
import { useClienteActual } from '@/hooks/useClienteActual'
import { useMesasSalon, useSectoresConMesas, useResumenEstados } from '../data/store'
import {
  listarLlamadosPendientes,
  suscribirLlamadosMozo,
  marcarLlamadoAtendido,
  type LlamadoMozo,
} from '../lib/llamadosMozo'
import {
  calcularIntensidadPorMesa,
  bucketIntensidad,
  formatValorCalor,
  COLOR_INTENSIDAD,
  METRICA_CALOR_LABEL,
  RANGO_CALOR_LABEL,
  type MetricaCalor,
  type RangoCalor,
} from '../lib/heatmap'
import type { EstadoMesa } from '../types'

const ORIGEN_LLAMADO_LABEL: Record<LlamadoMozo['origen'], string> = {
  cliente: 'Desde la mesa (Menú QR)',
  personal: 'Aviso interno',
}

const COLOR_ESTADO: Record<EstadoMesa, string> = {
  libre: 'bg-emerald-500 hover:bg-emerald-600',
  ocupada: 'bg-red-500 hover:bg-red-600',
  cobro: 'bg-amber-500 hover:bg-amber-600',
  reservada: 'bg-violet-500 hover:bg-violet-600',
}

const DOT_ESTADO: Record<EstadoMesa, string> = {
  libre: 'bg-emerald-500',
  ocupada: 'bg-red-500',
  cobro: 'bg-amber-500',
  reservada: 'bg-violet-500',
}

const LABEL_ESTADO: Record<EstadoMesa, string> = {
  libre: 'Libres',
  ocupada: 'Ocupadas',
  cobro: 'Cobro',
  reservada: 'Reserv.',
}

export default function Salon() {
  const navigate = useNavigate()
  const { cliente } = useClienteActual()
  const { dispatch } = useMesasSalon()
  const sectoresConMesas = useSectoresConMesas()
  const resumen = useResumenEstados()
  const { turno, cargando: cargandoTurno } = useTurnoActivo()
  const [vista, setVista] = useState<'grilla' | 'plano' | 'calor'>('grilla')

  const [nombreSector, setNombreSector] = useState('Salón principal')
  const [cantidadMesas, setCantidadMesas] = useState(8)
  const [sillasPorMesa, setSillasPorMesa] = useState(4)

  // Fase 16.2: mapa de calor -- ver ../lib/heatmap.ts. Selector con las 3
  // métricas (rotación/facturación/tiempo de ocupación) + selector de
  // rango, según lo pedido: no una sola vista fija.
  const [metricaCalor, setMetricaCalor] = useState<MetricaCalor>('rotacion')
  const [rangoCalor, setRangoCalor] = useState<RangoCalor>('7d')
  const [desdeCustom, setDesdeCustom] = useState('')
  const [hastaCustom, setHastaCustom] = useState('')
  const [valoresCalor, setValoresCalor] = useState<Map<string, number>>(new Map())
  const [cargandoCalor, setCargandoCalor] = useState(false)

  useEffect(() => {
    if (vista !== 'calor' || !cliente?.id) return
    if (rangoCalor === 'custom' && (!desdeCustom || !hastaCustom)) return
    let activo = true
    setCargandoCalor(true)
    calcularIntensidadPorMesa(cliente.id, metricaCalor, rangoCalor, desdeCustom, hastaCustom)
      .then((valores) => {
        if (activo) setValoresCalor(valores)
      })
      .finally(() => {
        if (activo) setCargandoCalor(false)
      })
    return () => {
      activo = false
    }
  }, [vista, cliente?.id, metricaCalor, rangoCalor, desdeCustom, hastaCustom])

  const maximoCalor = useMemo(() => Math.max(0, ...Array.from(valoresCalor.values())), [valoresCalor])

  // Fase 13c: llamados a mozo en tiempo real -- ver ../lib/llamadosMozo.ts.
  const [llamados, setLlamados] = useState<LlamadoMozo[]>([])

  useEffect(() => {
    if (!cliente?.id) return
    let activo = true
    listarLlamadosPendientes(cliente.id).then((lista) => {
      if (activo) setLlamados(lista)
    })
    const cancelar = suscribirLlamadosMozo(cliente.id, (nuevo) => {
      setLlamados((actual) => (actual.some((l) => l.id === nuevo.id) ? actual : [...actual, nuevo]))
    })
    return () => {
      activo = false
      cancelar()
    }
  }, [cliente?.id])

  async function atenderLlamado(id: string) {
    const ok = await marcarLlamadoAtendido(id)
    if (ok) setLlamados((actual) => actual.filter((l) => l.id !== id))
  }

  const totalMesas = sectoresConMesas.reduce((sum, s) => sum + s.mesas.length, 0)
  const soloLectura = !cargandoTurno && !turno

  function crearSalon() {
    const sector = sectoresConMesas[0]?.sector
    const sectorId = sector?.id ?? crypto.randomUUID()
    if (!sector) {
      dispatch({ type: 'ADD_SECTOR', payload: { id: sectorId, nombre: nombreSector } })
    }
    const offset = sectoresConMesas.find((s) => s.sector.id === sectorId)?.mesas.length ?? 0
    dispatch({
      type: 'CREAR_MESAS_MASIVO',
      payload: { sectorId, cantidad: cantidadMesas, capacidad: sillasPorMesa, offset },
    })
  }

  function abrirMesa(mesaId: string) {
    if (soloLectura) return
    navigate(`/m/comandas-cocina/mesa/${mesaId}`)
  }

  return (
    <div className="flex flex-col gap-4">
      {soloLectura && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">Debe abrir un turno de caja para usar mesas y sectores.</p>
                <p className="text-xs text-amber-800">El plano queda en modo lectura hasta que exista un turno abierto.</p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate('/m/caja-turno')}>
              Ir a Caja
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Fase 13c: llamados a mozo pendientes, en tiempo real -- ver
          ../lib/llamadosMozo.ts. Aparecen apenas se crean (Realtime),
          sin necesidad de refrescar la pantalla. */}
      {llamados.length > 0 && (
        <div className="flex flex-col gap-2">
          {llamados.map((l) => {
            const numeroMesa = sectoresConMesas
              .flatMap((s) => s.mesas)
              .find((m) => m.id === l.mesaId)?.numero
            return (
              <Card key={l.id} className="border-violet-300 bg-violet-50">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-2 text-violet-900">
                    <BellRing className="h-4 w-4 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">
                        Mesa {numeroMesa ?? '—'} llama al mozo
                      </p>
                      <p className="text-xs text-violet-800">
                        {ORIGEN_LLAMADO_LABEL[l.origen]}
                        {l.motivo ? ` · ${l.motivo}` : ''}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => atenderLlamado(l.id)}>
                    <Check className="mr-1.5 h-4 w-4" />
                    Atendido
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {totalMesas > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {(Object.keys(LABEL_ESTADO) as EstadoMesa[]).map((estado) => (
              <div key={estado} className="flex items-center gap-1.5">
                <span className={cn('h-2.5 w-2.5 rounded-full', DOT_ESTADO[estado])} />
                <span className="font-medium">{resumen[estado]}</span>
                <span className="text-muted-foreground">{LABEL_ESTADO[estado]}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-1 rounded-md border p-0.5">
            <Button
              variant={vista === 'grilla' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setVista('grilla')}
            >
              <LayoutGrid className="mr-1.5 h-4 w-4" />
              Grilla
            </Button>
            <Button
              variant={vista === 'plano' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setVista('plano')}
            >
              <MapIcon className="mr-1.5 h-4 w-4" />
              Plano
            </Button>
            <Button
              variant={vista === 'calor' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setVista('calor')}
            >
              <Flame className="mr-1.5 h-4 w-4" />
              Calor
            </Button>
          </div>
        </div>
      )}

      {/* Fase 16.2: controles del mapa de calor -- métrica + rango, ver
          ../lib/heatmap.ts. Solo se muestran en la vista "Calor". */}
      {vista === 'calor' && totalMesas > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="metrica-calor">Métrica</Label>
              <select
                id="metrica-calor"
                value={metricaCalor}
                onChange={(e) => setMetricaCalor(e.target.value as MetricaCalor)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {(Object.keys(METRICA_CALOR_LABEL) as MetricaCalor[]).map((m) => (
                  <option key={m} value={m}>{METRICA_CALOR_LABEL[m]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rango-calor">Rango</Label>
              <select
                id="rango-calor"
                value={rangoCalor}
                onChange={(e) => setRangoCalor(e.target.value as RangoCalor)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {(Object.keys(RANGO_CALOR_LABEL) as RangoCalor[]).map((r) => (
                  <option key={r} value={r}>{RANGO_CALOR_LABEL[r]}</option>
                ))}
              </select>
            </div>
            {rangoCalor === 'custom' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="desde-calor">Desde</Label>
                  <Input id="desde-calor" type="date" value={desdeCustom} onChange={(e) => setDesdeCustom(e.target.value)} className="h-9" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="hasta-calor">Hasta</Label>
                  <Input id="hasta-calor" type="date" value={hastaCustom} onChange={(e) => setHastaCustom(e.target.value)} className="h-9" />
                </div>
              </>
            )}
            {cargandoCalor && <span className="text-muted-foreground text-xs">Calculando...</span>}
            {!cargandoCalor && valoresCalor.size === 0 && (
              <span className="text-muted-foreground text-xs">Sin comandas en este rango todavía.</span>
            )}

            <div className="flex w-full items-center gap-1.5 pt-1">
              <span className="text-muted-foreground text-xs">Menos</span>
              {COLOR_INTENSIDAD.map((color, i) => (
                <span key={i} className={cn('h-3 w-6 rounded', color.split(' ')[0])} />
              ))}
              <span className="text-muted-foreground text-xs">Más</span>
            </div>
          </CardContent>
        </Card>
      )}

      {totalMesas === 0 ? (
        <Card className="mx-auto w-full max-w-md">
          <CardContent className="flex flex-col gap-4 py-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold">Armá tu salón en 10 segundos</h2>
              <p className="text-muted-foreground text-sm">
                Poné un sector y cuántas mesas tiene. Después podés mover, agregar o renombrar.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sector">Sector</Label>
                <Input id="sector" value={nombreSector} onChange={(e) => setNombreSector(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cantidad">Cantidad de mesas</Label>
                  <Input
                    id="cantidad"
                    type="number"
                    min={1}
                    value={cantidadMesas}
                    onChange={(e) => setCantidadMesas(Number(e.target.value) || 1)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sillas">Sillas por mesa</Label>
                  <Input
                    id="sillas"
                    type="number"
                    min={1}
                    value={sillasPorMesa}
                    onChange={(e) => setSillasPorMesa(Number(e.target.value) || 1)}
                  />
                </div>
              </div>
              <Button onClick={crearSalon}>Crear {cantidadMesas} mesas</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {sectoresConMesas.map(({ sector, mesas }) => (
            <div key={sector.id}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-medium">{sector.nombre}</h3>
                <span className="text-muted-foreground text-xs">
                  {mesas.filter((m) => m.estado === 'ocupada').length}/{mesas.length} ocupadas
                </span>
              </div>
              {vista === 'calor' ? (
                <div className="flex flex-wrap gap-3">
                  {mesas.map((mesa) => {
                    const valor = valoresCalor.get(mesa.id) ?? 0
                    const bucket = bucketIntensidad(valor, maximoCalor)
                    return (
                      <button
                        key={mesa.id}
                        onClick={() => abrirMesa(mesa.id)}
                        disabled={soloLectura}
                        title={`Mesa ${mesa.numero} · ${formatValorCalor(valor, metricaCalor)}`}
                        className={cn(
                          'flex h-16 w-16 flex-col items-center justify-center rounded-lg font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                          COLOR_INTENSIDAD[bucket],
                        )}
                      >
                        <span className="text-lg">{mesa.numero}</span>
                        <span className="text-[9px] font-normal opacity-90 leading-tight text-center px-0.5">
                          {formatValorCalor(valor, metricaCalor)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : vista === 'grilla' ? (
                <div className="flex flex-wrap gap-3">
                  {mesas.map((mesa) => (
                    <button
                      key={mesa.id}
                      onClick={() => abrirMesa(mesa.id)}
                      disabled={soloLectura}
                      className={cn(
                        'flex h-16 w-16 flex-col items-center justify-center rounded-lg font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                        COLOR_ESTADO[mesa.estado],
                      )}
                    >
                      <span className="text-lg">{mesa.numero}</span>
                      <span className="text-[10px] font-normal opacity-90">{mesa.capacidad}p</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="relative h-[420px] w-full overflow-auto rounded-lg border bg-gray-50">
                  {mesas.map((mesa) => (
                    <button
                      key={mesa.id}
                      onClick={() => abrirMesa(mesa.id)}
                      disabled={soloLectura}
                      style={{ left: mesa.posX, top: mesa.posY }}
                      className={cn(
                        'absolute flex h-16 w-16 flex-col items-center justify-center rounded-lg font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                        COLOR_ESTADO[mesa.estado],
                      )}
                    >
                      <span className="text-lg">{mesa.numero}</span>
                      <span className="text-[10px] font-normal opacity-90">{mesa.capacidad}p</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
