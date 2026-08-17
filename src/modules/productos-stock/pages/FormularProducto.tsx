'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus,
  Trash2,
  FlaskConical,
  Save,
  PackageOpen,
  Wrench,
  Cog,
  Factory,
  Search,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useProductosStock,
  crearProductoConfirmado,
  guardarFormulaConfirmada,
  actualizarProductoConfirmado,
} from '../data/store'
import { useClienteActual } from '@/hooks/useClienteActual'
import { Amount, EmptyState } from '../components/productos/display'
import { ProductoDialog } from '../components/productos/dialogs'
import { formatARS } from '../lib/format'
import { sanitizarDecimal, parsearDecimal, decimalATexto } from '@/lib/decimal'
import {
  UNIDADES,
  unidadAbrev,
  unidadLabel,
  type UnidadMedida,
  type TipoLineaFormula,
  type LineaFormula,
  type Formula,
  type Producto,
} from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm'

// Este id se usa tanto de key de React como, al guardar, de id real de la
// fila en la tabla `formula_lineas` de Supabase (columna tipo uuid). El
// formato anterior (`line-<timestamp>-<seq>-<random>`) no era un UUID
// válido: el INSERT fallaba en silencio (error 22P02) y la fórmula se
// guardaba sin ninguna de sus líneas. crypto.randomUUID() es válido para
// ambos usos.
function lineUid(): string {
  return crypto.randomUUID()
}

// ─── Local state types ────────────────────────────────────────────────────────

interface LocalLinea {
  id: string
  tipo: TipoLineaFormula
  insumoId: string
  descripcion: string
  cantidad: number
  unidad: UnidadMedida
  costoUnitario: number
  /** Buffers de texto (ver @/lib/decimal) -- aceptan coma decimal sin
   * perderla mientras el usuario todavía está escribiendo. */
  cantidadTexto: string
  costoUnitarioTexto: string
}

interface FormulaLocal {
  cantidadProducida: number
  cantidadProducidaTexto: string
  unidadProducida: UnidadMedida
  lineas: LocalLinea[]
  notas: string
  /** Fase 9: % de merma de proceso (informativo, ver comentario en types/index.ts). */
  mermaPorcentaje: number
  mermaPorcentajeTexto: string
}

function emptyFormula(): FormulaLocal {
  return {
    cantidadProducida: 1,
    cantidadProducidaTexto: '1',
    unidadProducida: 'unidad',
    lineas: [],
    notas: '',
    mermaPorcentaje: 0,
    mermaPorcentajeTexto: '',
  }
}

function formulaToLocal(f: Formula): FormulaLocal {
  return {
    cantidadProducida: f.cantidadProducida,
    cantidadProducidaTexto: decimalATexto(f.cantidadProducida) || String(f.cantidadProducida),
    unidadProducida: f.unidadProducida,
    lineas: f.lineas.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      insumoId: l.insumoId ?? '',
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad,
      costoUnitario: l.costoUnitario,
      cantidadTexto: decimalATexto(l.cantidad),
      costoUnitarioTexto: decimalATexto(l.costoUnitario),
    })),
    notas: f.notas,
    mermaPorcentaje: f.mermaPorcentaje ?? 0,
    mermaPorcentajeTexto: decimalATexto(f.mermaPorcentaje ?? 0),
  }
}

// ─── Buscador de insumo (combobox) ────────────────────────────────────────────
// Reemplaza el <select> nativo de la línea de insumo -- con 876 insumos
// cargados (caso Punto Tex), un <select> solo permite saltar por la
// primera letra tipeada, no filtrar. Este combobox filtra a medida que se
// escribe (mismo criterio de búsqueda "includes" que ya usa el buscador de
// catálogo en Ventas), y sí cierra al hacer click afuera -- algo que ese
// patrón de Ventas no maneja hoy.
//
// FIX (17/08, reporte de Carlos): la primera versión renderizaba el
// desplegable como <div absolute> DENTRO de la fila de la tabla. La tabla
// de la sección vive dentro de un contenedor con overflow-x-auto (para
// poder scrollear en pantallas chicas) -- y por regla de CSS, si
// overflow-x no es "visible" el overflow-y calculado pasa a "auto"
// aunque no se haya pedido, aunque no se pidiera explícitamente. Eso
// convierte a ese contenedor en un contexto de recorte/scroll, así que el
// desplegable (que se dibuja MÁS ABAJO del input) quedaba cortado por ese
// borde -- a veces invisible, a veces una tira angosta con su propia
// barra de scroll interna, dependiendo de dónde caía el corte. Es
// exactamente el "problema de vista y barras de desplazamiento" que
// reportó. Fix: el desplegable ahora se renderiza con un Portal
// directamente en <body> y se posiciona con position:fixed calculado
// desde getBoundingClientRect() del input -- así queda completamente
// afuera del contenedor con scroll y no lo puede recortar.
// También se agrega manejo de Enter (selecciona el primer resultado
// filtrado) y Escape (cierra), que antes no hacían nada.

interface InsumoOpcion {
  id: string
  nombre: string
  costo: number
  unidad: UnidadMedida
}

interface InsumoComboboxProps {
  value: string
  options: InsumoOpcion[]
  onSelect: (insumo: InsumoOpcion) => void
}

function InsumoCombobox({ value, options, onSelect }: InsumoComboboxProps) {
  const seleccionado = options.find((o) => o.id === value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const actualizarPosicion = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) })
  }, [])

  useEffect(() => {
    if (!open) return
    actualizarPosicion()
    // Recalcula si se scrollea (la tabla o la página) o se redimensiona la
    // ventana -- el portal está fijo en pantalla, no sigue al input solo.
    window.addEventListener('scroll', actualizarPosicion, true)
    window.addEventListener('resize', actualizarPosicion)
    return () => {
      window.removeEventListener('scroll', actualizarPosicion, true)
      window.removeEventListener('resize', actualizarPosicion)
    }
  }, [open, actualizarPosicion])

  useEffect(() => {
    function handleClickFuera(e: MouseEvent) {
      const target = e.target as Node
      const dentroInput = inputRef.current?.contains(target)
      const dentroDropdown = dropdownRef.current?.contains(target)
      if (!dentroInput && !dentroDropdown) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickFuera)
    return () => document.removeEventListener('mousedown', handleClickFuera)
  }, [])

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q ? options.filter((o) => o.nombre.toLowerCase().includes(q)) : options
    return base.slice(0, 40)
  }, [query, options])

  function seleccionar(o: InsumoOpcion) {
    onSelect(o)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        className={cn(inputClass, 'text-xs pl-6')}
        value={open ? query : (seleccionado?.nombre ?? '')}
        placeholder="Buscar insumo..."
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (filtradas.length > 0) seleccionar(filtradas[0])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open &&
        rect &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-50 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-lg"
            style={{ top: rect.top, left: rect.left, width: rect.width }}
          >
            {filtradas.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
            ) : (
              filtradas.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
                  onClick={() => seleccionar(o)}
                >
                  <span className="truncate">{o.nombre}</span>
                  <span className="shrink-0 text-muted-foreground">{formatARS(o.costo)}</span>
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

// ─── Buscador de producto (combobox) ──────────────────────────────────────────
// A pedido de Carlos (18/08): el selector de "Producto:" de esta pantalla
// era un <select> nativo -- con el catálogo grande (Gla & Co., Punto Tex)
// se volvía una lista larguísima para recorrer a ciegas. Mismo patrón que
// InsumoCombobox de arriba (portal + position:fixed, filtra a medida que
// se escribe), aplicado acá para que buscar un producto se sienta igual
// que el buscador de la pestaña Productos.

interface ProductoOpcion {
  id: string
  nombre: string
  codigo: string
}

interface ProductoComboboxProps {
  value: string
  options: ProductoOpcion[]
  onSelect: (producto: ProductoOpcion) => void
}

function ProductoCombobox({ value, options, onSelect }: ProductoComboboxProps) {
  const seleccionado = options.find((o) => o.id === value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const actualizarPosicion = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 260) })
  }, [])

  useEffect(() => {
    if (!open) return
    actualizarPosicion()
    window.addEventListener('scroll', actualizarPosicion, true)
    window.addEventListener('resize', actualizarPosicion)
    return () => {
      window.removeEventListener('scroll', actualizarPosicion, true)
      window.removeEventListener('resize', actualizarPosicion)
    }
  }, [open, actualizarPosicion])

  useEffect(() => {
    function handleClickFuera(e: MouseEvent) {
      const target = e.target as Node
      const dentroInput = inputRef.current?.contains(target)
      const dentroDropdown = dropdownRef.current?.contains(target)
      if (!dentroInput && !dentroDropdown) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickFuera)
    return () => document.removeEventListener('mousedown', handleClickFuera)
  }, [])

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? options.filter(
          (o) => o.nombre.toLowerCase().includes(q) || o.codigo.toLowerCase().includes(q),
        )
      : options
    return base.slice(0, 40)
  }, [query, options])

  function seleccionar(o: ProductoOpcion) {
    onSelect(o)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative flex-1 sm:max-w-sm">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        className={cn(inputClass, 'pl-7')}
        value={open ? query : seleccionado ? `${seleccionado.nombre} (${seleccionado.codigo})` : ''}
        placeholder="Buscar producto por nombre o código..."
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (filtradas.length > 0) seleccionar(filtradas[0])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open &&
        rect &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-50 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-lg"
            style={{ top: rect.top, left: rect.left, width: rect.width }}
          >
            {filtradas.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
            ) : (
              filtradas.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => seleccionar(o)}
                >
                  <span className="truncate">{o.nombre}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{o.codigo}</span>
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

// ─── Section table component ──────────────────────────────────────────────────

interface SectionProps {
  title: string
  icon: React.ElementType
  tipo: TipoLineaFormula
  lineas: LocalLinea[]
  insumosOptions?: { id: string; nombre: string; costo: number; unidad: UnidadMedida }[]
  onAddLine: (tipo: TipoLineaFormula) => void
  onUpdateLine: (id: string, updates: Partial<LocalLinea>) => void
  onDeleteLine: (id: string) => void
  subtotal: number
}

function FormulaSection({
  title,
  icon: Icon,
  tipo,
  lineas,
  insumosOptions,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  subtotal,
}: SectionProps) {
  const isInsumo = tipo === 'insumo'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">{title}</h4>
        </div>
        <Button variant="outline" size="sm" onClick={() => onAddLine(tipo)}>
          <Plus className="h-4 w-4 mr-1" />
          Agregar
        </Button>
      </div>

      {lineas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
          Sin lineas. Agrega al menos una.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">
                  {isInsumo ? 'Insumo' : 'Descripcion'}
                </th>
                <th className="px-3 py-2 font-medium text-right w-24">Cantidad</th>
                <th className="px-3 py-2 font-medium w-28">Unidad</th>
                <th className="px-3 py-2 font-medium text-right w-32">Costo unit.</th>
                <th className="px-3 py-2 font-medium text-right w-32">Subtotal</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    {isInsumo ? (
                      <InsumoCombobox
                        value={l.insumoId}
                        options={insumosOptions ?? []}
                        onSelect={(insumo) =>
                          onUpdateLine(l.id, {
                            insumoId: insumo.id,
                            costoUnitario: insumo.costo,
                            costoUnitarioTexto: decimalATexto(insumo.costo),
                            unidad: insumo.unidad,
                            descripcion: insumo.nombre,
                          })
                        }
                      />
                    ) : (
                      <input
                        className={cn(inputClass, 'text-xs')}
                        value={l.descripcion}
                        onChange={(e) =>
                          onUpdateLine(l.id, { descripcion: e.target.value })
                        }
                        placeholder={
                          tipo === 'mano_de_obra'
                            ? 'Ej: Operario armado'
                            : 'Ej: Electricidad'
                        }
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={cn(inputClass, 'text-xs text-right')}
                      type="text"
                      inputMode="decimal"
                      value={l.cantidadTexto}
                      onChange={(e) => {
                        const texto = sanitizarDecimal(e.target.value)
                        onUpdateLine(l.id, { cantidadTexto: texto, cantidad: parsearDecimal(texto) })
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={cn(inputClass, 'text-xs')}
                      value={l.unidad}
                      onChange={(e) =>
                        onUpdateLine(l.id, {
                          unidad: e.target.value as UnidadMedida,
                        })
                      }
                    >
                      {UNIDADES.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={cn(inputClass, 'text-xs text-right')}
                      type="text"
                      inputMode="decimal"
                      value={l.costoUnitarioTexto}
                      onChange={(e) => {
                        const texto = sanitizarDecimal(e.target.value)
                        onUpdateLine(l.id, { costoUnitarioTexto: texto, costoUnitario: parsearDecimal(texto) })
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {formatARS(l.cantidad * l.costoUnitario)}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-500"
                      onClick={() => onDeleteLine(l.id)}
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

      {/* Section subtotal */}
      <div className="flex justify-end pr-12">
        <span className="text-xs text-muted-foreground mr-2">Subtotal:</span>
        <span className="text-sm font-semibold tabular-nums">{formatARS(subtotal)}</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FormularProducto() {
  const { state, dispatch } = useProductosStock()
  const { cliente } = useClienteActual()
  const { pathname, search } = useLocation()
  const base = pathname.match(/^(\/m\/[^/]+)/)?.[1] ?? ''

  const [selectedProductoId, setSelectedProductoId] = useState('')
  const [formula, setFormula] = useState<FormulaLocal | null>(null)
  const [dirty, setDirty] = useState(false)

  // Guardado confirmado (17/08): a diferencia del resto del store
  // (optimista -- ver comentario grande en data/store.tsx junto a
  // crearProductoConfirmado/guardarFormulaConfirmada), acá se espera la
  // confirmación real de Supabase antes de tocar el estado local, porque
  // este es exactamente el punto donde Carlos vio productos y una fórmula
  // completa desaparecer sin aviso. El alta de producto nuevo delega su
  // guardando/error al propio ProductoDialog (mismo contrato que
  // TransferenciaDialog: onSave devuelve un string de error o nada); acá
  // solo hace falta el estado para el guardado de la Fórmula en sí.
  const [guardandoFormula, setGuardandoFormula] = useState(false)
  const [errorFormula, setErrorFormula] = useState<string | null>(null)

  // Precio de venta automático por margen (17/08, a pedido de Carlos): en vez
  // de tener que ir a Productos a cargar el Precio venta a mano después de
  // armar la fórmula, acá se puede calcular como costo * (1 + margen / 100)
  // o cargarlo manual. Se guarda en Producto.margenGanancia -- ver
  // comentario en types/index.ts.
  const [modoPrecio, setModoPrecio] = useState<'margen' | 'manual'>('margen')
  const [margenTexto, setMargenTexto] = useState('30')
  const [precioManualTexto, setPrecioManualTexto] = useState('')

  // Auto-seleccionar producto vía ?productoId=... -- lo usa el link "Ir a
  // Formular Producto" del banner de bloqueo de Costo en ProductoDialog
  // (ver Productos.tsx), para caer directo sobre la fórmula correcta en vez
  // de tener que buscarlo de nuevo en el desplegable.
  const productoIdPreseleccionado = useRef<string | null>(
    new URLSearchParams(search).get('productoId'),
  )
  useEffect(() => {
    const id = productoIdPreseleccionado.current
    if (id && state.productos.some((p) => p.id === id)) {
      productoIdPreseleccionado.current = null
      handleProductoChange(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.productos])

  // Alta de producto nuevo directamente desde esta pantalla, sin tener que
  // ir primero a la pestaña "Productos". Reutiliza el mismo ProductoDialog
  // que usa esa pestaña (mismos catálogos, misma acción ADD_PRODUCTO) para
  // no duplicar el formulario. Al guardar, se auto-selecciona el producto
  // recién creado para que el usuario caiga directo en "Crear formula".
  const [nuevoProductoOpen, setNuevoProductoOpen] = useState(false)
  const productosLengthAntesDeCrear = useRef<number | null>(null)

  // Find existing formula for selected product
  const existingFormula = useMemo(
    () => state.formulas.find((f) => f.productoId === selectedProductoId) ?? null,
    [state.formulas, selectedProductoId],
  )

  const selectedProducto = useMemo(
    () => state.productos.find((p) => p.id === selectedProductoId) ?? null,
    [state.productos, selectedProductoId],
  )

  // Insumos options for dropdown
  const insumosOptions = useMemo(
    () =>
      state.insumos.map((i) => ({
        id: i.id,
        nombre: i.nombre,
        costo: i.costo,
        unidad: i.unidad,
      })),
    [state.insumos],
  )

  // When product changes, load existing formula or reset
  function handleProductoChange(prodId: string) {
    setSelectedProductoId(prodId)
    const existing = state.formulas.find((f) => f.productoId === prodId)
    if (existing) {
      setFormula(formulaToLocal(existing))
    } else {
      setFormula(null)
    }
    setDirty(false)

    // Precarga el bloque de Precio de venta con lo que ya tenga guardado el
    // producto (si venía en modo margen, mantiene el % elegido).
    const producto = state.productos.find((p) => p.id === prodId)
    if (producto?.margenGanancia != null) {
      setModoPrecio('margen')
      setMargenTexto(decimalATexto(producto.margenGanancia))
    } else {
      setModoPrecio('manual')
      setMargenTexto('30')
    }
    setPrecioManualTexto(producto ? decimalATexto(producto.precioVenta) : '')
  }

  function handleCrearFormula() {
    setFormula(emptyFormula())
    setDirty(true)
  }

  function handleAbrirNuevoProducto() {
    productosLengthAntesDeCrear.current = state.productos.length
    setNuevoProductoOpen(true)
  }

  // Fix (17/08): antes esto era un simple dispatch({type:'ADD_PRODUCTO'}) --
  // optimista, sin esperar confirmación de Supabase. Así fue como "Cortina
  // generica" y otro producto de prueba de Carlos quedaron mostrados en
  // pantalla pero nunca llegaron a la base; al refrescar, desaparecieron
  // sin aviso. Ahora espera la respuesta real antes de tocar el estado
  // local -- devuelve el mensaje de error (mismo contrato que ya usa
  // TransferenciaDialog) para que ProductoDialog lo muestre y NO se
  // cierre solo si algo falla.
  async function handleGuardarNuevoProducto(
    data: Omit<Producto, 'id' | 'stock' | 'createdAt' | 'tieneFormula'>,
  ): Promise<string | void> {
    if (!cliente?.id) return 'No se pudo identificar la cuenta -- probá recargar la página.'
    const res = await crearProductoConfirmado({ ...data, stock: 0, tieneFormula: false }, cliente.id)
    if (!res.ok) return res.error
    dispatch({ type: 'CONFIRM_PRODUCTO', payload: res.data })
  }

  // CONFIRM_PRODUCTO agrega el producto nuevo al final de state.productos
  // (mismo comportamiento de "upsert al final" que tenía ADD_PRODUCTO -- ver
  // reducer en data/store.tsx). En cuanto el array crece respecto de la
  // longitud registrada al abrir el diálogo, el último elemento es el
  // producto recién creado -- se selecciona automáticamente.
  useEffect(() => {
    if (
      productosLengthAntesDeCrear.current !== null &&
      state.productos.length > productosLengthAntesDeCrear.current
    ) {
      const nuevo = state.productos[state.productos.length - 1]
      productosLengthAntesDeCrear.current = null
      handleProductoChange(nuevo.id)
    }
  }, [state.productos])

  // Line operations
  //
  // IMPORTANTE: estas tres funciones usan la forma funcional de setFormula
  // (setFormula(prev => ...)) en vez de leer `formula` directamente del
  // closure. Con clicks rápidos y consecutivos en "Agregar" (o ediciones
  // rápidas), React puede procesar varias llamadas a setFormula antes de
  // volver a renderizar; si cada llamada arma el nuevo estado a partir de la
  // variable `formula` capturada en el render viejo, cada actualización pisa
  // a la anterior en vez de acumularse — el resultado son líneas duplicadas,
  // líneas fantasma sin insumo, o clicks que no agregan nada. Usando `prev`
  // cada actualización parte siempre del estado más reciente, sin importar
  // cuántos clicks lleguen seguidos.
  function addLine(tipo: TipoLineaFormula) {
    setFormula((prev) => {
      if (!prev) return prev
      const newLine: LocalLinea = {
        id: lineUid(),
        tipo,
        insumoId: '',
        descripcion: '',
        cantidad: 0,
        unidad: tipo === 'mano_de_obra' ? 'hora' : 'unidad',
        costoUnitario: 0,
        cantidadTexto: '',
        costoUnitarioTexto: '',
      }
      return { ...prev, lineas: [...prev.lineas, newLine] }
    })
    setDirty(true)
  }

  function updateLine(id: string, updates: Partial<LocalLinea>) {
    setFormula((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        lineas: prev.lineas.map((l) => (l.id === id ? { ...l, ...updates } : l)),
      }
    })
    setDirty(true)
  }

  function deleteLine(id: string) {
    setFormula((prev) => {
      if (!prev) return prev
      return { ...prev, lineas: prev.lineas.filter((l) => l.id !== id) }
    })
    setDirty(true)
  }

  // Cost calculations
  const costos = useMemo(() => {
    if (!formula) return { insumos: 0, manoDeObra: 0, operativos: 0, total: 0, unitario: 0 }

    let insumos = 0
    let manoDeObra = 0
    let operativos = 0

    for (const l of formula.lineas) {
      const sub = l.cantidad * l.costoUnitario
      if (l.tipo === 'insumo') insumos += sub
      else if (l.tipo === 'mano_de_obra') manoDeObra += sub
      else operativos += sub
    }

    const total = insumos + manoDeObra + operativos
    const unitario =
      formula.cantidadProducida > 0
        ? total / formula.cantidadProducida
        : total

    return { insumos, manoDeObra, operativos, total, unitario }
  }, [formula])

  // Precio de venta sugerido/manual (ver comentario en el useState de
  // modoPrecio más arriba).
  const margenNum = parsearDecimal(margenTexto) ?? 0
  const precioCalculado = useMemo(() => {
    if (modoPrecio === 'margen') {
      return Math.round(costos.unitario * (1 + margenNum / 100) * 100) / 100
    }
    return Math.round((parsearDecimal(precioManualTexto) ?? 0) * 100) / 100
  }, [modoPrecio, margenNum, precioManualTexto, costos.unitario])

  // Margin
  const margen = useMemo(() => {
    if (!selectedProducto || costos.unitario === 0) return null
    const pv = selectedProducto.precioVenta
    if (pv === 0) return null
    return ((pv - costos.unitario) / pv) * 100
  }, [selectedProducto, costos.unitario])

  // Save (guardado confirmado, 17/08 -- ver comentario grande junto a los
  // estados guardandoFormula/errorFormula más arriba). Antes esto era un
  // par de dispatch() optimistas (ADD_FORMULA/UPDATE_FORMULA +
  // UPDATE_PRODUCTO) que actualizaban la pantalla sin esperar la escritura
  // real en Supabase. Así fue como la fórmula de "Cortina Edgy" se vio
  // guardada en pantalla pero nunca llegó a la base (rechazada con FK
  // violation contra un producto que tampoco se había persistido), y el
  // costo/precio quedaron en 0 sin ningún aviso. Ahora se espera la
  // confirmación real de cada escritura, en orden, y se corta con un error
  // visible si algo falla -- sin marcar el formulario como guardado.
  async function handleSave() {
    if (!formula || !selectedProductoId) return
    if (guardandoFormula) return
    if (!cliente?.id) {
      setErrorFormula('No se pudo identificar la cuenta -- probá recargar la página.')
      return
    }

    const lineas: LineaFormula[] = formula.lineas.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      insumoId: l.tipo === 'insumo' ? l.insumoId || undefined : undefined,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad,
      costoUnitario: l.costoUnitario,
    }))

    setGuardandoFormula(true)
    setErrorFormula(null)

    const resFormula = await guardarFormulaConfirmada(
      {
        id: existingFormula?.id,
        productoId: selectedProductoId,
        cantidadProducida: formula.cantidadProducida,
        unidadProducida: formula.unidadProducida,
        lineas,
        notas: formula.notas,
        mermaPorcentaje: formula.mermaPorcentaje,
        createdAt: existingFormula?.createdAt,
      },
      cliente.id,
    )

    if (!resFormula.ok) {
      setGuardandoFormula(false)
      setErrorFormula(`No se pudo guardar la fórmula: ${resFormula.error}`)
      return
    }
    dispatch({ type: 'CONFIRM_FORMULA', payload: resFormula.data })

    // Sincroniza el costo calculado (insumos + mano de obra + costos
    // operativos, prorrateado por cantidadProducida) hacia la ficha del
    // Producto -- a pedido explícito de Carlos (16/08): "necesito que
    // escriba el total... en el costo de la ficha del producto, ya que eso
    // es la composición del precio". El campo Costo se bloquea del lado de
    // ProductoDialog (ver dialogs.tsx) cuando el producto tiene una fórmula
    // real, justamente para que este valor no se pise a mano en silencio.
    if (selectedProducto) {
      const costoRedondeado = Math.round(costos.unitario * 100) / 100
      const cambios: Partial<Producto> = {}
      if (costoRedondeado !== selectedProducto.costo || !selectedProducto.tieneFormula) {
        cambios.costo = costoRedondeado
        cambios.tieneFormula = true
      }

      // Precio de venta: en modo margen se recalcula (costo * (1 + % / 100))
      // y se guarda el % elegido para la próxima vez; en modo manual se
      // toma el valor tipeado y se limpia el margen (para no dejar un %
      // viejo dando vueltas si después vuelve a modo margen). A pedido de
      // Carlos (17/08): "resultaría mas amigable poder... agregarle un
      // porcentaje de Ganancia... o ingresarlo manualmente".
      const nuevoMargen = modoPrecio === 'margen' ? margenNum : undefined
      if (precioCalculado !== selectedProducto.precioVenta) {
        cambios.precioVenta = precioCalculado
      }
      if (nuevoMargen !== selectedProducto.margenGanancia) {
        cambios.margenGanancia = nuevoMargen
      }

      if (Object.keys(cambios).length > 0) {
        const resProducto = await actualizarProductoConfirmado(
          { ...selectedProducto, ...cambios },
          cliente.id,
        )
        if (!resProducto.ok) {
          setGuardandoFormula(false)
          setErrorFormula(
            `La fórmula se guardó, pero no se pudo actualizar el costo/precio del producto: ${resProducto.error}`,
          )
          return
        }
        dispatch({ type: 'CONFIRM_PRODUCTO', payload: resProducto.data })
      }
    }

    setGuardandoFormula(false)
    setDirty(false)
  }

  // Separate lines by type
  const lineasInsumo = formula?.lineas.filter((l) => l.tipo === 'insumo') ?? []
  const lineasManoDeObra = formula?.lineas.filter((l) => l.tipo === 'mano_de_obra') ?? []
  const lineasOperativos = formula?.lineas.filter((l) => l.tipo === 'costo_operativo') ?? []

  return (
    <div className="space-y-6">
      {/* Product selector */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-muted-foreground" />
            <label className="text-sm font-medium">Producto:</label>
          </div>
          <ProductoCombobox
            value={selectedProductoId}
            options={state.productos.map((p) => ({ id: p.id, nombre: p.nombre, codigo: p.codigo }))}
            onSelect={(p) => handleProductoChange(p.id)}
          />

          <Button variant="outline" onClick={handleAbrirNuevoProducto}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo producto
          </Button>

          {selectedProductoId && !formula && !existingFormula && (
            <Button onClick={handleCrearFormula}>
              <Plus className="h-4 w-4 mr-1" />
              Crear formula
            </Button>
          )}
        </div>
      </div>

      {/* No product selected */}
      {!selectedProductoId && (
        <EmptyState
          icon={FlaskConical}
          title="Formular producto"
          description="Selecciona un producto para ver o crear su formula de composicion. Define insumos, mano de obra y costos operativos."
        />
      )}

      {/* Product selected but no formula */}
      {selectedProductoId && !formula && !existingFormula && (
        <EmptyState
          icon={FlaskConical}
          title="Sin formula"
          description="Este producto no tiene una formula definida. Crea una para calcular su costo de produccion automaticamente."
        >
          <Button onClick={handleCrearFormula}>
            <Plus className="h-4 w-4 mr-1" />
            Crear formula
          </Button>
        </EmptyState>
      )}

      {/* Formula editor */}
      {formula && selectedProducto && (
        <>
          {/* Header */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h3 className="text-base font-semibold">
                Formula para: {selectedProducto.nombre}
              </h3>
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground">Cantidad producida:</label>
                <input
                  className={cn(inputClass, 'w-20 text-right')}
                  type="text"
                  inputMode="decimal"
                  value={formula.cantidadProducidaTexto}
                  onChange={(e) => {
                    const texto = sanitizarDecimal(e.target.value)
                    const nuevaCantidad = parsearDecimal(texto) || 1
                    setFormula((prev) =>
                      prev ? { ...prev, cantidadProducidaTexto: texto, cantidadProducida: nuevaCantidad } : prev,
                    )
                    setDirty(true)
                  }}
                />
                <select
                  className={cn(inputClass, 'w-32')}
                  value={formula.unidadProducida}
                  onChange={(e) => {
                    const nuevaUnidad = e.target.value as UnidadMedida
                    setFormula((prev) =>
                      prev ? { ...prev, unidadProducida: nuevaUnidad } : prev,
                    )
                    setDirty(true)
                  }}
                >
                  {UNIDADES.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
                <label className="text-sm text-muted-foreground">Merma de proceso (%):</label>
                <input
                  className={cn(inputClass, 'w-20 text-right')}
                  type="text"
                  inputMode="decimal"
                  value={formula.mermaPorcentajeTexto}
                  onChange={(e) => {
                    const texto = sanitizarDecimal(e.target.value)
                    setFormula((prev) =>
                      prev ? { ...prev, mermaPorcentajeTexto: texto, mermaPorcentaje: parsearDecimal(texto) } : prev,
                    )
                    setDirty(true)
                  }}
                />
              </div>
            </div>
            {formula.mermaPorcentaje > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Con {formula.mermaPorcentaje}% de merma de proceso, la cantidad de insumos antes
                de la pérdida sería de aprox.{' '}
                <span className="font-medium">
                  {(formula.cantidadProducida / (1 - formula.mermaPorcentaje / 100)).toFixed(2)}{' '}
                  {unidadAbrev(formula.unidadProducida)}
                </span>
                . Es solo informativo, no cambia el costo calculado.
              </p>
            )}
          </div>

          {/* Section 1: Insumos / Materiales */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <FormulaSection
              title="Insumos / Materiales"
              icon={PackageOpen}
              tipo="insumo"
              lineas={lineasInsumo}
              insumosOptions={insumosOptions}
              onAddLine={addLine}
              onUpdateLine={updateLine}
              onDeleteLine={deleteLine}
              subtotal={costos.insumos}
            />
          </div>

          {/* Section 2: Mano de obra */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <FormulaSection
              title="Mano de obra"
              icon={Wrench}
              tipo="mano_de_obra"
              lineas={lineasManoDeObra}
              onAddLine={addLine}
              onUpdateLine={updateLine}
              onDeleteLine={deleteLine}
              subtotal={costos.manoDeObra}
            />
          </div>

          {/* Section 3: Costos operativos */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <FormulaSection
              title="Costos operativos"
              icon={Cog}
              tipo="costo_operativo"
              lineas={lineasOperativos}
              onAddLine={addLine}
              onUpdateLine={updateLine}
              onDeleteLine={deleteLine}
              subtotal={costos.operativos}
            />
          </div>

          {/* Cost summary */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <h4 className="text-sm font-semibold mb-4">Resumen de costos</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Insumos</span>
                <span className="tabular-nums">{formatARS(costos.insumos)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Mano de obra</span>
                <span className="tabular-nums">{formatARS(costos.manoDeObra)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Costos operativos</span>
                <span className="tabular-nums">{formatARS(costos.operativos)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm">
                <span className="font-bold">COSTO TOTAL</span>
                <span className="font-bold tabular-nums">{formatARS(costos.total)}</span>
              </div>
              {formula.cantidadProducida > 1 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Costo unitario
                  </span>
                  <span className="tabular-nums">
                    {formatARS(costos.unitario)} / {unidadAbrev(formula.unidadProducida)}
                  </span>
                </div>
              )}
              {margen !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Margen ({formatARS(selectedProducto.precioVenta)} - {formatARS(costos.unitario)}) / {formatARS(selectedProducto.precioVenta)}
                  </span>
                  <span
                    className={cn(
                      'tabular-nums font-medium',
                      margen >= 0 ? 'text-green-600' : 'text-red-600',
                    )}
                  >
                    {margen.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Precio de venta */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <h4 className="text-sm font-semibold mb-4">Precio de venta</h4>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => {
                  setModoPrecio('margen')
                  setDirty(true)
                }}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium border',
                  modoPrecio === 'margen'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground',
                )}
              >
                Por margen (%)
              </button>
              <button
                type="button"
                onClick={() => {
                  setModoPrecio('manual')
                  setDirty(true)
                }}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium border',
                  modoPrecio === 'manual'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground',
                )}
              >
                Manual
              </button>
            </div>
            {modoPrecio === 'margen' ? (
              <div className="flex items-end gap-4">
                <div className="w-32">
                  <label className="text-xs text-muted-foreground block mb-1">
                    Ganancia sobre costo
                  </label>
                  <div className="relative">
                    <input
                      className={inputClass}
                      value={margenTexto}
                      onChange={(e) => {
                        setMargenTexto(sanitizarDecimal(e.target.value))
                        setDirty(true)
                      }}
                      placeholder="30"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
                <div className="flex-1 text-right">
                  <p className="text-xs text-muted-foreground">Precio de venta sugerido</p>
                  <p className="text-lg font-bold tabular-nums">{formatARS(precioCalculado)}</p>
                </div>
              </div>
            ) : (
              <div className="w-48">
                <label className="text-xs text-muted-foreground block mb-1">
                  Precio de venta
                </label>
                <input
                  className={inputClass}
                  value={precioManualTexto}
                  onChange={(e) => {
                    setPrecioManualTexto(sanitizarDecimal(e.target.value))
                    setDirty(true)
                  }}
                  placeholder="0,00"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              Se guarda en la ficha del Producto al guardar la fórmula. En modo &quot;Por
              margen&quot;, el precio se recalcula solo la próxima vez que se guarde acá (si
              cambia el costo).
            </p>
          </div>

          {/* Notas */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <label className="text-sm font-medium mb-2 block">Notas</label>
            <textarea
              className={cn(inputClass, 'min-h-[80px] resize-y')}
              value={formula.notas}
              onChange={(e) => {
                const nuevasNotas = e.target.value
                setFormula((prev) => (prev ? { ...prev, notas: nuevasNotas } : prev))
                setDirty(true)
              }}
              placeholder="Notas sobre la formula, instrucciones de preparacion, observaciones..."
              rows={3}
            />
          </div>

          {/* Save button */}
          <div className="flex flex-col items-end gap-2">
            {errorFormula && (
              <p className="flex items-center gap-1.5 text-sm text-red-500">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {errorFormula}
              </p>
            )}
            <Button onClick={handleSave} disabled={!dirty || guardandoFormula} size="lg">
              {guardandoFormula ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {existingFormula ? 'Guardar cambios' : 'Guardar formula'}
            </Button>
          </div>

          {/* Fase 9 (cierre): "Registrar producción" se mudó a su propia
              pestaña -- más fácil de encontrar cuando ya se terminó de
              producir un lote, en vez de tener que volver a abrir esta
              fórmula puntual. Acá queda solo un puntero directo. */}
          {existingFormula && (
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Factory className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    ¿Ya produjiste un lote de {selectedProducto.nombre}? Registralo en la
                    pestaña Producción.
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link to={`${base}/produccion`}>
                    <Factory className="h-4 w-4 mr-2" />
                    Ir a Producción
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ProductoDialog
        open={nuevoProductoOpen}
        onOpenChange={setNuevoProductoOpen}
        onSave={handleGuardarNuevoProducto}
        rubros={state.rubros}
        subRubros={state.subRubros}
        productos={state.productos}
        insumos={state.insumos}
        marcas={state.marcas}
        onCrearMarca={(nombre) => dispatch({ type: 'ADD_MARCA', payload: { nombre } })}
        plantillasGarantia={state.plantillasGarantia}
      />
    </div>
  )
}
