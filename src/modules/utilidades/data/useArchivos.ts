import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Carpeta, Archivo } from '../types'
import { subirArchivo, eliminarArchivo } from '../lib/archivos'
import { useClienteId } from './useClienteId'

function filaACarpeta(row: any): Carpeta {
  return { id: row.id, nombre: row.nombre, createdAt: row.created_at }
}

function filaAArchivo(row: any): Archivo {
  return {
    id: row.id,
    carpetaId: row.carpeta_id ?? undefined,
    origenModulo: row.origen_modulo ?? undefined,
    origenId: row.origen_id ?? undefined,
    nombre: row.nombre,
    path: row.path,
    tamanioBytes: row.tamanio_bytes,
    createdAt: row.created_at,
  }
}

interface UseArchivosResult {
  clienteId: string | null
  carpetas: Carpeta[]
  archivos: Archivo[]
  cargando: boolean
  error: string | null
  crearCarpeta: (nombre: string) => Promise<boolean>
  eliminarCarpeta: (id: string) => Promise<boolean>
  subir: (file: File, carpetaId?: string) => Promise<boolean>
  borrarArchivo: (archivo: Archivo) => Promise<boolean>
}

export function useArchivos(): UseArchivosResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [carpetas, setCarpetas] = useState<Carpeta[]>([])
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)

    const [{ data: carpetasData, error: errCarpetas }, { data: archivosData, error: errArchivos }] =
      await Promise.all([
        supabase
          .from('carpetas_cliente')
          .select('*')
          .eq('cliente_id', clienteId)
          .order('nombre', { ascending: true }),
        supabase
          .from('archivos_cliente')
          .select('*')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: false }),
      ])

    if (errCarpetas || errArchivos) {
      setError('No pudimos cargar el explorador de archivos.')
      setCargando(false)
      return
    }

    setCarpetas((carpetasData ?? []).map(filaACarpeta))
    setArchivos((archivosData ?? []).map(filaAArchivo))
    setCargando(false)
  }, [clienteId])

  useEffect(() => {
    if (cargandoClienteId) return
    if (errorClienteId) {
      setError(errorClienteId)
      setCargando(false)
      return
    }
    cargar()
  }, [cargandoClienteId, errorClienteId, cargar])

  const crearCarpeta = useCallback(
    async (nombre: string) => {
      if (!clienteId) return false
      setError(null)

      const { error: errInsert } = await supabase
        .from('carpetas_cliente')
        .insert({ cliente_id: clienteId, nombre })

      if (errInsert) {
        setError(
          errInsert.code === '23505'
            ? 'Ya existe una carpeta con ese nombre.'
            : 'No pudimos crear la carpeta.',
        )
        return false
      }

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  const eliminarCarpeta = useCallback(
    async (id: string) => {
      setError(null)
      // Los archivos de la carpeta NO se borran -- quedan sin carpeta
      // (carpeta_id -> null via "on delete set null"), consistente con la
      // idea de que borrar una carpeta es solo un reordenamiento, no una
      // acción destructiva sobre los archivos.
      const { error: errDelete } = await supabase.from('carpetas_cliente').delete().eq('id', id)

      if (errDelete) {
        setError('No pudimos eliminar la carpeta.')
        return false
      }

      await cargar()
      return true
    },
    [cargar],
  )

  const subir = useCallback(
    async (file: File, carpetaId?: string) => {
      if (!clienteId) return false
      setError(null)

      const archivoId = crypto.randomUUID()

      try {
        const { path, tamanioBytes } = await subirArchivo(file, clienteId, archivoId)

        const { error: errInsert } = await supabase.from('archivos_cliente').insert({
          id: archivoId,
          cliente_id: clienteId,
          carpeta_id: carpetaId ?? null,
          nombre: file.name,
          path,
          tamanio_bytes: tamanioBytes,
        })

        if (errInsert) {
          // Best-effort: si falla el registro en la tabla, no dejamos el
          // archivo huérfano en el bucket.
          await eliminarArchivo(path)
          setError('No pudimos registrar el archivo.')
          return false
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No pudimos subir el archivo.')
        return false
      }

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  const borrarArchivo = useCallback(
    async (archivo: Archivo) => {
      setError(null)

      const { error: errDelete } = await supabase
        .from('archivos_cliente')
        .delete()
        .eq('id', archivo.id)

      if (errDelete) {
        setError('No pudimos eliminar el archivo.')
        return false
      }

      await eliminarArchivo(archivo.path)
      await cargar()
      return true
    },
    [cargar],
  )

  return {
    clienteId,
    carpetas,
    archivos,
    cargando: cargando || cargandoClienteId,
    error,
    crearCarpeta,
    eliminarCarpeta,
    subir,
    borrarArchivo,
  }
}
