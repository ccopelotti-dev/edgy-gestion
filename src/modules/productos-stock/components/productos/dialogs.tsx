'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import { formatARS } from '../../lib/format'
import type {
  Producto,
  Insumo,
  Categoria,
  Recepcion,
  LineaRecepcion,
  AlicuotaIVA,
  UnidadMedida,
  MotivoAjuste,
} from '../../types'
import { ALICUOTAS_IVA, UNIDADES, MOTIVOS_AJUSTE } from '../../types'

// ─── Shared input class ───────────────────────────────────────────────────────

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── ProductoDialog ───────────────────────────────────────────────────────────

type ProductoFormData = Omit<Producto, 'id' | 'stock' | 'createdAt' | 'tieneFormula'>

interface ProductoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: ProductoFormData) => void
  categorias: Categoria[]
  editData?: Producto
}

const emptyProducto: ProductoFormData = {
  nombre: '',
  codigo: '',
  categoriaId: '',
  descripcion: '',
  precioVenta: 0,
  costo: 0,
  iva: 21,
  unidadVenta: 'unidad',
  stockMinimo: 0,
  controlaStock: true,
  disponible: true,
  estado: 'activo',
}

export function ProductoDialog({
  open,
  onOpenChange,
  onSave,
  categorias,
  editData,
}: ProductoDialogProps) {
  const [form, setForm] = useState<ProductoFormData>(emptyProducto)

  useEffect(() => {
    if (open) {
      if (editData) {
        const { id, stock, createdAt, tieneFormula, ...rest } = editData
        setForm(rest)
      } else {
        setForm(emptyProducto)
      }
    }
  }, [open, editData])

  function update<K extends keyof ProductoFormData>(key: K, value: ProductoFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    if (!form.nombre.trim()) return
    onSave({
      ...form,
      codigo: form.codigo.trim() || `PROD-${Date.now().toString(36).toUpperCase()}`,
    })
    onOpenChange(false)
  }

  const catsFiltradas = categorias.filter(
    (c) => c.tipo === 'producto' || c.tipo === 'ambos',
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

          {/* Categoria */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Categoria</label>
            <select
              className={inputClass}
              value={form.categoriaId}
              onChange={(e) => update('categoriaId', e.target.value)}
            >
              <option value="">Sin categoria</option>
              {catsFiltradas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!form.nombre.trim()}>
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
  categorias: Categoria[]
  editData?: Insumo
}

const emptyInsumo: InsumoFormData = {
  nombre: '',
  categoriaId: '',
  unidad: 'unidad',
  stockMinimo: 0,
  costo: 0,
  esComercializable: false,
}

export function InsumoDialog({
  open,
  onOpenChange,
  onSave,
  categorias,
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
    onSave(form)
    onOpenChange(false)
  }

  const catsFiltradas = categorias.filter(
    (c) => c.tipo === 'insumo' || c.tipo === 'ambos',
  )

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

          {/* Categoria */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Categoria</label>
            <select
              className={inputClass}
              value={form.categoriaId}
              onChange={(e) => update('categoriaId', e.target.value)}
            >
              <option value="">Sin categoria</option>
              {catsFiltradas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
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

  useEffect(() => {
    if (open) {
      setProveedor('')
      setNumeroRemito('')
      setNotas('')
      setLineas([])
    }
  }, [open])

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

          {/* Lineas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Lineas de recepcion</label>
              <Button variant="outline" size="sm" onClick={addLinea}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar linea
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
