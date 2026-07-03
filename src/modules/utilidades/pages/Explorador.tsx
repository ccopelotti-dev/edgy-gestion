'use client'

import { useMemo, useRef, useState } from 'react'
import {
  Folder,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  FileText,
  ChevronLeft,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useArchivos } from '../data/useArchivos'
import { obtenerUrlDescarga } from '../lib/archivos'
import { EmptyState, ErrorBanner } from '../components/utilidades/display'
import { CarpetaDialog } from '../components/utilidades/carpeta-dialog'
import { formatDate, formatTamanio } from '../lib/format'
import type { Archivo, ModuloOrigenArchivo } from '../types'

// ─── Labels de módulo origen ────────────────────────────────────────────────
// Ninguno de estos módulos llama todavía a subir() con un origenModulo --
// queda preparado para cuando, por ejemplo, una Recepción confirmada de
// Productos y Stock adjunte su remito acá automáticamente.

const MODULO_LABEL: Record<ModuloOrigenArchivo, string> = {
  tesoreria: 'Tesorería',
  'productos-stock': 'Productos y Stock',
  ventas: 'Ventas',
  compras: 'Compras',
  servicios: 'Servicios',
}

type Grupo =
  | { tipo: 'carpeta'; id: string; nombre: string }
  | { tipo: 'modulo'; modulo: ModuloOrigenArchivo; nombre: string }
  | { tipo: 'sin-carpeta' }

export default function Explorador() {
  const { carpetas, archivos, cargando, error, crearCarpeta, eliminarCarpeta, subir, borrarArchivo } =
    useArchivos()

  const [grupoActivo, setGrupoActivo] = useState<Grupo | null>(null)
  const [carpetaDialogOpen, setCarpetaDialogOpen] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const gruposModulo = useMemo(() => {
    const modulos = new Set<ModuloOrigenArchivo>()
    archivos.forEach((a) => {
      if (a.origenModulo) modulos.add(a.origenModulo)
    })
    return Array.from(modulos)
  }, [archivos])

  const archivosSinCarpeta = useMemo(
    () => archivos.filter((a) => !a.carpetaId && !a.origenModulo),
    [archivos],
  )

  function archivosDe(grupo: Grupo): Archivo[] {
    if (grupo.tipo === 'carpeta') return archivos.filter((a) => a.carpetaId === grupo.id)
    if (grupo.tipo === 'modulo') return archivos.filter((a) => a.origenModulo === grupo.modulo)
    return archivosSinCarpeta
  }

  function conteoDe(grupo: Grupo): number {
    return archivosDe(grupo).length
  }

  async function handleSubir(files: FileList | null) {
    if (!files || files.length === 0) return
    setSubiendo(true)
    setErrorLocal(null)
    const carpetaId = grupoActivo?.tipo === 'carpeta' ? grupoActivo.id : undefined
    for (const file of Array.from(files)) {
      const ok = await subir(file, carpetaId)
      if (!ok) {
        setErrorLocal('Alguno de los archivos no se pudo subir.')
      }
    }
    setSubiendo(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDescargar(archivo: Archivo) {
    try {
      const url = await obtenerUrlDescarga(archivo.path)
      window.open(url, '_blank')
    } catch {
      setErrorLocal('No pudimos generar el link de descarga.')
    }
  }

  async function handleBorrar(archivo: Archivo) {
    if (!window.confirm(`¿Eliminar "${archivo.nombre}"?`)) return
    await borrarArchivo(archivo)
  }

  async function handleEliminarCarpeta(id: string, nombre: string) {
    if (!window.confirm(`¿Eliminar la carpeta "${nombre}"? Los archivos no se borran, quedan sin carpeta.`)) {
      return
    }
    await eliminarCarpeta(id)
    setGrupoActivo(null)
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Cargando...
      </div>
    )
  }

  if (error) {
    return <ErrorBanner mensaje={error} />
  }

  // ── Vista dentro de un grupo (archivos) ──────────────────────────────────
  if (grupoActivo) {
    const lista = archivosDe(grupoActivo)
    const nombreGrupo =
      grupoActivo.tipo === 'carpeta'
        ? grupoActivo.nombre
        : grupoActivo.tipo === 'modulo'
          ? MODULO_LABEL[grupoActivo.modulo]
          : 'Sin carpeta'

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setGrupoActivo(null)}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleSubir(e.target.files)}
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={subiendo}>
              {subiendo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              Subir archivos
            </Button>
            {grupoActivo.tipo === 'carpeta' && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-red-500"
                onClick={() => handleEliminarCarpeta(grupoActivo.id, grupoActivo.nombre)}
                title="Eliminar carpeta"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <h2 className="text-lg font-semibold">{nombreGrupo}</h2>

        {errorLocal && <ErrorBanner mensaje={errorLocal} />}

        {lista.length === 0 ? (
          <EmptyState icon={FileText} title="Sin archivos" description="Todavía no hay archivos acá." />
        ) : (
          <div className="divide-y rounded-lg border bg-card shadow-sm">
            {lista.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTamanio(a.tamanioBytes)} · {formatDate(a.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDescargar(a)} title="Descargar">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                    onClick={() => handleBorrar(a)}
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Vista de carpetas (root) ─────────────────────────────────────────────
  const grupos: Grupo[] = [
    ...carpetas.map((c): Grupo => ({ tipo: 'carpeta', id: c.id, nombre: c.nombre })),
    ...gruposModulo.map((m): Grupo => ({ tipo: 'modulo', modulo: m, nombre: MODULO_LABEL[m] })),
    { tipo: 'sin-carpeta' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground max-w-lg">
          Repositorio de documentos del negocio. Las carpetas con nombre de módulo se generan solas
          cuando ese módulo adjunta un comprobante -- por ahora, ningún módulo lo hace todavía.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleSubir(e.target.files)}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={subiendo}>
            {subiendo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Subir archivo
          </Button>
          <Button size="sm" onClick={() => setCarpetaDialogOpen(true)}>
            <FolderPlus className="h-4 w-4 mr-1" />
            Nueva carpeta
          </Button>
        </div>
      </div>

      {errorLocal && <ErrorBanner mensaje={errorLocal} />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {grupos.map((g, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setGrupoActivo(g)}
            className="flex flex-col items-center gap-2 rounded-lg border bg-card p-4 text-center shadow-sm transition-shadow hover:shadow-md"
          >
            <Folder className="h-8 w-8 text-blue-500" />
            <span className="text-sm font-medium truncate w-full">
              {g.tipo === 'carpeta' ? g.nombre : g.tipo === 'modulo' ? g.nombre : 'Sin carpeta'}
            </span>
            <span className="text-xs text-muted-foreground">{conteoDe(g)} archivo(s)</span>
          </button>
        ))}
      </div>

      <CarpetaDialog open={carpetaDialogOpen} onOpenChange={setCarpetaDialogOpen} onSave={crearCarpeta} />
    </div>
  )
}
