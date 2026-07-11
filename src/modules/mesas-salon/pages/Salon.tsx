import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, Map as MapIcon, AlertTriangle, BellRing, Check } from 'lucide-react'
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
  const [vista, setVista] = useState<'grilla' | 'plano'>('grilla')

  const [nombreSector, setNombreSector] = useState('Salón principal')
  const [cantidadMesas, setCantidadMesas] = useState(8)
  const [sillasPorMesa, setSillasPorMesa] = useState(4)

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
          </div>
        </div>
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
              {vista === 'grilla' ? (
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
