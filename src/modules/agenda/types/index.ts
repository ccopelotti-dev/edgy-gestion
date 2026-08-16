// Tipos del módulo Agenda (Fase 31) -- calendario/tareas + bandeja de
// notas. Mismo criterio que el resto de los módulos: tipos propios acá,
// no en src/types/index.ts (ver useArchivos.ts de Utilidades).

// 'replanteo' (Fase 0083): segunda visita a domicilio para confirmar
// medidas exactas antes de fabricar -- generada automáticamente por el
// módulo Fichas de medida (ver fichas-medida/data/useFichasMedida.ts),
// no se crea a mano desde acá.
export type CategoriaTarea = 'trabajo' | 'personal' | 'pago' | 'entrega' | 'otro' | 'replanteo'
export type PrioridadTarea = 'baja' | 'media' | 'alta'
export type EstadoTarea = 'pendiente' | 'hecho'

export const CATEGORIA_TAREA_LABEL: Record<CategoriaTarea, string> = {
  trabajo: 'Trabajo',
  personal: 'Personal',
  pago: 'Pago',
  entrega: 'Entrega',
  otro: 'Otro',
  replanteo: 'Replanteo',
}

export const PRIORIDAD_TAREA_LABEL: Record<PrioridadTarea, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

export interface TareaAgenda {
  id: string
  clienteId: string
  titulo: string
  descripcion: string | null
  fecha: string // YYYY-MM-DD
  horaInicio: string | null
  horaFin: string | null
  categoria: CategoriaTarea
  prioridad: PrioridadTarea
  estado: EstadoTarea
  createdAt: string
}

// `resultado` -- bitácora que va a completar la futura skill de
// clasificación (Fase 31b, todavía no construida): qué tabla/fila creó a
// partir de esta nota, o por qué la dejó pendiente de revisión en vez de
// forzar una clasificación dudosa.
export interface NotaAgenda {
  id: string
  clienteId: string
  texto: string | null
  imagenes: string[] // paths en el bucket "notas-media", no URLs públicas
  audios: string[]
  procesado: boolean
  resultado: Record<string, unknown> | null
  createdAt: string
}
