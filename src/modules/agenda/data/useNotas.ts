import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { NotaAgenda } from '../types'
import { eliminarMediaNota, subirMediaNota } from '../lib/notasMedia'
import { useClienteId } from './useClienteId'

function filaANota(row: any): NotaAgenda {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    texto: row.texto,
    imagenes: row.imagenes ?? [],
    audios: row.audios ?? [],
    procesado: row.procesado,
    resultado: row.resultado,
    createdAt: row.created_at,
  }
}

interface UseNotasResult {
  clienteId: string | null
  notas: NotaAgenda[]
  cargando: boolean
  error: string | null
  subiendo: boolean
  crearNota: (texto: string, imagenes: File[], audios: Blob[]) => Promise<boolean>
  eliminarNota: (nota: NotaAgenda) => Promise<boolean>
  // Saca la nota de la bandeja y crea una tarea a partir del primer
  // renglón del texto -- mismo criterio que "Mover a Tarea" de Edgy
  // Trading Hub.
  moverATarea: (nota: NotaAgenda, fecha: string) => Promise<boolean>
}

export function useNotas(): UseNotasResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [notas, setNotas] = useState<NotaAgenda[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)

    const { data, error: errFetch } = await supabase
      .from('notas')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })

    if (errFetch) {
      setError('No pudimos cargar las notas.')
      setCargando(false)
      return
    }

    setNotas((data ?? []).map(filaANota))
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

  const crearNota = useCallback(
    async (texto: string, imagenes: File[], audios: Blob[]) => {
      if (!clienteId) return false
      if (!texto.trim() && imagenes.length === 0 && audios.length === 0) return false
      setError(null)
      setSubiendo(true)

      try {
        const pathsImagenes: string[] = []
        for (const img of imagenes) {
          pathsImagenes.push(await subirMediaNota(img, clienteId, img.name))
        }

        const pathsAudios: string[] = []
        for (let i = 0; i < audios.length; i++) {
          pathsAudios.push(await subirMediaNota(audios[i], clienteId, `nota_${Date.now()}_${i}.webm`))
        }

        const { error: errInsert } = await supabase.from('notas').insert({
          cliente_id: clienteId,
          texto: texto.trim() || null,
          imagenes: pathsImagenes,
          audios: pathsAudios,
        })

        if (errInsert) {
          setError('No pudimos guardar la nota.')
          setSubiendo(false)
          return false
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No pudimos subir el archivo.')
        setSubiendo(false)
        return false
      }

      setSubiendo(false)
      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  const eliminarNota = useCallback(
    async (nota: NotaAgenda) => {
      setError(null)
      const { error: errDelete } = await supabase.from('notas').delete().eq('id', nota.id)

      if (errDelete) {
        setError('No pudimos eliminar la nota.')
        return false
      }

      // Best-effort: no deja los archivos huérfanos en el bucket, pero
      // tampoco bloquea el borrado de la nota si esto falla.
      await Promise.all([...nota.imagenes, ...nota.audios].map((path) => eliminarMediaNota(path)))

      await cargar()
      return true
    },
    [cargar],
  )

  const moverATarea = useCallback(
    async (nota: NotaAgenda, fecha: string) => {
      if (!clienteId) return false
      setError(null)

      const primerLinea = (nota.texto || '').split('\n')[0].slice(0, 80) || 'Nota sin título'

      const { error: errInsert } = await supabase.from('agenda_tareas').insert({
        cliente_id: clienteId,
        titulo: primerLinea,
        descripcion: nota.texto || null,
        fecha,
        categoria: 'trabajo',
        prioridad: 'media',
      })

      if (errInsert) {
        setError('No pudimos mover la nota a tareas.')
        return false
      }

      const { error: errDelete } = await supabase.from('notas').delete().eq('id', nota.id)
      if (errDelete) {
        setError('Se creó la tarea, pero no pudimos sacar la nota de la bandeja.')
        await cargar()
        return false
      }

      await cargar()
      return true
    },
    [clienteId, cargar],
  )

  return {
    clienteId,
    notas,
    cargando: cargando || cargandoClienteId,
    error,
    subiendo,
    crearNota,
    eliminarNota,
    moverATarea,
  }
}
