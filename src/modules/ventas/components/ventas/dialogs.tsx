// ============================================================
// Módulo Ventas — Dialogs
// Edgy Gestión · React 19 + Radix UI + Tailwind CSS 4
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Trash2, Search, ShieldCheck, Tag, Check, Briefcase } from 'lucide-react';

import type {
  Cliente,
  TipoDocumento,
  CondicionIva,
  Comprobante,
  TipoComprobante,
  ModoEmision,
  MedioPago,
  ComprobanteItem,
  Presupuesto,
  PresupuestoItem,
  ImputacionCobro,
  Orden,
  ProveedorLogistica,
} from '../../types';

import {
  calcularSubtotalItem,
  calcularTotalConIva,
  generarId,
  TIPO_DOCUMENTO_LABEL,
  CONDICION_IVA_LABEL,
  TIPO_COMPROBANTE_LABEL,
  labelTipoComprobante,
  MEDIO_PAGO_LABEL,
  PROVEEDOR_LOGISTICA_LABEL,
  CONSUMIDOR_FINAL_ID,
  clienteConsumidorFinal,
} from '../../types';

import { formatARS, formatPct, todayISO } from '../../lib/format';
import { sanitizarDecimal, parsearDecimal } from '@/lib/decimal';
import { esCuitValido } from '@/lib/validarCuit';
import { supabase } from '@/lib/supabase';
import { useClienteActual } from '@/hooks/useClienteActual';

// ─── Shared styles ───────────────────────────────────────────

const overlayClass =
  'fixed inset-0 bg-black/50 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0';

const contentClass =
  'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto z-50';

const contentWideClass =
  'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto z-50';

const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900';
const selectClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900';
const btnPrimary =
  'px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnSecondary =
  'px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors';
const btnIcon =
  'p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors';

// ─── 1. ClienteDialog ────────────────────────────────────────

interface ClienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente?: Cliente;
  onSave: (data: Omit<Cliente, 'id' | 'saldoCuentaCorriente' | 'activo' | 'createdAt' | 'updatedAt'>) => void;
}

interface ClienteForm {
  nombre: string;
  tipoDocumento: TipoDocumento;
  documento: string;
  condicionIva: CondicionIva;
  email: string;
  telefono: string;
  direccion: string;
  localidad: string;
  provincia: string;
  categoriaId: string;
  limiteCredito: number;
  notas: string;
}

const emptyClienteForm: ClienteForm = {
  nombre: '',
  tipoDocumento: 'cuit',
  documento: '',
  condicionIva: 'consumidor_final',
  email: '',
  telefono: '',
  direccion: '',
  localidad: '',
  provincia: '',
  categoriaId: '',
  limiteCredito: 0,
  notas: '',
};

export function ClienteDialog({ open, onOpenChange, cliente, onSave }: ClienteDialogProps) {
  const [form, setForm] = useState<ClienteForm>(emptyClienteForm);
  const [errors, setErrors] = useState<Partial<Record<keyof ClienteForm, string>>>({});

  useEffect(() => {
    if (open) {
      if (cliente) {
        setForm({
          nombre: cliente.nombre,
          tipoDocumento: cliente.tipoDocumento,
          documento: cliente.documento,
          condicionIva: cliente.condicionIva,
          email: cliente.email ?? '',
          telefono: cliente.telefono ?? '',
          direccion: cliente.direccion ?? '',
          localidad: cliente.localidad ?? '',
          provincia: cliente.provincia ?? '',
          categoriaId: cliente.categoriaId ?? '',
          limiteCredito: cliente.limiteCredito,
          notas: cliente.notas ?? '',
        });
      } else {
        setForm(emptyClienteForm);
      }
      setErrors({});
    }
  }, [open, cliente]);

  const update = <K extends keyof ClienteForm>(key: K, value: ClienteForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof ClienteForm, string>> = {};
    if (!form.nombre.trim()) next.nombre = 'El nombre es obligatorio';
    if (!form.documento.trim()) next.documento = 'El documento es obligatorio';
    else if (
      (form.tipoDocumento === 'cuit' || form.tipoDocumento === 'cuil') &&
      !esCuitValido(form.documento)
    ) {
      next.documento = 'El CUIT/CUIL no es válido (dígito verificador incorrecto)';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      nombre: form.nombre.trim(),
      tipoDocumento: form.tipoDocumento,
      documento: form.documento.trim(),
      condicionIva: form.condicionIva,
      email: form.email || undefined,
      telefono: form.telefono || undefined,
      direccion: form.direccion || undefined,
      localidad: form.localidad || undefined,
      provincia: form.provincia || undefined,
      categoriaId: form.categoriaId || undefined,
      limiteCredito: form.limiteCredito,
      notas: form.notas || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              {cliente ? 'Editar cliente' : 'Nuevo cliente'}
            </Dialog.Title>
            <Dialog.Close className={btnIcon}>
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            {/* Nombre */}
            <div>
              <label className={labelClass}>Nombre *</label>
              <input
                className={inputClass}
                value={form.nombre}
                onChange={(e) => update('nombre', e.target.value)}
                placeholder="Razón social o nombre"
              />
              {errors.nombre && <p className="text-xs text-red-600 mt-1">{errors.nombre}</p>}
            </div>

            {/* Tipo documento + Documento */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Tipo doc.</label>
                <select
                  className={selectClass}
                  value={form.tipoDocumento}
                  onChange={(e) => update('tipoDocumento', e.target.value as TipoDocumento)}
                >
                  {(Object.entries(TIPO_DOCUMENTO_LABEL) as [TipoDocumento, string][]).map(
                    ([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ),
                  )}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Documento *</label>
                <input
                  className={inputClass}
                  value={form.documento}
                  onChange={(e) => update('documento', e.target.value)}
                  placeholder="Sin guiones ni puntos"
                />
                {errors.documento && <p className="text-xs text-red-600 mt-1">{errors.documento}</p>}
              </div>
            </div>

            {/* Condición IVA */}
            <div>
              <label className={labelClass}>Condición IVA</label>
              <select
                className={selectClass}
                value={form.condicionIva}
                onChange={(e) => update('condicionIva', e.target.value as CondicionIva)}
              >
                {(Object.entries(CONDICION_IVA_LABEL) as [CondicionIva, string][]).map(
                  ([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ),
                )}
              </select>
            </div>

            {/* Email + Teléfono */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Email</label>
                <input
                  className={inputClass}
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Teléfono</label>
                <input
                  className={inputClass}
                  value={form.telefono}
                  onChange={(e) => update('telefono', e.target.value)}
                />
              </div>
            </div>

            {/* Dirección */}
            <div>
              <label className={labelClass}>Dirección</label>
              <input
                className={inputClass}
                value={form.direccion}
                onChange={(e) => update('direccion', e.target.value)}
              />
            </div>

            {/* Localidad + Provincia */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Localidad</label>
                <input
                  className={inputClass}
                  value={form.localidad}
                  onChange={(e) => update('localidad', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Provincia</label>
                <input
                  className={inputClass}
                  value={form.provincia}
                  onChange={(e) => update('provincia', e.target.value)}
                />
              </div>
            </div>

            {/* Categoría + Límite crédito */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Categoría</label>
                <input
                  className={inputClass}
                  value={form.categoriaId}
                  onChange={(e) => update('categoriaId', e.target.value)}
                  placeholder="ID categoría"
                />
              </div>
              <div>
                <label className={labelClass}>Límite crédito</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input
                    className={`${inputClass} pl-6`}
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.limiteCredito}
                    onChange={(e) => update('limiteCredito', Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className={labelClass}>Notas</label>
              <textarea
                className={`${inputClass} resize-none`}
                rows={2}
                value={form.notas}
                onChange={(e) => update('notas', e.target.value)}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
            <button className={btnPrimary} onClick={handleSave}>
              Guardar
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── 2. ComprobanteDialog ────────────────────────────────────

interface ComprobanteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientes: Cliente[];
  /** Si se abre desde "Facturar" en una Comanda/Orden de venta puntual,
   * precarga cliente + items desde ahí (mismo criterio que
   * ComprobanteCompraDialog.ordenCompra en Compras). Sin esto, el modal
   * arranca en blanco (alta manual, como siempre). */
  orden?: Orden;
  /** Si se abre desde "Facturar directamente" en un Presupuesto ya
   * confirmado (estado 'enviado'), precarga cliente + items desde ahí --
   * mismo criterio que `orden` arriba, para el caso en que el operador
   * quiere pasar de presupuesto a factura sin generar una Orden en el
   * medio. Se ignora si `orden` también está presente. */
  presupuesto?: Presupuesto;
  /** "Facturar directamente" desde un Presupuesto (y "Facturar" desde una
   * Orden) solo tiene sentido como Factura -- no tiene sentido ofrecer acá
   * Nota de crédito/débito/Recibo, que son operaciones sobre un comprobante
   * ya emitido, no una forma de facturar. Con esto en true se oculta el
   * selector de Tipo (queda fijo en 'factura') y solo se deja elegir el
   * modo de emisión (Interno -- se muestra como "Nota de entrega" hasta que
   * se conecte ARCA -- o Electrónica). No hay todavía un selector de punto
   * de venta o tiqueadora fiscal por comprobante en clientes de un solo
   * local: el punto de venta sigue siendo un dato fijo de la
   * configuración ARCA de la empresa (Configuración > Empresa). En
   * clientes con 2+ puntos de venta cargados (Fase 27), sí aparece un
   * selector -- ver `puntosVenta`/`puntoVentaId` más abajo. */
  soloFactura?: boolean;
  onSave: (data: {
    tipo: TipoComprobante;
    clienteId: string;
    fecha: string;
    medioPago: MedioPago;
    modoEmision: ModoEmision;
    items: Omit<ComprobanteItem, 'id'>[];
    descuentoGeneral: number;
    /** Fase 27c: qué punto de venta (local/sucursal) emite este
     * comprobante -- undefined en clientes de un solo local. */
    puntoVentaId?: string;
  }) => void;
  modoEmisionDefault: ModoEmision;
}

interface ItemRow {
  key: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  alicuotaIva: number;
  /** Vínculo opcional al catálogo real (productos-stock) -- Fase 18 del
   * refactor. Si se deja sin vincular, la línea sigue siendo texto libre
   * como siempre (fallback manual, comportamiento default sin cambios). */
  productoId?: string;
  /** Vínculo opcional a un Combo del catálogo -- Fase 19.1. Mutuamente
   * excluyente con productoId: al facturar, esta línea descuenta stock
   * de los componentes fijos del combo (ver descontarStockVenta.ts),
   * no de un producto único. */
  comboId?: string;
  /** Vínculo opcional a un Servicio del catálogo -- Fase 40. Mutuamente
   * excluyente con productoId/comboId: no descuenta stock (Servicios no
   * tiene). Si el servicio es de tipo 'con_variantes', varianteServicioId
   * identifica cuál variante se vendió (cada variante tiene su propio
   * precio -- ver flattening en cargarCatalogo). */
  servicioId?: string;
  varianteServicioId?: string;
}

function newItemRow(): ItemRow {
  return {
    key: generarId(),
    descripcion: '',
    cantidad: 1,
    precioUnitario: 0,
    descuento: 0,
    alicuotaIva: 21,
  };
}

/** Una fila de ítem se considera incompleta si falta la descripción o el precio. */
function filaItemIncompleta(item: ItemRow): boolean {
  return !item.descripcion.trim() || item.precioUnitario <= 0;
}

/** Una fila "vacía" es la fila manual en blanco que arranca el modal (o
 * cualquier fila agregada con "+Agregar" que el operador todavía no tocó):
 * sin descripción y sin vínculo a catálogo. Al elegir un producto o combo
 * desde el buscador, esa fila se reutiliza en vez de sumar una fila nueva y
 * dejarla en blanco -- si no, esa fila vacía bloqueaba el guardado con
 * "Falta descripción y/o precio en la fila 1" hasta que el operador la
 * borrara a mano (mismo criterio que PresupuestoDialog, ver
 * filaPresupuestoVacia). */
function filaItemVacia(item: ItemRow): boolean {
  return !item.descripcion.trim() && !item.productoId && !item.comboId && !item.servicioId;
}

// Fase 18: selector de catálogo en "Nuevo comprobante" -- versión simplificada
// (sin variantes ni garantía) del mismo patrón ya usado en Punto de Venta
// (Fase 6c del refactor de Productos). El precio de cada producto se
// resuelve igual que en PuntoDeVenta.tsx: si el cliente configuró una lista
// de precio para Ventas/Facturación, se usa el override manual en
// producto_precios (si existe) o costo * (1 + %recargo); si no hay lista
// configurada, se usa precio_venta del producto (comportamiento default).
interface ProductoCatalogoItem {
  id: string;
  nombre: string;
  precioVenta: number;
  stock: number;
  controlaStock: boolean;
  /** Fase 40: Servicio asociado (ej. Instalación), si el producto tiene uno
   * cargado -- ver Producto.servicioAsociadoId. Maneja el auto-agregado o
   * la sugerencia al elegir este producto desde el buscador. */
  servicioAsociadoId?: string;
  servicioAsociadoObligatorio?: boolean;
}

// Fase 19.1: los combos también son vendibles desde acá -- no tienen stock
// propio (se descuenta el de sus componentes fijos al facturar) ni lista de
// precio (precioVenta es el precio final cargado en Productos y Stock >
// Combos). `etiqueta` es el badge opcional (Fase 19 prep) que se muestra
// junto al nombre en la sugerencia, si el combo tiene uno cargado.
interface ComboCatalogoItem {
  id: string;
  nombre: string;
  precioVenta: number;
  etiqueta?: string;
}

// Fase 40: los Servicios (módulo separado, sin stock) también son vendibles
// desde acá -- mismo criterio que Combos, pero un servicio 'con_variantes'
// no tiene un precio único (cada variante tiene el suyo), así que se
// "aplana" en cargarCatalogo: una entrada seleccionable por variante (ej.
// "Instalación - Cortina simple" / "Instalación - Cortina doble"), cada una
// con su propio varianteServicioId. Un servicio 'a_convenir' llega con
// precioVenta 0 -- el operador lo completa a mano en la fila, igual que
// cualquier línea manual.
interface ServicioCatalogoItem {
  id: string;
  varianteServicioId?: string;
  nombre: string;
  precioVenta: number;
  aConvenir: boolean;
}

type SugerenciaCatalogo =
  | { tipo: 'producto'; item: ProductoCatalogoItem }
  | { tipo: 'combo'; item: ComboCatalogoItem }
  | { tipo: 'servicio'; item: ServicioCatalogoItem };

export function ComprobanteDialog({
  open,
  onOpenChange,
  clientes,
  orden,
  presupuesto,
  soloFactura = false,
  onSave,
  modoEmisionDefault,
}: ComprobanteDialogProps) {
  const [tipo, setTipo] = useState<TipoComprobante>('factura');
  const [clienteId, setClienteId] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo');
  const [modoEmision, setModoEmision] = useState<ModoEmision>(modoEmisionDefault);
  const [items, setItems] = useState<ItemRow[]>([newItemRow()]);
  const [descuentoGeneral, setDescuentoGeneral] = useState(0);
  // Fase 27c: qué punto de venta (local/sucursal) emite este comprobante --
  // solo importa en clientes con 2+ puntos de venta cargados (ver
  // `puntosVenta.length > 1` más abajo, mismo criterio que ClienteDetalle.tsx).
  const [puntoVentaId, setPuntoVentaId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Se activa recién después del primer intento fallido de guardar: a partir
  // de ahí, las filas incompletas se resaltan en rojo en vivo a medida que
  // el usuario las va completando (o dejando incompletas).
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const itemsSectionRef = useRef<HTMLDivElement>(null);

  // Buffers de texto para Cant./Precio (Fase: quitar flechitas de
  // incremento/decremento + habilitar coma decimal desde el teclado
  // numérico) -- mismo patrón que combo-dialogs.tsx (handleCantidadFijoTexto):
  // con type="number" el navegador rechaza directamente la "," que el
  // teclado numérico produce en layout es-AR, así que estos campos pasan a
  // ser type="text" con un buffer de string propio por fila (clave =
  // item.key), separado del valor numérico real en `items`.
  const [textoCantidad, setTextoCantidad] = useState<Record<string, string>>({});
  const [textoPrecio, setTextoPrecio] = useState<Record<string, string>>({});

  // Fase 18: catálogo de productos para el buscador (ver ProductoCatalogoItem
  // arriba). Se carga solo mientras el diálogo está abierto.
  // Fase 27c: puntosVenta/puntoVentaUsuarioId vienen del mismo hook -- ya
  // se llamaba acá para el catálogo, no hace falta un import nuevo.
  const { cliente: clienteTenant, puntosVenta, puntoVentaUsuarioId } = useClienteActual();
  const [productosCatalogo, setProductosCatalogo] = useState<ProductoCatalogoItem[]>([]);
  // Fase 19.1: combos disponibles del catálogo, cargados junto con los
  // productos (misma condición `open` + cliente tenant).
  const [combosCatalogo, setCombosCatalogo] = useState<ComboCatalogoItem[]>([]);
  // Fase 40: servicios vendibles del catálogo, ya "aplanados" por variante.
  const [serviciosCatalogo, setServiciosCatalogo] = useState<ServicioCatalogoItem[]>([]);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  // Fase 40: cuando se agrega un producto con Servicio asociado no
  // obligatorio, queda acá la sugerencia para que el operador la confirme
  // con un clic (o la descarte) -- ver handleAgregarLineaCatalogo.
  const [servicioSugerido, setServicioSugerido] = useState<ServicioCatalogoItem | null>(null);

  useEffect(() => {
    if (open) {
      setTipo('factura');
      setFecha(todayISO());
      setMedioPago('efectivo');
      setModoEmision(modoEmisionDefault);
      setDescuentoGeneral(0);
      setErrors({});
      setIntentoGuardar(false);
      setBusquedaProducto('');
      setServicioSugerido(null);
      setTextoCantidad({});
      setTextoPrecio({});
      // Fase 27c: precarga el punto de venta al que está restringido el
      // usuario logueado (si tiene uno); si tiene acceso global y el
      // cliente solo tiene un local cargado, ese es el único elegible.
      // En cualquier otro caso queda en blanco y el operador elige --
      // ver `validate()` más abajo, que lo exige si hay 2+ opciones.
      setPuntoVentaId(puntoVentaUsuarioId ?? (puntosVenta.length === 1 ? puntosVenta[0].id : ''));
      if (orden) {
        // Fase 22f: si el cliente de la orden no tiene un Cliente formal
        // vinculado (pedido de invitado/canal externo -- Ventas Online,
        // Menú QR), se prefillea "Consumidor Final" en vez de dejarlo en
        // blanco -- mismo patrón ya usado en PuntoDeVenta.tsx y
        // cerrarComandaVenta.ts -- para no bloquear el Guardar. El
        // nombre/dirección/teléfono reales de contacto se muestran aparte
        // (ver bloque debajo del selector, con orden.contactoNombre/
        // contactoTelefono/direccionEntrega).
        setClienteId(
          clientes.some((c) => c.id === orden.clienteId) ? orden.clienteId : CONSUMIDOR_FINAL_ID,
        );
        setItems(
          orden.items.length
            ? orden.items.map((it) => ({
                key: generarId(),
                descripcion: it.descripcion,
                cantidad: it.cantidad,
                precioUnitario: it.precioUnitario,
                descuento: it.descuento,
                alicuotaIva: 21,
                productoId: it.productoId,
              }))
            : [newItemRow()],
        );
      } else if (presupuesto) {
        setClienteId(clientes.some((c) => c.id === presupuesto.clienteId) ? presupuesto.clienteId : '');
        setDescuentoGeneral(presupuesto.descuentoGeneral);
        setItems(
          presupuesto.items.length
            ? presupuesto.items.map((it) => ({
                key: generarId(),
                descripcion: it.descripcion,
                cantidad: it.cantidad,
                precioUnitario: it.precioUnitario,
                descuento: it.descuento,
                alicuotaIva: 21,
                productoId: it.productoId || undefined,
              }))
            : [newItemRow()],
        );
      } else {
        setClienteId('');
        setItems([newItemRow()]);
      }
    }
  }, [open, modoEmisionDefault, orden, presupuesto, clientes, puntosVenta, puntoVentaUsuarioId]);

  useEffect(() => {
    if (!open || !clienteTenant?.id) return;
    let activo = true;
    const listaId = clienteTenant.lista_precio_ventas_id;

    async function cargarCatalogo() {
      const [productosRes, listaRes, overridesRes, combosRes, serviciosRes] = await Promise.all([
        supabase
          .from('productos')
          .select('id, nombre, precio_venta, costo, stock, controla_stock, servicio_asociado_id, servicio_asociado_obligatorio')
          .eq('cliente_id', clienteTenant!.id)
          .eq('disponible', true)
          .eq('estado', 'activo')
          .order('nombre'),
        listaId
          ? supabase.from('listas_precio').select('porcentaje_recargo').eq('id', listaId).maybeSingle()
          : Promise.resolve({ data: null } as { data: { porcentaje_recargo: number } | null }),
        listaId
          ? supabase.from('producto_precios').select('producto_id, precio').eq('lista_id', listaId)
          : Promise.resolve({ data: [] as { producto_id: string; precio: number }[] }),
        // Fase 19.1: los combos no usan lista de precio (precio_venta es el
        // precio final cargado a mano en Productos y Stock > Combos).
        supabase
          .from('combos')
          .select('id, nombre, precio_venta, etiqueta')
          .eq('cliente_id', clienteTenant!.id)
          .eq('disponible', true)
          .order('nombre'),
        // Fase 40: servicios activos del cliente -- tampoco usan lista de
        // precio (precio fijo cargado en el módulo Servicios).
        supabase
          .from('servicios')
          .select('id, titulo, tipo, modalidad_precio, precio')
          .eq('cliente_id', clienteTenant!.id)
          .eq('estado', 'activo')
          .order('titulo'),
      ]);

      if (!activo) return;

      // Fase 40: los servicios 'con_variantes' no tienen precio propio --
      // hay que traer sus variantes en una segunda consulta (no se puede
      // resolver en el Promise.all de arriba porque depende de los ids).
      const serviciosData = (serviciosRes.data ?? []) as any[];
      const idsConVariantes = serviciosData.filter((s) => s.tipo === 'con_variantes').map((s) => s.id);
      let variantesPorServicio = new Map<string, { id: string; nombre: string; modalidad_precio: string; precio: number }[]>();
      if (idsConVariantes.length > 0 && activo) {
        const variantesRes = await supabase
          .from('servicio_variantes')
          .select('id, servicio_id, nombre, modalidad_precio, precio')
          .in('servicio_id', idsConVariantes)
          .order('orden');
        if (!activo) return;
        for (const v of (variantesRes.data ?? []) as any[]) {
          const lista = variantesPorServicio.get(v.servicio_id) ?? [];
          lista.push(v);
          variantesPorServicio.set(v.servicio_id, lista);
        }
      }
      const servicios: ServicioCatalogoItem[] = [];
      for (const s of serviciosData) {
        if (s.tipo === 'con_variantes') {
          for (const v of variantesPorServicio.get(s.id) ?? []) {
            servicios.push({
              id: s.id,
              varianteServicioId: v.id,
              nombre: `${s.titulo} - ${v.nombre}`,
              precioVenta: v.modalidad_precio === 'a_convenir' ? 0 : Number(v.precio ?? 0),
              aConvenir: v.modalidad_precio === 'a_convenir',
            });
          }
        } else {
          servicios.push({
            id: s.id,
            nombre: s.titulo,
            precioVenta: s.modalidad_precio === 'a_convenir' ? 0 : Number(s.precio ?? 0),
            aConvenir: s.modalidad_precio === 'a_convenir',
          });
        }
      }
      setServiciosCatalogo(servicios);

      const porcentaje = listaRes.data ? Number(listaRes.data.porcentaje_recargo) : 0;
      const overridesPorProducto = new Map<string, number>();
      for (const o of overridesRes.data ?? []) {
        overridesPorProducto.set(o.producto_id, Number(o.precio));
      }

      setProductosCatalogo(
        ((productosRes.data ?? []) as any[]).map((p) => {
          const override = overridesPorProducto.get(p.id);
          const calculado = Number(p.costo) * (1 + porcentaje / 100);
          const precioVenta = listaId ? override ?? calculado : Number(p.precio_venta);
          return {
            id: p.id,
            nombre: p.nombre,
            precioVenta,
            stock: Number(p.stock),
            controlaStock: !!p.controla_stock,
            servicioAsociadoId: p.servicio_asociado_id ?? undefined,
            servicioAsociadoObligatorio: !!p.servicio_asociado_obligatorio,
          } as ProductoCatalogoItem;
        }),
      );

      setCombosCatalogo(
        ((combosRes.data ?? []) as any[]).map((c) => ({
          id: c.id,
          nombre: c.nombre,
          precioVenta: Number(c.precio_venta),
          etiqueta: c.etiqueta ?? undefined,
        })),
      );
    }

    cargarCatalogo();
    return () => {
      activo = false;
    };
  }, [open, clienteTenant?.id, clienteTenant?.lista_precio_ventas_id]);

  // Fase 19.1: la búsqueda ahora combina productos y combos disponibles --
  // los combos se listan primero (suelen ser la promoción que el cliente
  // quiere ofrecer activamente), hasta 8 sugerencias en total.
  const sugerenciasCatalogo = useMemo<SugerenciaCatalogo[]>(() => {
    const q = busquedaProducto.trim().toLowerCase();
    if (!q) return [];
    const combos: SugerenciaCatalogo[] = combosCatalogo
      .filter((c) => c.nombre.toLowerCase().includes(q))
      .map((item) => ({ tipo: 'combo' as const, item }));
    const servicios: SugerenciaCatalogo[] = serviciosCatalogo
      .filter((s) => s.nombre.toLowerCase().includes(q))
      .map((item) => ({ tipo: 'servicio' as const, item }));
    const productos: SugerenciaCatalogo[] = productosCatalogo
      .filter((p) => p.nombre.toLowerCase().includes(q))
      .map((item) => ({ tipo: 'producto' as const, item }));
    return [...combos, ...servicios, ...productos].slice(0, 8);
  }, [busquedaProducto, productosCatalogo, combosCatalogo, serviciosCatalogo]);

  const handleAgregarLineaCatalogo = useCallback((producto: ProductoCatalogoItem) => {
    const nuevaLinea: ItemRow = {
      key: generarId(),
      descripcion: producto.nombre,
      cantidad: 1,
      precioUnitario: producto.precioVenta,
      descuento: 0,
      alicuotaIva: 21,
      productoId: producto.id,
    };
    setItems((prev) => {
      const idxVacia = prev.findIndex(filaItemVacia);
      if (idxVacia !== -1) return prev.map((it, i) => (i === idxVacia ? nuevaLinea : it));
      return [...prev, nuevaLinea];
    });
    setBusquedaProducto('');

    // Fase 40: Servicio asociado -- si el producto elegido tiene uno
    // cargado (ver Producto.servicioAsociadoId), se agrega solo cuando es
    // "obligatorio"; si no, queda como sugerencia con un botón (ver render
    // más abajo). Un servicio 'con_variantes' no tiene una única entrada
    // para auto-agregar (cada variante tiene su propio precio) -- en ese
    // caso se precarga el buscador con su título para que el operador
    // elija la variante puntual.
    setServicioSugerido(null);
    if (producto.servicioAsociadoId) {
      const candidatos = serviciosCatalogo.filter((s) => s.id === producto.servicioAsociadoId);
      if (candidatos.length === 1) {
        if (producto.servicioAsociadoObligatorio) {
          const servicioLinea: ItemRow = {
            key: generarId(),
            descripcion: candidatos[0].nombre,
            cantidad: 1,
            precioUnitario: candidatos[0].precioVenta,
            descuento: 0,
            alicuotaIva: 21,
            servicioId: candidatos[0].id,
            varianteServicioId: candidatos[0].varianteServicioId,
          };
          setItems((prev) => [...prev, servicioLinea]);
        } else {
          setServicioSugerido(candidatos[0]);
        }
      } else if (candidatos.length > 1 && !producto.servicioAsociadoObligatorio) {
        setBusquedaProducto(candidatos[0].nombre.split(' - ')[0]);
      }
    }
  }, [serviciosCatalogo]);

  const handleAgregarLineaCombo = useCallback((combo: ComboCatalogoItem) => {
    const nuevaLinea: ItemRow = {
      key: generarId(),
      descripcion: combo.etiqueta ? `${combo.nombre} (${combo.etiqueta})` : combo.nombre,
      cantidad: 1,
      precioUnitario: combo.precioVenta,
      descuento: 0,
      alicuotaIva: 21,
      comboId: combo.id,
    };
    setItems((prev) => {
      const idxVacia = prev.findIndex(filaItemVacia);
      if (idxVacia !== -1) return prev.map((it, i) => (i === idxVacia ? nuevaLinea : it));
      return [...prev, nuevaLinea];
    });
    setBusquedaProducto('');
    setServicioSugerido(null);
  }, []);

  const handleAgregarLineaServicio = useCallback((servicio: ServicioCatalogoItem) => {
    const nuevaLinea: ItemRow = {
      key: generarId(),
      descripcion: servicio.nombre,
      cantidad: 1,
      precioUnitario: servicio.precioVenta,
      descuento: 0,
      alicuotaIva: 21,
      servicioId: servicio.id,
      varianteServicioId: servicio.varianteServicioId,
    };
    setItems((prev) => {
      const idxVacia = prev.findIndex(filaItemVacia);
      if (idxVacia !== -1) return prev.map((it, i) => (i === idxVacia ? nuevaLinea : it));
      return [...prev, nuevaLinea];
    });
    setBusquedaProducto('');
    setServicioSugerido(null);
  }, []);

  const updateItem = (index: number, field: keyof ItemRow, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  // Acepta "," o "." como separador decimal -- ver buffers arriba.
  function handleCantidadTexto(key: string, index: number, raw: string) {
    const limpio = raw.replace(/[^0-9.,]/g, '');
    setTextoCantidad((prev) => ({ ...prev, [key]: limpio }));
    const parsed = parseFloat(limpio.replace(',', '.'));
    updateItem(index, 'cantidad', isNaN(parsed) ? 0 : parsed);
  }

  function handlePrecioTexto(key: string, index: number, raw: string) {
    const limpio = raw.replace(/[^0-9.,]/g, '');
    setTextoPrecio((prev) => ({ ...prev, [key]: limpio }));
    const parsed = parseFloat(limpio.replace(',', '.'));
    updateItem(index, 'precioUnitario', isNaN(parsed) ? 0 : parsed);
  }

  const addItem = () => setItems((prev) => [...prev, newItemRow()]);

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    const key = items[index]?.key;
    if (key) {
      setTextoCantidad((prev) => { const { [key]: _omit, ...rest } = prev; return rest; });
      setTextoPrecio((prev) => { const { [key]: _omit, ...rest } = prev; return rest; });
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const getSubtotal = (item: ItemRow) =>
    calcularSubtotalItem(item.cantidad, item.precioUnitario, item.descuento);

  const totalNeto = items.reduce((sum, item) => sum + getSubtotal(item), 0);

  const totalIva = items.reduce((sum, item) => {
    const sub = getSubtotal(item);
    return sum + calcularTotalConIva(sub, item.alicuotaIva).montoIva;
  }, 0);

  const totalBruto = totalNeto + totalIva;
  const totalFinal = totalBruto * (1 - descuentoGeneral / 100);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!clienteId) next.clienteId = 'Seleccione un cliente';
    // Fase 27c: con 2+ puntos de venta cargados, hay que elegir cuál
    // factura -- con uno solo (o ninguno) no hay ambigüedad posible.
    if (puntosVenta.length > 1 && !puntoVentaId) next.puntoVentaId = 'Seleccione un punto de venta';
    if (items.length === 0) next.items = 'Agregue al menos un ítem';
    const filasIncompletas = items
      .map((it, i) => (filaItemIncompleta(it) ? i + 1 : null))
      .filter((n): n is number => n !== null);
    if (filasIncompletas.length > 0) {
      const plural = filasIncompletas.length > 1;
      next.items = `Falta descripción y/o precio en la${plural ? 's filas' : ' fila'} ${filasIncompletas.join(', ')} (resaltada${plural ? 's' : ''} en rojo abajo).`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) setIntentoGuardar(true);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) {
      // El mensaje de error puede quedar fuera de la vista si el usuario
      // scrolleó hacia abajo para completar filas nuevas — llevamos la
      // sección de ítems a la vista para que el error sea imposible de
      // pasar por alto.
      itemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onSave({
      tipo,
      clienteId,
      fecha,
      medioPago,
      modoEmision,
      descuentoGeneral,
      puntoVentaId: puntoVentaId || undefined,
      items: items.map((item) => {
        const subtotal = getSubtotal(item);
        const { montoIva } = calcularTotalConIva(subtotal, item.alicuotaIva);
        return {
          descripcion: item.descripcion.trim(),
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          descuento: item.descuento,
          alicuotaIva: item.alicuotaIva,
          subtotal,
          montoIva,
          productoId: item.productoId,
          comboId: item.comboId,
          servicioId: item.servicioId,
          varianteServicioId: item.varianteServicioId,
        };
      }),
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentWideClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              Nuevo comprobante
            </Dialog.Title>
            <Dialog.Close className={btnIcon}>
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <div className="space-y-5">
            {/* Header */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Tipo</label>
                {soloFactura ? (
                  <div className={`${selectClass} flex items-center bg-gray-50 text-gray-500`}>
                    {labelTipoComprobante('factura', modoEmision)}
                  </div>
                ) : (
                  <select
                    className={selectClass}
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as TipoComprobante)}
                  >
                    {(Object.keys(TIPO_COMPROBANTE_LABEL) as TipoComprobante[]).map(
                      (val) => (
                        <option key={val} value={val}>
                          {labelTipoComprobante(val, modoEmision)}
                        </option>
                      ),
                    )}
                  </select>
                )}
              </div>
              <div>
                <label className={labelClass}>Cliente *</label>
                <select
                  className={selectClass}
                  value={clienteId}
                  onChange={(e) => {
                    setClienteId(e.target.value);
                    if (errors.clienteId) setErrors((p) => ({ ...p, clienteId: '' }));
                  }}
                >
                  <option value="">Seleccionar...</option>
                  {/* Fase 22f: al facturar desde una Orden sin Cliente
                      formal vinculado, se ofrece "Consumidor Final" --
                      mismo cliente virtual (no persiste en Supabase) que
                      ya usa PuntoDeVenta.tsx. */}
                  {orden && <option value={CONSUMIDOR_FINAL_ID}>{clienteConsumidorFinal.nombre}</option>}
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
                {errors.clienteId && <p className="text-xs text-red-600 mt-1">{errors.clienteId}</p>}
              </div>
            </div>

            {/* Fase 27c: solo tiene sentido preguntar si el cliente ya
                tiene más de un punto de venta cargado -- en un negocio
                de un solo local queda oculto, cero cambio de flujo. */}
            {puntosVenta.length > 1 && (
              <div>
                <label className={labelClass}>Punto de venta *</label>
                <select
                  className={selectClass}
                  value={puntoVentaId}
                  onChange={(e) => {
                    setPuntoVentaId(e.target.value);
                    if (errors.puntoVentaId) setErrors((p) => ({ ...p, puntoVentaId: '' }));
                  }}
                >
                  <option value="">Seleccionar...</option>
                  {puntosVenta.filter((pv) => pv.activo).map((pv) => (
                    <option key={pv.id} value={pv.id}>{pv.alias}</option>
                  ))}
                </select>
                {errors.puntoVentaId && <p className="text-xs text-red-600 mt-1">{errors.puntoVentaId}</p>}
              </div>
            )}

            {/* Fase 22f: datos de contacto de la comanda -- útiles para
                confirmar a quién y adónde se factura/entrega, sobre todo
                cuando no hay Cliente formal vinculado (arriba queda
                "Consumidor Final"). No se persisten en el comprobante en
                sí (Comprobante no tiene estos campos), es solo para
                referencia del operador en este momento. */}
            {orden && (orden.contactoNombre || orden.contactoTelefono || orden.direccionEntrega) && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Datos de la comanda
                </h4>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                  {orden.contactoNombre && (
                    <span>
                      Cliente: <span className="font-medium">{orden.contactoNombre}</span>
                    </span>
                  )}
                  {orden.direccionEntrega && (
                    <span>
                      Dirección: <span className="font-medium">{orden.direccionEntrega}</span>
                    </span>
                  )}
                  {orden.contactoTelefono && (
                    <span>
                      Teléfono: <span className="font-medium">{orden.contactoTelefono}</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Fecha</label>
                <input
                  className={inputClass}
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Medio de pago</label>
                <select
                  className={selectClass}
                  value={medioPago}
                  onChange={(e) => setMedioPago(e.target.value as MedioPago)}
                >
                  {(Object.entries(MEDIO_PAGO_LABEL) as [MedioPago, string][]).map(
                    ([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <label className={labelClass}>Modo emisión</label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="modoEmision"
                      value="interno"
                      checked={modoEmision === 'interno'}
                      onChange={() => setModoEmision('interno')}
                      className="accent-gray-900"
                    />
                    Interno
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="modoEmision"
                      value="electronica"
                      checked={modoEmision === 'electronica'}
                      onChange={() => setModoEmision('electronica')}
                      className="accent-gray-900"
                    />
                    Electrónica
                  </label>
                </div>
              </div>
            </div>

            {/* Items table */}
            <div ref={itemsSectionRef}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900">Ítems</h3>
                <button type="button" className={`${btnSecondary} flex items-center gap-1 text-xs py-1.5 px-3`} onClick={addItem}>
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
              {errors.items && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-2">
                  <p className="text-xs text-red-700">{errors.items}</p>
                </div>
              )}

              {/* Fase 18: buscador de catálogo -- clic en una sugerencia agrega
                  una fila ya vinculada al producto (precio resuelto por lista
                  de precio). La carga manual sigue disponible como fallback
                  vía el botón "Agregar" y edición directa de la fila. */}
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={busquedaProducto}
                  onChange={(e) => setBusquedaProducto(e.target.value)}
                  placeholder="Buscar producto en el catálogo..."
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900/20"
                />
                {sugerenciasCatalogo.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {sugerenciasCatalogo.map((s) => {
                      if (s.tipo === 'combo') {
                        return (
                          <button
                            key={`combo-${s.item.id}`}
                            type="button"
                            onClick={() => handleAgregarLineaCombo(s.item)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                          >
                            <span className="flex items-center gap-1.5 text-gray-900">
                              <Tag className="h-3.5 w-3.5 text-pink-600" />
                              {s.item.nombre}
                              {s.item.etiqueta && (
                                <span className="inline-flex items-center rounded-full bg-pink-100 px-1.5 py-0.5 text-[10px] font-medium text-pink-700">
                                  {s.item.etiqueta}
                                </span>
                              )}
                            </span>
                            <span className="text-gray-500">{formatARS(s.item.precioVenta)}</span>
                          </button>
                        );
                      }
                      if (s.tipo === 'servicio') {
                        return (
                          <button
                            key={`servicio-${s.item.id}-${s.item.varianteServicioId ?? ''}`}
                            type="button"
                            onClick={() => handleAgregarLineaServicio(s.item)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                          >
                            <span className="flex items-center gap-1.5 text-gray-900">
                              <Briefcase className="h-3.5 w-3.5 text-indigo-600" />
                              {s.item.nombre}
                              {s.item.aConvenir && (
                                <span className="inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                                  A convenir
                                </span>
                              )}
                            </span>
                            <span className="text-gray-500">
                              {s.item.aConvenir ? '$ 0 (editable)' : formatARS(s.item.precioVenta)}
                            </span>
                          </button>
                        );
                      }
                      return (
                        <button
                          key={`producto-${s.item.id}`}
                          type="button"
                          onClick={() => handleAgregarLineaCatalogo(s.item)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="text-gray-900">{s.item.nombre}</span>
                          <span className="text-gray-500">
                            {formatARS(s.item.precioVenta)}
                            {s.item.controlaStock ? ` · Stock ${s.item.stock}` : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Fase 40: sugerencia de Servicio asociado (ej. instalación)
                  al producto que se acaba de agregar -- solo cuando no es
                  "obligatorio" (si lo es, ya se agregó solo arriba). */}
              {servicioSugerido && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-sm text-indigo-900">
                    <Briefcase className="h-3.5 w-3.5 text-indigo-600" />
                    ¿Agregar "{servicioSugerido.nombre}"?
                  </span>
                  <div className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      onClick={() => handleAgregarLineaServicio(servicioSugerido)}
                      className="text-xs font-medium text-indigo-700 hover:underline"
                    >
                      Agregar
                    </button>
                    <button
                      type="button"
                      onClick={() => setServicioSugerido(null)}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              )}

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-left px-3 py-2 font-medium">Descripción</th>
                      <th className="text-right px-3 py-2 font-medium w-20">Cant.</th>
                      <th className="text-right px-3 py-2 font-medium w-24">Precio</th>
                      <th className="text-right px-3 py-2 font-medium w-16">Dto.%</th>
                      <th className="text-right px-3 py-2 font-medium w-20">IVA</th>
                      <th className="text-right px-3 py-2 font-medium w-24">Subtotal</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const filaInvalida = intentoGuardar && filaItemIncompleta(item);
                      const descripcionInvalida = filaInvalida && !item.descripcion.trim();
                      const precioInvalido = filaInvalida && item.precioUnitario <= 0;
                      return (
                        <tr
                          key={item.key}
                          className={`border-t border-gray-100 ${filaInvalida ? 'bg-red-50' : ''}`}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              className={`w-full border-0 bg-transparent text-sm focus:outline-none ${descripcionInvalida ? 'ring-1 ring-red-400 rounded' : ''}`}
                              placeholder={descripcionInvalida ? 'Falta la descripción' : 'Descripción'}
                              value={item.descripcion}
                              onChange={(e) => updateItem(idx, 'descripcion', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full text-right border-0 bg-transparent text-sm focus:outline-none"
                              type="text"
                              inputMode="decimal"
                              value={textoCantidad[item.key] ?? String(item.cantidad || '')}
                              onChange={(e) => handleCantidadTexto(item.key, idx, e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`w-full text-right border-0 bg-transparent text-sm focus:outline-none ${precioInvalido ? 'ring-1 ring-red-400 rounded' : ''}`}
                              type="text"
                              inputMode="decimal"
                              value={textoPrecio[item.key] ?? String(item.precioUnitario || '')}
                              onChange={(e) => handlePrecioTexto(item.key, idx, e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full text-right border-0 bg-transparent text-sm focus:outline-none"
                              type="number"
                              min={0}
                              max={100}
                              value={item.descuento}
                              onChange={(e) => updateItem(idx, 'descuento', Number(e.target.value))}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="w-full text-right border-0 bg-transparent text-sm focus:outline-none"
                              value={item.alicuotaIva}
                              onChange={(e) => updateItem(idx, 'alicuotaIva', Number(e.target.value))}
                            >
                              <option value={0}>0%</option>
                              <option value={10.5}>10,5%</option>
                              <option value={21}>21%</option>
                              <option value={27}>27%</option>
                            </select>
                          </td>
                          <td className="px-3 py-1.5 text-right text-gray-700 font-medium">
                            {formatARS(getSubtotal(item))}
                          </td>
                          <td className="px-1 py-1.5">
                            <button
                              type="button"
                              className={btnIcon}
                              onClick={() => removeItem(idx)}
                              disabled={items.length <= 1}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal neto</span>
                  <span className="text-gray-900">{formatARS(totalNeto)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">IVA</span>
                  <span className="text-gray-900">{formatARS(totalIva)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Dto. general %</span>
                  <input
                    className="w-16 text-right border border-gray-200 rounded px-2 py-0.5 text-sm focus:outline-none"
                    type="number"
                    min={0}
                    max={100}
                    value={descuentoGeneral}
                    onChange={(e) => setDescuentoGeneral(Number(e.target.value))}
                  />
                </div>
                <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
                  <span className="text-gray-900">TOTAL</span>
                  <span className="text-gray-900">{formatARS(totalFinal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
            <button className={btnPrimary} onClick={handleSave}>
              Guardar
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── 3. CobroDialog ──────────────────────────────────────────

interface CobroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: Cliente;
  comprobantesCliente: Comprobante[];
  onSave: (data: {
    fecha: string;
    monto: number;
    medioPago: MedioPago;
    imputaciones: ImputacionCobro[];
  }) => void;
}

interface ImputacionRow {
  comprobanteId: string;
  numero: number;
  fecha: string;
  saldoPendiente: number;
  montoImputado: number;
}

export function CobroDialog({
  open,
  onOpenChange,
  cliente,
  comprobantesCliente,
  onSave,
}: CobroDialogProps) {
  const [fecha, setFecha] = useState(todayISO());
  const [monto, setMonto] = useState(0);
  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo');
  const [imputaciones, setImputaciones] = useState<ImputacionRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize imputaciones from pending comprobantes
  useEffect(() => {
    if (open) {
      setFecha(todayISO());
      setMonto(0);
      setMedioPago('efectivo');
      setErrors({});

      const pendientes = comprobantesCliente
        .filter((c) => c.estado === 'emitido' || c.estado === 'cobrado_parcial')
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((c) => ({
          comprobanteId: c.id,
          numero: c.numero,
          fecha: c.fecha,
          saldoPendiente: c.saldoPendiente,
          montoImputado: 0,
        }));
      setImputaciones(pendientes);
    }
  }, [open, comprobantesCliente]);

  // Auto-distribute monto across comprobantes oldest-first
  const distribuirMonto = useCallback(
    (nuevoMonto: number) => {
      setMonto(nuevoMonto);
      let restante = nuevoMonto;
      setImputaciones((prev) =>
        prev.map((imp) => {
          if (restante <= 0) return { ...imp, montoImputado: 0 };
          const asignar = Math.min(restante, imp.saldoPendiente);
          restante -= asignar;
          return { ...imp, montoImputado: Math.round(asignar * 100) / 100 };
        }),
      );
    },
    [],
  );

  const updateImputacion = (index: number, value: number) => {
    setImputaciones((prev) =>
      prev.map((imp, i) => (i === index ? { ...imp, montoImputado: value } : imp)),
    );
  };

  const totalImputado = imputaciones.reduce((sum, imp) => sum + imp.montoImputado, 0);
  // Techo real de imputación: no tiene sentido pedirle al operador que
  // impute más de lo que hay de deuda pendiente -- si el cobro es mayor
  // a la deuda total, el excedente queda legítimamente "sin imputar"
  // (a favor del cliente). Ver bug COB-00003: se guardó un cobro con
  // imputaciones en cero mientras había una factura pendiente por el
  // mismo importe exacto, dejando la factura "Emitida" para siempre y
  // el saldo de cuenta corriente del cliente descontado igual.
  const sumaSaldosPendientes = imputaciones.reduce((sum, imp) => sum + imp.saldoPendiente, 0);
  const montoQueDeberiaImputarse = Math.min(monto, sumaSaldosPendientes);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (monto <= 0) next.monto = 'El monto debe ser mayor a 0';
    if (totalImputado > monto + 0.01) next.imputaciones = 'La suma de imputaciones excede el monto';
    const invalid = imputaciones.some((imp) => imp.montoImputado > imp.saldoPendiente + 0.01);
    if (invalid) next.imputaciones = 'Una imputación excede el saldo pendiente';
    if (totalImputado < montoQueDeberiaImputarse - 0.01) {
      next.imputaciones = `Falta imputar ${formatARS(montoQueDeberiaImputarse - totalImputado)} a comprobantes pendientes antes de guardar (o ajuste el monto del cobro).`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      fecha,
      monto,
      medioPago,
      imputaciones: imputaciones
        .filter((imp) => imp.montoImputado > 0)
        .map(({ comprobanteId, montoImputado }) => ({ comprobanteId, montoImputado })),
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentWideClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              Registrar cobro — {cliente.nombre}
            </Dialog.Title>
            <Dialog.Close className={btnIcon}>
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <div className="space-y-5">
            {/* Header fields */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Fecha</label>
                <input
                  className={inputClass}
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Monto *</label>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  step={0.01}
                  value={monto}
                  onChange={(e) => distribuirMonto(Number(e.target.value))}
                />
                {errors.monto && <p className="text-xs text-red-600 mt-1">{errors.monto}</p>}
              </div>
              <div>
                <label className={labelClass}>Medio de pago</label>
                <select
                  className={selectClass}
                  value={medioPago}
                  onChange={(e) => setMedioPago(e.target.value as MedioPago)}
                >
                  {(Object.entries(MEDIO_PAGO_LABEL) as [MedioPago, string][]).map(
                    ([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ),
                  )}
                </select>
              </div>
            </div>

            {/* Imputación table */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">Imputación a comprobantes</h3>
              {errors.imputaciones && (
                <p className="text-xs text-red-600 mb-2">{errors.imputaciones}</p>
              )}

              {imputaciones.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No hay comprobantes pendientes para este cliente.
                </p>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="text-left px-3 py-2 font-medium">Comprobante</th>
                        <th className="text-left px-3 py-2 font-medium">Fecha</th>
                        <th className="text-right px-3 py-2 font-medium">Saldo pend.</th>
                        <th className="text-right px-3 py-2 font-medium w-32">Imputar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {imputaciones.map((imp, idx) => (
                        <tr key={imp.comprobanteId} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-700">#{imp.numero}</td>
                          <td className="px-3 py-2 text-gray-500">{imp.fecha}</td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            {formatARS(imp.saldoPendiente)}
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900/20"
                              type="number"
                              min={0}
                              max={imp.saldoPendiente}
                              step={0.01}
                              value={imp.montoImputado}
                              onChange={(e) => updateImputacion(idx, Number(e.target.value))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Summary */}
              <div className="flex justify-end mt-3">
                <div className="w-64 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Monto cobro</span>
                    <span className="text-gray-900">{formatARS(monto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total imputado</span>
                    <span className="text-gray-900">{formatARS(totalImputado)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-gray-500">
                      {monto - totalImputado > 0.01 && totalImputado >= montoQueDeberiaImputarse - 0.01
                        ? 'Sin imputar (a favor del cliente)'
                        : 'Sin imputar'}
                    </span>
                    <span className={totalImputado < montoQueDeberiaImputarse - 0.01 ? 'text-red-600' : monto - totalImputado > 0.01 ? 'text-amber-600' : 'text-gray-900'}>
                      {formatARS(monto - totalImputado)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
            <button className={btnPrimary} onClick={handleSave}>
              Guardar
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── 3b. SenaDialog ──────────────────────────────────────────
// Fase 41.2: cobro de seña de un presupuesto -- acción de a demanda desde
// el ícono "$" en Presupuestos.tsx (Acciones), NO un paso obligado de
// "Aprobar y crear orden": el cliente puede confirmar el presupuesto hoy y
// venir a pagar la seña recién más adelante, así que queda disponible en
// cualquier momento mientras el presupuesto siga vivo. A propósito NO
// reutiliza CobroDialog: acá todavía no existe ningún comprobante contra el
// cual imputar (la venta ni se facturó), así que la tabla de imputación de
// CobroDialog no aplica -- este es un cobro "suelto", que se imputa recién
// más adelante al facturar (ver IMPUTAR_COBRO en data/store.tsx). El monto
// cobrado ahora sí impacta la cuenta corriente del cliente y Tesorería, vía
// el mismo ADD_COBRO de siempre.

interface SenaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presupuesto: Presupuesto;
  onConfirmar: (data: { monto: number; medioPago: MedioPago }) => void;
}

export function SenaDialog({ open, onOpenChange, presupuesto, onConfirmar }: SenaDialogProps) {
  // Mismo patrón que el resto de la app (ver comentario de sanitizarDecimal
  // en @/lib/decimal): input de texto en vez de type="number" -- el nativo
  // no dejaba borrar el cero inicial con comodidad y rechazaba la coma
  // decimal en teclado en español.
  const [montoTexto, setMontoTexto] = useState('');
  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo');

  useEffect(() => {
    if (open) {
      setMontoTexto('');
      setMedioPago('efectivo');
    }
  }, [open]);

  const monto = parsearDecimal(montoTexto);
  const pct = presupuesto.total > 0 && monto > 0 ? (monto / presupuesto.total) * 100 : 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentClass}>
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              Cobrar seña — Presupuesto #{presupuesto.numero}
            </Dialog.Title>
            <Dialog.Close className={btnIcon}>
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <p className="text-sm text-gray-600 mb-5">
            Total del presupuesto: <span className="font-medium text-gray-900">{formatARS(presupuesto.total)}</span>.
            Cargá el monto que el cliente vino a pagar como seña{monto > 0 ? ` (${formatPct(pct)} del total)` : ''}.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div>
              <label className={labelClass}>Monto a cobrar</label>
              <input
                className={inputClass}
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={montoTexto}
                onChange={(e) => setMontoTexto(sanitizarDecimal(e.target.value))}
                autoFocus
              />
            </div>
            <div>
              <label className={labelClass}>Medio de pago</label>
              <select className={selectClass} value={medioPago} onChange={(e) => setMedioPago(e.target.value as MedioPago)}>
                {(Object.entries(MEDIO_PAGO_LABEL) as [MedioPago, string][])
                  .filter(([val]) => val !== 'cuenta_corriente')
                  .map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
            <button className={btnPrimary} onClick={() => onConfirmar({ monto, medioPago })} disabled={monto <= 0}>
              Registrar cobro de seña
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── 4. PresupuestoDialog ────────────────────────────────────

interface PresupuestoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientes: Cliente[];
  presupuesto?: Presupuesto;
  onSave: (data: {
    clienteId: string;
    fecha: string;
    validezDias: number;
    condiciones: string;
    notas: string;
    items: Omit<PresupuestoItem, 'id'>[];
    descuentoGeneral: number;
  }) => void;
  validezDefault: number;
  /** Confirma el presupuesto (borrador -> enviado) sin salir del modal --
   * mismo criterio que el botón "Confirmar" agregado en la columna
   * Acciones del listado, para no obligar al operador a cerrar y volver a
   * abrir para desbloquear "Aprobar y crear orden" / "Facturar". Solo se
   * muestra editando un presupuesto existente en estado 'borrador'. */
  onConfirmar?: (id: string) => void;
}

interface PresupuestoItemRow {
  key: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  /** Vínculo opcional al catálogo real de Productos y Stock -- mismo
   * criterio que el buscador de ComprobanteDialog (Fase 18). Si se deja
   * sin vincular, la línea sigue siendo texto libre (fallback manual). */
  productoId?: string;
  /** Vínculo opcional a un Servicio del catálogo -- Fase 40. Igual que en
   * ComprobanteDialog: no descuenta stock, mutuamente excluyente con
   * productoId. */
  servicioId?: string;
  varianteServicioId?: string;
}

function newPresupuestoItemRow(): PresupuestoItemRow {
  return {
    key: generarId(),
    descripcion: '',
    cantidad: 1,
    precioUnitario: 0,
    descuento: 0,
  };
}

/** Catálogo de productos para el buscador de "Nuevo presupuesto" -- mismo
 * criterio que ProductoCatalogoItem de ComprobanteDialog, sin combos (un
 * presupuesto cotiza productos puntuales, no combos armados). */
interface ProductoCatalogoPresupuesto {
  id: string;
  nombre: string;
  precioVenta: number;
  /** Fase 40: ver comentario en ProductoCatalogoItem de ComprobanteDialog. */
  servicioAsociadoId?: string;
  servicioAsociadoObligatorio?: boolean;
}

/** Fase 40: servicios vendibles del catálogo, mismo criterio de "aplanado"
 * por variante que en ComprobanteDialog (ver ServicioCatalogoItem). */
interface ServicioCatalogoPresupuesto {
  id: string;
  varianteServicioId?: string;
  nombre: string;
  precioVenta: number;
  aConvenir: boolean;
}

type SugerenciaPresupuesto =
  | { tipo: 'producto'; item: ProductoCatalogoPresupuesto }
  | { tipo: 'servicio'; item: ServicioCatalogoPresupuesto };

/** Una fila de ítem se considera incompleta si falta la descripción o el precio. */
function filaPresupuestoIncompleta(item: PresupuestoItemRow): boolean {
  return !item.descripcion.trim() || item.precioUnitario <= 0;
}

/** Una fila "vacía" es la fila manual en blanco que arranca el modal (o
 * cualquier fila agregada con "+Agregar" que el operador todavía no tocó):
 * sin descripción y sin vínculo a catálogo. Al elegir un producto desde el
 * buscador, esa fila se reutiliza en vez de sumar una fila nueva y dejarla
 * en blanco -- si no, esa fila vacía bloqueaba el guardado (mismo criterio
 * que CotizacionDialog en Compras, ver filaCotizacionVacia). */
function filaPresupuestoVacia(item: PresupuestoItemRow): boolean {
  return !item.descripcion.trim() && !item.productoId && !item.servicioId;
}

export function PresupuestoDialog({
  open,
  onOpenChange,
  clientes,
  presupuesto,
  onSave,
  validezDefault,
  onConfirmar,
}: PresupuestoDialogProps) {
  const [clienteId, setClienteId] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [validezDias, setValidezDias] = useState(validezDefault);
  const [condiciones, setCondiciones] = useState('');
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<PresupuestoItemRow[]>([newPresupuestoItemRow()]);
  const [descuentoGeneral, setDescuentoGeneral] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Se activa recién después del primer intento fallido de guardar: a partir
  // de ahí, las filas incompletas se resaltan en rojo en vivo.
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const itemsSectionRef = useRef<HTMLDivElement>(null);

  // Buscador de catálogo (mismo criterio que ComprobanteDialog, Fase 18):
  // el usuario pidió explícitamente que "Nuevo presupuesto" se relacione
  // con el módulo Productos en vez de forzar carga manual de texto libre.
  const { cliente: clienteTenant } = useClienteActual();
  const [productosCatalogo, setProductosCatalogo] = useState<ProductoCatalogoPresupuesto[]>([]);
  // Fase 40: servicios vendibles del catálogo, ya aplanados por variante.
  const [serviciosCatalogo, setServiciosCatalogo] = useState<ServicioCatalogoPresupuesto[]>([]);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  // Fase 40: ver comentario en ComprobanteDialog (servicioSugerido).
  const [servicioSugerido, setServicioSugerido] = useState<ServicioCatalogoPresupuesto | null>(null);

  useEffect(() => {
    if (open) {
      if (presupuesto) {
        setClienteId(presupuesto.clienteId);
        setFecha(presupuesto.fecha);
        setValidezDias(presupuesto.validezDias);
        setCondiciones(presupuesto.condiciones ?? '');
        setNotas(presupuesto.notas ?? '');
        setDescuentoGeneral(presupuesto.descuentoGeneral);
        setItems(
          presupuesto.items.map((it) => ({
            key: it.id,
            descripcion: it.descripcion,
            cantidad: it.cantidad,
            precioUnitario: it.precioUnitario,
            descuento: it.descuento,
            productoId: it.productoId || undefined,
            servicioId: it.servicioId || undefined,
            varianteServicioId: it.varianteServicioId || undefined,
          })),
        );
      } else {
        setClienteId('');
        setFecha(todayISO());
        setValidezDias(validezDefault);
        setCondiciones('');
        setNotas('');
        setItems([newPresupuestoItemRow()]);
        setDescuentoGeneral(0);
      }
      setErrors({});
      setIntentoGuardar(false);
      setBusquedaProducto('');
      setServicioSugerido(null);
    }
  }, [open, presupuesto, validezDefault]);

  useEffect(() => {
    if (!open || !clienteTenant?.id) return;
    let activo = true;

    async function cargarCatalogo() {
      const [{ data }, serviciosRes] = await Promise.all([
        supabase
          .from('productos')
          .select('id, nombre, precio_venta, servicio_asociado_id, servicio_asociado_obligatorio')
          .eq('cliente_id', clienteTenant!.id)
          .eq('disponible', true)
          .eq('estado', 'activo')
          .order('nombre'),
        // Fase 40: servicios activos del cliente -- ver mismo criterio en
        // ComprobanteDialog (cargarCatalogo).
        supabase
          .from('servicios')
          .select('id, titulo, tipo, modalidad_precio, precio')
          .eq('cliente_id', clienteTenant!.id)
          .eq('estado', 'activo')
          .order('titulo'),
      ]);

      if (!activo) return;
      setProductosCatalogo(
        ((data ?? []) as any[]).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          precioVenta: Number(p.precio_venta),
          servicioAsociadoId: p.servicio_asociado_id ?? undefined,
          servicioAsociadoObligatorio: !!p.servicio_asociado_obligatorio,
        })),
      );

      const serviciosData = (serviciosRes.data ?? []) as any[];
      const idsConVariantes = serviciosData.filter((s) => s.tipo === 'con_variantes').map((s) => s.id);
      let variantesPorServicio = new Map<string, { id: string; nombre: string; modalidad_precio: string; precio: number }[]>();
      if (idsConVariantes.length > 0) {
        const variantesRes = await supabase
          .from('servicio_variantes')
          .select('id, servicio_id, nombre, modalidad_precio, precio')
          .in('servicio_id', idsConVariantes)
          .order('orden');
        if (!activo) return;
        for (const v of (variantesRes.data ?? []) as any[]) {
          const lista = variantesPorServicio.get(v.servicio_id) ?? [];
          lista.push(v);
          variantesPorServicio.set(v.servicio_id, lista);
        }
      }
      const servicios: ServicioCatalogoPresupuesto[] = [];
      for (const s of serviciosData) {
        if (s.tipo === 'con_variantes') {
          for (const v of variantesPorServicio.get(s.id) ?? []) {
            servicios.push({
              id: s.id,
              varianteServicioId: v.id,
              nombre: `${s.titulo} - ${v.nombre}`,
              precioVenta: v.modalidad_precio === 'a_convenir' ? 0 : Number(v.precio ?? 0),
              aConvenir: v.modalidad_precio === 'a_convenir',
            });
          }
        } else {
          servicios.push({
            id: s.id,
            nombre: s.titulo,
            precioVenta: s.modalidad_precio === 'a_convenir' ? 0 : Number(s.precio ?? 0),
            aConvenir: s.modalidad_precio === 'a_convenir',
          });
        }
      }
      setServiciosCatalogo(servicios);
    }

    cargarCatalogo();
    return () => {
      activo = false;
    };
  }, [open, clienteTenant?.id]);

  const sugerenciasProducto = useMemo<SugerenciaPresupuesto[]>(() => {
    const q = busquedaProducto.trim().toLowerCase();
    if (!q) return [];
    const servicios: SugerenciaPresupuesto[] = serviciosCatalogo
      .filter((s) => s.nombre.toLowerCase().includes(q))
      .map((item) => ({ tipo: 'servicio' as const, item }));
    const productos: SugerenciaPresupuesto[] = productosCatalogo
      .filter((p) => p.nombre.toLowerCase().includes(q))
      .map((item) => ({ tipo: 'producto' as const, item }));
    return [...servicios, ...productos].slice(0, 8);
  }, [busquedaProducto, productosCatalogo, serviciosCatalogo]);

  const handleAgregarLineaCatalogo = useCallback((producto: ProductoCatalogoPresupuesto) => {
    const nuevaLinea: PresupuestoItemRow = {
      key: generarId(),
      descripcion: producto.nombre,
      cantidad: 1,
      precioUnitario: producto.precioVenta,
      descuento: 0,
      productoId: producto.id,
    };
    setItems((prev) => {
      const idxVacia = prev.findIndex(filaPresupuestoVacia);
      if (idxVacia !== -1) return prev.map((it, i) => (i === idxVacia ? nuevaLinea : it));
      return [...prev, nuevaLinea];
    });
    setBusquedaProducto('');

    // Fase 40: ver comentario en ComprobanteDialog (mismo criterio).
    setServicioSugerido(null);
    if (producto.servicioAsociadoId) {
      const candidatos = serviciosCatalogo.filter((s) => s.id === producto.servicioAsociadoId);
      if (candidatos.length === 1) {
        if (producto.servicioAsociadoObligatorio) {
          const servicioLinea: PresupuestoItemRow = {
            key: generarId(),
            descripcion: candidatos[0].nombre,
            cantidad: 1,
            precioUnitario: candidatos[0].precioVenta,
            descuento: 0,
            servicioId: candidatos[0].id,
            varianteServicioId: candidatos[0].varianteServicioId,
          };
          setItems((prev) => [...prev, servicioLinea]);
        } else {
          setServicioSugerido(candidatos[0]);
        }
      } else if (candidatos.length > 1 && !producto.servicioAsociadoObligatorio) {
        setBusquedaProducto(candidatos[0].nombre.split(' - ')[0]);
      }
    }
  }, [serviciosCatalogo]);

  const handleAgregarLineaServicio = useCallback((servicio: ServicioCatalogoPresupuesto) => {
    const nuevaLinea: PresupuestoItemRow = {
      key: generarId(),
      descripcion: servicio.nombre,
      cantidad: 1,
      precioUnitario: servicio.precioVenta,
      descuento: 0,
      servicioId: servicio.id,
      varianteServicioId: servicio.varianteServicioId,
    };
    setItems((prev) => {
      const idxVacia = prev.findIndex(filaPresupuestoVacia);
      if (idxVacia !== -1) return prev.map((it, i) => (i === idxVacia ? nuevaLinea : it));
      return [...prev, nuevaLinea];
    });
    setBusquedaProducto('');
    setServicioSugerido(null);
  }, []);

  const updateItem = (index: number, field: keyof PresupuestoItemRow, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const addItem = () => setItems((prev) => [...prev, newPresupuestoItemRow()]);

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const getSubtotal = (item: PresupuestoItemRow) =>
    calcularSubtotalItem(item.cantidad, item.precioUnitario, item.descuento);

  const totalNeto = items.reduce((sum, item) => sum + getSubtotal(item), 0);
  const totalFinal = totalNeto * (1 - descuentoGeneral / 100);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!clienteId) next.clienteId = 'Seleccione un cliente';
    if (items.length === 0) next.items = 'Agregue al menos un ítem';
    const filasIncompletas = items
      .map((it, i) => (filaPresupuestoIncompleta(it) ? i + 1 : null))
      .filter((n): n is number => n !== null);
    if (filasIncompletas.length > 0) {
      const plural = filasIncompletas.length > 1;
      next.items = `Falta descripción y/o precio en la${plural ? 's filas' : ' fila'} ${filasIncompletas.join(', ')} (resaltada${plural ? 's' : ''} en rojo abajo).`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) setIntentoGuardar(true);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) {
      itemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onSave({
      clienteId,
      fecha,
      validezDias,
      condiciones,
      notas,
      descuentoGeneral,
      items: items.map((item) => ({
        productoId: item.productoId ?? '',
        servicioId: item.servicioId,
        varianteServicioId: item.varianteServicioId,
        descripcion: item.descripcion.trim(),
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        descuento: item.descuento,
        subtotal: getSubtotal(item),
      })),
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentWideClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              {presupuesto ? 'Editar presupuesto' : 'Nuevo presupuesto'}
            </Dialog.Title>
            <Dialog.Close className={btnIcon}>
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <div className="space-y-5">
            {/* Header */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Cliente *</label>
                <select
                  className={selectClass}
                  value={clienteId}
                  onChange={(e) => {
                    setClienteId(e.target.value);
                    if (errors.clienteId) setErrors((p) => ({ ...p, clienteId: '' }));
                  }}
                >
                  <option value="">Seleccionar...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
                {errors.clienteId && <p className="text-xs text-red-600 mt-1">{errors.clienteId}</p>}
              </div>
              <div>
                <label className={labelClass}>Fecha</label>
                <input
                  className={inputClass}
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Validez (días)</label>
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  value={validezDias}
                  onChange={(e) => setValidezDias(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Condiciones + Notas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Condiciones comerciales</label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={2}
                  value={condiciones}
                  onChange={(e) => setCondiciones(e.target.value)}
                  placeholder="Condiciones de entrega, pago, etc."
                />
              </div>
              <div>
                <label className={labelClass}>Notas</label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={2}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
              </div>
            </div>

            {/* Items table */}
            <div ref={itemsSectionRef}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900">Ítems</h3>
                <button type="button" className={`${btnSecondary} flex items-center gap-1 text-xs py-1.5 px-3`} onClick={addItem}>
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
              {errors.items && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-2">
                  <p className="text-xs text-red-700">{errors.items}</p>
                </div>
              )}

              {/* Buscador de catálogo -- mismo criterio que en Nuevo comprobante
                  (Fase 18): clic en una sugerencia agrega una fila ya vinculada
                  al producto. La carga manual sigue disponible con "Agregar". */}
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={busquedaProducto}
                  onChange={(e) => setBusquedaProducto(e.target.value)}
                  placeholder="Buscar producto en el catálogo..."
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900/20"
                />
                {sugerenciasProducto.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {sugerenciasProducto.map((s) =>
                      s.tipo === 'servicio' ? (
                        <button
                          key={`servicio-${s.item.id}-${s.item.varianteServicioId ?? ''}`}
                          type="button"
                          onClick={() => handleAgregarLineaServicio(s.item)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="flex items-center gap-1.5 text-gray-900">
                            <Briefcase className="h-3.5 w-3.5 text-indigo-600" />
                            {s.item.nombre}
                            {s.item.aConvenir && (
                              <span className="inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                                A convenir
                              </span>
                            )}
                          </span>
                          <span className="text-gray-500">
                            {s.item.aConvenir ? '$ 0 (editable)' : formatARS(s.item.precioVenta)}
                          </span>
                        </button>
                      ) : (
                        <button
                          key={`producto-${s.item.id}`}
                          type="button"
                          onClick={() => handleAgregarLineaCatalogo(s.item)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="text-gray-900">{s.item.nombre}</span>
                          <span className="text-gray-500">{formatARS(s.item.precioVenta)}</span>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>

              {/* Fase 40: sugerencia de Servicio asociado -- ver comentario
                  en ComprobanteDialog. */}
              {servicioSugerido && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-sm text-indigo-900">
                    <Briefcase className="h-3.5 w-3.5 text-indigo-600" />
                    ¿Agregar "{servicioSugerido.nombre}"?
                  </span>
                  <div className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      onClick={() => handleAgregarLineaServicio(servicioSugerido)}
                      className="text-xs font-medium text-indigo-700 hover:underline"
                    >
                      Agregar
                    </button>
                    <button
                      type="button"
                      onClick={() => setServicioSugerido(null)}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              )}

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-left px-3 py-2 font-medium">Descripción</th>
                      <th className="text-right px-3 py-2 font-medium w-20">Cant.</th>
                      <th className="text-right px-3 py-2 font-medium w-24">Precio</th>
                      <th className="text-right px-3 py-2 font-medium w-16">Dto.%</th>
                      <th className="text-right px-3 py-2 font-medium w-24">Subtotal</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const filaInvalida = intentoGuardar && filaPresupuestoIncompleta(item);
                      const descripcionInvalida = filaInvalida && !item.descripcion.trim();
                      const precioInvalido = filaInvalida && item.precioUnitario <= 0;
                      return (
                        <tr
                          key={item.key}
                          className={`border-t border-gray-100 ${filaInvalida ? 'bg-red-50' : ''}`}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              className={`w-full border-0 bg-transparent text-sm focus:outline-none ${descripcionInvalida ? 'ring-1 ring-red-400 rounded' : ''}`}
                              placeholder={descripcionInvalida ? 'Falta la descripción' : 'Descripción'}
                              value={item.descripcion}
                              onChange={(e) => updateItem(idx, 'descripcion', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full text-right border-0 bg-transparent text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.cantidad || ''}
                              onChange={(e) => updateItem(idx, 'cantidad', Number(e.target.value))}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`w-full text-right border-0 bg-transparent text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${precioInvalido ? 'ring-1 ring-red-400 rounded' : ''}`}
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.precioUnitario}
                              onChange={(e) => updateItem(idx, 'precioUnitario', Number(e.target.value))}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full text-right border-0 bg-transparent text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              type="number"
                              min={0}
                              max={100}
                              value={item.descuento}
                              onChange={(e) => updateItem(idx, 'descuento', Number(e.target.value))}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right text-gray-700 font-medium">
                            {formatARS(getSubtotal(item))}
                          </td>
                          <td className="px-1 py-1.5">
                            <button
                              type="button"
                              className={btnIcon}
                              onClick={() => removeItem(idx)}
                              disabled={items.length <= 1}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-900">{formatARS(totalNeto)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Dto. general %</span>
                  <input
                    className="w-16 text-right border border-gray-200 rounded px-2 py-0.5 text-sm focus:outline-none"
                    type="number"
                    min={0}
                    max={100}
                    value={descuentoGeneral}
                    onChange={(e) => setDescuentoGeneral(Number(e.target.value))}
                  />
                </div>
                <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
                  <span className="text-gray-900">TOTAL</span>
                  <span className="text-gray-900">{formatARS(totalFinal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
            {presupuesto && presupuesto.estado === 'borrador' && onConfirmar ? (
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                onClick={() => {
                  onConfirmar(presupuesto.id);
                  onOpenChange(false);
                }}
                title="Confirma el presupuesto para poder aprobarlo y crear una orden, o facturarlo directamente"
              >
                <Check className="h-4 w-4" />
                Confirmar presupuesto
              </button>
            ) : (
              <span />
            )}
            <div className="flex justify-end gap-3">
              <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
              <button className={btnPrimary} onClick={handleSave}>
                Guardar
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── 5. DespachoDialog ───────────────────────────────────────
//
// Fase 21 (Etapa 1): captura los datos de despacho al marcar una Orden
// "En camino" -- transportista + número de seguimiento/pedido + link
// opcional. Sin integración real todavía (ver comentario en
// Orden.estadoLogistica, types/index.ts): son campos de carga manual,
// pensados para que una futura Etapa 2 (webhook/API por proveedor) los
// actualice de la misma forma.

interface DespachoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fase 23b: empleados del tenant para elegir a quién asignarle el
   * reparto -- solo se ofrece cuando el transportista es "propio" (un
   * tercero como Rappi/PedidosYa no lo necesita). No hay filtro por rol
   * (`rol` es texto libre desde 0003_consolidado_v2_a_v8.sql), se listan
   * todos los empleados del cliente. */
  empleados: { id: string; nombre: string }[];
  onConfirmar: (data: {
    proveedorLogistica: ProveedorLogistica;
    numeroSeguimiento: string;
    urlSeguimiento: string;
    cadeteId?: string;
    cadeteNombre?: string;
    cobraContraEntrega: boolean;
  }) => void;
}

export function DespachoDialog({ open, onOpenChange, empleados, onConfirmar }: DespachoDialogProps) {
  const [proveedor, setProveedor] = useState<ProveedorLogistica>('propio');
  const [numeroSeguimiento, setNumeroSeguimiento] = useState('');
  const [urlSeguimiento, setUrlSeguimiento] = useState('');
  const [cadeteId, setCadeteId] = useState('');
  const [cobraContraEntrega, setCobraContraEntrega] = useState(false);

  useEffect(() => {
    if (open) {
      setProveedor('propio');
      setNumeroSeguimiento('');
      setUrlSeguimiento('');
      setCadeteId('');
      setCobraContraEntrega(false);
    }
  }, [open]);

  const handleConfirmar = () => {
    onConfirmar({
      proveedorLogistica: proveedor,
      numeroSeguimiento: numeroSeguimiento.trim(),
      urlSeguimiento: urlSeguimiento.trim(),
      cadeteId: proveedor === 'propio' && cadeteId ? cadeteId : undefined,
      cadeteNombre:
        proveedor === 'propio' && cadeteId
          ? empleados.find((e) => e.id === cadeteId)?.nombre
          : undefined,
      cobraContraEntrega: proveedor === 'propio' && cobraContraEntrega,
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              Marcar en camino
            </Dialog.Title>
            <Dialog.Close className={btnIcon}>
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>Transportista</label>
              <select
                className={selectClass}
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value as ProveedorLogistica)}
              >
                {(Object.keys(PROVEEDOR_LOGISTICA_LABEL) as ProveedorLogistica[]).map((p) => (
                  <option key={p} value={p}>
                    {PROVEEDOR_LOGISTICA_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Número de seguimiento / pedido</label>
              <input
                className={inputClass}
                value={numeroSeguimiento}
                onChange={(e) => setNumeroSeguimiento(e.target.value)}
                placeholder="Nº de pedido en Rappi/PedidosYa, guía de un correo, etc. (opcional)"
              />
            </div>
            <div>
              <label className={labelClass}>Link de seguimiento (opcional)</label>
              <input
                className={inputClass}
                type="url"
                value={urlSeguimiento}
                onChange={(e) => setUrlSeguimiento(e.target.value)}
                placeholder="https://..."
              />
            </div>

            {/* Fase 23b: cadete + cobro contra entrega -- solo aplica a
                reparto propio. Un tercero (Rappi/PedidosYa) cobra por su
                cuenta, Edgy Gestión no necesita rendir ese efectivo. */}
            {proveedor === 'propio' && (
              <>
                <div>
                  <label className={labelClass}>Cadete (opcional)</label>
                  <select
                    className={selectClass}
                    value={cadeteId}
                    onChange={(e) => setCadeteId(e.target.value)}
                  >
                    <option value="">Sin asignar</option>
                    {empleados.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={cobraContraEntrega}
                    onChange={(e) => setCobraContraEntrega(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Cobra contra entrega (queda pendiente de rendición)
                </label>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
            <button className={btnPrimary} onClick={handleConfirmar}>
              Marcar en camino
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── 6. RendicionDialog ──────────────────────────────────────
//
// Fase 23c: cierra la rendición de un cadete -- confirma qué pedidos
// "cobra contra entrega" (ver Fase 23b) efectivamente liquida, cuánto
// efectivo entregó, y compara contra lo esperado (suma de las facturas
// seleccionadas). No hace falta un modelo nuevo: al confirmar, la
// pantalla (Rendicion.tsx) genera un ADD_COBRO en efectivo por cada
// factura -- el mismo motor de Cobro/Imputación que ya usan Cobranzas y
// Fase 23a -- así que la factura pasa a "Cobrado" y el pedido deja de
// aparecer solo en la lista de pendientes (mismo criterio de
// cero-modelo-nuevo de Fase 23a).

interface RendicionOrdenRow {
  ordenId: string;
  numeroOrden: number;
  clienteNombre: string;
  numeroComprobante: number;
  saldoPendiente: number;
}

interface RendicionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cadeteNombre: string;
  ordenes: RendicionOrdenRow[];
  onConfirmar: (data: { montoDeclarado: number; notas?: string }) => void;
}

export function RendicionDialog({ open, onOpenChange, cadeteNombre, ordenes, onConfirmar }: RendicionDialogProps) {
  const [montoDeclarado, setMontoDeclarado] = useState(0);
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (open) {
      setMontoDeclarado(0);
      setNotas('');
    }
  }, [open]);

  const montoEsperado = ordenes.reduce((s, o) => s + o.saldoPendiente, 0);
  const diferencia = Math.round((montoDeclarado - montoEsperado) * 100) / 100;

  const handleConfirmar = () => {
    onConfirmar({ montoDeclarado, notas: notas.trim() || undefined });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              Rendición de {cadeteNombre}
            </Dialog.Title>
            <Dialog.Close className={btnIcon}>
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 divide-y max-h-48 overflow-y-auto">
              {ordenes.map((o) => (
                <div key={o.ordenId} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-600">
                    Pedido #{o.numeroOrden} — {o.clienteNombre}
                  </span>
                  <span className="font-medium text-gray-900">{formatARS(o.saldoPendiente)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold bg-gray-50">
                <span>Total esperado</span>
                <span>{formatARS(montoEsperado)}</span>
              </div>
            </div>

            <div>
              <label className={labelClass}>Efectivo entregado por el cadete *</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step={0.01}
                value={montoDeclarado}
                onChange={(e) => setMontoDeclarado(Number(e.target.value))}
              />
              {Math.abs(diferencia) > 0.01 && (
                <p className={`text-xs mt-1 ${diferencia < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                  Diferencia: {diferencia > 0 ? '+' : ''}
                  {formatARS(diferencia)} {diferencia < 0 ? '(falta efectivo)' : '(sobra efectivo)'}
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Notas (opcional)</label>
              <input
                className={inputClass}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones sobre la rendición..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
            <button className={btnPrimary} onClick={handleConfirmar} disabled={ordenes.length === 0}>
              Confirmar rendición
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
