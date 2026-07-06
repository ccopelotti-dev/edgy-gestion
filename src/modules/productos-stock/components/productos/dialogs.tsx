'use client'

import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, ImagePlus, X, Loader2, Star, Wand2 } from 'lucide-react'
import { formatARS } from '../../lib/format'
import {
  subirImagenProducto,
  eliminarImagenProducto,
  ACCEPT_IMAGENES,
} from '../../lib/imagenes'
import { generarCodigoInterno } from '../../lib/etiqueta'
import type {
  Producto,
  Insumo,
  Rubro,
  SubRubro,
  Recepcion,
  LineaRecepcion,
  AlicuotaIVA,
  UnidadMedida,
  MotivoAjuste,
} from '../../types'
import { ALICUOTAS_IVA, UNIDADES, MOTIVOS_AJUSTE, MAX_IMAGENES_PRODUCTO } from '../../types'

// ─── Shared input class ───────────────────────────────────────────────────────

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── ProductoDialog ───────────────────────────────────────────────────────────

type ProductoFormData = Omit<Producto, 'id' | 'stock' | 'createdAt' | 'tieneFormula'>

interface ProductoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: ProductoFormData) => void
  rubros: Rubro[]
  subRubros: SubRubro[]
  /** Productos existentes, para validar que el código de barras no se repita. */
  productos: Producto[]
  editData?: Producto
}

const emptyProducto: ProductoFormData = {
  nombre: '',
  codigo: '',
  rubroId: '',
  subRubroId: undefined,
  descripcion: '',
  precioVenta: 0,
  costo: 0,
  iva: 21,
  unidadVenta: 'unidad',
  stockMinimo: 0,
  controlaStock: true,
  disponible: true,
  estado: 'activo',
  imagenes: [],
  codigoBarras: undefined,
}

export function ProductoDialog({
  open,
  onOpenChange,
  onSave,
  rubros,
  subRubros,
  productos,
  editData,
}: ProductoDialogProps) {
  const [form, setForm] = useState<ProductoFormData>(emptyProducto)
  const [subiendo, setSubiendo] = useState(false)
  const [errorImagen, setErrorImagen] = useState('')
  const [errorCodigoBarras, setErrorCodigoBarras] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Carpeta estable para esta sesión de edición (id real si ya existe, o un
  // id temporal si el producto todavía se está creando).
  const carpetaIdRef = useRef<string>('')
  // Fotos subidas durante esta apertura del diálogo que todavía no son parte
  // del producto guardado — si se cancela, se borran del bucket.
  const subidasEnEstaSesionRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (open) {
      carpetaIdRef.current =
        editData?.id ?? `nuevo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      subidasEnEstaSesionRef.current = new Set()
      setErrorImagen('')
      if (editData) {
        const { id, stock, createdAt, tieneFormula, ...rest } = editData
        setForm({ ...rest, imagenes: rest.imagenes ?? [] })
      } else {
        setForm(emptyProducto)
      }
    }
  }, [open, editData])

  function update<K extends keyof ProductoFormData>(key: K, value: ProductoFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    setErrorImagen('')

    const disponibles = MAX_IMAGENES_PRODUCTO - form.imagenes.length
    if (disponibles <= 0) {
      setErrorImagen(`Máximo ${MAX_IMAGENES_PRODUCTO} fotos por producto.`)
      return
    }

    const aProcesar = Array.from(files).slice(0, disponibles)
    setSubiendo(true)
    try {
      for (const file of aProcesar) {
        try {
          const { url } = await subirImagenProducto(file, carpetaIdRef.current)
          subidasEnEstaSesionRef.current.add(url)
          setForm((prev) => ({ ...prev, imagenes: [...prev.imagenes, url] }))
        } catch (err) {
          setErrorImagen(err instanceof Error ? err.message : 'No se pudo subir una foto.')
        }
      }
    } finally {
      setSubiendo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleRemoveImagen(url: string) {
    update(
      'imagenes',
      form.imagenes.filter((u) => u !== url),
    )
    if (subidasEnEstaSesionRef.current.has(url)) {
      subidasEnEstaSesionRef.current.delete(url)
      void eliminarImagenProducto(url)
    }
  }

  function handleHacerPrincipal(url: string) {
    const resto = form.imagenes.filter((u) => u !== url)
    update('imagenes', [url, ...resto])
  }

  function handleCancelar() {
    // Limpiar fotos subidas en esta sesión que no se van a guardar.
    for (const url of subidasEnEstaSesionRef.current) {
      void eliminarImagenProducto(url)
    }
    subidasEnEstaSesionRef.current = new Set()
    onOpenChange(false)
  }

  function handleSave() {
    if (!form.nombre.trim()) return

    const codigoBarrasLimpio = form.codigoBarras?.trim() || undefined
    if (codigoBarrasLimpio) {
      const yaUsado = productos.some(
        (p) => p.id !== editData?.id && p.codigoBarras === codigoBarrasLimpio,
      )
      if (yaUsado) {
        setErrorCodigoBarras('Ese código de barras ya lo tiene otro producto.')
        return
      }
    }

    setErrorCodigoBarras('')
    subidasEnEstaSesionRef.current = new Set()
    onSave({
      ...form,
      codigo: form.codigo.trim() || `PROD-${Date.now().toString(36).toUpperCase()}`,
      codigoBarras: codigoBarrasLimpio,
      subRubroId: form.subRubroId || undefined,
    })
    onOpenChange(false)
  }

  const rubrosFiltrados = rubros.filter((r) => r.tipo === 'producto' || r.tipo === 'ambos')
  const subRubrosFiltrados = subRubros.filter((sr) => sr.rubroId === form.rubroId)

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleCancelar()
        else onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          <DialogDescription>
            {editData
              ? 'Modifica los datos del producto.'
              : 'Completa los datos para crear un nuevo producto.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Galería de fotos */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">
              Fotos del producto ({form.imagenes.length}/{MAX_IMAGENES_PRODUCTO})
            </label>
            <div className="flex flex-wrap gap-2">
              {form.imagenes.map((url, idx) => (
                <div
                  key={url}
                  className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted"
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  {idx === 0 && (
                    <span className="absolute left-1 top-1 rounded-full bg-black/60 p-0.5">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    </span>
                  )}
                  <div className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/50 group-hover:flex">
                    {idx !== 0 && (
                      <button
                        type="button"
                        title="Hacer principal"
                        onClick={() => handleHacerPrincipal(url)}
                        className="rounded-full bg-white/90 p-1 hover:bg-white"
                      >
                        <Star className="h-3.5 w-3.5 text-yellow-500" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Quitar foto"
                      onClick={() => handleRemoveImagen(url)}
                      className="rounded-full bg-white/90 p-1 hover:bg-white"
                    >
                      <X className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              ))}

              {form.imagenes.length < MAX_IMAGENES_PRODUCTO && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={subiendo}
                  className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
                >
                  {subiendo ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-[10px]">Agregar</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_IMAGENES}
              multiple
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            {errorImagen && <p className="text-xs text-red-500">{errorImagen}</p>}
            <p className="text-xs text-muted-foreground">
              La primera foto es la principal (se usa en el Catálogo). JPG, PNG o WEBP, hasta 5 MB c/u.
            </p>
          </div>

          {/* Nombre */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) => update('nombre', e.target.value)}
              placeholder="Nombre del producto"
            />
          </div>

          {/* Codigo */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Codigo</label>
            <input
              className={inputClass}
              value={form.codigo}
              onChange={(e) => update('codigo', e.target.value)}
              placeholder="Auto-generado si se deja vacio"
            />
          </div>

          {/* Codigo de barras */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Código de barras / QR</label>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={form.codigoBarras ?? ''}
                onChange={(e) => {
                  update('codigoBarras', e.target.value)
                  setErrorCodigoBarras('')
                }}
                placeholder="Escaneá con el lector, o generá uno interno"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  update('codigoBarras', generarCodigoInterno())
                  setErrorCodigoBarras('')
                }}
              >
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                Generar
              </Button>
            </div>
            {errorCodigoBarras && <p className="text-xs text-red-500">{errorCodigoBarras}</p>}
            <p className="text-muted-foreground text-xs">
              Si el producto ya viene con código de fábrica, escaneálo acá con el lector. Si es un
              producto propio sin código, usá "Generar" y después imprimí la etiqueta desde la
              tabla de Productos.
            </p>
          </div>

          {/* Rubro y Sub-rubro */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Rubro</label>
              <select
                className={inputClass}
                value={form.rubroId}
                onChange={(e) => {
                  update('rubroId', e.target.value)
                  update('subRubroId', undefined)
                }}
              >
                <option value="">Sin rubro</option>
                {rubrosFiltrados.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Sub-rubro</label>
              <select
                className={inputClass}
                value={form.subRubroId ?? ''}
                onChange={(e) => update('subRubroId', e.target.value || undefined)}
                disabled={!form.rubroId || subRubrosFiltrados.length === 0}
              >
                <option value="">Sin sub-rubro</option>
                {subRubrosFiltrados.map((sr) => (
                  <option key={sr.id} value={sr.id}>
                    {sr.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Descripcion */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Descripcion</label>
            <textarea
              className={`${inputClass} min-h-[60px] resize-y`}
              value={form.descripcion}
              onChange={(e) => update('descripcion', e.target.value)}
              placeholder="Descripcion opcional"
              rows={2}
            />
          </div>

          {/* Precio y Costo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Precio venta</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step={0.01}
                value={form.precioVenta || ''}
                onChange={(e) => update('precioVenta', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Costo</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step={0.01}
                value={form.costo || ''}
                onChange={(e) => update('costo', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* IVA y Unidad */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">IVA</label>
              <select
                className={inputClass}
                value={form.iva}
                onChange={(e) => update('iva', parseFloat(e.target.value) as AlicuotaIVA)}
              >
                {ALICUOTAS_IVA.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Unidad de venta</label>
              <select
                className={inputClass}
                value={form.unidadVenta}
                onChange={(e) => update('unidadVenta', e.target.value as UnidadMedida)}
              >
                {UNIDADES.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Stock minimo */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Stock minimo</label>
            <input
              className={inputClass}
              type="number"
              min={0}
              value={form.stockMinimo || ''}
              onChange={(e) => update('stockMinimo', parseFloat(e.target.value) || 0)}
            />
          </div>

          {/* Checkboxes */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.controlaStock}
                onChange={(e) => update('controlaStock', e.target.checked)}
                className="rounded border-input"
              />
              Controla stock
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.disponible}
                onChange={(e) => update('disponible', e.target.checked)}
                className="rounded border-input"
              />
              Disponible
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancelar}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!form.nombre.trim() || subiendo}>
            {editData ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── InsumoDialog ─────────────────────────────────────────────────────────────

type InsumoFormData = Omit<Insumo, 'id' | 'stock' | 'createdAt' | 'productoVinculadoId'>

interface InsumoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: InsumoFormData) => void
  rubros: Rubro[]
  subRubros: SubRubro[]
  editData?: Insumo
}

const emptyInsumo: InsumoFormData = {
  nombre: '',
  rubroId: '',
  subRubroId: undefined,
  unidad: 'unidad',
  stockMinimo: 0,
  costo: 0,
  esComercializable: false,
}

export function InsumoDialog({
  open,
  onOpenChange,
  onSave,
  rubros,
  subRubros,
  editData,
}: InsumoDialogProps) {
  const [form, setForm] = useState<InsumoFormData>(emptyInsumo)

  useEffect(() => {
    if (open) {
      if (editData) {
        const { id, stock, createdAt, productoVinculadoId, ...rest } = editData
        setForm(rest)
      } else {
        setForm(emptyInsumo)
      }
    }
  }, [open, editData])

  function update<K extends keyof InsumoFormData>(key: K, value: InsumoFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    if (!form.nombre.trim()) return
    onSave({ ...form, subRubroId: form.subRubroId || undefined })
    onOpenChange(false)
  }

  const rubrosFiltrados = rubros.filter((r) => r.tipo === 'insumo' || r.tipo === 'ambos')
  const subRubrosFiltrados = subRubros.filter((sr) => sr.rubroId === form.rubroId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar insumo' : 'Nuevo insumo'}</DialogTitle>
          <DialogDescription>
            {editData
              ? 'Modifica los datos del insumo.'
              : 'Completa los datos para crear un nuevo insumo.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Nombre */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) => update('nombre', e.target.value)}
              placeholder="Nombre del insumo"
            />
          </div>

          {/* Rubro y Sub-rubro */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Rubro</label>
              <select
                className={inputClass}
                value={form.rubroId}
                onChange={(e) => {
                  update('rubroId', e.target.value)
                  update('subRubroId', undefined)
                }}
              >
                <option value="">Sin rubro</option>
                {rubrosFiltrados.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Sub-rubro</label>
              <select
                className={inputClass}
                value={form.subRubroId ?? ''}
                onChange={(e) => update('subRubroId', e.target.value || undefined)}
                disabled={!form.rubroId || subRubrosFiltrados.length === 0}
              >
                <option value="">Sin sub-rubro</option>
                {subRubrosFiltrados.map((sr) => (
                  <option key={sr.id} value={sr.id}>
                    {sr.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Unidad */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Unidad</label>
            <select
              className={inputClass}
              value={form.unidad}
              onChange={(e) => update('unidad', e.target.value as UnidadMedida)}
            >
              {UNIDADES.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          {/* Stock minimo y Costo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Stock minimo</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={form.stockMinimo || ''}
                onChange={(e) => update('stockMinimo', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Costo</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step={0.01}
                value={form.costo || ''}
                onChange={(e) => update('costo', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Comercializable */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.esComercializable}
              onChange={(e) => update('esComercializable', e.target.checked)}
              className="rounded border-input"
            />
            Es comercializable (puede venderse como producto)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!form.nombre.trim()}>
            {editData ? 'Guardar cambios' : 'Crear insumo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── RecepcionDialog ──────────────────────────────────────────────────────────

type RecepcionFormData = Omit<Recepcion, 'id' | 'estado' | 'createdAt'>

interface RecepcionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: RecepcionFormData) => void
  productos: Producto[]
  insumos: Insumo[]
}

interface LineaForm {
  key: string
  itemTipo: 'producto' | 'insumo'
  itemId: string
  cantidad: number
  costoUnitario: number
}

export function RecepcionDialog({
  open,
  onOpenChange,
  onSave,
  productos,
  insumos,
}: RecepcionDialogProps) {
  const [proveedor, setProveedor] = useState('')
  const [numeroRemito, setNumeroRemito] = useState('')
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([])
  const [codigoEscaneado, setCodigoEscaneado] = useState('')
  const [errorEscaneo, setErrorEscaneo] = useState('')

  useEffect(() => {
    if (open) {
      setProveedor('')
      setNumeroRemito('')
      setNotas('')
      setLineas([])
      setCodigoEscaneado('')
      setErrorEscaneo('')
    }
  }, [open])

  // Pensado para un lector de codigo de barras USB/Bluetooth: el lector
  // "tipea" el codigo y aprieta Enter solo, como si fuera un teclado -- no
  // hace falta ninguna integracion especial, solo escuchar el Enter de este
  // input. Si el producto ya tiene una linea cargada, suma 1 a la cantidad
  // en vez de duplicar la linea.
  function handleEscanear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const codigo = codigoEscaneado.trim()
    if (!codigo) return

    const producto = productos.find((p) => p.codigoBarras === codigo)
    if (!producto) {
      setErrorEscaneo(`No se encontró ningún producto con el código "${codigo}".`)
      return
    }

    setErrorEscaneo('')
    setLineas((prev) => {
      const idx = prev.findIndex((l) => l.itemTipo === 'producto' && l.itemId === producto.id)
      if (idx >= 0) {
        return prev.map((l, i) => (i === idx ? { ...l, cantidad: l.cantidad + 1 } : l))
      }
      return [
        ...prev,
        {
          key: `${Date.now()}-${Math.random()}`,
          itemTipo: 'producto',
          itemId: producto.id,
          cantidad: 1,
          costoUnitario: producto.costo,
        },
      ]
    })
    setCodigoEscaneado('')
  }

  function addLinea() {
    setLineas((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random()}`,
        itemTipo: 'producto',
        itemId: '',
        cantidad: 0,
        costoUnitario: 0,
      },
    ])
  }

  function updateLinea(index: number, updates: Partial<LineaForm>) {
    setLineas((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...updates } : l)),
    )
  }

  function removeLinea(index: number) {
    setLineas((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    const validLineas = lineas.filter((l) => l.itemId && l.cantidad > 0)
    if (validLineas.length === 0) return

    onSave({
      fecha: new Date().toISOString().slice(0, 10),
      proveedor,
      numeroRemito,
      notas,
      lineas: validLineas.map((l) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        itemTipo: l.itemTipo,
        itemId: l.itemId,
        cantidad: l.cantidad,
        costoUnitario: l.costoUnitario,
      })),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva recepcion de mercaderia</DialogTitle>
          <DialogDescription>
            Registra el ingreso de productos e insumos de un proveedor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Proveedor y Remito */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Proveedor</label>
              <input
                className={inputClass}
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">N. remito</label>
              <input
                className={inputClass}
                value={numeroRemito}
                onChange={(e) => setNumeroRemito(e.target.value)}
                placeholder="Numero de remito"
              />
            </div>
          </div>

          {/* Notas */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Notas</label>
            <textarea
              className={`${inputClass} min-h-[48px] resize-y`}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones"
              rows={2}
            />
          </div>

          {/* Escaneo rapido */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Buscar por código de barras</label>
            <input
              className={inputClass}
              value={codigoEscaneado}
              onChange={(e) => {
                setCodigoEscaneado(e.target.value)
                setErrorEscaneo('')
              }}
              onKeyDown={handleEscanear}
              placeholder="Escaneá con el lector o tipeá el código y apretá Enter"
              autoFocus
            />
            {errorEscaneo && <p className="text-xs text-red-500">{errorEscaneo}</p>}
          </div>

          {/* Lineas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Lineas de recepcion</label>
              <Button variant="outline" size="sm" onClick={addLinea}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar linea manual
              </Button>
            </div>

            {lineas.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                No hay lineas. Agrega al menos una.
              </p>
            )}

            {lineas.map((linea, idx) => {
              const itemsDisponibles =
                linea.itemTipo === 'producto' ? productos : insumos
              return (
                <div
                  key={linea.key}
                  className="grid grid-cols-[120px_1fr_100px_100px_36px] gap-2 items-end"
                >
                  {/* Tipo */}
                  <div className="grid gap-1">
                    <label className="text-xs text-muted-foreground">Tipo</label>
                    <select
                      className={inputClass}
                      value={linea.itemTipo}
                      onChange={(e) =>
                        updateLinea(idx, {
                          itemTipo: e.target.value as 'producto' | 'insumo',
                          itemId: '',
                        })
                      }
                    >
                      <option value="producto">Producto</option>
                      <option value="insumo">Insumo</option>
                    </select>
                  </div>

                  {/* Item */}
                  <div className="grid gap-1">
                    <label className="text-xs text-muted-foreground">Item</label>
                    <select
                      className={inputClass}
                      value={linea.itemId}
                      onChange={(e) => updateLinea(idx, { itemId: e.target.value })}
                    >
                      <option value="">Seleccionar...</option>
                      {itemsDisponibles.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Cantidad */}
                  <div className="grid gap-1">
                    <label className="text-xs text-muted-foreground">Cantidad</label>
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      step={0.01}
                      value={linea.cantidad || ''}
                      onChange={(e) =>
                        updateLinea(idx, { cantidad: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>

                  {/* Costo unitario */}
                  <div className="grid gap-1">
                    <label className="text-xs text-muted-foreground">Costo unit.</label>
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      step={0.01}
                      value={linea.costoUnitario || ''}
                      onChange={(e) =>
                        updateLinea(idx, {
                          costoUnitario: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-red-500"
                    onClick={() => removeLinea(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={lineas.filter((l) => l.itemId && l.cantidad > 0).length === 0}
          >
            Crear recepcion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── AjusteStockDialog ────────────────────────────────────────────────────────

interface AjusteStockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: {
    cantidad: number
    motivo: MotivoAjuste
    nota: string
  }) => void
  item: { id: string; nombre: string; stock: number; tipo: 'producto' | 'insumo' }
}

export function AjusteStockDialog({
  open,
  onOpenChange,
  onSave,
  item,
}: AjusteStockDialogProps) {
  const [cantidad, setCantidad] = useState(0)
  const [motivo, setMotivo] = useState<MotivoAjuste>('conteo_fisico')
  const [nota, setNota] = useState('')

  useEffect(() => {
    if (open) {
      setCantidad(0)
      setMotivo('conteo_fisico')
      setNota('')
    }
  }, [open])

  const nuevoStock = item.stock + cantidad

  function handleSave() {
    if (cantidad === 0) return
    onSave({ cantidad, motivo, nota })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar stock</DialogTitle>
          <DialogDescription>
            Ajuste manual de stock para: {item.nombre}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Stock actual */}
          <div className="rounded-md bg-muted px-4 py-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Stock actual</span>
              <span className="font-medium">{item.stock}</span>
            </div>
          </div>

          {/* Cantidad */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">
              Cantidad (positivo = ingreso, negativo = egreso)
            </label>
            <input
              className={inputClass}
              type="number"
              step={0.01}
              value={cantidad || ''}
              onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
              placeholder="Ej: 10 o -5"
            />
          </div>

          {/* Proyeccion */}
          <div className="rounded-md bg-muted px-4 py-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Stock proyectado</span>
              <span
                className={`font-medium ${
                  nuevoStock < 0 ? 'text-red-500' : 'text-foreground'
                }`}
              >
                {nuevoStock}
              </span>
            </div>
          </div>

          {/* Motivo */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Motivo</label>
            <select
              className={inputClass}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as MotivoAjuste)}
            >
              {MOTIVOS_AJUSTE.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Nota */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nota</label>
            <input
              className={inputClass}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Detalle adicional (opcional)"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={cantidad === 0}>
            Aplicar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
