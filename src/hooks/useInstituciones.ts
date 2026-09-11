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

export interface RegistroInstitucion {
  id: string;
  vinculoId: string;
  tipoRegistro: TipoRegistroInstitucion;
  periodo?: string;
  contenido: Record<string, unknown>;
  origen?: string;
  createdAt: string;
  updatedAt: string;
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

function filaARegistro(r: any): RegistroInstitucion {
  return {
    id: r.id,
    vinculoId: r.vinculo_id,
    tipoRegistro: r.tipo_registro,
    periodo: r.periodo ?? undefined,
    contenido: r.contenido ?? {},
    origen: r.origen ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
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
  // se puede distinguir de un vistazo qué se cargó a mano vs. solo.
  const crear = useCallback(
    async (data: { vinculoId: string; tipoRegistro: TipoRegistroInstitucion; periodo?: string; texto: string }) => {
      const { error } = await supabase.from('institucion_registros').insert({
        vinculo_id: data.vinculoId,
        tipo_registro: data.tipoRegistro,
        periodo: data.periodo || null,
        contenido: { texto: data.texto },
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
