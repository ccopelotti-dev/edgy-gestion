// ============================================================
// Agenda familiar (Fase 75k) — hook standalone, sin pasar por el
// Context/reducer de HomeKeepProvider (store.tsx). Es un duplicado
// deliberado de src/modules/agenda/data/useAgendaTareas.ts, mismo
// criterio: cada página se maneja sola, no hace falta un estado
// centralizado para una agenda. Ver comentario largo en la migración
// 0136_fase75k_home_keep_tareas.sql sobre por qué esta tabla es propia
// de Home Keep en vez de reusar `agenda_tareas`.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useClienteActual } from '@/hooks/useClienteActual';
import type {
  CategoriaTareaHogar,
  EstadoTareaHogar,
  PrioridadTareaHogar,
  TareaHogar,
} from '../types';

function filaATarea(row: any): TareaHogar {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    usuarioClienteId: row.usuario_cliente_id ?? undefined,
    titulo: row.titulo,
    descripcion: row.descripcion,
    fecha: row.fecha,
    horaInicio: row.hora_inicio,
    horaFin: row.hora_fin,
    categoria: row.categoria as CategoriaTareaHogar,
    prioridad: row.prioridad as PrioridadTareaHogar,
    estado: row.estado as EstadoTareaHogar,
    origen: row.origen ?? undefined,
    createdAt: row.created_at,
  };
}

export interface NuevaTareaHogar {
  usuarioClienteId?: string;
  titulo: string;
  descripcion?: string;
  fecha: string;
  horaInicio?: string;
  horaFin?: string;
  categoria: CategoriaTareaHogar;
  prioridad: PrioridadTareaHogar;
}

interface UseAgendaHogarResult {
  clienteId: string | null;
  tareas: TareaHogar[];
  cargando: boolean;
  error: string | null;
  crear: (tarea: NuevaTareaHogar) => Promise<boolean>;
  marcarEstado: (id: string, estado: EstadoTareaHogar) => Promise<boolean>;
  eliminar: (id: string) => Promise<boolean>;
  recargar: () => Promise<void>;
}

export function useAgendaHogar(): UseAgendaHogarResult {
  const { cliente, cargando: cargandoCliente, error: errorCliente } = useClienteActual();
  const clienteId = cliente?.id ?? null;
  const [tareas, setTareas] = useState<TareaHogar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);

    const { data, error: errFetch } = await supabase
      .from('home_keep_tareas')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: true });

    if (errFetch) {
      setError('No pudimos cargar la agenda familiar.');
      setCargando(false);
      return;
    }

    setTareas((data ?? []).map(filaATarea));
    setCargando(false);
  }, [clienteId]);

  useEffect(() => {
    if (cargandoCliente) return;
    if (errorCliente) {
      setError(errorCliente);
      setCargando(false);
      return;
    }
    cargar();
  }, [cargandoCliente, errorCliente, cargar]);

  const crear = useCallback(
    async (tarea: NuevaTareaHogar) => {
      if (!clienteId) return false;
      setError(null);

      const { error: errInsert } = await supabase.from('home_keep_tareas').insert({
        cliente_id: clienteId,
        usuario_cliente_id: tarea.usuarioClienteId || null,
        titulo: tarea.titulo,
        descripcion: tarea.descripcion || null,
        fecha: tarea.fecha,
        hora_inicio: tarea.horaInicio || null,
        hora_fin: tarea.horaFin || null,
        categoria: tarea.categoria,
        prioridad: tarea.prioridad,
      });

      if (errInsert) {
        setError('No pudimos crear el evento.');
        return false;
      }

      await cargar();
      return true;
    },
    [clienteId, cargar],
  );

  const marcarEstado = useCallback(
    async (id: string, estado: EstadoTareaHogar) => {
      setError(null);
      const { error: errUpdate } = await supabase.from('home_keep_tareas').update({ estado }).eq('id', id);

      if (errUpdate) {
        setError('No pudimos actualizar el evento.');
        return false;
      }

      await cargar();
      return true;
    },
    [cargar],
  );

  const eliminar = useCallback(
    async (id: string) => {
      setError(null);
      const { error: errDelete } = await supabase.from('home_keep_tareas').delete().eq('id', id);

      if (errDelete) {
        setError('No pudimos eliminar el evento.');
        return false;
      }

      await cargar();
      return true;
    },
    [cargar],
  );

  return {
    clienteId,
    tareas,
    cargando: cargando || cargandoCliente,
    error,
    crear,
    marcarEstado,
    eliminar,
    recargar: cargar,
  };
}
