import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAgendaTareas } from '../data/useAgendaTareas'
import { formatFecha, formatHora, todayISO } from '../lib/format'
import {
  CATEGORIA_TAREA_LABEL,
  PRIORIDAD_TAREA_LABEL,
  type CategoriaTarea,
  type PrioridadTarea,
  type TareaAgenda,
} from '../types'

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function celdasDelMes(anio: number, mes: number): (string | null)[] {
  const primerDia = new Date(anio, mes, 1)
  const ultimoDia = new Date(anio, mes + 1, 0)
  const offset = primerDia.getDay()
  const celdas: (string | null)[] = []
  for (let i = 0; i < offset; i++) celdas.push(null)
  for (let d = 1; d <= ultimoDia.getDate(); d++) {
    const mm = String(mes + 1).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    celdas.push(`${anio}-${mm}-${dd}`)
  }
  return celdas
}

const PRIORIDAD_COLOR: Record<PrioridadTarea, string> = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-amber-100 text-amber-700',
  baja: 'bg-gray-100 text-gray-600',
}

export default function Calendario() {
  const hoy = todayISO()
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)))
  const [mes, setMes] = useState(Number(hoy.slice(5, 7)) - 1)
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoy)
  const [mostrarForm, setMostrarForm] = useState(false)

  const { tareas, cargando, error, crear, marcarEstado, eliminar } = useAgendaTareas()

  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [categoria, setCategoria] = useState<CategoriaTarea>('trabajo')
  const [prioridad, setPrioridad] = useState<PrioridadTarea>('media')

  const tareasPorFecha = useMemo(() => {
    const mapa = new Map<string, TareaAgenda[]>()
    for (const t of tareas) {
      const lista = mapa.get(t.fecha) ?? []
      lista.push(t)
      mapa.set(t.fecha, lista)
    }
    return mapa
  }, [tareas])

  const celdas = useMemo(() => celdasDelMes(anio, mes), [anio, mes])
  const tareasDelDia = tareasPorFecha.get(diaSeleccionado) ?? []
  const proximasTareas = useMemo(
    () =>
      [...tareas]
        .filter((t) => t.estado === 'pendiente' && t.fecha >= hoy)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .slice(0, 6),
    [tareas, hoy],
  )

  function irMesAnterior() {
    if (mes === 0) {
      setAnio((a) => a - 1)
      setMes(11)
    } else {
      setMes((m) => m - 1)
    }
  }

  function irMesSiguiente() {
    if (mes === 11) {
      setAnio((a) => a + 1)
      setMes(0)
    } else {
      setMes((m) => m + 1)
    }
  }

  function abrirNuevaTarea(fecha: string) {
    setDiaSeleccionado(fecha)
    setTitulo('')
    setDescripcion('')
    setHoraInicio('')
    setHoraFin('')
    setCategoria('trabajo')
    setPrioridad('media')
    setMostrarForm(true)
  }

  async function guardarTarea() {
    if (!titulo.trim()) return
    const ok = await crear({
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || undefined,
      fecha: diaSeleccionado,
      horaInicio: horaInicio || undefined,
      horaFin: horaFin || undefined,
      categoria,
      prioridad,
    })
    if (ok) setMostrarForm(false)
  }

  if (cargando) {
    return <p className="text-muted-foreground text-sm">Cargando agenda...</p>
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="flex flex-col gap-4 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              {MESES[mes]} {anio}
            </h2>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={irMesAnterior}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={irMesSiguiente}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {celdas.map((fecha, i) => {
              if (!fecha) return <div key={`vacio-${i}`} />
              const tareasDia = tareasPorFecha.get(fecha) ?? []
              const esHoy = fecha === hoy
              const esSeleccionado = fecha === diaSeleccionado
              return (
                <button
                  key={fecha}
                  onClick={() => setDiaSeleccionado(fecha)}
                  className={`flex h-16 flex-col items-center justify-start gap-1 rounded-md border p-1 text-sm transition-colors ${
                    esSeleccionado
                      ? 'border-primary bg-primary/5'
                      : esHoy
                        ? 'border-gray-300 bg-gray-50'
                        : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  <span className={esHoy ? 'font-semibold' : ''}>{Number(fecha.slice(8, 10))}</span>
                  {tareasDia.length > 0 && (
                    <span className="flex flex-wrap justify-center gap-0.5">
                      {tareasDia.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          className={`h-1.5 w-1.5 rounded-full ${
                            t.estado === 'hecho' ? 'bg-gray-300' : 'bg-primary'
                          }`}
                        />
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{formatFecha(diaSeleccionado)}</h3>
              <Button size="sm" onClick={() => abrirNuevaTarea(diaSeleccionado)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Nueva
              </Button>
            </div>

            {tareasDelDia.length === 0 ? (
              <p className="text-muted-foreground text-xs">No hay tareas para este día.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {tareasDelDia.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={t.estado === 'hecho'}
                      onChange={() => marcarEstado(t.id, t.estado === 'hecho' ? 'pendiente' : 'hecho')}
                    />
                    <div className="flex-1">
                      <p className={t.estado === 'hecho' ? 'text-muted-foreground line-through' : 'font-medium'}>
                        {t.titulo}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(t.horaInicio || t.horaFin) && (
                          <span className="text-muted-foreground text-xs">
                            {t.horaInicio ? formatHora(t.horaInicio) : ''}
                            {t.horaFin ? ` - ${formatHora(t.horaFin)}` : ''}
                          </span>
                        )}
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORIDAD_COLOR[t.prioridad]}`}>
                          {PRIORIDAD_TAREA_LABEL[t.prioridad]}
                        </span>
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          {CATEGORIA_TAREA_LABEL[t.categoria]}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => eliminar(t.id)}
                      className="text-muted-foreground hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <h3 className="text-sm font-semibold">Próximas tareas</h3>
            {proximasTareas.length === 0 ? (
              <p className="text-muted-foreground text-xs">No hay tareas pendientes.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {proximasTareas.map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-xs">
                    <span className="truncate">{t.titulo}</span>
                    <span className="text-muted-foreground ml-2 whitespace-nowrap">{formatFecha(t.fecha)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {error && <p className="text-sm text-red-600 lg:col-span-3">{error}</p>}

      <Dialog open={mostrarForm} onOpenChange={setMostrarForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva tarea · {formatFecha(diaSeleccionado)}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="titulo-tarea">Título</Label>
              <Input id="titulo-tarea" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="descripcion-tarea">Descripción (opcional)</Label>
              <Input
                id="descripcion-tarea"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hora-inicio">Hora inicio</Label>
                <Input
                  id="hora-inicio"
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hora-fin">Hora fin</Label>
                <Input id="hora-fin" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoria-tarea">Categoría</Label>
                <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaTarea)}>
                  <SelectTrigger id="categoria-tarea">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORIA_TAREA_LABEL) as CategoriaTarea[]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORIA_TAREA_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prioridad-tarea">Prioridad</Label>
                <Select value={prioridad} onValueChange={(v) => setPrioridad(v as PrioridadTarea)}>
                  <SelectTrigger id="prioridad-tarea">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORIDAD_TAREA_LABEL) as PrioridadTarea[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORIDAD_TAREA_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={guardarTarea} disabled={!titulo.trim()}>
              Crear tarea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
