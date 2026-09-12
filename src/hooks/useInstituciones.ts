// ============================================================
// Instituciones vinculadas a un integrante de la familia (Fase 75o)
// ============================================================
// Un integrante (usuarios_cliente) puede estar vinculado a una o más
// instituciones -- hoy: el colegio de cada hijo (proveedor='acadeu',
// se sincroniza solo); a futuro: un club, una actividad extracurricular
// (proveedor='manual', Carlos carga los registros a mano).
//
// Vive en Perfil Familiar (no en Home Keep) porque es historial de una
// PERSONA, no gasto del hogar -- ver comentario largo en la migración
// 0140_fase75o_vinculos_institucionales.sql.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { subirArchivo, obtenerUrlDescarga, eliminarArchivo } from '@/modules/utilidades/lib/archivos';

export type TipoInstitucion = 'colegio' | 'club' | 'otro';
export type ProveedorInstitucion = 'acadeu' | 'manual';
export type TipoRegistroInstitucion =
  | 'boletin'
  | 'convivencia'
  | 'materias_adeudadas'
  | 'asistencias_historico'
  | 'otro';

export interface VinculoInstitucional {
  id: string;
  clienteId: string;
  usuarioClienteId: string;
  tipo: TipoInstitucion;
  nombre: string;
  proveedor: ProveedorInstitucion;
  curso?: string;
  activo: boolean;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

// Fase 75r: forma normalizada de "estadoActual" según el tipo -- ver
// comentario largo en acadeu-sincronizar-registros.js (la normalización
// vive del lado del servidor; acá solo se tipa lo que ya viene armado).
export interface EstadoBoletin {
  asignaturas: { nombre: string; valores: Record<string, string> }[];
  asistenciasResumen: { nombre: string; valores: Record<string, string> }[];
  materiasAdeudadasAnteriores: string[];
  observaciones: string | null;
}

export interface EstadoAsistencias {
  resumen: Record<string, string> | null;
  detalle: Record<string, string>[];
}

export interface EstadoGenerico {
  mensaje: string | null;
  items: Record<string, string>[];
}

export interface EntradaHistorial {
  fecha: string;
  cambios: string[];
}

export interface ContenidoRegistro {
  estadoActual: EstadoBoletin | EstadoAsistencias | EstadoGenerico;
  historial: EntradaHistorial[];
}

export interface RegistroInstitucion {
  id: string;
  vinculoId: string;
  tipoRegistro: TipoRegistroInstitucion;
  periodo?: string;
  contenido: ContenidoRegistro;
  origen?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdjuntoRegistro {
  id: string;
  registroId: string;
  path: string;
  nombreArchivo: string;
  tamanioBytes?: number;
  createdAt: string;
}

const TIPO_INSTITUCION_LABEL: Record<TipoInstitucion, string> = {
  colegio: 'Colegio',
  club: 'Club',
  otro: 'Otro',
};

export const TIPO_REGISTRO_LABEL: Record<TipoRegistroInstitucion, string> = {
  boletin: 'Boletín',
  convivencia: 'Convivencia',
  materias_adeudadas: 'Materias adeudadas',
  asistencias_historico: 'Asistencias (histórico)',
  otro: 'Otro',
};

// Secciones que tiene sentido mostrar según el tipo de institución --
// arranca solo con 'colegio' (lo único que hoy tiene datos reales vía
// Acadeu); un 'club' a futuro tendría su propia lista acá.
export const SECCIONES_POR_TIPO: Record<TipoInstitucion, TipoRegistroInstitucion[]> = {
  colegio: ['boletin', 'convivencia', 'materias_adeudadas', 'asistencias_historico'],
  club: [],
  otro: [],
};

function filaAVinculo(r: any): VinculoInstitucional {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    usuarioClienteId: r.usuario_cliente_id,
    tipo: r.tipo,
    nombre: r.nombre,
    proveedor: r.proveedor,
    curso: r.curso ?? undefined,
    activo: r.activo,
    notas: r.notas ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Defensivo: filas viejas (previas a la Fase 75r) o algo cargado a mano
// sin pasar por crear() podrían no traer el sobre {estadoActual,
// historial} -- se envuelve acá para que el resto del código no tenga
// que volver a chequearlo.
function filaARegistro(r: any): RegistroInstitucion {
  const crudo = r.contenido ?? {};
  const contenido: ContenidoRegistro =
    crudo && typeof crudo === 'object' && 'estadoActual' in crudo
      ? { estadoActual: crudo.estadoActual, historial: crudo.historial ?? [] }
      : { estadoActual: { mensaje: null, items: [] }, historial: [] };
  return {
    id: r.id,
    vinculoId: r.vinculo_id,
    tipoRegistro: r.tipo_registro,
    periodo: r.periodo ?? undefined,
    contenido,
    origen: r.origen ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function filaAAdjunto(r: any): AdjuntoRegistro {
  return {
    id: r.id,
    registroId: r.registro_id,
    path: r.path,
    nombreArchivo: r.nombre_archivo,
    tamanioBytes: r.tamanio_bytes ?? undefined,
    createdAt: r.created_at,
  };
}

export { TIPO_INSTITUCION_LABEL };

export function useVinculosInstitucionales(usuarioClienteId?: string) {
  const [vinculos, setVinculos] = useState<VinculoInstitucional[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!usuarioClienteId) {
      setVinculos([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    const { data } = await supabase
      .from('vinculos_institucionales')
      .select('*')
      .eq('usuario_cliente_id', usuarioClienteId)
      .order('created_at');
    setVinculos((data ?? []).map(filaAVinculo));
    setCargando(false);
  }, [usuarioClienteId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = useCallback(
    async (data: { clienteId: string; usuarioClienteId: string; tipo: TipoInstitucion; nombre: string; proveedor: ProveedorInstitucion; curso?: string }) => {
      const { error } = await supabase.from('vinculos_institucionales').insert({
        cliente_id: data.clienteId,
        usuario_cliente_id: data.usuarioClienteId,
        tipo: data.tipo,
        nombre: data.nombre,
        proveedor: data.proveedor,
        curso: data.curso || null,
      });
      if (error) {
        console.error('useVinculosInstitucionales: error insertando', error);
        return false;
      }
      await cargar();
      return true;
    },
    [cargar],
  );

  const eliminar = useCallback(
    async (id: string) => {
      await supabase.from('vinculos_institucionales').delete().eq('id', id);
      await cargar();
    },
    [cargar],
  );

  return { vinculos, cargando, crear, eliminar, recargar: cargar };
}

export function useRegistrosInstitucion(vinculoId?: string) {
  const [registros, setRegistros] = useState<RegistroInstitucion[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!vinculoId) {
      setRegistros([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    const { data } = await supabase
      .from('institucion_registros')
      .select('*')
      .eq('vinculo_id', vinculoId)
      .order('created_at', { ascending: false });
    setRegistros((data ?? []).map(filaARegistro));
    setCargando(false);
  }, [vinculoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Carga manual (Fase 75p) -- `origen` queda undefined/null a propósito:
  // se reserva para cuando el sincronizador de Acadeu escriba acá, así
  // se puede distinguir de un vistazo qué se cargó a mano vs. solo. Se
  // envuelve en el mismo sobre {estadoActual, historial} que usa Acadeu
  // (Fase 75r) para que la Ficha tenga una sola forma que renderizar.
  const crear = useCallback(
    async (data: { vinculoId: string; tipoRegistro: TipoRegistroInstitucion; periodo?: string; texto: string }) => {
      const { error } = await supabase.from('institucion_registros').insert({
        vinculo_id: data.vinculoId,
        tipo_registro: data.tipoRegistro,
        periodo: data.periodo || null,
        contenido: { estadoActual: { mensaje: data.texto, items: [] }, historial: [] },
      });
      if (error) {
        console.error('useRegistrosInstitucion: error insertando', error);
        return false;
      }
      await cargar();
      return true;
    },
    [cargar],
  );

  return { registros, cargando, crear };
}

// ─── Adjuntos (Fase 75r) ─────────────────────────────────────────────
// Reusa el bucket privado "archivos-cliente" (mismo que Compras/
// Home Keep para tickets) -- ver src/modules/utilidades/lib/archivos.ts.

export function useAdjuntosRegistro(registroId?: string) {
  const [adjuntos, setAdjuntos] = useState<AdjuntoRegistro[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!registroId) {
      setAdjuntos([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    const { data } = await supabase
      .from('institucion_registro_adjuntos')
      .select('*')
      .eq('registro_id', registroId)
      .order('created_at', { ascending: false });
    setAdjuntos((data ?? []).map(filaAAdjunto));
    setCargando(false);
  }, [registroId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const subir = useCallback(
    async (file: File, clienteId: string) => {
      if (!registroId) return false;
      try {
        const { path, tamanioBytes } = await subirArchivo(file, clienteId, crypto.randomUUID());
        const { error } = await supabase.from('institucion_registro_adjuntos').insert({
          registro_id: registroId,
          cliente_id: clienteId,
          path,
          nombre_archivo: file.name,
          tamanio_bytes: tamanioBytes,
        });
        if (error) {
          console.error('useAdjuntosRegistro: error insertando fila', error);
          return false;
        }
        await cargar();
        return true;
      } catch (e) {
        console.error('useAdjuntosRegistro: error subiendo archivo', e);
        return false;
      }
    },
    [registroId, cargar],
  );

  const descargar = useCallback(async (path: string) => obtenerUrlDescarga(path), []);

  const eliminar = useCallback(
    async (adjunto: AdjuntoRegistro) => {
      await eliminarArchivo(adjunto.path);
      await supabase.from('institucion_registro_adjuntos').delete().eq('id', adjunto.id);
      await cargar();
    },
    [cargar],
  );

  return { adjuntos, cargando, subir, descargar, eliminar };
}
