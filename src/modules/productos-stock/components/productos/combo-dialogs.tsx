'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, ImagePlus, X, Loader2, Star } from 'lucide-react'
import { formatARS } from '../../lib/format'
import {
  subirImagenProducto,
  eliminarImagenProducto,
  ACCEPT_IMAGENES,
} from '../../lib/imagenes'
import type { Combo, ComboComponenteFijo, ComboComponenteEleccion, Producto, Rubro } from '../../types'
import { MAX_IMAGENES_PRODUCTO, unidadAbrev } from '../../types'

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── ids client-side para componentes nuevos (mismo patrón que variantes) ────

let _cSeq = 0
function cUid(): string {
  return `combo-${Date.now()}-${++_cSeq}-${Math.random().toString(36).slice(2, 7)}`
}

// ─── ComboDialog ──────────────────────────────────────────────────────────────
//
// Fase 5 del refactor de Productos. Un combo agrupa componentes FIJOS
// (producto + cantidad exacta) y slots de ELECCIÓN (rubro + cantidad a
// elegir de ese rubro, ej. "elegí 1 bebida"). El combo no maneja stock
// propio (ver comentario en types/index.ts).
//
// Fase 5b (mejoras, a pedido del usuario):
//   - Galería de fotos: mismo patrón que ProductoDialog (subirImagenProducto/
//     eliminarImagenProducto, carpeta estable, limpieza al cancelar).
//   - Precio sugerido: se calcula sumando cantidad x precioVenta de cada
//     componente FIJO (los de elección no entran porque el producto puntual
//     se define recién al vender) y restando el % de descuento. El campo de
//     precio de venta queda SIEMPRE editable -- el sugerido es una
//     referencia que se autocompleta mientras el usuario no lo haya tocado
//     a mano, y siempre se puede volver a aplicar con "Usar sugerido".

type ComboFormData = Omit<Combo, 'id' | 'createdAt'>

interface ComboDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: ComboFormData) => void
  productos: Producto[]
  rubros: Rubro[]
  editData?: Combo
}

const emptyCombo: ComboFormData = {
  nombre: '',
  descripcion: '',
  precioVenta: 0,
  descuentoPorcentaje: 0,
  imagenes: [],
  disponible: true,
  componentesFijos: [],
  componentesEleccion: [],
}

export function ComboDialog({
  open,
  onOpenChange,
  onSave,
  productos,
  rubros,
  editData,
}: ComboDialogProps) {
  const [form, setForm] = useState<ComboFormData>(emptyCombo)
  const [subiendo, setSubiendo] = useState(false)
  const [errorImagen, setErrorImagen] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Carpeta estable para esta sesión de edición (id real si ya existe, o un
  // id temporal si el combo todavía se está creando) -- mismo patrón que
  // ProductoDialog.
  const carpetaIdRef = useRef<string>('')
  // Fotos subidas durante esta apertura del diálogo que todavía no son parte
  // del combo guardado -- si se cancela, se borran del bucket.
  const subidasEnEstaSesionRef = useRef<Set<string>>(new Set())

  // Una vez que el usuario edita el precio a mano, dejamos de pisarlo con el
  // sugerido automáticamente (sigue disponible el botón "Usar sugerido").
  const [precioManual, setPrecioManual] = useState(false)

  useEffect(() => {
    if (open) {
      carpetaIdRef.current =
        editData?.id ?? `nuevo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      subidasEnEstaSesionRef.current = new Set()
      setErrorImagen('')
      if (editData) {
        const { id, createdAt, ...rest } = editData
        setForm({
          ...rest,
          imagenes: rest.imagenes ?? [],
          descuentoPorcentaje: rest.descuentoPorcentaje ?? 0,
          componentesFijos: rest.componentesFijos.map((cf) => ({ ...cf })),
          componentesEleccion: rest.componentesEleccion.map((ce) => ({ ...ce })),
        })
        // Al editar respetamos el precio ya guardado -- no lo pisamos solo
        // por abrir el diálogo, aunque no coincida con el sugerido.
        setPrecioManual(true)
      } else {
        setForm(emptyCombo)
        setPrecioManual(false)
      }
    }
  }, [open, editData])

  function update<K extends keyof ComboFormData>(key: K, value: ComboFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── Precio sugerido ───────────────────────────────────────────────────────
  // Suma precioVenta base x cantidad de cada componente fijo (confirmado con
  // el usuario: no se usa ninguna lista de precios, solo el precio de venta
  // base del producto) y aplica el % de descuento.
  const precioSugerido = useMemo(() => {
    const base = form.componentesFijos.reduce((acc, cf) => {
      const producto = productos.find((p) => p.id === cf.productoId)
      if (!producto) return acc
      return acc + producto.precioVenta * (cf.cantidad || 0)
    }, 0)
    const descuento = Math.min(Math.max(form.descuentoPorcentaje || 0, 0), 100)
    return Math.max(base * (1 - descuento / 100), 0)
  }, [form.componentesFijos, form.descuentoPorcentaje, productos])

  // Mientras el usuario no haya tocado el precio a mano, lo mantenemos
  // sincronizado con el sugerido (ej: recién arrancando a cargar el combo).
  useEffect(() => {
    if (!precioManual) {
      setForm((f) => ({ ...f, precioVenta: precioSugerido }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precioSugerido, precioManual])

  function handlePrecioChange(value: number) {
    setPrecioManual(true)
    update('precioVenta', value)
  }

  function handleUsarSugerido() {
    setPrecioManual(false)
    update('precioVenta', precioSugerido)
  }

  // ── Galería de fotos (mismo patrón que ProductoDialog) ───────────────────
  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    setErrorImagen('')

    const disponibles = MAX_IMAGENES_PRODUCTO - form.imagenes.length
    if (disponibles <= 0) {
      setErrorImagen(`Máximo ${MAX_IMAGENES_PRODUCTO} fotos por combo.`)
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
    for (const url of subidasEnEstaSesionRef.current) {
      void eliminarImagenProducto(url)
    }
    subidasEnEstaSesionRef.current = new Set()
    onOpenChange(false)
  }

  // ── Componentes fijos ─────────────────────────────────────────────────────
  function handleAddFijo() {
    setForm((f) => ({
      ...f,
      componentesFijos: [
        ...f.componentesFijos,
        { id: cUid(), productoId: '', cantidad: 1 },
      ],
    }))
  }

  function handleUpdateFijo(id: string, updates: Partial<ComboComponenteFijo>) {
    setForm((f) => ({
      ...f,
      componentesFijos: f.componentesFijos.map((cf) =>
        cf.id === id ? { ...cf, ...updates } : cf,
      ),
    }))
  }

  function handleDeleteFijo(id: string) {
    setForm((f) => ({
      ...f,
      componentesFijos: f.componentesFijos.filter((cf) => cf.id !== id),
    }))
  }

  // ── Componentes a elección ────────────────────────────────────────────────
  function handleAddEleccion() {
    setForm((f) => ({
      ...f,
      componentesEleccion: [
        ...f.componentesEleccion,
        { id: cUid(), rubroId: '', cantidad: 1 },
      ],
    }))
  }

  function handleUpdateEleccion(id: string, updates: Partial<ComboComponenteEleccion>) {
    setForm((f) => ({
      ...f,
      componentesEleccion: f.componentesEleccion.map((ce) =>
        ce.id === id ? { ...ce, ...updates } : ce,
      ),
    }))
  }

  function handleDeleteEleccion(id: string) {
    setForm((f) => ({
      ...f,
      componentesEleccion: f.componentesEleccion.filter((ce) => ce.id !== id),
    }))
  }

  const componentesValidos =
    form.componentesFijos.every((cf) => cf.productoId && cf.cantidad > 0) &&
    form.componentesEleccion.every((ce) => ce.rubroId && ce.cantidad > 0)

  const tieneComponentes =
    form.componentesFijos.length > 0 || form.componentesEleccion.length > 0

  function handleSave() {
    if (!form.nombre.trim()) return
    if (!tieneComponentes || !componentesValidos) return
    subidasEnEstaSesionRef.current = new Set()
    onSave({
      ...form,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim(),
      descuentoPorcentaje: Math.min(Math.max(form.descuentoPorcentaje || 0, 0), 100),
    })
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleCancelar()
        else onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? 'Editar combo' : 'Nuevo combo'}</DialogTitle>
          <DialogDescription>
            Agrupa productos existentes en un ítem vendible a precio propio. El combo no
            maneja stock propio -- descuenta el de sus componentes al venderse (fase futura).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Galería de fotos */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">
              Fotos del combo ({form.imagenes.length}/{MAX_IMAGENES_PRODUCTO})
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
              La primera foto es la principal. JPG, PNG o WEBP, hasta 5 MB c/u.
            </p>
          </div>

          {/* Nombre */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) => update('nombre', e.target.value)}
              placeholder="Ej: Combo Menú"
              autoFocus
            />
          </div>

          {/* Descripcion */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Descripción</label>
            <textarea
              className={`${inputClass} min-h-[50px] resize-y`}
              value={form.descripcion}
              onChange={(e) => update('descripcion', e.target.value)}
              placeholder="Texto de promoción, ej: 'Combo ideal para compartir en familia'"
              rows={2}
            />
          </div>

          {/* Descuento */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">% Descuento sobre el precio sugerido</label>
            <input
              className={inputClass + ' max-w-[140px]'}
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.descuentoPorcentaje || ''}
              onChange={(e) => update('descuentoPorcentaje', parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </div>

          {/* Precio sugerido + Precio final */}
          <div className="grid gap-1.5 rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Precio sugerido (suma de componentes fijos - descuento)
              </span>
              <span className="font-medium">{formatARS(precioSugerido)}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 items-end">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Precio de venta *</label>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.precioVenta || ''}
                  onChange={(e) => handlePrecioChange(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="flex items-center gap-3 pb-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleUsarSugerido}
                  disabled={form.componentesFijos.length === 0}
                >
                  Usar sugerido
                </Button>
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
            <p className="text-xs text-muted-foreground">
              El precio final queda editable a mano en todo momento -- el sugerido es solo una
              referencia.
            </p>
          </div>

          {/* Componentes fijos */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Componentes fijos</h4>
              <Button type="button" variant="outline" size="sm" onClick={handleAddFijo}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar producto
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Productos que siempre forman parte del combo, con la cantidad exacta. Su precio de
              venta base es el que alimenta el precio sugerido de arriba.
            </p>

            {form.componentesFijos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md">
                Sin componentes fijos.
              </p>
            ) : (
              <div className="space-y-2">
                {form.componentesFijos.map((cf) => (
                  <div key={cf.id} className="flex items-end gap-2">
                    <div className="grid gap-1 flex-1">
                      <label className="text-xs text-muted-foreground">Producto</label>
                      <select
                        className={inputClass}
                        value={cf.productoId}
                        onChange={(e) => handleUpdateFijo(cf.id, { productoId: e.target.value })}
                      >
                        <option value="">Seleccionar...</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1 w-24">
                      <label className="text-xs text-muted-foreground">
                        Cantidad
                        {cf.productoId &&
                          (() => {
                            const p = productos.find((x) => x.id === cf.productoId)
                            return p ? ` (${unidadAbrev(p.unidadVenta)})` : ''
                          })()}
                      </label>
                      <input
                        className={inputClass}
                        type="number"
                        min={0.001}
                        step={0.001}
                        value={cf.cantidad || ''}
                        onChange={(e) =>
                          handleUpdateFijo(cf.id, { cantidad: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-red-500"
                      onClick={() => handleDeleteFijo(cf.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Componentes a elección */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">A elección del cliente</h4>
              <Button type="button" variant="outline" size="sm" onClick={handleAddEleccion}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar slot
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ej: "elegí 1 bebida" -- se define el rubro y cuántos ítems de ese rubro elige el
              cliente. La elección real sucede al vender el combo (fase futura). No entra en el
              cálculo del precio sugerido porque el producto puntual se define recién al vender.
            </p>

            {form.componentesEleccion.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md">
                Sin slots a elección.
              </p>
            ) : (
              <div className="space-y-2">
                {form.componentesEleccion.map((ce) => (
                  <div key={ce.id} className="flex items-end gap-2">
                    <div className="grid gap-1 flex-1">
                      <label className="text-xs text-muted-foreground">Rubro</label>
                      <select
                        className={inputClass}
                        value={ce.rubroId}
                        onChange={(e) => handleUpdateEleccion(ce.id, { rubroId: e.target.value })}
                      >
                        <option value="">Seleccionar...</option>
                        {rubros.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1 w-32">
                      <label className="text-xs text-muted-foreground">Cant. a elegir</label>
                      <input
                        className={inputClass}
                        type="number"
                        min={1}
                        step={1}
                        value={ce.cantidad || ''}
                        onChange={(e) =>
                          handleUpdateEleccion(ce.id, {
                            cantidad: parseInt(e.target.value, 10) || 0,
                          })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-red-500"
                      onClick={() => handleDeleteEleccion(ce.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!tieneComponentes && (
            <p className="text-xs text-red-500">
              Agregá al menos un componente fijo o un slot a elección.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancelar}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              !form.nombre.trim() ||
              form.precioVenta <= 0 ||
              !tieneComponentes ||
              !componentesValidos
            }
          >
            {editData ? 'Guardar cambios' : 'Crear combo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
