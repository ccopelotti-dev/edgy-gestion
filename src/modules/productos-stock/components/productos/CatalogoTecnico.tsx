'use client'

// ============================================================
// Catálogo Técnico -- componente compartido (Fase 48e)
// ============================================================
//
// Repositorio de documentación técnica (fichas técnicas, hojas de
// seguridad, videos de uso, texto libre) -- nació en InsumoDialog
// (Fase 48c/48d) y se extrae acá para reutilizarse también en
// ProductoDialog sin duplicar ~200 líneas de JSX y handlers. Pensado
// explícitamente para que en el futuro un agente de IA o una
// automatización pueda encontrar y usar esta información -- por eso
// `titulo` es obligatorio en cada documento (ver comentario en
// DocumentoTecnico, types/index.ts).
//
// Es un componente CONTROLADO (`documentos`/`onChange`) -- no sabe si
// el dueño es un Insumo o un Producto, ni cómo se persiste; eso lo
// maneja el diálogo padre igual que cualquier otro campo del form.
//
// La única pieza de estado que no puede vivir puramente controlada es
// la limpieza de archivos subidos "en esta sesión de edición" que
// nunca se llegaron a guardar (si el usuario sube un PDF y después
// cancela el diálogo, ese archivo queda huérfano en el bucket si no
// se borra). Como esa limpieza la dispara el padre (su propio
// handleCancelar), se expone vía ref con `limpiarSesion()`.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Trash2,
  ImagePlus,
  X,
  Loader2,
  FileText,
  Video,
  Link2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Type,
} from 'lucide-react'
import { subirArchivo, obtenerUrlDescarga, eliminarArchivo } from '@/modules/utilidades/lib/archivos'
import { todayISO } from '../../lib/format'
import type { DocumentoTecnico, TipoDocumentoTecnico } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

export interface CatalogoTecnicoHandle {
  /** Borra del bucket privado los archivos subidos en esta apertura del
   * diálogo que no llegaron a guardarse -- llamar desde el handleCancelar
   * del diálogo padre. */
  limpiarSesion: () => void
}

interface CatalogoTecnicoProps {
  /** Igual que en el diálogo padre -- se usa para resetear el estado de
   * UI (textos expandidos, formularios de "nuevo video/texto" abiertos)
   * cada vez que el diálogo se vuelve a abrir. */
  open: boolean
  documentos: DocumentoTecnico[]
  onChange: (documentos: DocumentoTecnico[]) => void
  /** cliente_id del usuario logueado -- hace falta para el path del
   * bucket privado "archivos-cliente" (ver utilidades/lib/archivos.ts). */
  clienteId: string | null | undefined
  /** Texto de ayuda bajo el título -- distinto según sea Insumo o
   * Producto (ej. "de este insumo" vs. "de este producto"). */
  descripcionAyuda?: string
}

export const CatalogoTecnico = forwardRef<CatalogoTecnicoHandle, CatalogoTecnicoProps>(
  function CatalogoTecnico({ open, documentos, onChange, clienteId, descripcionAyuda }, ref) {
    const fileInputDocRef = useRef<HTMLInputElement>(null)
    const documentosSubidosEnEstaSesionRef = useRef<Set<string>>(new Set())
    const [subiendoDoc, setSubiendoDoc] = useState(false)
    const [errorDoc, setErrorDoc] = useState('')
    const [mostrarNuevoVideo, setMostrarNuevoVideo] = useState(false)
    const [nuevoVideoTitulo, setNuevoVideoTitulo] = useState('')
    const [nuevoVideoUrl, setNuevoVideoUrl] = useState('')
    const [mostrarNuevoTexto, setMostrarNuevoTexto] = useState(false)
    const [nuevoTextoTitulo, setNuevoTextoTitulo] = useState('')
    const [nuevoTextoContenido, setNuevoTextoContenido] = useState('')
    const [textosExpandidos, setTextosExpandidos] = useState<Set<string>>(new Set())

    useEffect(() => {
      if (!open) return
      documentosSubidosEnEstaSesionRef.current = new Set()
      setErrorDoc('')
      setMostrarNuevoVideo(false)
      setNuevoVideoTitulo('')
      setNuevoVideoUrl('')
      setMostrarNuevoTexto(false)
      setNuevoTextoTitulo('')
      setNuevoTextoContenido('')
      setTextosExpandidos(new Set())
    }, [open])

    useImperativeHandle(ref, () => ({
      limpiarSesion() {
        for (const path of documentosSubidosEnEstaSesionRef.current) {
          void eliminarArchivo(path)
        }
        documentosSubidosEnEstaSesionRef.current = new Set()
      },
    }))

    async function handleDocArchivoSeleccionado(files: FileList | null) {
      const file = files?.[0]
      if (!file) return
      setErrorDoc('')
      if (!clienteId) {
        setErrorDoc('Esperá un segundo, todavía estamos cargando tus datos -- probá de nuevo.')
        return
      }
      setSubiendoDoc(true)
      try {
        const docId = crypto.randomUUID()
        const { path } = await subirArchivo(file, clienteId, docId)
        documentosSubidosEnEstaSesionRef.current.add(path)
        const tipo: TipoDocumentoTecnico = file.type === 'application/pdf' ? 'pdf' : 'imagen'
        const tituloDefault = file.name.replace(/\.[^./\\]+$/, '')
        onChange([...documentos, { id: docId, tipo, titulo: tituloDefault, path, createdAt: todayISO() }])
      } catch (err) {
        setErrorDoc(err instanceof Error ? err.message : 'No se pudo subir el archivo.')
      } finally {
        setSubiendoDoc(false)
        if (fileInputDocRef.current) fileInputDocRef.current.value = ''
      }
    }

    function handleAgregarVideo() {
      const titulo = nuevoVideoTitulo.trim()
      const url = nuevoVideoUrl.trim()
      if (!titulo || !url) return
      onChange([...documentos, { id: crypto.randomUUID(), tipo: 'video', titulo, url, createdAt: todayISO() }])
      setNuevoVideoTitulo('')
      setNuevoVideoUrl('')
      setMostrarNuevoVideo(false)
    }

    function handleActualizarTituloDoc(id: string, titulo: string) {
      onChange(documentos.map((d) => (d.id === id ? { ...d, titulo } : d)))
    }

    function handleAgregarTexto() {
      const titulo = nuevoTextoTitulo.trim()
      const contenido = nuevoTextoContenido.trim()
      if (!titulo || !contenido) return
      const id = crypto.randomUUID()
      onChange([...documentos, { id, tipo: 'texto', titulo, contenido, createdAt: todayISO() }])
      setTextosExpandidos((prev) => new Set(prev).add(id))
      setNuevoTextoTitulo('')
      setNuevoTextoContenido('')
      setMostrarNuevoTexto(false)
    }

    function handleActualizarContenidoTexto(id: string, contenido: string) {
      onChange(documentos.map((d) => (d.id === id ? { ...d, contenido } : d)))
    }

    function handleToggleTextoExpandido(id: string) {
      setTextosExpandidos((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }

    function handleQuitarDocumento(id: string) {
      const doc = documentos.find((d) => d.id === id)
      if (doc?.path && documentosSubidosEnEstaSesionRef.current.has(doc.path)) {
        documentosSubidosEnEstaSesionRef.current.delete(doc.path)
        void eliminarArchivo(doc.path)
      }
      onChange(documentos.filter((d) => d.id !== id))
    }

    async function handleVerDocumento(doc: DocumentoTecnico) {
      if (doc.tipo === 'texto') {
        handleToggleTextoExpandido(doc.id)
        return
      }
      if (doc.tipo === 'video') {
        if (doc.url) window.open(doc.url, '_blank', 'noopener,noreferrer')
        return
      }
      if (!doc.path) return
      setErrorDoc('')
      try {
        const url = await obtenerUrlDescarga(doc.path)
        window.open(url, '_blank', 'noopener,noreferrer')
      } catch {
        setErrorDoc('No pudimos generar el link de descarga -- probá de nuevo.')
      }
    }

    return (
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">Catálogo Técnico</label>
        <p className="text-xs text-muted-foreground">
          {descripcionAyuda ??
            'Fichas técnicas, hojas de seguridad, manuales o videos de uso -- quedan a mano acá para consultarlos rápido (y, a futuro, para que un agente de IA los use como referencia).'}
        </p>

        {documentos.length > 0 && (
          <div className="grid gap-2 mt-1">
            {documentos.map((d) => {
              const expandido = d.tipo === 'texto' && textosExpandidos.has(d.id)
              return (
                <div key={d.id} className="grid gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-muted-foreground" title={d.tipo}>
                      {d.tipo === 'pdf' && <FileText className="h-4 w-4" />}
                      {d.tipo === 'imagen' && <ImagePlus className="h-4 w-4" />}
                      {d.tipo === 'video' && <Video className="h-4 w-4" />}
                      {d.tipo === 'texto' && <Type className="h-4 w-4" />}
                    </span>
                    <input
                      className={`${inputClass} flex-1`}
                      placeholder="Título (ej. Ficha técnica)"
                      value={d.titulo}
                      onChange={(e) => handleActualizarTituloDoc(d.id, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                      title={
                        d.tipo === 'video'
                          ? 'Abrir video'
                          : d.tipo === 'texto'
                            ? expandido
                              ? 'Ocultar texto'
                              : 'Ver texto'
                            : 'Ver / descargar'
                      }
                      onClick={() => handleVerDocumento(d)}
                    >
                      {d.tipo === 'texto' ? (
                        expandido ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0"
                      onClick={() => handleQuitarDocumento(d.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {expandido && (
                    <textarea
                      className={`${inputClass} h-28 resize-y`}
                      value={d.contenido ?? ''}
                      onChange={(e) => handleActualizarContenidoTexto(d.id, e.target.value)}
                      placeholder="Especificación técnica..."
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {mostrarNuevoVideo && (
          <div className="flex items-center gap-2 mt-1">
            <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              className={`${inputClass} flex-1`}
              placeholder="Título (ej. Video: instalación)"
              value={nuevoVideoTitulo}
              onChange={(e) => setNuevoVideoTitulo(e.target.value)}
            />
            <input
              className={`${inputClass} flex-1`}
              placeholder="Link (YouTube, Drive, etc.)"
              value={nuevoVideoUrl}
              onChange={(e) => setNuevoVideoUrl(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAgregarVideo}
              disabled={!nuevoVideoTitulo.trim() || !nuevoVideoUrl.trim()}
            >
              Agregar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground shrink-0"
              onClick={() => {
                setMostrarNuevoVideo(false)
                setNuevoVideoTitulo('')
                setNuevoVideoUrl('')
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {mostrarNuevoTexto && (
          <div className="grid gap-1.5 mt-1">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                className={`${inputClass} flex-1`}
                placeholder="Título (ej. Especificación técnica)"
                value={nuevoTextoTitulo}
                onChange={(e) => setNuevoTextoTitulo(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground shrink-0"
                onClick={() => {
                  setMostrarNuevoTexto(false)
                  setNuevoTextoTitulo('')
                  setNuevoTextoContenido('')
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <textarea
              className={`${inputClass} h-28 resize-y`}
              placeholder="Pegá o escribí acá la especificación técnica..."
              value={nuevoTextoContenido}
              onChange={(e) => setNuevoTextoContenido(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              className="justify-self-start"
              onClick={handleAgregarTexto}
              disabled={!nuevoTextoTitulo.trim() || !nuevoTextoContenido.trim()}
            >
              Agregar
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputDocRef.current?.click()}
            disabled={subiendoDoc}
          >
            {subiendoDoc ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5 mr-1" />
            )}
            Subir PDF o imagen
          </Button>
          {!mostrarNuevoVideo && (
            <Button type="button" variant="outline" size="sm" onClick={() => setMostrarNuevoVideo(true)}>
              <Link2 className="h-3.5 w-3.5 mr-1" />
              Agregar link de video
            </Button>
          )}
          {!mostrarNuevoTexto && (
            <Button type="button" variant="outline" size="sm" onClick={() => setMostrarNuevoTexto(true)}>
              <Type className="h-3.5 w-3.5 mr-1" />
              Agregar texto libre
            </Button>
          )}
        </div>
        <input
          ref={fileInputDocRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleDocArchivoSeleccionado(e.target.files)}
        />
        {errorDoc && <p className="text-xs text-red-500">{errorDoc}</p>}
      </div>
    )
  },
)
