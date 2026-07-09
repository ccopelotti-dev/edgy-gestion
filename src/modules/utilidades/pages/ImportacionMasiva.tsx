'use client'

import { useMemo, useRef, useState } from 'react'
import { Download, Upload, Loader2, CheckCircle2, XCircle, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useImportaciones } from '../data/useImportaciones'
import { ErrorBanner, EstadoImportacionBadge, EmptyState } from '../components/utilidades/display'
import {
  parsearCSV,
  generarPlantillaCSV,
  generarEjemploCSV,
  validarProductos,
  validarRubrosProducto,
  validarServicios,
  validarRubrosServicio,
  type FilaConPayload,
} from '../lib/importCsv'
import { formatDate } from '../lib/format'
import { ENTIDADES_IMPORTABLES, type EntidadImportable } from '../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

function descargarTexto(nombreArchivo: string, contenido: string) {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}

export default function ImportacionMasiva() {
  const {
    historial,
    rubrosProducto,
    subRubrosProducto,
    marcasProducto,
    rubrosServicio,
    subRubrosServicio,
    cargando,
    error,
    ejecutarImportacion,
  } = useImportaciones()

  const [entidad, setEntidad] = useState<EntidadImportable>('productos')
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  const [filas, setFilas] = useState<FilaConPayload[] | null>(null)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<{ validas: number; error: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validas = useMemo(() => filas?.filter((f) => f.valida).length ?? 0, [filas])
  const invalidas = useMemo(() => filas?.filter((f) => !f.valida).length ?? 0, [filas])

  function handleCambiarEntidad(nueva: EntidadImportable) {
    setEntidad(nueva)
    setFilas(null)
    setNombreArchivo(null)
    setResultado(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleArchivo(file: File | undefined) {
    if (!file) return
    setResultado(null)
    setNombreArchivo(file.name)
    const texto = await file.text()
    const csv = parsearCSV(texto)

    let validadas: FilaConPayload[]
    switch (entidad) {
      case 'productos':
        validadas = validarProductos(csv, rubrosProducto, subRubrosProducto, marcasProducto)
        break
      case 'rubros_producto':
        validadas = validarRubrosProducto(csv)
        break
      case 'servicios':
        validadas = validarServicios(csv, rubrosServicio, subRubrosServicio)
        break
      case 'rubros_servicio':
        validadas = validarRubrosServicio(csv)
        break
    }
    setFilas(validadas)
  }

  async function handleImportar() {
    if (!filas || !nombreArchivo) return
    setImportando(true)
    const payloads = filas.filter((f) => f.valida).map((f) => f.payload!) as Record<string, unknown>[]
    const ok = await ejecutarImportacion(entidad, nombreArchivo, payloads, filas.length, invalidas)
    setImportando(false)
    if (ok) {
      setResultado({ validas: payloads.length, error: invalidas })
      setFilas(null)
      setNombreArchivo(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const columnasPreview = filas && filas.length > 0 ? Object.keys(filas[0].datos) : []

  return (
    <div className="space-y-6">
      {error && <ErrorBanner mensaje={error} />}

      {/* Instrucciones */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
        <p className="font-semibold">¿Cómo funciona la importación masiva?</p>
        <p>1. Descargá el modelo (o el ejemplo, para ver cómo se completa).</p>
        <p>2. Completá el archivo con tus datos, respetando los nombres de columna.</p>
        <p>
          3. Guardalo como .csv (delimitado por punto y coma o por coma -- ambos funcionan) y
          seleccionalo abajo.
        </p>
        <p>
          <strong>Importante:</strong> los rubros (y sub-rubros) referenciados tienen que existir
          antes de importar -- creálos primero en la pestaña Rubros del módulo correspondiente. Lo
          mismo para Marca (columna opcional en Productos): si la completás, tiene que existir --
          creála primero desde "Nuevo producto".
        </p>
        <p className="text-muted-foreground">
          Esta primera entrega cubre las entidades que ya tienen tabla real en Supabase (Productos,
          Rubros de Productos y Stock, Servicios, Rubros de Servicios). El resto de los tipos de dato
          de Contabilium (Clientes, Facturas, Plan de cuentas, Asientos, Movimientos bancarios) se
          suman cuando tengan su propio módulo.
        </p>
      </div>

      {/* Selector + acciones */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">Tipo de información a importar *</label>
          <select
            className={inputClass}
            value={entidad}
            onChange={(e) => handleCambiarEntidad(e.target.value as EntidadImportable)}
          >
            {ENTIDADES_IMPORTABLES.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">Archivo CSV *</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className={cn(inputClass, 'pt-1.5')}
            onChange={(e) => handleArchivo(e.target.files?.[0])}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => descargarTexto(`modelo-${entidad}.csv`, generarPlantillaCSV(entidad))}
        >
          <Download className="h-4 w-4 mr-1" />
          Descargar modelo
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => descargarTexto(`ejemplo-${entidad}.csv`, generarEjemploCSV(entidad))}
        >
          <Download className="h-4 w-4 mr-1" />
          Descargar ejemplo
        </Button>
      </div>

      {resultado && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400">
          Importación completada: {resultado.validas} fila(s) cargadas
          {resultado.error > 0 ? `, ${resultado.error} con error (no se cargaron)` : ''}.
        </div>
      )}

      {/* Preview */}
      {filas && filas.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" /> {validas} válida(s)
            </span>
            <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
              <XCircle className="h-4 w-4" /> {invalidas} con error
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Fila</th>
                  {columnasPreview.map((c) => (
                    <th key={c} className="px-3 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr
                    key={f.numeroFila}
                    className={cn('border-b last:border-0', !f.valida && 'bg-red-50 dark:bg-red-900/10')}
                  >
                    <td className="px-3 py-2 tabular-nums">{f.numeroFila}</td>
                    {columnasPreview.map((c) => (
                      <td key={c} className="px-3 py-2">
                        {f.datos[c]}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {f.valida ? (
                        <span className="text-green-700 dark:text-green-400">Válida</span>
                      ) : (
                        <span className="text-red-700 dark:text-red-400">{f.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button onClick={handleImportar} disabled={validas === 0 || importando}>
            {importando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Importar {validas} fila(s) válida(s)
          </Button>
        </div>
      )}

      {/* Historial */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4" /> Historial de importaciones
        </h3>
        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : historial.length === 0 ? (
          <EmptyState
            icon={History}
            title="Sin importaciones todavía"
            description="Las importaciones que hagas van a quedar registradas acá."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Entidad</th>
                  <th className="px-4 py-2 font-medium">Archivo</th>
                  <th className="px-4 py-2 font-medium text-right">Filas</th>
                  <th className="px-4 py-2 font-medium text-right">Válidas</th>
                  <th className="px-4 py-2 font-medium text-right">Con error</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="px-4 py-2 tabular-nums">{formatDate(h.createdAt)}</td>
                    <td className="px-4 py-2">
                      {ENTIDADES_IMPORTABLES.find((e) => e.value === h.entidad)?.label ?? h.entidad}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{h.nombreArchivo}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{h.totalFilas}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{h.filasValidas}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{h.filasConError}</td>
                    <td className="px-4 py-2">
                      <EstadoImportacionBadge estado={h.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
