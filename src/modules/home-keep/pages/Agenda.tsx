// ============================================================
// Modulo Home Keep — Agenda familiar (Fase 75k)
// Edgy Gestion · Duplicado deliberado de modules/agenda/pages/
// Calendario.tsx -- ver comentario largo en la migración
// 0136_fase75k_home_keep_tareas.sql sobre por qué esta agenda es propia
// de Home Keep (Cónyuge/Hijo tienen bloqueada la Agenda "de negocio").
// Suma un selector de integrante (usuarioClienteId) que la Agenda
// original no tiene -- pensado para que el agente de Acadeu pueda cargar
// acá la actividad de cada hijo.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { useClienteActual } from '@/hooks/useClienteActual';
import { useAgendaHogar } from '../data/useAgendaHogar';
import { formatDate as formatFecha, formatHora, todayISO } from '../lib/format';
import {
  CATEGORIA_TAREA_HOGAR_LABEL,
  PRIORIDAD_TAREA_HOGAR_LABEL,
  type CategoriaTareaHogar,
  type PrioridadTareaHogar,
  type TareaHogar,
} from '../types';

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Sentinel para "evento compartido de toda la familia" -- distinto del
// SIN_VINCULAR de IngresoDialog (ahí significa "no está en la lista,
// escribilo a mano"): acá null es un valor válido y frecuente, no una
// falta de dato.
const TODA_LA_FAMILIA = '__toda_la_familia__';

function celdasDelMes(anio: number, mes: number): (string | null)[] {
  const primerDia = new Date(anio, mes, 1);
  const ultimoDia = new Date(anio, mes + 1, 0);
  const offset = primerDia.getDay();
  const celdas: (string | null)[] = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= ultimoDia.getDate(); d++) {
    const mm = String(mes + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    celdas.push(`${anio}-${mm}-${dd}`);
  }
  return celdas;
}

const PRIORIDAD_COLOR: Record<PrioridadTareaHogar, string> = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-amber-100 text-amber-700',
  baja: 'bg-gray-100 text-gray-600',
};

interface IntegranteOpcion {
  id: string;
  nombre: string;
}

export default function Agenda() {
  const { cliente } = useClienteActual();
  const hoy = todayISO();
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoy.slice(5, 7)) - 1);
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoy);
  const [mostrarForm, setMostrarForm] = useState(false);

  const { tareas, cargando, error, crear, marcarEstado, eliminar } = useAgendaHogar();

  const [integrantes, setIntegrantes] = useState<IntegranteOpcion[]>([]);
  useEffect(() => {
    if (!cliente?.id) return;
    supabase
      .from('usuarios_cliente')
      .select('id, nombre, email')
      .eq('cliente_id', cliente.id)
      .order('nombre')
      .then(({ data }) => {
        setIntegrantes(
          (data ?? []).map((u: any) => ({ id: u.id, nombre: u.nombre || u.email || 'Sin nombre' })),
        );
      });
  }, [cliente?.id]);
  const nombreIntegrante = useMemo(() => {
    const mapa = new Map(integrantes.map((i) => [i.id, i.nombre]));
    return (id?: string) => (id ? mapa.get(id) ?? null : null);
  }, [integrantes]);

  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [categoria, setCategoria] = useState<CategoriaTareaHogar>('personal');
  const [prioridad, setPrioridad] = useState<PrioridadTareaHogar>('media');
  const [usuarioClienteId, setUsuarioClienteId] = useState(TODA_LA_FAMILIA);

  const tareasPorFecha = useMemo(() => {
    const mapa = new Map<string, TareaHogar[]>();
    for (const t of tareas) {
      const lista = mapa.get(t.fecha) ?? [];
      lista.push(t);
      mapa.set(t.fecha, lista);
    }
    return mapa;
  }, [tareas]);

  const celdas = useMemo(() => celdasDelMes(anio, mes), [anio, mes]);
  const tareasDelDia = tareasPorFecha.get(diaSeleccionado) ?? [];
  const proximasTareas = useMemo(
    () =>
      [...tareas]
        .filter((t) => t.estado === 'pendiente' && t.fecha >= hoy)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .slice(0, 6),
    [tareas, hoy],
  );

  function irMesAnterior() {
    if (mes === 0) {
      setAnio((a) => a - 1);
      setMes(11);
    } else {
      setMes((m) => m - 1);
    }
  }

  function irMesSiguiente() {
    if (mes === 11) {
      setAnio((a) => a + 1);
      setMes(0);
    } else {
      setMes((m) => m + 1);
    }
  }

  function abrirNuevoEvento(fecha: string) {
    setDiaSeleccionado(fecha);
    setTitulo('');
    setDescripcion('');
    setHoraInicio('');
    setHoraFin('');
    setCategoria('personal');
    setPrioridad('media');
    setUsuarioClienteId(TODA_LA_FAMILIA);
    setMostrarForm(true);
  }

  async function guardarEvento() {
    if (!titulo.trim()) return;
    const ok = await crear({
      usuarioClienteId: usuarioClienteId !== TODA_LA_FAMILIA ? usuarioClienteId : undefined,
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || undefined,
      fecha: diaSeleccionado,
      horaInicio: horaInicio || undefined,
      horaFin: horaFin || undefined,
      categoria,
      prioridad,
    });
    if (ok) setMostrarForm(false);
  }

  if (cargando) {
    return <p className="text-muted-foreground text-sm">Cargando agenda familiar...</p>;
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
              if (!fecha) return <div key={`vacio-${i}`} />;
              const tareasDia = tareasPorFecha.get(fecha) ?? [];
              const esHoy = fecha === hoy;
              const esSeleccionado = fecha === diaSeleccionado;
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
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{formatFecha(diaSeleccionado)}</h3>
              <Button size="sm" onClick={() => abrirNuevoEvento(diaSeleccionado)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Nuevo
              </Button>
            </div>

            {tareasDelDia.length === 0 ? (
              <p className="text-muted-foreground text-xs">No hay eventos para este día.</p>
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
                          {PRIORIDAD_TAREA_HOGAR_LABEL[t.prioridad]}
                        </span>
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          {CATEGORIA_TAREA_HOGAR_LABEL[t.categoria]}
                        </span>
                        {nombreIntegrante(t.usuarioClienteId) && (
                          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                            {nombreIntegrante(t.usuarioClienteId)}
                          </span>
                        )}
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
            <h3 className="text-sm font-semibold">Próximos eventos</h3>
            {proximasTareas.length === 0 ? (
              <p className="text-muted-foreground text-xs">No hay eventos pendientes.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {proximasTareas.map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-xs">
                    <span className="truncate">
                      {t.titulo}
                      {nombreIntegrante(t.usuarioClienteId) && (
                        <span className="text-muted-foreground"> · {nombreIntegrante(t.usuarioClienteId)}</span>
                      )}
                    </span>
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
            <DialogTitle>Nuevo evento · {formatFecha(diaSeleccionado)}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="titulo-evento">Título</Label>
              <Input id="titulo-evento" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="descripcion-evento">Descripción (opcional)</Label>
              <Input
                id="descripcion-evento"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="integrante-evento">Para quién es</Label>
              <Select value={usuarioClienteId} onValueChange={setUsuarioClienteId}>
                <SelectTrigger id="integrante-evento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODA_LA_FAMILIA}>Toda la familia</SelectItem>
                  {integrantes.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hora-inicio-evento">Hora inicio</Label>
                <Input
                  id="hora-inicio-evento"
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hora-fin-evento">Hora fin</Label>
                <Input id="hora-fin-evento" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoria-evento">Categoría</Label>
                <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaTareaHogar)}>
                  <SelectTrigger id="categoria-evento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORIA_TAREA_HOGAR_LABEL) as CategoriaTareaHogar[]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORIA_TAREA_HOGAR_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prioridad-evento">Prioridad</Label>
                <Select value={prioridad} onValueChange={(v) => setPrioridad(v as PrioridadTareaHogar)}>
                  <SelectTrigger id="prioridad-evento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORIDAD_TAREA_HOGAR_LABEL) as PrioridadTareaHogar[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORIDAD_TAREA_HOGAR_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={guardarEvento} disabled={!titulo.trim()}>
              Crear evento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
