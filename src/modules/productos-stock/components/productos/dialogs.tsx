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
import {
  Plus,
  Trash2,
  ImagePlus,
  X,
  Loader2,
  Star,
  Wand2,
  Lock,
  FileText,
  Video,
  Link2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Type,
} from 'lucide-react'
import { formatARS } from '../../lib/format'
import { todayISO } from '../../lib/format'
import {
  subirImagenProducto,
  eliminarImagenProducto,
  ACCEPT_IMAGENES,
} from '../../lib/imagenes'
import { generarCodigoInterno } from '../../lib/etiqueta'
import { useClienteId } from '../../data/useClienteId'
import { subirArchivo, obtenerUrlDescarga, eliminarArchivo } from '@/modules/utilidades/lib/archivos'
import { supabase } from '@/lib/supabase'
import { sanitizarDecimal, sanitizarDecimalConSigno, parsearDecimal, decimalATexto } from '@/lib/decimal'
import type {
  Producto,
  ProductoVariante,
  TipoProducto,
  Insumo,
  InsumoDocumento,
  TipoDocumentoInsumo,
  Rubro,
  SubRubro,
  Marca,
  PlantillaGarantia,
  Recepcion,
  LineaRecepcion,
  AlicuotaIVA,
  UnidadMedida,
  MotivoAjuste,
  Formula,
} from '../../types'
import {
  ALICUOTAS_IVA,
  UNIDADES,
  MOTIVOS_AJUSTE,
  MAX_IMAGENES_PRODUCTO,
  DIA_SEMANA_LABEL,
  DIAS_SEMANA_ORDEN,
  unidadLabel,
  unidadAbrev,
  presentacionDefault,
} from '../../types'

// ─── Shared input class ───────────────────────────────────────────────────────

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// ─── ids client-side para variantes nuevas (mismo patrón que Servicios) ───────

let _vSeq = 0
function vUid(): string {
  return `var-${Date.now()}-${++_vSeq}-${Math.random().toString(36).slice(2, 7)}`
}

// ─── ProductoDialog ───────────────────────────────────────────────────────────

type ProductoFormData = Omit<Producto, 'id' | 'stock' | 'createdAt' | 'tieneFormula'>

interface ProductoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Guardado confirmado (17/08): espera la escritura real en Supabase antes
   * de cerrar el diálogo. Devuelve un mensaje de error si falló, o
   * `undefined`/nada si se guardó bien (mismo contrato que TransferenciaDialog). */
  onSave: (data: ProductoFormData) => Promise<string | void>
  rubros: Rubro[]
  subRubros: SubRubro[]
  /** Productos existentes, para validar que el código de barras no se repita. */
  productos: Producto[]
  /** Insumos existentes -- para avisar si ya hay uno suelto con el mismo
   * nombre al tildar "también es insumo" (ver Fase 34+ fix). */
  insumos: Insumo[]
  /** Catálogo de marcas del cliente (ver Fase 1 del refactor de Productos). */
  marcas: Marca[]
  /** Crea una marca nueva en el catálogo compartido -- guardado confirmado:
   * espera la escritura real en Supabase y devuelve la marca creada (o un
   * error) directo, sin depender de que el array `marcas` se actualice
   * solo para poder auto-seleccionarla. */
  onCrearMarca: (nombre: string) => Promise<{ ok: true; marca: Marca } | { ok: false; error: string }>
  /** Catálogo de plantillas de garantía (Fase 4). */
  plantillasGarantia: PlantillaGarantia[]
  /** Puntos de venta (locales) del cliente -- Fase 27d. Vacío o con un
   * solo elemento en un cliente de un solo local: el selector de
   * "Disponible en" directamente no se muestra en ese caso. */
  puntosVenta?: { id: string; alias: string }[]
  /** Fórmulas existentes -- para saber si este producto tiene una receta
   * real que le calcula el costo (ver Formular Producto). OJO:
   * `Producto.tieneFormula` no es confiable (no se mantiene sincronizado
   * en todos los casos), por eso acá se busca en esta lista en vez de
   * confiar en ese campo. */
  formulas?: Formula[]
  /** Navega a Formular Producto con este producto seleccionado (para editar
   * el costo desde la fórmula en vez de acá). */
  onIrAFormula?: (productoId: string) => void
  editData?: Producto
}

const emptyProducto: ProductoFormData = {
  nombre: '',
  codigo: '',
  rubroId: '',
  subRubroId: undefined,
  marcaId: undefined,
  proveedorId: undefined,
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
  tipo: 'unico',
  variantes: [],
  plantillaGarantiaId: undefined,
  diasDisponibles: undefined,
  puntoVentaId: undefined,
  esInsumo: false,
  servicioAsociadoId: undefined,
  servicioAsociadoObligatorio: false,
  modalidadStock: 'deposito',
}

export function ProductoDialog({
  open,
  onOpenChange,
  onSave,
  rubros,
  subRubros,
  productos,
  insumos,
  marcas,
  onCrearMarca,
  plantillasGarantia,
  puntosVenta = [],
  formulas,
  onIrAFormula,
  editData,
}: ProductoDialogProps) {
  const tieneFormulaReal =
    !!editData && (formulas?.some((f) => f.productoId === editData.id) ?? false)
  // Precio automático por margen (17/08): si el producto tiene fórmula Y
  // esa fórmula está calculando el precio por %, se bloquea también el
  // Precio venta acá -- mismo motivo que el bloqueo de Costo, para que no
  // se pise en silencio.
  const precioAutomatico = tieneFormulaReal && editData?.margenGanancia != null
  const [form, setForm] = useState<ProductoFormData>(emptyProducto)
  // Buffers de texto de los 3 campos numéricos con coma decimal (ver
  // @/lib/decimal) -- separados de `form` para no pisar la coma que el
  // usuario todavía está escribiendo.
  const [precioVentaTexto, setPrecioVentaTexto] = useState('')
  const [costoTexto, setCostoTexto] = useState('')
  const [stockMinimoTexto, setStockMinimoTexto] = useState('')
  // Fase 41.7: ver comentario de Producto.anchoRollo en types/index.ts.
  const [anchoRolloTexto, setAnchoRolloTexto] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [errorImagen, setErrorImagen] = useState('')
  const [errorCodigoBarras, setErrorCodigoBarras] = useState('')
  // Guardado confirmado (17/08): antes onSave era sincrónico y el diálogo se
  // cerraba de inmediato sin esperar la respuesta real de Supabase -- así
  // desaparecieron "Cortina Black Interior" y otro producto de prueba sin
  // ningún aviso. Ahora se espera la confirmación antes de cerrar, y si
  // falla se muestra acá en vez de fallar en silencio.
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Carpeta estable para esta sesión de edición (id real si ya existe, o un
  // id temporal si el producto todavía se está creando).
  const carpetaIdRef = useRef<string>('')
  // Fotos subidas durante esta apertura del diálogo que todavía no son parte
  // del producto guardado — si se cancela, se borran del bucket.
  const subidasEnEstaSesionRef = useRef<Set<string>>(new Set())

  // Proveedores (catálogo de Compras), para el select de "proveedor
  // preferido". Se trae directo de Supabase -- ver comentario en 0023 --
  // para no acoplar este módulo al Context de Compras solo por esto.
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([])

  useEffect(() => {
    if (!open) return
    let activo = true
    supabase
      .from('proveedores')
      .select('id, nombre')
      .order('nombre')
      .then(({ data }) => {
        if (activo) setProveedores(data ?? [])
      })
    return () => {
      activo = false
    }
  }, [open])

  // Fase 40: catálogo de Servicios (módulo separado) para el selector de
  // "Servicio asociado" -- mismo criterio directo-a-Supabase que
  // proveedores acá arriba, sin acoplar este módulo al store de Servicios.
  const [servicios, setServicios] = useState<{ id: string; titulo: string }[]>([])

  useEffect(() => {
    if (!open) return
    let activo = true
    supabase
      .from('servicios')
      .select('id, titulo')
      .eq('estado', 'activo')
      .order('titulo')
      .then(({ data }) => {
        if (activo) setServicios(data ?? [])
      })
    return () => {
      activo = false
    }
  }, [open])

  // Alta rápida de marca desde el propio formulario: guardado confirmado
  // (espera la escritura real y recién ahí auto-selecciona la marca nueva,
  // en vez de depender de que el array `marcas` se actualice solo).
  const [mostrarNuevaMarca, setMostrarNuevaMarca] = useState(false)
  const [nuevaMarcaNombre, setNuevaMarcaNombre] = useState('')
  const [creandoMarca, setCreandoMarca] = useState(false)
  const [errorMarca, setErrorMarca] = useState('')

  async function handleCrearMarca() {
    const nombre = nuevaMarcaNombre.trim()
    if (!nombre || creandoMarca) return
    setErrorMarca('')
    setCreandoMarca(true)
    const res = await onCrearMarca(nombre)
    setCreandoMarca(false)
    if (!res.ok) {
      setErrorMarca(res.error)
      return
    }
    setForm((prev) => ({ ...prev, marcaId: res.marca.id }))
    setNuevaMarcaNombre('')
    setMostrarNuevaMarca(false)
  }

  useEffect(() => {
    if (open) {
      carpetaIdRef.current =
        editData?.id ?? `nuevo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      subidasEnEstaSesionRef.current = new Set()
      setErrorImagen('')
      setMostrarNuevaMarca(false)
      setNuevaMarcaNombre('')
      setGuardando(false)
      setErrorGuardado('')
      if (editData) {
        const { id, stock, createdAt, tieneFormula, ...rest } = editData
        setForm({
          ...rest,
          imagenes: rest.imagenes ?? [],
          // Copia profunda de las variantes -- el editor las muta localmente
          // hasta que se guarda, sin tocar el state global.
          variantes: rest.variantes.map((v) => ({ ...v })),
          // Normaliza a la lista explícita de los 7 días -- ver comentario
          // en handleToggleDia/handleToggleTodosDias más abajo. Un producto
          // guardado antes de este fix con diasDisponibles vacío/undefined
          // significaba "todos los días" igual, así que esto no le cambia
          // la disponibilidad real, solo la muestra tildada.
          diasDisponibles: rest.diasDisponibles?.length ? rest.diasDisponibles : DIAS_SEMANA_ORDEN.slice(),
        })
        setPrecioVentaTexto(decimalATexto(rest.precioVenta))
        setCostoTexto(decimalATexto(rest.costo))
        setStockMinimoTexto(decimalATexto(rest.stockMinimo))
        setAnchoRolloTexto(rest.anchoRollo != null ? decimalATexto(rest.anchoRollo) : '')
      } else {
        setForm({ ...emptyProducto, diasDisponibles: DIAS_SEMANA_ORDEN.slice() })
        setPrecioVentaTexto('')
        setCostoTexto('')
        setStockMinimoTexto('')
        setAnchoRolloTexto('')
      }
    }
  }, [open, editData])

  function update<K extends keyof ProductoFormData>(key: K, value: ProductoFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── Variantes (Fase 2: color/talle) ──────────────────────────────────────
  // El stock de cada variante NO se edita acá -- se maneja igual que el
  // stock de un producto único, vía Recepción o Ajuste de stock. Acá solo
  // se define QUÉ variantes existen (color/talle/código de barras propio).
  // Las variantes nuevas arrancan en 0; las existentes conservan su stock
  // real (se muestra de solo lectura como referencia).

  function handleAddVariante() {
    setForm((f) => ({
      ...f,
      variantes: [...f.variantes, { id: vUid(), color: '', talle: '', stock: 0 }],
    }))
  }

  function handleUpdateVariante(id: string, updates: Partial<ProductoVariante>) {
    setForm((f) => ({
      ...f,
      variantes: f.variantes.map((v) => (v.id === id ? { ...v, ...updates } : v)),
    }))
  }

  function handleDeleteVariante(id: string) {
    setForm((f) => ({ ...f, variantes: f.variantes.filter((v) => v.id !== id) }))
  }

  function handleTipoChange(tipo: TipoProducto) {
    setForm((f) => ({ ...f, tipo, variantes: tipo === 'unico' ? [] : f.variantes }))
  }

  // ── Días disponibles (Fase 24a) ──────────────────────────────────────────
  // Vacío/undefined = disponible todos los días para el motor (Catálogo
  // Público, Viandas -- ver dias_disponibles en store.tsx/generarEntregaVianda.ts).
  // A pedido de Carlos (18/08): antes ese significado era implícito y
  // confuso (nada tildado = disponible igual todos los días). Ahora el
  // formulario siempre trabaja con la lista explícita de los 7 días (se
  // normaliza al abrir, ver useEffect de arriba) y agrega una casilla
  // "Todos los días" que tilda/destilda el conjunto completo de una, y
  // arranca tildada por defecto.
  function handleToggleDia(dia: number) {
    setForm((f) => {
      const actual = f.diasDisponibles ?? []
      const nuevo = actual.includes(dia) ? actual.filter((d) => d !== dia) : [...actual, dia]
      return { ...f, diasDisponibles: nuevo }
    })
  }

  function handleToggleTodosDias() {
    setForm((f) => {
      const todosMarcados = (f.diasDisponibles ?? []).length === DIAS_SEMANA_ORDEN.length
      return { ...f, diasDisponibles: todosMarcados ? [] : DIAS_SEMANA_ORDEN.slice() }
    })
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
    if (guardando) return
    // Limpiar fotos subidas en esta sesión que no se van a guardar.
    for (const url of subidasEnEstaSesionRef.current) {
      void eliminarImagenProducto(url)
    }
    subidasEnEstaSesionRef.current = new Set()
    onOpenChange(false)
  }

  const variantesValidas =
    form.tipo === 'unico' ||
    (form.variantes.length > 0 &&
      form.variantes.every((v) => (v.color?.trim() || '') || (v.talle?.trim() || '')))

  async function handleSave() {
    if (!form.nombre.trim()) return
    if (!form.rubroId) return
    if (!variantesValidas) return
    if (guardando) return

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
    setErrorGuardado('')
    setGuardando(true)
    const errorGuardar = await onSave({
      ...form,
      codigo: form.codigo.trim() || `PROD-${Date.now().toString(36).toUpperCase()}`,
      codigoBarras: codigoBarrasLimpio,
      subRubroId: form.subRubroId || undefined,
      marcaId: form.marcaId || undefined,
      proveedorId: form.proveedorId || undefined,
      plantillaGarantiaId: form.plantillaGarantiaId || undefined,
      diasDisponibles: form.diasDisponibles && form.diasDisponibles.length ? form.diasDisponibles : undefined,
      puntoVentaId: form.puntoVentaId || undefined,
      servicioAsociadoId: form.servicioAsociadoId || undefined,
      servicioAsociadoObligatorio: form.servicioAsociadoId ? !!form.servicioAsociadoObligatorio : false,
      variantes:
        form.tipo === 'con_variantes'
          ? form.variantes.map((v) => ({
              ...v,
              color: v.color?.trim() || undefined,
              talle: v.talle?.trim() || undefined,
              codigoBarras: v.codigoBarras?.trim() || undefined,
            }))
          : [],
    })
    setGuardando(false)
    if (errorGuardar) {
      setErrorGuardado(errorGuardar)
      return
    }
    subidasEnEstaSesionRef.current = new Set()
    onOpenChange(false)
  }

  const rubrosFiltrados = rubros.filter((r) => r.tipo === 'producto' || r.tipo === 'ambos')
  const subRubrosFiltrados = subRubros.filter((sr) => sr.rubroId === form.rubroId)

  // Garantía heredada del rubro elegido (si el rubro tiene una plantilla
  // default asignada). Se muestra como referencia -- ver Fase 4.
  const rubroSeleccionado = rubros.find((r) => r.id === form.rubroId)
  const plantillaHeredada = rubroSeleccionado?.plantillaGarantiaId
    ? plantillasGarantia.find((pg) => pg.id === rubroSeleccionado.plantillaGarantiaId)
    : undefined

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
              <label className="text-sm font-medium">Rubro *</label>
              <select
                className={inputClass}
                value={form.rubroId}
                onChange={(e) => {
                  update('rubroId', e.target.value)
                  update('subRubroId', undefined)
                }}
              >
                <option value="" disabled>
                  Elegí un rubro...
                </option>
                {rubrosFiltrados.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
              {rubrosFiltrados.length === 0 && (
                <p className="text-xs text-amber-600">
                  Todavía no cargaste ningún rubro -- creá uno primero en la pestaña Rubros.
                </p>
              )}
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

          {/* Marca y Proveedor preferido */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Marca</label>
              {mostrarNuevaMarca ? (
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <input
                      className={inputClass}
                      value={nuevaMarcaNombre}
                      onChange={(e) => setNuevaMarcaNombre(e.target.value)}
                      placeholder="Nombre de la marca"
                      autoFocus
                      disabled={creandoMarca}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleCrearMarca()
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={handleCrearMarca}
                      disabled={!nuevaMarcaNombre.trim() || creandoMarca}
                    >
                      {creandoMarca && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                      Crear
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      disabled={creandoMarca}
                      onClick={() => {
                        setMostrarNuevaMarca(false)
                        setNuevaMarcaNombre('')
                        setErrorMarca('')
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {errorMarca && <p className="text-xs text-red-600 dark:text-red-400">{errorMarca}</p>}
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    className={inputClass}
                    value={form.marcaId ?? ''}
                    onChange={(e) => update('marcaId', e.target.value || undefined)}
                  >
                    <option value="">Sin marca</option>
                    {marcas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setMostrarNuevaMarca(true)}
                    title="Nueva marca"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Proveedor preferido</label>
              <select
                className={inputClass}
                value={form.proveedorId ?? ''}
                onChange={(e) => update('proveedorId', e.target.value || undefined)}
              >
                <option value="">Sin proveedor preferido</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Servicio asociado (Fase 40): enlace opcional a un servicio del
              módulo Servicios -- ej. "Instalación" para una cortina. Mismo
              criterio liviano que Marca/Proveedor preferido de arriba. */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Servicio asociado</label>
            <p className="text-xs text-muted-foreground">
              Un servicio (ej. instalación) que suele venderse junto con este producto.
            </p>
            <select
              className={inputClass}
              value={form.servicioAsociadoId ?? ''}
              onChange={(e) => update('servicioAsociadoId', e.target.value || undefined)}
            >
              <option value="">Sin servicio asociado</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.titulo}
                </option>
              ))}
            </select>
            {form.servicioAsociadoId && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.servicioAsociadoObligatorio}
                  onChange={(e) => update('servicioAsociadoObligatorio', e.target.checked)}
                />
                Agregarlo automáticamente al vender este producto
                <span className="text-xs text-muted-foreground">
                  (si no, Ventas solo lo va a sugerir con un botón)
                </span>
              </label>
            )}
          </div>

          {/* Disponible en (Fase 27d): solo aparece en clientes con 2+
              locales cargados -- default (sin elegir nada) = compartido,
              visible desde cualquier local, igual que hasta ahora. */}
          {puntosVenta.length > 1 && (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Disponible en</label>
              <select
                className={inputClass}
                value={form.puntoVentaId ?? ''}
                onChange={(e) => update('puntoVentaId', e.target.value || undefined)}
              >
                <option value="">Todos los locales</option>
                {puntosVenta.map((pv) => (
                  <option key={pv.id} value={pv.id}>
                    Solo {pv.alias}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Garantía (Fase 4: override puntual, con fallback al rubro) */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Garantía</label>
            <select
              className={inputClass}
              value={form.plantillaGarantiaId ?? ''}
              onChange={(e) => update('plantillaGarantiaId', e.target.value || undefined)}
            >
              <option value="">
                {plantillaHeredada
                  ? `Heredar del rubro (${plantillaHeredada.nombre})`
                  : 'Sin garantía'}
              </option>
              {plantillasGarantia.map((pg) => (
                <option key={pg.id} value={pg.id}>
                  {pg.nombre} ({pg.duracionMeses} {pg.duracionMeses === 1 ? 'mes' : 'meses'})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Solo hace falta elegir una acá si este producto puntual usa una garantía distinta a
              la del rubro.
            </p>
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
                type="text"
                inputMode="decimal"
                value={precioVentaTexto}
                disabled={precioAutomatico}
                onChange={(e) => {
                  const texto = sanitizarDecimal(e.target.value)
                  setPrecioVentaTexto(texto)
                  update('precioVenta', parsearDecimal(texto))
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Costo</label>
              <input
                className={inputClass}
                type="text"
                inputMode="decimal"
                value={costoTexto}
                disabled={tieneFormulaReal}
                onChange={(e) => {
                  const texto = sanitizarDecimal(e.target.value)
                  setCostoTexto(texto)
                  update('costo', parsearDecimal(texto))
                }}
              />
            </div>
          </div>

          {tieneFormulaReal && (
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300">
              <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>
                  Este producto tiene una Fórmula asociada. El Costo se calcula solo (suma de
                  insumos + mano de obra + costos operativos)
                  {precioAutomatico
                    ? ' y el Precio venta se calcula con el margen definido en la fórmula -- ambos'
                    : ' y'}{' '}
                  se bloquea{precioAutomatico ? 'n' : ''} acá para que un cambio manual no se pise
                  en silencio la próxima vez que se guarde la fórmula.
                </p>
                {editData && onIrAFormula && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-blue-800 underline dark:text-blue-300"
                    onClick={() => onIrAFormula(editData.id)}
                  >
                    Ir a Formular Producto
                  </Button>
                )}
              </div>
            </div>
          )}

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

          {/* Fase 41.7: ancho de rollo -- solo tiene sentido si la unidad
              de venta es Metro o m² (ver Producto.anchoRollo en types/
              index.ts). Habilita convertir metro<->m2 en Formular
              Producto para telas/materiales que se venden por metro
              lineal pero se consumen por área en una fórmula. */}
          {(form.unidadVenta === 'metro' || form.unidadVenta === 'm2') && (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Ancho de rollo (m)</label>
              <input
                className={inputClass}
                type="text"
                inputMode="decimal"
                placeholder="Ej. 2,80"
                value={anchoRolloTexto}
                onChange={(e) => {
                  const texto = sanitizarDecimal(e.target.value)
                  setAnchoRolloTexto(texto)
                  update('anchoRollo', texto.trim() ? parsearDecimal(texto) : undefined)
                }}
              />
              <p className="text-xs text-muted-foreground">
                Completalo si este artículo también se consume por m² en alguna fórmula (ej. una tela
                que se vende por metro pero se gasta por área en una cortina). Dejalo vacío si no aplica.
              </p>
            </div>
          )}

          {/* Stock minimo */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Stock minimo</label>
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              value={stockMinimoTexto}
              onChange={(e) => {
                const texto = sanitizarDecimal(e.target.value)
                setStockMinimoTexto(texto)
                update('stockMinimo', parsearDecimal(texto))
              }}
            />
          </div>

          {/* Tipo: único o con variantes */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Tipo de producto</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.tipo === 'unico'}
                  onChange={() => handleTipoChange('unico')}
                />
                Único
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.tipo === 'con_variantes'}
                  onChange={() => handleTipoChange('con_variantes')}
                />
                Con variantes (color / talle)
              </label>
            </div>
          </div>

          {/* Variantes */}
          {form.tipo === 'con_variantes' && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Variantes</h4>
                <Button type="button" variant="outline" size="sm" onClick={handleAddVariante}>
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar variante
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                El stock de cada variante se carga desde Recepción o Ajuste de stock, no acá --
                este formulario solo define qué combinaciones existen.
              </p>

              {form.variantes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                  Sin variantes. Agregá al menos una (ej: "Rojo" / "M").
                </p>
              ) : (
                <div className="overflow-x-auto scroll-shadow-x">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-2 py-2 font-medium">Color</th>
                        <th className="px-2 py-2 font-medium">Talle</th>
                        <th className="px-2 py-2 font-medium">Cód. barras</th>
                        <th className="px-2 py-2 font-medium w-20 text-right">Stock</th>
                        <th className="px-2 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {form.variantes.map((v) => (
                        <tr key={v.id} className="border-b last:border-0">
                          <td className="px-2 py-2">
                            <input
                              className={`${inputClass} text-xs`}
                              value={v.color ?? ''}
                              onChange={(e) =>
                                handleUpdateVariante(v.id, { color: e.target.value })
                              }
                              placeholder="Ej: Rojo"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className={`${inputClass} text-xs`}
                              value={v.talle ?? ''}
                              onChange={(e) =>
                                handleUpdateVariante(v.id, { talle: e.target.value })
                              }
                              placeholder="Ej: M"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className={`${inputClass} text-xs`}
                              value={v.codigoBarras ?? ''}
                              onChange={(e) =>
                                handleUpdateVariante(v.id, { codigoBarras: e.target.value })
                              }
                              placeholder="Opcional"
                            />
                          </td>
                          <td className="px-2 py-2 text-right text-xs text-muted-foreground tabular-nums">
                            {v.stock}
                          </td>
                          <td className="px-2 py-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-500"
                              onClick={() => handleDeleteVariante(v.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

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
            <label
              className="flex items-center gap-2 text-sm"
              title="Fabricación contra un pedido puntual (ej. cortinas a medida): Producción no suma stock genérico de este producto, queda imputado al pedido hasta que se entregue/facture."
            >
              <input
                type="checkbox"
                checked={form.modalidadStock === 'a_medida'}
                onChange={(e) => update('modalidadStock', e.target.checked ? 'a_medida' : 'deposito')}
                className="rounded border-input"
              />
              A medida (sin stock genérico)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.esInsumo ?? false}
                onChange={(e) => {
                  if (e.target.checked) {
                    // Fase 34+ (fix): antes de tildar, avisar si ya existe un
                    // insumo suelto (sin vínculo) con el mismo nombre -- se
                    // va a vincular ESE en vez de crear uno nuevo (ver
                    // sincronizarInsumoDeProducto en data/store.tsx).
                    const nombreP = form.nombre.trim().toLowerCase()
                    const huerfano = nombreP
                      ? insumos.find(
                          (i) =>
                            !i.productoVinculadoId &&
                            i.nombre.trim().toLowerCase() === nombreP,
                        )
                      : undefined
                    if (huerfano) {
                      const ok = window.confirm(
                        `Ya existe un insumo suelto llamado "${huerfano.nombre}" (stock ${huerfano.stock}) sin vincular a ningún producto.\n\n` +
                          `Al guardar, se va a vincular ese insumo con este producto en vez de crear uno nuevo -- así no queda la existencia contada dos veces.`,
                      )
                      if (!ok) return
                    }
                  }
                  update('esInsumo', e.target.checked)
                }}
                className="rounded border-input"
              />
              También es insumo (usar en Formular Producto)
            </label>
          </div>
          {form.esInsumo && (
            <p className="text-xs text-muted-foreground -mt-2">
              Este artículo va a estar disponible como ingrediente en Formular Producto (ej. una
              tela que también se usa para confeccionar). El stock y el costo se sincronizan
              solos desde acá -- no hace falta cargarlos por separado en Insumos.
            </p>
          )}

          {/* Días disponibles (Fase 24a) -- pensado para productos con
              disponibilidad acotada por día (ej. viandas), pero sirve para
              cualquier producto. Sin marcar ninguno = todos los días. */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Días disponibles</label>
            <label className="flex items-center gap-1.5 text-sm font-medium">
              <input
                type="checkbox"
                checked={(form.diasDisponibles ?? []).length === DIAS_SEMANA_ORDEN.length}
                onChange={handleToggleTodosDias}
                className="rounded border-input"
              />
              Todos los días
            </label>
            <div className="flex flex-wrap gap-3 pl-1">
              {DIAS_SEMANA_ORDEN.map((dia) => (
                <label key={dia} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={(form.diasDisponibles ?? []).includes(dia)}
                    onChange={() => handleToggleDia(dia)}
                    className="rounded border-input"
                  />
                  {DIA_SEMANA_LABEL[dia]}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Tildá los días en los que este producto está disponible. Esto solo se respeta en
              el Catálogo Público/Menú QR -- el personal siempre puede vender el producto desde
              Punto de Venta, Comandas, etc.
            </p>
          </div>
        </div>

        {errorGuardado && <p className="text-sm text-red-500 px-6">{errorGuardado}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancelar} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!form.nombre.trim() || !form.rubroId || subiendo || !variantesValidas || guardando}
          >
            {guardando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
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
  /** Guardado confirmado (18/08, fase siguiente a Producto/Fórmula): espera
   * la escritura real en Supabase antes de cerrar. Devuelve un mensaje de
   * error si falló, o nada si se guardó bien. */
  onSave: (data: InsumoFormData) => Promise<string | void>
  rubros: Rubro[]
  subRubros: SubRubro[]
  editData?: Insumo
  /** Fase 34+ (fix): para poder mostrar el nombre del producto vinculado y
   * ofrecer un atajo hacia él cuando el insumo es un espejo. Opcional para
   * no romper otros llamadores que todavía no lo pasen. */
  productos?: Producto[]
  onIrAProducto?: (productoId: string) => void
}

const emptyInsumo: InsumoFormData = {
  nombre: '',
  rubroId: '',
  subRubroId: undefined,
  unidad: 'unidad',
  stockMinimo: 0,
  costo: 0,
  esComercializable: false,
  presentaciones: [],
  documentos: [],
}

/** Fase 48b: fila de edición local para una presentación -- el contenido
 * se edita como texto (mismo criterio que costoTexto/stockMinimoTexto) y
 * recién se parsea a número al guardar. */
interface PresentacionForm {
  id: string
  nombre: string
  contenidoTexto: string
  esDefault: boolean
}

export function InsumoDialog({
  open,
  onOpenChange,
  onSave,
  rubros,
  subRubros,
  editData,
  productos,
  onIrAProducto,
}: InsumoDialogProps) {
  const [form, setForm] = useState<InsumoFormData>(emptyInsumo)
  const [stockMinimoTexto, setStockMinimoTexto] = useState('')
  const [costoTexto, setCostoTexto] = useState('')
  // Fase 41.7: ver comentario de Insumo.anchoRollo en types/index.ts.
  const [anchoRolloTexto, setAnchoRolloTexto] = useState('')
  // Fase 48b: ver comentario de Insumo.presentaciones en types/index.ts.
  const [presentacionesForm, setPresentacionesForm] = useState<PresentacionForm[]>([])
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')

  // Fase 48c: foto de referencia -- mismo patrón que la galería de
  // ProductoDialog, pero con UN solo archivo (ver comentario en
  // Insumo.imagenUrl). Reusa el mismo bucket público "productos-imagenes".
  const fileInputImagenRef = useRef<HTMLInputElement>(null)
  const carpetaIdRef = useRef<string>('')
  // URL subida en ESTA apertura del diálogo que todavía no es parte del
  // insumo guardado -- si se cancela o se reemplaza, se borra del bucket
  // (mismo criterio que subidasEnEstaSesionRef en ProductoDialog).
  const imagenSubidaEnEstaSesionRef = useRef<string | null>(null)
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  const [errorImagen, setErrorImagen] = useState('')

  // Fase 48c: Catálogo Técnico -- documentos del insumo (PDF/imagen vía
  // bucket privado "archivos-cliente", o link de video). Necesita el
  // cliente_id del usuario logueado para el path del bucket privado -- ver
  // convención en utilidades/lib/archivos.ts.
  const { clienteId } = useClienteId()
  const fileInputDocRef = useRef<HTMLInputElement>(null)
  const documentosSubidosEnEstaSesionRef = useRef<Set<string>>(new Set())
  const [subiendoDoc, setSubiendoDoc] = useState(false)
  const [errorDoc, setErrorDoc] = useState('')
  const [mostrarNuevoVideo, setMostrarNuevoVideo] = useState(false)
  const [nuevoVideoTitulo, setNuevoVideoTitulo] = useState('')
  const [nuevoVideoUrl, setNuevoVideoUrl] = useState('')
  // Fase 48d: texto libre -- especificación técnica escrita directo en el
  // sistema, sin subir archivo. `textosExpandidos` recuerda qué filas de
  // tipo 'texto' están mostrando su contenido en este momento (se edita
  // in-line, no hace falta abrir nada aparte).
  const [mostrarNuevoTexto, setMostrarNuevoTexto] = useState(false)
  const [nuevoTextoTitulo, setNuevoTextoTitulo] = useState('')
  const [nuevoTextoContenido, setNuevoTextoContenido] = useState('')
  const [textosExpandidos, setTextosExpandidos] = useState<Set<string>>(new Set())

  // Fase 45h (Etapa 2 del split de OC): proveedores (catálogo de Compras)
  // para el select de "Proveedor habitual" -- mismo criterio directo-a-
  // Supabase que en ProductoDialog (ver comentario ahí), sin acoplar este
  // módulo al Context de Compras solo por esto.
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([])

  useEffect(() => {
    if (!open) return
    let activo = true
    supabase
      .from('proveedores')
      .select('id, nombre')
      .order('nombre')
      .then(({ data }) => {
        if (activo) setProveedores(data ?? [])
      })
    return () => {
      activo = false
    }
  }, [open])

  // Fase 34+ (fix): si el insumo es un espejo, nombre/rubro/sub-rubro/
  // unidad/stock mínimo/costo se re-escriben solos cada vez que se guarda
  // el producto vinculado (ver sincronizarInsumoDeProducto en store.tsx).
  // Editarlos acá daba una falsa sensación de que el cambio queda -- se
  // pisa en silencio en el próximo guardado del producto. Se bloquean y
  // se explica dónde editarlos de verdad. "Comercializable" NO es un
  // campo espejado, sigue editable normalmente.
  const vinculado = !!editData?.productoVinculadoId
  const productoVinculado = productos?.find((p) => p.id === editData?.productoVinculadoId)

  useEffect(() => {
    if (open) {
      setGuardando(false)
      setErrorGuardado('')
      // Fase 48c: carpeta estable para la foto (id real si ya existe, o un
      // id temporal si el insumo se está creando) y limpieza de refs de
      // "subido en esta sesión" -- mismo criterio que ProductoDialog.
      carpetaIdRef.current =
        editData?.id ?? `nuevo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      imagenSubidaEnEstaSesionRef.current = null
      documentosSubidosEnEstaSesionRef.current = new Set()
      setErrorImagen('')
      setErrorDoc('')
      setMostrarNuevoVideo(false)
      setNuevoVideoTitulo('')
      setNuevoVideoUrl('')
      setMostrarNuevoTexto(false)
      setNuevoTextoTitulo('')
      setNuevoTextoContenido('')
      setTextosExpandidos(new Set())
      if (editData) {
        const { id, stock, createdAt, productoVinculadoId, ...rest } = editData
        setForm({ ...rest, documentos: rest.documentos ?? [] })
        setStockMinimoTexto(decimalATexto(rest.stockMinimo))
        setCostoTexto(decimalATexto(rest.costo))
        setAnchoRolloTexto(rest.anchoRollo != null ? decimalATexto(rest.anchoRollo) : '')
        setPresentacionesForm(
          rest.presentaciones.map((p) => ({
            id: p.id,
            nombre: p.nombre ?? '',
            contenidoTexto: decimalATexto(p.contenido),
            esDefault: p.esDefault,
          })),
        )
      } else {
        setForm(emptyInsumo)
        setStockMinimoTexto('')
        setCostoTexto('')
        setAnchoRolloTexto('')
        setPresentacionesForm([])
      }
    }
  }, [open, editData])

  function update<K extends keyof InsumoFormData>(key: K, value: InsumoFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Fase 48b: helpers de la lista de presentaciones.
  function agregarPresentacion() {
    setPresentacionesForm((prev) => [
      ...prev,
      { id: crypto.randomUUID(), nombre: '', contenidoTexto: '', esDefault: prev.length === 0 },
    ])
  }
  function actualizarPresentacion(idx: number, patch: Partial<PresentacionForm>) {
    setPresentacionesForm((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }
  function marcarDefault(idx: number) {
    setPresentacionesForm((prev) => prev.map((p, i) => ({ ...p, esDefault: i === idx })))
  }
  function quitarPresentacion(idx: number) {
    setPresentacionesForm((prev) => {
      const quitada = prev[idx]
      const resto = prev.filter((_, i) => i !== idx)
      // Si se quitó la que era default y quedan otras, la primera pasa a serlo
      // -- nunca queda la lista sin ninguna marcada si hay al menos una fila.
      if (quitada?.esDefault && resto.length > 0 && !resto.some((p) => p.esDefault)) {
        resto[0] = { ...resto[0], esDefault: true }
      }
      return resto
    })
  }

  // Fase 48c: foto de referencia -- ver handleFilesSelected/handleRemoveImagen
  // en ProductoDialog, adaptado a un solo archivo en vez de una galería.
  async function handleImagenSelected(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setErrorImagen('')
    setSubiendoImagen(true)
    try {
      const { url } = await subirImagenProducto(file, carpetaIdRef.current)
      // Si ya había una foto subida en esta misma sesión de edición (el
      // usuario la está reemplazando sin haber guardado todavía), se borra
      // la vieja para no dejar basura huérfana en el bucket.
      if (imagenSubidaEnEstaSesionRef.current) {
        void eliminarImagenProducto(imagenSubidaEnEstaSesionRef.current)
      }
      imagenSubidaEnEstaSesionRef.current = url
      update('imagenUrl', url)
    } catch (err) {
      setErrorImagen(err instanceof Error ? err.message : 'No se pudo subir la foto.')
    } finally {
      setSubiendoImagen(false)
      if (fileInputImagenRef.current) fileInputImagenRef.current.value = ''
    }
  }

  function handleRemoveImagen() {
    if (form.imagenUrl && imagenSubidaEnEstaSesionRef.current === form.imagenUrl) {
      imagenSubidaEnEstaSesionRef.current = null
      void eliminarImagenProducto(form.imagenUrl)
    }
    update('imagenUrl', undefined)
  }

  // Fase 48c: Catálogo Técnico -- ver comentario en Insumo.documentos
  // (types/index.ts) sobre por qué el título es obligatorio.
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
      const tipo: TipoDocumentoInsumo = file.type === 'application/pdf' ? 'pdf' : 'imagen'
      const tituloDefault = file.name.replace(/\.[^./\\]+$/, '')
      update('documentos', [
        ...form.documentos,
        { id: docId, tipo, titulo: tituloDefault, path, createdAt: todayISO() },
      ])
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
    update('documentos', [
      ...form.documentos,
      { id: crypto.randomUUID(), tipo: 'video', titulo, url, createdAt: todayISO() },
    ])
    setNuevoVideoTitulo('')
    setNuevoVideoUrl('')
    setMostrarNuevoVideo(false)
  }

  function handleActualizarTituloDoc(id: string, titulo: string) {
    update(
      'documentos',
      form.documentos.map((d) => (d.id === id ? { ...d, titulo } : d)),
    )
  }

  // Fase 48d: texto libre -- se edita in-line, el contenido vive en el
  // propio form.documentos (sin subir nada a ningún lado).
  function handleAgregarTexto() {
    const titulo = nuevoTextoTitulo.trim()
    const contenido = nuevoTextoContenido.trim()
    if (!titulo || !contenido) return
    const id = crypto.randomUUID()
    update('documentos', [
      ...form.documentos,
      { id, tipo: 'texto', titulo, contenido, createdAt: todayISO() },
    ])
    setTextosExpandidos((prev) => new Set(prev).add(id))
    setNuevoTextoTitulo('')
    setNuevoTextoContenido('')
    setMostrarNuevoTexto(false)
  }

  function handleActualizarContenidoTexto(id: string, contenido: string) {
    update(
      'documentos',
      form.documentos.map((d) => (d.id === id ? { ...d, contenido } : d)),
    )
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
    const doc = form.documentos.find((d) => d.id === id)
    if (doc?.path && documentosSubidosEnEstaSesionRef.current.has(doc.path)) {
      documentosSubidosEnEstaSesionRef.current.delete(doc.path)
      void eliminarArchivo(doc.path)
    }
    update(
      'documentos',
      form.documentos.filter((d) => d.id !== id),
    )
  }

  async function handleVerDocumento(doc: InsumoDocumento) {
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

  function handleCancelar() {
    if (guardando) return
    // Limpia foto y documentos subidos en esta sesión que no se llegaron a
    // guardar -- mismo criterio que handleCancelar en ProductoDialog.
    if (imagenSubidaEnEstaSesionRef.current) {
      void eliminarImagenProducto(imagenSubidaEnEstaSesionRef.current)
    }
    imagenSubidaEnEstaSesionRef.current = null
    for (const path of documentosSubidosEnEstaSesionRef.current) {
      void eliminarArchivo(path)
    }
    documentosSubidosEnEstaSesionRef.current = new Set()
    onOpenChange(false)
  }

  async function handleSave() {
    if (!form.nombre.trim()) return
    if (guardando) return
    setErrorGuardado('')
    // Presentaciones con contenido vacío o inválido se descartan en
    // silencio (fila a medio cargar, no vale la pena bloquear el guardado
    // del insumo por eso -- el usuario puede volver a completarla después).
    const presentaciones = presentacionesForm
      .filter((p) => p.contenidoTexto.trim() && parsearDecimal(p.contenidoTexto) > 0)
      .map((p) => ({
        id: p.id,
        nombre: p.nombre.trim() || undefined,
        contenido: parsearDecimal(p.contenidoTexto),
        esDefault: p.esDefault,
      }))
    // Documentos sin título (ej. un link de video a medio cargar que nunca
    // se confirmó con el botón "Agregar") se descartan en silencio, mismo
    // criterio que las presentaciones. Un texto libre que el usuario dejó
    // vacío al editarlo in-line tampoco se guarda.
    const documentos = form.documentos.filter(
      (d) => d.titulo.trim() && (d.tipo !== 'texto' || d.contenido?.trim()),
    )
    setGuardando(true)
    const errorGuardar = await onSave({
      ...form,
      subRubroId: form.subRubroId || undefined,
      presentaciones,
      documentos,
    })
    setGuardando(false)
    if (errorGuardar) {
      setErrorGuardado(errorGuardar)
      return
    }
    imagenSubidaEnEstaSesionRef.current = null
    documentosSubidosEnEstaSesionRef.current = new Set()
    onOpenChange(false)
  }

  const rubrosFiltrados = rubros.filter((r) => r.tipo === 'insumo' || r.tipo === 'ambos')
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
          <DialogTitle>{editData ? 'Editar insumo' : 'Nuevo insumo'}</DialogTitle>
          <DialogDescription>
            {editData
              ? 'Modifica los datos del insumo.'
              : 'Completa los datos para crear un nuevo insumo.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Fase 48c: foto de referencia -- una sola, no galería (ver
              comentario en Insumo.imagenUrl). */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Foto de referencia</label>
            <div className="flex items-center gap-3">
              {form.imagenUrl ? (
                <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted">
                  <img src={form.imagenUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    title="Quitar foto"
                    onClick={handleRemoveImagen}
                    className="absolute inset-0 hidden items-center justify-center bg-black/50 group-hover:flex"
                  >
                    <X className="h-4 w-4 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputImagenRef.current?.click()}
                  disabled={subiendoImagen}
                  className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
                >
                  {subiendoImagen ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-[10px]">Agregar</span>
                    </>
                  )}
                </button>
              )}
              <p className="text-xs text-muted-foreground">
                Opcional. JPG, PNG o WEBP, hasta 5 MB.
              </p>
            </div>
            <input
              ref={fileInputImagenRef}
              type="file"
              accept={ACCEPT_IMAGENES}
              className="hidden"
              onChange={(e) => handleImagenSelected(e.target.files)}
            />
            {errorImagen && <p className="text-xs text-red-500">{errorImagen}</p>}
          </div>

          {vinculado && (
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300">
              <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>
                  Este insumo está vinculado a{' '}
                  {productoVinculado ? (
                    <strong>{productoVinculado.nombre}</strong>
                  ) : (
                    'un producto'
                  )}
                  . Nombre, rubro, sub-rubro, unidad, ancho de rollo, stock mínimo y costo se
                  sincronizan solos desde ahí -- se bloquean acá para que un
                  cambio manual no se pise en silencio la próxima vez que se
                  guarde el producto.
                </p>
                {productoVinculado && onIrAProducto && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-blue-800 underline dark:text-blue-300"
                    onClick={() => onIrAProducto(productoVinculado.id)}
                  >
                    Ir al producto para editarlo
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Nombre */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Nombre *</label>
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) => update('nombre', e.target.value)}
              placeholder="Nombre del insumo"
              disabled={vinculado}
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
                disabled={vinculado}
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
                disabled={vinculado || !form.rubroId || subRubrosFiltrados.length === 0}
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
              disabled={vinculado}
            >
              {UNIDADES.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          {/* Fase 45h (Etapa 2 del split de OC): proveedor habitual --
              mismo campo liviano que "Proveedor preferido" en
              ProductoDialog. No se bloquea con `vinculado`: aunque el
              insumo sea un espejo de un producto, quién se lo provee es
              un dato propio del insumo, no algo que el producto sincronice. */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Proveedor habitual</label>
            <select
              className={inputClass}
              value={form.proveedorId ?? ''}
              onChange={(e) => update('proveedorId', e.target.value || undefined)}
            >
              <option value="">Sin proveedor habitual</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Opcional -- si lo cargás, cuando Producción genere una Orden de Compra por
              faltantes de este insumo, se agrupa con los demás de este mismo proveedor en vez
              de por rubro.
            </p>
          </div>

          {/* Fase 41.7: ancho de rollo -- ver mismo campo en ProductoDialog. */}
          {(form.unidad === 'metro' || form.unidad === 'm2') && (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Ancho de rollo (m)</label>
              <input
                className={inputClass}
                type="text"
                inputMode="decimal"
                placeholder="Ej. 2,80"
                value={anchoRolloTexto}
                onChange={(e) => {
                  const texto = sanitizarDecimal(e.target.value)
                  setAnchoRolloTexto(texto)
                  update('anchoRollo', texto.trim() ? parsearDecimal(texto) : undefined)
                }}
                disabled={vinculado}
              />
              <p className="text-xs text-muted-foreground">
                Completalo si este insumo se compra/stockea por metro lineal pero se consume por m² en
                alguna fórmula (ej. una tela). Dejalo vacío si no aplica.
              </p>
            </div>
          )}

          {/* Stock minimo y Costo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Stock minimo</label>
              <input
                className={inputClass}
                type="text"
                inputMode="decimal"
                value={stockMinimoTexto}
                onChange={(e) => {
                  const texto = sanitizarDecimal(e.target.value)
                  setStockMinimoTexto(texto)
                  update('stockMinimo', parsearDecimal(texto))
                }}
                disabled={vinculado}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Costo</label>
              <input
                className={inputClass}
                type="text"
                inputMode="decimal"
                value={costoTexto}
                onChange={(e) => {
                  const texto = sanitizarDecimal(e.target.value)
                  setCostoTexto(texto)
                  update('costo', parsearDecimal(texto))
                }}
                disabled={vinculado}
              />
            </div>
          </div>

          {/* Fase 48b: presentaciones de compra -- ver Insumo.presentaciones. */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Presentaciones de compra</label>
              <Button type="button" variant="outline" size="sm" onClick={agregarPresentacion}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Agregar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Opcional -- cómo se compra realmente este insumo (sachet, bolsa, balde), en la
              misma unidad de arriba ({unidadLabel(form.unidad)}). Ej. "Sachet 40 g" con
              contenido 40. Si cargás más de una, marcá con el punto cuál es la habitual --
              esa es la que se usa para sugerir/redondear cantidades.
            </p>
            {presentacionesForm.length > 0 && (
              <div className="grid gap-2 mt-1">
                {presentacionesForm.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => marcarDefault(idx)}
                      title={p.esDefault ? 'Presentación habitual' : 'Marcar como habitual'}
                      className={`h-4 w-4 shrink-0 rounded-full border ${
                        p.esDefault ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                      }`}
                    />
                    <input
                      className={`${inputClass} flex-1`}
                      placeholder="Nombre (ej. Sachet chico)"
                      value={p.nombre}
                      onChange={(e) => actualizarPresentacion(idx, { nombre: e.target.value })}
                    />
                    <input
                      className={`${inputClass} w-28`}
                      type="text"
                      inputMode="decimal"
                      placeholder={`Ej. 40`}
                      value={p.contenidoTexto}
                      onChange={(e) =>
                        actualizarPresentacion(idx, { contenidoTexto: sanitizarDecimal(e.target.value) })
                      }
                    />
                    <span className="text-xs text-muted-foreground w-14 shrink-0">
                      {unidadAbrev(form.unidad)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0"
                      onClick={() => quitarPresentacion(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fase 48c: Catálogo Técnico -- ver comentario en
              Insumo.documentos (types/index.ts). Pensado para que en el
              futuro un agente de IA o una automatización pueda encontrar
              esta documentación, por eso cada documento pide un título
              claro. */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Catálogo Técnico</label>
            <p className="text-xs text-muted-foreground">
              Fichas técnicas, hojas de seguridad, instructivos de dosificación o videos de uso
              de este insumo -- quedan a mano acá para consultarlos rápido (y, a futuro, para que
              un agente de IA los use como referencia).
            </p>

            {form.documentos.length > 0 && (
              <div className="grid gap-2 mt-1">
                {form.documentos.map((d) => {
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
                  placeholder="Título (ej. Video: dosificación)"
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMostrarNuevoVideo(true)}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1" />
                  Agregar link de video
                </Button>
              )}
              {!mostrarNuevoTexto && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMostrarNuevoTexto(true)}
                >
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

        {errorGuardado && <p className="text-sm text-red-500 px-6">{errorGuardado}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancelar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!form.nombre.trim() || guardando}>
            {guardando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
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
  /** Guardado confirmado (rediseño Stock/Producción): espera la escritura
   * real en Supabase antes de cerrar. Devuelve un mensaje de error si
   * falló, o nada si se guardó bien -- mismo contrato que Producto/Insumo. */
  onSave: (data: RecepcionFormData) => Promise<string | void>
  productos: Producto[]
  insumos: Insumo[]
}

interface LineaForm {
  key: string
  itemTipo: 'producto' | 'insumo'
  itemId: string
  /** Solo si itemTipo === 'producto' y ese producto es 'con_variantes'. */
  varianteId: string
  cantidad: number
  costoUnitario: number
  /** Buffer de texto de los inputs de arriba -- acepta coma decimal (ver
   * @/lib/decimal) sin perderla mientras el usuario todavía está
   * escribiendo. */
  cantidadTexto: string
  costoUnitarioTexto: string
  /** Vencimiento del lote que ingresa (opcional -- perecederos). */
  fechaVencimiento: string
}

export function RecepcionDialog({
  open,
  onOpenChange,
  onSave,
  productos,
  insumos,
}: RecepcionDialogProps) {
  const [fecha, setFecha] = useState(todayISO())
  const [proveedor, setProveedor] = useState('')
  const [numeroRemito, setNumeroRemito] = useState('')
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([])
  const [codigoEscaneado, setCodigoEscaneado] = useState('')
  const [errorEscaneo, setErrorEscaneo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')

  useEffect(() => {
    if (open) {
      setFecha(todayISO())
      setProveedor('')
      setNumeroRemito('')
      setNotas('')
      setLineas([])
      setCodigoEscaneado('')
      setErrorEscaneo('')
      setGuardando(false)
      setErrorGuardado('')
    }
  }, [open])

  // Pensado para un lector de codigo de barras USB/Bluetooth: el lector
  // "tipea" el codigo y aprieta Enter solo, como si fuera un teclado -- no
  // hace falta ninguna integracion especial, solo escuchar el Enter de este
  // input. Si el producto ya tiene una linea cargada, suma 1 a la cantidad
  // en vez de duplicar la linea. Busca primero por código del producto
  // (tipo 'unico'), y si no matchea, por código de una variante puntual
  // (tipo 'con_variantes') -- así el lector sirve para ambos casos.
  function handleEscanear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const codigo = codigoEscaneado.trim()
    if (!codigo) return

    const producto = productos.find((p) => p.codigoBarras === codigo)
    if (producto) {
      setErrorEscaneo('')
      setLineas((prev) => {
        const idx = prev.findIndex((l) => l.itemTipo === 'producto' && l.itemId === producto.id && !l.varianteId)
        if (idx >= 0) {
          return prev.map((l, i) =>
            i === idx ? { ...l, cantidad: l.cantidad + 1, cantidadTexto: decimalATexto(l.cantidad + 1) } : l,
          )
        }
        return [
          ...prev,
          {
            key: `${Date.now()}-${Math.random()}`,
            itemTipo: 'producto',
            itemId: producto.id,
            varianteId: '',
            cantidad: 1,
            costoUnitario: producto.costo,
            cantidadTexto: '1',
            costoUnitarioTexto: decimalATexto(producto.costo),
            fechaVencimiento: '',
          },
        ]
      })
      setCodigoEscaneado('')
      return
    }

    // Buscar por código de barras de una variante puntual.
    for (const p of productos) {
      const variante = p.variantes.find((v) => v.codigoBarras === codigo)
      if (variante) {
        setErrorEscaneo('')
        setLineas((prev) => {
          const idx = prev.findIndex(
            (l) => l.itemTipo === 'producto' && l.itemId === p.id && l.varianteId === variante.id,
          )
          if (idx >= 0) {
            return prev.map((l, i) =>
              i === idx ? { ...l, cantidad: l.cantidad + 1, cantidadTexto: decimalATexto(l.cantidad + 1) } : l,
            )
          }
          return [
            ...prev,
            {
              key: `${Date.now()}-${Math.random()}`,
              itemTipo: 'producto',
              itemId: p.id,
              varianteId: variante.id,
              cantidad: 1,
              costoUnitario: p.costo,
              cantidadTexto: '1',
              costoUnitarioTexto: decimalATexto(p.costo),
              fechaVencimiento: '',
            },
          ]
        })
        setCodigoEscaneado('')
        return
      }
    }

    setErrorEscaneo(`No se encontró ningún producto con el código "${codigo}".`)
  }

  function addLinea() {
    setLineas((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random()}`,
        itemTipo: 'producto',
        itemId: '',
        varianteId: '',
        cantidad: 0,
        costoUnitario: 0,
        cantidadTexto: '',
        costoUnitarioTexto: '',
        fechaVencimiento: '',
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

  // Una línea de producto 'con_variantes' recién es válida cuando además
  // eligieron la variante puntual (no alcanza con elegir el producto).
  function lineaValida(l: LineaForm): boolean {
    if (!l.itemId || l.cantidad <= 0) return false
    if (l.itemTipo === 'producto') {
      const producto = productos.find((p) => p.id === l.itemId)
      if (producto?.tipo === 'con_variantes' && !l.varianteId) return false
    }
    return true
  }

  const datosCabeceraValidos = proveedor.trim().length > 0 && numeroRemito.trim().length > 0

  async function handleSave() {
    const validLineas = lineas.filter(lineaValida)
    if (validLineas.length === 0 || !datosCabeceraValidos || guardando) return

    setErrorGuardado('')
    setGuardando(true)
    const error = await onSave({
      fecha,
      proveedor: proveedor.trim(),
      numeroRemito: numeroRemito.trim(),
      notas,
      lineas: validLineas.map((l) => ({
        // La tabla recepcion_lineas usa `uuid` como tipo de columna id.
        // El formato anterior (timestamp + random) no es un UUID válido y
        // hacía que el INSERT fallara en silencio (error 22P02) — la
        // recepción se guardaba, pero sus líneas nunca se persistían.
        id: crypto.randomUUID(),
        itemTipo: l.itemTipo,
        itemId: l.itemId,
        varianteId: l.varianteId || undefined,
        cantidad: l.cantidad,
        costoUnitario: l.costoUnitario,
        fechaVencimiento: l.fechaVencimiento || undefined,
      })),
    })
    setGuardando(false)
    if (error) {
      setErrorGuardado(error)
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva recepcion de mercaderia</DialogTitle>
          <DialogDescription>
            Registra el ingreso de productos e insumos de un proveedor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Fecha, Proveedor y Remito */}
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Fecha</label>
              <input
                className={inputClass}
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Proveedor *</label>
              <input
                className={inputClass}
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">N. remito *</label>
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
              const productoSeleccionado =
                linea.itemTipo === 'producto'
                  ? productos.find((p) => p.id === linea.itemId)
                  : undefined
              const tieneVariantes =
                productoSeleccionado?.tipo === 'con_variantes'
              // Fase 48: ayuda visual "≈ N envases" -- ver Insumo.pesoEnvase.
              // Solo un texto de referencia, no cambia cómo se carga la
              // cantidad (que sigue siempre en la unidad nativa del insumo).
              const insumoSeleccionado =
                linea.itemTipo === 'insumo'
                  ? insumos.find((ins) => ins.id === linea.itemId)
                  : undefined

              return (
                <div
                  key={linea.key}
                  className="grid gap-2 rounded-md border p-2"
                >
                  <div className="grid grid-cols-[110px_1fr_85px_85px_130px_36px] gap-2 items-end">
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
                            varianteId: '',
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
                        onChange={(e) =>
                          updateLinea(idx, { itemId: e.target.value, varianteId: '' })
                        }
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
                        type="text"
                        inputMode="decimal"
                        value={linea.cantidadTexto}
                        onChange={(e) => {
                          const texto = sanitizarDecimal(e.target.value)
                          updateLinea(idx, { cantidadTexto: texto, cantidad: parsearDecimal(texto) })
                        }}
                      />
                      {(() => {
                        const pres = insumoSeleccionado ? presentacionDefault(insumoSeleccionado.presentaciones) : undefined
                        if (!pres || linea.cantidad <= 0) return null
                        return (
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            ≈ {(linea.cantidad / pres.contenido).toFixed(2).replace('.', ',')} envases
                            {pres.nombre ? ` (${pres.nombre})` : ''}
                          </p>
                        )
                      })()}
                    </div>

                    {/* Costo unitario */}
                    <div className="grid gap-1">
                      <label className="text-xs text-muted-foreground">Costo unit.</label>
                      <input
                        className={inputClass}
                        type="text"
                        inputMode="decimal"
                        value={linea.costoUnitarioTexto}
                        onChange={(e) => {
                          const texto = sanitizarDecimal(e.target.value)
                          updateLinea(idx, { costoUnitarioTexto: texto, costoUnitario: parsearDecimal(texto) })
                        }}
                      />
                    </div>

                    {/* Vencimiento / lote */}
                    <div className="grid gap-1">
                      <label className="text-xs text-muted-foreground">Vencimiento</label>
                      <input
                        className={inputClass}
                        type="date"
                        value={linea.fechaVencimiento}
                        onChange={(e) =>
                          updateLinea(idx, { fechaVencimiento: e.target.value })
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

                  {/* Selector de variante (solo si el producto es 'con_variantes') */}
                  {tieneVariantes && (
                    <div className="grid gap-1 max-w-xs">
                      <label className="text-xs text-muted-foreground">
                        Variante (color / talle) *
                      </label>
                      <select
                        className={inputClass}
                        value={linea.varianteId}
                        onChange={(e) => updateLinea(idx, { varianteId: e.target.value })}
                      >
                        <option value="">Seleccionar...</option>
                        {productoSeleccionado!.variantes.map((v) => (
                          <option key={v.id} value={v.id}>
                            {[v.color, v.talle].filter(Boolean).join(' / ') || '(sin nombre)'}
                            {' — stock actual: '}
                            {v.stock}
                          </option>
                        ))}
                      </select>
                      {!linea.varianteId && (
                        <p className="text-xs text-red-500">
                          Elegí la variante antes de guardar la recepción.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {errorGuardado && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {errorGuardado}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={lineas.filter(lineaValida).length === 0 || !datosCabeceraValidos || guardando}
          >
            {guardando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Crear recepcion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── TransferenciaDialog ────────────────────────────────────────────────────
// Fase 27e-1: primera vez que "Nueva transferencia" tiene un diálogo de alta
// real (antes el botón estaba permanentemente deshabilitado). A diferencia
// del resto de los diálogos de este archivo, onSave es ASYNC -- el alta pasa
// por la RPC `crear_transferencia` (movimiento de stock atómico en el
// servidor, ver migración 0073), que puede rechazar la operación (ej. "no
// hay stock suficiente en el local de origen"). El diálogo espera esa
// respuesta y muestra el error sin cerrarse si algo falla.

interface LineaTransferenciaForm {
  key: string
  itemTipo: 'producto' | 'insumo'
  itemId: string
  varianteId: string
  cantidad: number
}

interface TransferenciaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Puntos de venta activos del cliente (2+ siempre, si no esta pantalla no
   * se muestra -- ver Transferencias.tsx). */
  puntosVenta: { id: string; alias: string }[]
  productos: Producto[]
  insumos: Insumo[]
  /** Devuelve un mensaje de error si la RPC rechazó la transferencia, o
   * `null` si se creó bien (el diálogo se cierra solo en ese caso). */
  onSave: (data: {
    fecha: string
    origenPuntoVentaId: string
    destinoPuntoVentaId: string
    notas: string
    lineas: { itemTipo: 'producto' | 'insumo'; itemId: string; varianteId?: string; cantidad: number }[]
  }) => Promise<string | null>
}

export function TransferenciaDialog({
  open,
  onOpenChange,
  puntosVenta,
  productos,
  insumos,
  onSave,
}: TransferenciaDialogProps) {
  const [fecha, setFecha] = useState(todayISO())
  const [origenId, setOrigenId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState<LineaTransferenciaForm[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setFecha(todayISO())
      setOrigenId(puntosVenta[0]?.id ?? '')
      setDestinoId(puntosVenta[1]?.id ?? '')
      setNotas('')
      setLineas([])
      setGuardando(false)
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function addLinea() {
    setLineas((prev) => [
      ...prev,
      { key: `${Date.now()}-${Math.random()}`, itemTipo: 'producto', itemId: '', varianteId: '', cantidad: 0 },
    ])
  }

  function updateLinea(index: number, updates: Partial<LineaTransferenciaForm>) {
    setLineas((prev) => prev.map((l, i) => (i === index ? { ...l, ...updates } : l)))
  }

  function removeLinea(index: number) {
    setLineas((prev) => prev.filter((_, i) => i !== index))
  }

  function lineaValida(l: LineaTransferenciaForm): boolean {
    if (!l.itemId || l.cantidad <= 0) return false
    if (l.itemTipo === 'producto') {
      const producto = productos.find((p) => p.id === l.itemId)
      if (producto?.tipo === 'con_variantes' && !l.varianteId) return false
    }
    return true
  }

  const lineasValidas = lineas.filter(lineaValida)
  const puedeGuardar =
    !guardando && origenId && destinoId && origenId !== destinoId && lineasValidas.length > 0

  async function handleSave() {
    if (!puedeGuardar) return
    setGuardando(true)
    setError('')
    const errorRpc = await onSave({
      fecha,
      origenPuntoVentaId: origenId,
      destinoPuntoVentaId: destinoId,
      notas,
      lineas: lineasValidas.map((l) => ({
        itemTipo: l.itemTipo,
        itemId: l.itemId,
        varianteId: l.varianteId || undefined,
        cantidad: l.cantidad,
      })),
    })
    setGuardando(false)
    if (errorRpc) {
      setError(errorRpc)
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva transferencia entre locales</DialogTitle>
          <DialogDescription>
            Mueve stock real de un local a otro. Se descuenta del origen y se suma al destino al
            momento de guardar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Fecha</label>
              <input className={inputClass} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Local origen</label>
              <select className={inputClass} value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {puntosVenta.map((pv) => (
                  <option key={pv.id} value={pv.id}>
                    {pv.alias}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Local destino</label>
              <select className={inputClass} value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {puntosVenta.map((pv) => (
                  <option key={pv.id} value={pv.id}>
                    {pv.alias}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {origenId && destinoId && origenId === destinoId && (
            <p className="text-xs text-red-500">El local de origen y destino no pueden ser el mismo.</p>
          )}

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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Ítems a transferir</label>
              <Button variant="outline" size="sm" onClick={addLinea}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar ítem
              </Button>
            </div>

            {lineas.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                No hay ítems. Agrega al menos uno.
              </p>
            )}

            {lineas.map((linea, idx) => {
              const itemsDisponibles = linea.itemTipo === 'producto' ? productos : insumos
              const productoSeleccionado =
                linea.itemTipo === 'producto' ? productos.find((p) => p.id === linea.itemId) : undefined
              const tieneVariantes = productoSeleccionado?.tipo === 'con_variantes'

              return (
                <div key={linea.key} className="grid gap-2 rounded-md border p-2">
                  <div className="grid grid-cols-[110px_1fr_100px_36px] gap-2 items-end">
                    <div className="grid gap-1">
                      <label className="text-xs text-muted-foreground">Tipo</label>
                      <select
                        className={inputClass}
                        value={linea.itemTipo}
                        onChange={(e) =>
                          updateLinea(idx, { itemTipo: e.target.value as 'producto' | 'insumo', itemId: '', varianteId: '' })
                        }
                      >
                        <option value="producto">Producto</option>
                        <option value="insumo">Insumo</option>
                      </select>
                    </div>

                    <div className="grid gap-1">
                      <label className="text-xs text-muted-foreground">Item</label>
                      <select
                        className={inputClass}
                        value={linea.itemId}
                        onChange={(e) => updateLinea(idx, { itemId: e.target.value, varianteId: '' })}
                      >
                        <option value="">Seleccionar...</option>
                        {itemsDisponibles.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-1">
                      <label className="text-xs text-muted-foreground">Cantidad</label>
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        step={0.01}
                        value={linea.cantidad || ''}
                        onChange={(e) => updateLinea(idx, { cantidad: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-red-500"
                      onClick={() => removeLinea(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {tieneVariantes && (
                    <div className="grid gap-1 max-w-xs">
                      <label className="text-xs text-muted-foreground">Variante (color / talle) *</label>
                      <select
                        className={inputClass}
                        value={linea.varianteId}
                        onChange={(e) => updateLinea(idx, { varianteId: e.target.value })}
                      >
                        <option value="">Seleccionar...</option>
                        {productoSeleccionado!.variantes.map((v) => (
                          <option key={v.id} value={v.id}>
                            {[v.color, v.talle].filter(Boolean).join(' / ') || '(sin nombre)'}
                          </option>
                        ))}
                      </select>
                      {!linea.varianteId && (
                        <p className="text-xs text-red-500">Elegí la variante antes de guardar.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!puedeGuardar}>
            {guardando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Crear transferencia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── AjusteStockDialog ────────────────────────────────────────────────────────
// Usado solo para Insumos (Insumos.tsx) -- los productos con variantes se
// ajustan desde la página Stock, que maneja su propio selector de variante.

interface AjusteStockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: {
    cantidad: number
    motivo: MotivoAjuste
    nota: string
  }) => Promise<string | void>
  item: { id: string; nombre: string; stock: number; tipo: 'producto' | 'insumo' }
}

export function AjusteStockDialog({
  open,
  onOpenChange,
  onSave,
  item,
}: AjusteStockDialogProps) {
  const [cantidad, setCantidad] = useState(0)
  const [cantidadTexto, setCantidadTexto] = useState('')
  const [motivo, setMotivo] = useState<MotivoAjuste>('conteo_fisico')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')

  useEffect(() => {
    if (open) {
      setCantidad(0)
      setCantidadTexto('')
      setMotivo('conteo_fisico')
      setNota('')
      setGuardando(false)
      setErrorGuardado('')
    }
  }, [open])

  const nuevoStock = item.stock + cantidad

  async function handleSave() {
    if (cantidad === 0 || guardando) return
    setErrorGuardado('')
    setGuardando(true)
    const error = await onSave({ cantidad, motivo, nota })
    setGuardando(false)
    if (error) {
      setErrorGuardado(error)
      return
    }
    onOpenChange(false)
  }

  function handleCantidadTexto(raw: string) {
    const texto = sanitizarDecimalConSigno(raw)
    setCantidadTexto(texto)
    setCantidad(parsearDecimal(texto))
  }

  // Completa la Cantidad con el negativo EXACTO del stock actual -- para
  // casos como residuos de coma flotante (ej. 1.249999999999997 en vez de
  // 1.25, que se van acumulando con restas sucesivas) donde tipear el
  // ajuste a mano es tedioso y fácil de errar un dígito. Usa item.stock
  // directo (no lo que esté tipeado en el texto), así resta ese mismo
  // número consigo mismo y el resultado da 0 exacto, sin importar cuántos
  // decimales de basura tenga.
  function handleLlevarACero() {
    const cant = -item.stock
    setCantidad(cant)
    setCantidadTexto(decimalATexto(cant))
    setMotivo('conteo_fisico')
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
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Stock actual</span>
              <div className="flex items-center gap-3">
                <span className="font-medium">{item.stock}</span>
                {item.stock !== 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleLlevarACero}
                  >
                    Llevar a 0
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Cantidad */}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">
              Cantidad (positivo = ingreso, negativo = egreso)
            </label>
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              value={cantidadTexto}
              onChange={(e) => handleCantidadTexto(e.target.value)}
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

          {errorGuardado && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {errorGuardado}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={cantidad === 0 || guardando}>
            {guardando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Aplicar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
