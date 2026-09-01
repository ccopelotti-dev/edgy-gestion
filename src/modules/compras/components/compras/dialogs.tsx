// ============================================================
// Modulo Compras — Dialogs
// Edgy Gestion · React 19 + Radix UI + Tailwind CSS 4
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Trash2, Search, Factory, ImagePlus, Loader2, ZoomIn } from 'lucide-react';

import type {
  Proveedor,
  CondicionIvaProveedor,
  PedidoCotizacion,
  TipoComprobanteCompra,
  MedioPagoCompra,
  ComprobanteCompra,
  ImputacionPago,
  ItemComprobanteCompra,
  ControlRemision,
  OrdenCompra,
  ItemCompra,
  ImpuestoOrdenCompra,
  PagoCompra,
  LineaPago,
} from '../../types';

import {
  calcularSubtotalItem,
  generarId,
  CONDICION_IVA_PROV_LABEL,
  TIPO_COMPROBANTE_COMPRA_LABEL,
  MEDIO_PAGO_COMPRA_LABEL,
} from '../../types';

import { formatARS, todayISO } from '../../lib/format';
import { sanitizarDecimal, parsearDecimal, decimalATexto } from '@/lib/decimal';
import { esCuitValido } from '@/lib/validarCuit';
import { TIPOS_COMPROBANTE_ARCA } from '@/modules/impuestos/lib/arcaReferencia';
import { supabase } from '@/lib/supabase';
import { useClienteActual } from '@/hooks/useClienteActual';
import {
  subirImagenComprobanteManual,
  eliminarImagenComprobanteManual,
  firmarUrlsDeTickets,
  ACCEPT_IMAGEN_COMPROBANTE,
  TAMANIO_MAXIMO_IMAGEN_COMPROBANTE,
} from '@/lib/imagenComprobanteAgente';
import ImageLightbox from '@/components/ImageLightbox';
import { UNIDADES, unidadAbrev, presentacionDefault, type UnidadMedida, type InsumoPresentacion } from '@/modules/productos-stock/types';

// ─── Shared styles ───────────────────────────────────────────

const overlayClass =
  'fixed inset-0 bg-black/50 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0';

const contentClass =
  'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto z-50';

const contentWideClass =
  'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto z-50';

// Un poco más ancho que contentWideClass -- el modal de comprobante de
// compra sumó columnas (UM, buscador de catálogo, Control de Remisión)
// y quedó apretado con el ancho estándar.
const contentComprobanteClass =
  'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-6 w-full max-w-4xl max-h-[85vh] overflow-y-auto z-50';

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

// ─── 1. ProveedorDialog ─────────────────────────────────────

interface ProveedorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proveedor?: Proveedor;
  onSave: (data: Omit<Proveedor, 'id' | 'saldoCuentaCorriente' | 'activo' | 'createdAt' | 'updatedAt'>) => void;
}

interface ProveedorForm {
  nombre: string;
  nombreFantasia: string;
  cuit: string;
  condicionIva: CondicionIvaProveedor;
  email: string;
  telefono: string;
  direccion: string;
  localidad: string;
  provincia: string;
  contacto: string;
  rubro: string;
  notas: string;
}

const emptyProveedorForm: ProveedorForm = {
  nombre: '',
  nombreFantasia: '',
  cuit: '',
  condicionIva: 'responsable_inscripto',
  email: '',
  telefono: '',
  direccion: '',
  localidad: '',
  provincia: '',
  contacto: '',
  rubro: '',
  notas: '',
};

export function ProveedorDialog({ open, onOpenChange, proveedor, onSave }: ProveedorDialogProps) {
  const [form, setForm] = useState<ProveedorForm>(emptyProveedorForm);
  const [errors, setErrors] = useState<Partial<Record<keyof ProveedorForm, string>>>({});

  useEffect(() => {
    if (open) {
      if (proveedor) {
        setForm({
          nombre: proveedor.nombre,
          nombreFantasia: proveedor.nombreFantasia ?? '',
          cuit: proveedor.cuit,
          condicionIva: proveedor.condicionIva,
          email: proveedor.email ?? '',
          telefono: proveedor.telefono ?? '',
          direccion: proveedor.direccion ?? '',
          localidad: proveedor.localidad ?? '',
          provincia: proveedor.provincia ?? '',
          contacto: proveedor.contacto ?? '',
          rubro: proveedor.rubro ?? '',
          notas: proveedor.notas ?? '',
        });
      } else {
        setForm(emptyProveedorForm);
      }
      setErrors({});
    }
  }, [open, proveedor]);

  const update = <K extends keyof ProveedorForm>(key: K, value: ProveedorForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof ProveedorForm, string>> = {};
    if (!form.nombre.trim()) next.nombre = 'El nombre es obligatorio';
    if (!form.cuit.trim()) next.cuit = 'El CUIT es obligatorio';
    else if (!esCuitValido(form.cuit)) next.cuit = 'El CUIT no es válido (dígito verificador incorrecto)';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      nombre: form.nombre.trim(),
      nombreFantasia: form.nombreFantasia.trim() || undefined,
      cuit: form.cuit.trim(),
      condicionIva: form.condicionIva,
      email: form.email || undefined,
      telefono: form.telefono || undefined,
      direccion: form.direccion || undefined,
      localidad: form.localidad || undefined,
      provincia: form.provincia || undefined,
      contacto: form.contacto || undefined,
      rubro: form.rubro || undefined,
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
              {proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}
            </Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nombre *</label>
              <input className={inputClass} value={form.nombre} onChange={(e) => update('nombre', e.target.value)} placeholder="Razon social" />
              {errors.nombre && <p className="text-xs text-red-600 mt-1">{errors.nombre}</p>}
            </div>

            <div>
              <label className={labelClass}>Nombre comercial</label>
              <input className={inputClass} value={form.nombreFantasia} onChange={(e) => update('nombreFantasia', e.target.value)} placeholder="Nombre de fantasia (ej. Don Rene)" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>CUIT *</label>
                <input className={inputClass} value={form.cuit} onChange={(e) => update('cuit', e.target.value)} placeholder="Sin guiones" />
                {errors.cuit && <p className="text-xs text-red-600 mt-1">{errors.cuit}</p>}
              </div>
              <div>
                <label className={labelClass}>Condicion IVA</label>
                <select className={selectClass} value={form.condicionIva} onChange={(e) => update('condicionIva', e.target.value as CondicionIvaProveedor)}>
                  {(Object.entries(CONDICION_IVA_PROV_LABEL) as [CondicionIvaProveedor, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Email</label>
                <input className={inputClass} type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Telefono</label>
                <input className={inputClass} value={form.telefono} onChange={(e) => update('telefono', e.target.value)} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Direccion</label>
              <input className={inputClass} value={form.direccion} onChange={(e) => update('direccion', e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Localidad</label>
                <input className={inputClass} value={form.localidad} onChange={(e) => update('localidad', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Provincia</label>
                <input className={inputClass} value={form.provincia} onChange={(e) => update('provincia', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Contacto</label>
                <input className={inputClass} value={form.contacto} onChange={(e) => update('contacto', e.target.value)} placeholder="Nombre de contacto" />
              </div>
              <div>
                <label className={labelClass}>Rubro</label>
                <input className={inputClass} value={form.rubro} onChange={(e) => update('rubro', e.target.value)} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Notas</label>
              <textarea className={`${inputClass} resize-none`} rows={2} value={form.notas} onChange={(e) => update('notas', e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
            <button className={btnPrimary} onClick={handleSave}>Guardar</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── 2. CotizacionDialog ───────────────────────────────────

interface CotizacionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proveedores: Proveedor[];
  cotizacion?: PedidoCotizacion;
  validezDefault: number;
  onSave: (data: {
    proveedorId: string;
    fecha: string;
    validezDias: number;
    notas: string;
    items: {
      descripcion: string; cantidad: number; precioUnitario: number; descuento: number; subtotal: number;
      insumoId?: string; productoId?: string; unidad?: UnidadMedida;
    }[];
  }) => void;
}

interface CotizacionItemRow {
  key: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  /** Vínculo opcional al catálogo real de Productos y Stock -- ver
   * buscador de insumo/producto más abajo. Mutuamente excluyentes. */
  insumoId?: string;
  productoId?: string;
  unidad: UnidadMedida;
}

function newCotizacionItemRow(): CotizacionItemRow {
  return { key: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0, unidad: 'unidad' };
}

/** Una fila de item se considera incompleta si falta la descripcion. */
function filaCotizacionIncompleta(item: CotizacionItemRow): boolean {
  return !item.descripcion.trim();
}

/** Una fila "vacía" es la fila manual en blanco que arranca el modal (o
 * cualquier fila agregada con "+Agregar" que el operador todavía no tocó):
 * sin descripción y sin vínculo a catálogo. Al vincular un insumo/producto
 * desde el buscador, esa fila se reutiliza en lugar de sumar una fila nueva
 * y dejarla en blanco. */
function filaCotizacionVacia(item: CotizacionItemRow): boolean {
  return !item.descripcion.trim() && !item.insumoId && !item.productoId;
}

export function CotizacionDialog({ open, onOpenChange, proveedores, cotizacion, validezDefault, onSave }: CotizacionDialogProps) {
  const [proveedorId, setProveedorId] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [validezDias, setValidezDias] = useState(validezDefault);
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<CotizacionItemRow[]>([newCotizacionItemRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Se activa recien despues del primer intento fallido de guardar: a partir
  // de ahi, las filas incompletas se resaltan en rojo en vivo.
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const itemsSectionRef = useRef<HTMLDivElement>(null);

  // Conexión con el catálogo real de Productos y Stock (mismo criterio que
  // ComprobanteCompraDialog, Fase 18): permite formular el pedido de
  // cotización eligiendo insumos/productos existentes en vez de tipear
  // descripciones libres a mano.
  const { cliente: clienteTenant } = useClienteActual();
  const [insumosCatalogo, setInsumosCatalogo] = useState<InsumoCatalogoCompra[]>([]);
  const [productosCatalogo, setProductosCatalogo] = useState<ProductoCatalogoCompra[]>([]);
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');

  useEffect(() => {
    if (open) {
      if (cotizacion) {
        setProveedorId(cotizacion.proveedorId);
        setFecha(cotizacion.fecha);
        setValidezDias(cotizacion.validezDias);
        setNotas(cotizacion.notas ?? '');
        setItems(cotizacion.items.map((it) => ({
          key: it.id, descripcion: it.descripcion, cantidad: it.cantidad, precioUnitario: it.precioUnitario, descuento: it.descuento,
          insumoId: it.insumoId, productoId: it.productoId, unidad: (it.unidad as UnidadMedida) ?? 'unidad',
        })));
      } else {
        setProveedorId('');
        setFecha(todayISO());
        setValidezDias(validezDefault);
        setNotas('');
        setItems([newCotizacionItemRow()]);
      }
      setErrors({});
      setIntentoGuardar(false);
      setBusquedaCatalogo('');
    }
  }, [open, cotizacion, validezDefault]);

  useEffect(() => {
    if (!open || !clienteTenant?.id) return;
    let activo = true;

    async function cargarCatalogo() {
      const [insumosRes, productosRes] = await Promise.all([
        supabase
          .from('insumos')
          // Fase 48b: nested select trae las presentaciones de compra en la
          // misma consulta (PostgREST resuelve la FK insumo_presentaciones
          // -> insumos sola, sin join manual).
          .select('id, nombre, unidad, costo, stock, insumo_presentaciones(id, nombre, contenido, es_default)')
          .eq('cliente_id', clienteTenant!.id)
          .order('nombre'),
        supabase
          .from('productos')
          .select('id, nombre, unidad_venta, costo, stock')
          .eq('cliente_id', clienteTenant!.id)
          .eq('estado', 'activo')
          .order('nombre'),
      ]);
      if (!activo) return;

      setInsumosCatalogo(
        ((insumosRes.data ?? []) as any[]).map((i) => ({
          id: i.id,
          nombre: i.nombre,
          unidad: i.unidad as UnidadMedida,
          costo: Number(i.costo),
          stock: Number(i.stock),
          presentaciones: ((i.insumo_presentaciones ?? []) as any[]).map((p) => ({
            id: p.id,
            nombre: p.nombre ?? undefined,
            contenido: Number(p.contenido),
            esDefault: p.es_default,
          })),
        })),
      );
      setProductosCatalogo(
        ((productosRes.data ?? []) as any[]).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          unidad: p.unidad_venta as UnidadMedida,
          costo: Number(p.costo),
          stock: Number(p.stock),
        })),
      );
    }

    cargarCatalogo();
    return () => {
      activo = false;
    };
  }, [open, clienteTenant?.id]);

  const sugerenciasCatalogoCotizacion = useMemo<SugerenciaCatalogoCompra[]>(() => {
    const q = busquedaCatalogo.trim().toLowerCase();
    if (!q) return [];
    const insumos: SugerenciaCatalogoCompra[] = insumosCatalogo
      .filter((i) => i.nombre.toLowerCase().includes(q))
      .map((item) => ({ tipo: 'insumo' as const, item }));
    const productos: SugerenciaCatalogoCompra[] = productosCatalogo
      .filter((p) => p.nombre.toLowerCase().includes(q))
      .map((item) => ({ tipo: 'producto' as const, item }));
    return [...insumos, ...productos].slice(0, 8);
  }, [busquedaCatalogo, insumosCatalogo, productosCatalogo]);

  const handleAgregarLineaInsumoCotizacion = useCallback((insumo: InsumoCatalogoCompra) => {
    const nuevaLinea: CotizacionItemRow = {
      key: generarId(), descripcion: insumo.nombre, cantidad: 1, precioUnitario: insumo.costo, descuento: 0,
      insumoId: insumo.id, unidad: insumo.unidad,
    };
    setItems((prev) => {
      const idxVacia = prev.findIndex(filaCotizacionVacia);
      if (idxVacia !== -1) return prev.map((it, i) => (i === idxVacia ? nuevaLinea : it));
      return [...prev, nuevaLinea];
    });
    setBusquedaCatalogo('');
  }, []);

  const handleAgregarLineaProductoCotizacion = useCallback((producto: ProductoCatalogoCompra) => {
    const nuevaLinea: CotizacionItemRow = {
      key: generarId(), descripcion: producto.nombre, cantidad: 1, precioUnitario: producto.costo, descuento: 0,
      productoId: producto.id, unidad: producto.unidad,
    };
    setItems((prev) => {
      const idxVacia = prev.findIndex(filaCotizacionVacia);
      if (idxVacia !== -1) return prev.map((it, i) => (i === idxVacia ? nuevaLinea : it));
      return [...prev, nuevaLinea];
    });
    setBusquedaCatalogo('');
  }, []);

  const updateItem = (index: number, field: keyof CotizacionItemRow, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const addItem = () => setItems((prev) => [...prev, newCotizacionItemRow()]);
  const removeItem = (index: number) => { if (items.length > 1) setItems((prev) => prev.filter((_, i) => i !== index)); };

  const getSubtotal = (item: CotizacionItemRow) => calcularSubtotalItem(item.cantidad, item.precioUnitario, item.descuento);
  const total = items.reduce((sum, item) => sum + getSubtotal(item), 0);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!proveedorId) next.proveedorId = 'Seleccione un proveedor';
    const filasIncompletas = items
      .map((it, i) => (filaCotizacionIncompleta(it) ? i + 1 : null))
      .filter((n): n is number => n !== null);
    if (filasIncompletas.length > 0) {
      const plural = filasIncompletas.length > 1;
      next.items = `Falta la descripcion en la${plural ? 's filas' : ' fila'} ${filasIncompletas.join(', ')} (resaltada${plural ? 's' : ''} en rojo abajo).`;
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
      proveedorId, fecha, validezDias, notas,
      items: items.map((item) => ({
        descripcion: item.descripcion.trim(), cantidad: item.cantidad,
        precioUnitario: item.precioUnitario, descuento: item.descuento, subtotal: getSubtotal(item),
        insumoId: item.insumoId, productoId: item.productoId, unidad: item.unidad,
      })),
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentComprobanteClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              {cotizacion ? 'Editar cotizacion' : 'Nueva cotizacion'}
            </Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Proveedor *</label>
                <select className={selectClass} value={proveedorId} onChange={(e) => { setProveedorId(e.target.value); if (errors.proveedorId) setErrors((p) => ({ ...p, proveedorId: '' })); }}>
                  <option value="">Seleccionar...</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {errors.proveedorId && <p className="text-xs text-red-600 mt-1">{errors.proveedorId}</p>}
              </div>
              <div>
                <label className={labelClass}>Fecha</label>
                <input className={inputClass} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Validez (dias)</label>
                <input className={inputClass} type="number" min={1} value={validezDias} onChange={(e) => setValidezDias(Number(e.target.value))} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Notas</label>
              <textarea className={`${inputClass} resize-none`} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>

            {/* Items */}
            <div ref={itemsSectionRef}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900">Items</h3>
                <button type="button" className={`${btnSecondary} flex items-center gap-1 text-xs py-1.5 px-3`} onClick={addItem}>
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
              {errors.items && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-2">
                  <p className="text-xs text-red-700">{errors.items}</p>
                </div>
              )}

              {/* Buscador de insumo/producto real del catálogo -- clic en una
                  sugerencia agrega una fila ya vinculada (con su unidad de
                  stock precargada). La carga manual (texto libre) sigue
                  disponible vía "Agregar". */}
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={busquedaCatalogo}
                  onChange={(e) => setBusquedaCatalogo(e.target.value)}
                  placeholder="Vincular a un insumo o producto del catálogo..."
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900/20"
                />
                {sugerenciasCatalogoCotizacion.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {sugerenciasCatalogoCotizacion.map((s) =>
                      s.tipo === 'insumo' ? (
                        <button
                          key={`insumo-${s.item.id}`}
                          type="button"
                          onClick={() => handleAgregarLineaInsumoCotizacion(s.item)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="flex items-center gap-1.5 text-gray-900">
                            {s.item.nombre}
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                              Insumo
                            </span>
                          </span>
                          <span className="text-gray-500">
                            Stock {s.item.stock} {unidadAbrev(s.item.unidad)}
                          </span>
                        </button>
                      ) : (
                        <button
                          key={`producto-${s.item.id}`}
                          type="button"
                          onClick={() => handleAgregarLineaProductoCotizacion(s.item)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="flex items-center gap-1.5 text-gray-900">
                            {s.item.nombre}
                            <span className="inline-flex items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                              Producto
                            </span>
                          </span>
                          <span className="text-gray-500">
                            Stock {s.item.stock} {unidadAbrev(s.item.unidad)}
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-x-auto scroll-shadow-x">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                      <th className="text-right px-3 py-2 font-medium w-20">Cant.</th>
                      <th className="text-left px-3 py-2 font-medium w-24">UM</th>
                      <th className="text-right px-3 py-2 font-medium w-24">Precio</th>
                      <th className="text-right px-3 py-2 font-medium w-16">Dto.%</th>
                      <th className="text-right px-3 py-2 font-medium w-24">Subtotal</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const filaInvalida = intentoGuardar && filaCotizacionIncompleta(item);
                      const vinculada = Boolean(item.insumoId || item.productoId);
                      return (
                        <tr
                          key={item.key}
                          className={`border-t border-gray-100 ${filaInvalida ? 'bg-red-50' : ''}`}
                        >
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                className={`w-full border-0 bg-transparent text-sm focus:outline-none ${filaInvalida ? 'ring-1 ring-red-400 rounded' : ''}`}
                                placeholder={filaInvalida ? 'Falta la descripcion' : 'Descripcion'}
                                value={item.descripcion}
                                onChange={(e) => updateItem(idx, 'descripcion', e.target.value)}
                              />
                              {vinculada && (
                                <span
                                  title={item.insumoId ? 'Vinculada a un insumo' : 'Vinculada a un producto'}
                                  className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${item.insumoId ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}
                                >
                                  {item.insumoId ? 'Insumo' : 'Producto'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" type="number" min={0} step={0.01} value={item.cantidad || ''} onChange={(e) => updateItem(idx, 'cantidad', Number(e.target.value))} />
                            {(() => {
                              // Fase 48b: ayuda "≈ N envases" -- mismo criterio que en
                              // Recepción, solo referencia, no cambia el valor real cargado.
                              const insumo = item.insumoId ? insumosCatalogo.find((i) => i.id === item.insumoId) : undefined;
                              const pres = insumo ? presentacionDefault(insumo.presentaciones ?? []) : undefined;
                              if (!pres || !item.cantidad) return null;
                              return (
                                <p className="text-[10px] text-muted-foreground leading-tight text-right">
                                  ≈ {(item.cantidad / pres.contenido).toFixed(2).replace('.', ',')} env.
                                </p>
                              );
                            })()}
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="w-full border-0 bg-transparent text-xs focus:outline-none"
                              value={item.unidad}
                              onChange={(e) => updateItem(idx, 'unidad', e.target.value as UnidadMedida)}
                            >
                              {UNIDADES.map((u) => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" type="number" min={0} step={0.01} value={item.precioUnitario} onChange={(e) => updateItem(idx, 'precioUnitario', Number(e.target.value))} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" type="number" min={0} max={100} value={item.descuento} onChange={(e) => updateItem(idx, 'descuento', Number(e.target.value))} />
                          </td>
                          <td className="px-3 py-1.5 text-right text-gray-700 font-medium">{formatARS(getSubtotal(item))}</td>
                          <td className="px-1 py-1.5">
                            <button type="button" className={btnIcon} onClick={() => removeItem(idx)} disabled={items.length <= 1}><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-64 text-sm">
                <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
                  <span className="text-gray-900">TOTAL</span>
                  <span className="text-gray-900">{formatARS(total)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
            <button className={btnPrimary} onClick={handleSave}>Guardar</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── 3. ComprobanteCompraDialog ─────────────────────────────

interface ComprobanteCompraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proveedores: Proveedor[];
  /** Si se abre desde "Registrar factura" en una Orden de Compra puntual,
   * precarga proveedor + items + otros impuestos desde ahí (con los
   * precios/IVA ya confirmados en "Cargar precios cotizados") y vincula el
   * comprobante resultante a esa OC. Sin esto, el modal arranca en blanco
   * (alta manual, como siempre). */
  ordenCompra?: OrdenCompra;
  /** Fase 61 (30/08): cuando el modal se abre "en blanco" (sin `ordenCompra`
   * preseleccionada -- ej. desde el botón "Nuevo comprobante" de
   * Comprobantes.tsx), esta lista ofrece elegir una Orden de Compra ya
   * `recibida` y sin factura vinculada todavía, para facturarla desde acá
   * en vez de tener que ir a Órdenes de Compra > "Registrar factura". Al
   * elegir una, se precargan proveedor + items igual que con `ordenCompra`. */
  ordenesCompraDisponibles?: OrdenCompra[];
  onSave: (data: {
    tipo: TipoComprobanteCompra;
    proveedorId: string;
    /** Nro. de comprobante fiscal del proveedor (ej. "0001-00000542") --
     * ver comentario en ComprobanteCompra.numeroComprobanteProveedor. */
    numeroComprobanteProveedor: string;
    /** Letra/tipo AFIP-ARCA del comprobante recibido (código de 3 dígitos)
     * -- Fase 34 (Impuestos), determina crédito fiscal computable de IVA. */
    tipoComprobanteCodigo: string;
    fecha: string;
    fechaVencimiento: string;
    medioPago: MedioPagoCompra;
    items: Omit<ItemComprobanteCompra, 'id'>[];
    controlRemision: ControlRemision;
    numeroRemito: string;
    /** true si se apretó "Actualizar stock" (guardar + empujar stock de una),
     * false si se apretó "Guardar" (solo el registro fiscal, sin tocar stock). */
    actualizarStock: boolean;
    /** Percepciones/impuestos adicionales -- mismo criterio que en la OC
     * (Fase 21): Ganancias, IIBB, débitos y créditos bancarios, etc. */
    otrosImpuestos: ImpuestoOrdenCompra[];
    /** Si el comprobante viene de "Registrar factura" en una OC (o se eligió
     * una desde `ordenesCompraDisponibles`), el id de esa OC para
     * vincularlos (ver ComprobanteCompra.ordenCompraId). */
    ordenCompraId?: string;
    /** Fase 61: path en Storage de la foto/scan adjuntada a mano (ver
     * ComprobanteCompra.imagenUrl). Undefined si no se adjuntó nada. */
    imagenUrl?: string;
  }) => void;
}

interface ComprobanteItemRow {
  key: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  alicuotaIva: number;
  /** Vínculo opcional al catálogo real de Productos y Stock -- ver
   * buscador de insumo/producto más abajo. Mutuamente excluyentes. */
  insumoId?: string;
  productoId?: string;
  /** Unidad en la que se cargó `cantidad`. Por default 'unidad'; si la
   * línea se vinculó a un insumo/producto, se precarga con SU unidad de
   * stock (el operador la puede cambiar, ej. a 'kg' si así viene la
   * factura, y se convierte al confirmar "Actualizar stock"). */
  unidad: UnidadMedida;
}

function newComprobanteItemRow(): ComprobanteItemRow {
  return { key: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0, alicuotaIva: 21, unidad: 'unidad' };
}

/** Una fila de item se considera incompleta si falta la descripcion o el precio. */
function filaItemIncompleta(item: ComprobanteItemRow): boolean {
  return !item.descripcion.trim() || item.precioUnitario <= 0;
}

// Conexión Compras -> Recepción: buscador de insumo/producto real del
// catálogo de Productos y Stock. Este módulo no está montado dentro de
// ProductosStockProvider, así que se consulta Supabase directo (mismo
// criterio que el buscador de catálogo de Ventas, Fase 18).
interface InsumoCatalogoCompra {
  id: string;
  nombre: string;
  unidad: UnidadMedida;
  costo: number;
  stock: number;
  // Fase 48b: presentaciones de compra (ver Insumo.presentaciones en
  // productos-stock/types) -- para la ayuda "N envases" al cargar Cantidad.
  presentaciones?: InsumoPresentacion[];
}

interface ProductoCatalogoCompra {
  id: string;
  nombre: string;
  unidad: UnidadMedida;
  costo: number;
  stock: number;
}

type SugerenciaCatalogoCompra =
  | { tipo: 'insumo'; item: InsumoCatalogoCompra }
  | { tipo: 'producto'; item: ProductoCatalogoCompra };

/** Deja solo dígitos y corta a `max` caracteres -- para los campos de Pto.
 * Vta / Número de remito (el usuario tipea libre, sin ceros). */
function soloDigitos(raw: string, max: number): string {
  return raw.replace(/\D/g, '').slice(0, max);
}

export function ComprobanteCompraDialog({ open, onOpenChange, proveedores, ordenCompra, ordenesCompraDisponibles, onSave }: ComprobanteCompraDialogProps) {
  const [tipo, setTipo] = useState<TipoComprobanteCompra>('factura');
  const [proveedorId, setProveedorId] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [medioPago, setMedioPago] = useState<MedioPagoCompra>('transferencia');
  const [items, setItems] = useState<ComprobanteItemRow[]>([newComprobanteItemRow()]);
  // Percepciones/impuestos adicionales -- mismo componente que en
  // OrdenCompraPreciosDialog (Fase 21): Ganancias, IIBB, débitos y
  // créditos bancarios, etc. Si viene de una OC, se precargan las suyas.
  const [otrosImpuestos, setOtrosImpuestos] = useState<OtroImpuestoRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Se activa recien despues del primer intento fallido de guardar: a partir
  // de ahi, las filas incompletas se resaltan en rojo en vivo.
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const itemsSectionRef = useRef<HTMLDivElement>(null);

  // Nro. de comprobante fiscal del PROVEEDOR (el impreso en la factura
  // física, ej. "0001-00000542") -- distinto del correlativo interno de
  // Edgy Gestión. Fundamental para identificar la compra y para el libro
  // IVA Compras del período fiscal. Mismo criterio de UI que Nro. de
  // Remito más abajo: dos campos (Pto. Vta 4 díg. + Número 8 díg.) con
  // autocompletado de ceros y avance de foco al presionar Enter.
  const [comprobantePtoVta, setComprobantePtoVta] = useState('');
  const [comprobanteNumero, setComprobanteNumero] = useState('');
  const comprobanteNumeroInputRef = useRef<HTMLInputElement>(null);
  // Letra/tipo AFIP-ARCA del comprobante recibido (Fase 34, Impuestos) --
  // determina si genera crédito fiscal computable de IVA (A/M sí, B/C no).
  const [tipoComprobanteCodigo, setTipoComprobanteCodigo] = useState('');
  const numeroComprobanteProveedor =
    comprobantePtoVta || comprobanteNumero
      ? `${comprobantePtoVta.padStart(4, '0')}-${comprobanteNumero.padStart(8, '0')}`
      : '';

  // Conexión con Recepción (stock). Antes había un botón "Actualizar stock"
  // separado de "Guardar" que guardaba el comprobante Y empujaba el stock
  // en un solo click (y cerraba el modal de golpe). Como técnicamente el
  // stock necesita que el comprobante ya exista para poder vincular la
  // recepción, no tiene sentido "separarlos" de verdad -- en cambio, esto
  // es un tilde: si está marcado, "Guardar" hace las dos cosas en el orden
  // correcto (primero guarda, después actualiza stock); si no, guarda nomás.
  const [actualizarStockChecked, setActualizarStockChecked] = useState(false);
  // Fase 58e (30/08, a pedido de Carlos -- caso real Punto Tex/Gla & Co.):
  // la mayoría de los proveedores facturan con el IVA ya metido adentro del
  // precio unitario ("precio final", sin discriminar). Antes la única forma
  // de cargar eso sin que el motor sumara un 21% de más era poner la
  // alícuota en 0% -- pero entonces el comprobante quedaba con "IVA: $0",
  // sin ningún crédito fiscal computable para el libro IVA Compras (dato
  // que Carlos SÍ necesita, aunque el total de la factura no cambie).
  // Con este tilde activado, "Precio" pasa a interpretarse como el precio
  // FINAL (con IVA) tal cual figura impreso en la factura del proveedor --
  // la alícuota de cada línea se sigue eligiendo igual que siempre, pero
  // ahora se usa para DESAGREGAR (precioNeto = precioFinal / (1+alícuota))
  // en vez de para sumar arriba de un precio que ya la traía adentro. Lo
  // que se guarda en la base (`precioUnitario`) sigue siendo el neto -- el
  // resto del sistema (costeo de insumos, stock, márgenes) asume siempre
  // precio sin IVA, y este comprobante no debe ser la excepción.
  const [precioConIva, setPrecioConIva] = useState(false);
  const [controlRemision, setControlRemision] = useState<ControlRemision>('no');
  // Nro. de remito partido en dos campos (Pto. Vta 4 díg. + Número 8 díg.)
  // para carga rápida: el operador tipea "1" + Enter (pasa de campo y
  // completa a "0001") y "521" + Enter (completa a "00000521") sin tener
  // que tipear los ceros a mano.
  const [remitoPtoVta, setRemitoPtoVta] = useState('');
  const [remitoNumero, setRemitoNumero] = useState('');
  const remitoNumeroInputRef = useRef<HTMLInputElement>(null);
  const numeroRemito =
    remitoPtoVta || remitoNumero
      ? `${remitoPtoVta.padStart(4, '0')}-${remitoNumero.padStart(8, '0')}`
      : '';

  const { cliente: clienteTenant } = useClienteActual();
  const [insumosCatalogo, setInsumosCatalogo] = useState<InsumoCatalogoCompra[]>([]);
  const [productosCatalogo, setProductosCatalogo] = useState<ProductoCatalogoCompra[]>([]);
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');

  // Fase 61 (30/08): elegir una OC "recibida" y sin factura todavía desde
  // acá mismo, sin tener que ir a Órdenes de Compra > "Registrar factura".
  // Solo tiene sentido cuando el modal se abrió en blanco (sin `ordenCompra`
  // ya preseleccionada por el caller).
  const [ordenCompraSeleccionadaId, setOrdenCompraSeleccionadaId] = useState('');

  // Fase 61: foto/scan adjuntado a mano (bucket privado "comprobantes-gastos").
  const [imagenPath, setImagenPath] = useState<string | null>(null);
  const [imagenPreviewUrl, setImagenPreviewUrl] = useState<string | null>(null);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [errorImagen, setErrorImagen] = useState('');
  const [imagenAmpliadaPreview, setImagenAmpliadaPreview] = useState<string | null>(null);
  const fileInputImagenRef = useRef<HTMLInputElement>(null);
  // Recuerda si la imagen actual se subió DURANTE esta apertura del modal --
  // si se cierra sin guardar (o se reemplaza por otra), se borra el archivo
  // huérfano del bucket (best-effort, ver eliminarImagenComprobanteManual).
  const imagenSubidaEnEstaSesionRef = useRef<string | null>(null);

  /** Precarga proveedor + items + otros impuestos desde una OC -- mismo
   * criterio tanto si viene por prop (`ordenCompra`, ej. "Registrar
   * factura" en Órdenes de Compra) como si se elige del selector nuevo. */
  function aplicarOrdenCompra(oc: OrdenCompra) {
    setProveedorId(oc.proveedorId);
    setItems(
      oc.items.length
        ? oc.items.map((it) => ({
            key: generarId(), descripcion: it.descripcion, cantidad: it.cantidad,
            precioUnitario: it.precioUnitario, descuento: it.descuento,
            alicuotaIva: it.alicuotaIva ?? 21,
            insumoId: it.insumoId, productoId: it.productoId, unidad: it.unidad ?? 'unidad',
          }))
        : [newComprobanteItemRow()],
    );
    setOtrosImpuestos(
      (oc.otrosImpuestos ?? []).map((imp) => ({ key: imp.id, concepto: imp.concepto, monto: imp.monto })),
    );
  }

  const handleSeleccionarOrdenCompra = (id: string) => {
    setOrdenCompraSeleccionadaId(id);
    if (!id) return;
    const oc = ordenesCompraDisponibles?.find((o) => o.id === id);
    if (oc) aplicarOrdenCompra(oc);
  };

  const handleImagenSeleccionada = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !clienteTenant?.id) return;
    setErrorImagen('');
    setSubiendoImagen(true);
    try {
      const { path, signedUrl } = await subirImagenComprobanteManual(file, clienteTenant.id);
      // Si ya había una imagen subida en esta misma sesión del modal (el
      // usuario reemplazó la foto), se borra la anterior para no dejar
      // archivos sueltos en el bucket.
      if (imagenSubidaEnEstaSesionRef.current) {
        eliminarImagenComprobanteManual(imagenSubidaEnEstaSesionRef.current);
      }
      imagenSubidaEnEstaSesionRef.current = path;
      setImagenPath(path);
      setImagenPreviewUrl(signedUrl);
    } catch (err) {
      setErrorImagen(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
    } finally {
      setSubiendoImagen(false);
    }
  };

  const handleQuitarImagen = () => {
    if (imagenSubidaEnEstaSesionRef.current) {
      eliminarImagenComprobanteManual(imagenSubidaEnEstaSesionRef.current);
      imagenSubidaEnEstaSesionRef.current = null;
    }
    setImagenPath(null);
    setImagenPreviewUrl(null);
    setErrorImagen('');
  };

  useEffect(() => {
    if (open) {
      setTipo('factura');
      setFecha(todayISO());
      setFechaVencimiento('');
      setMedioPago('transferencia');
      setErrors({});
      setIntentoGuardar(false);
      setComprobantePtoVta('');
      setComprobanteNumero('');
      setActualizarStockChecked(false);
      setControlRemision('no');
      setRemitoPtoVta('');
      setRemitoNumero('');
      setBusquedaCatalogo('');
      // Fase 61: cada apertura arranca sin OC elegida ni imagen adjunta --
      // si quedó algo subido de una apertura anterior que se cerró sin
      // guardar, se limpia (best-effort).
      setOrdenCompraSeleccionadaId(ordenCompra?.id ?? '');
      setImagenPath(null);
      setImagenPreviewUrl(null);
      setErrorImagen('');
      if (imagenSubidaEnEstaSesionRef.current) {
        eliminarImagenComprobanteManual(imagenSubidaEnEstaSesionRef.current);
        imagenSubidaEnEstaSesionRef.current = null;
      }
      if (ordenCompra) {
        aplicarOrdenCompra(ordenCompra);
      } else {
        setProveedorId('');
        setItems([newComprobanteItemRow()]);
        setOtrosImpuestos([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ordenCompra]);

  useEffect(() => {
    if (!open || !clienteTenant?.id) return;
    let activo = true;

    async function cargarCatalogo() {
      const [insumosRes, productosRes] = await Promise.all([
        supabase
          .from('insumos')
          // Fase 48b: nested select trae las presentaciones de compra en la
          // misma consulta (PostgREST resuelve la FK insumo_presentaciones
          // -> insumos sola, sin join manual).
          .select('id, nombre, unidad, costo, stock, insumo_presentaciones(id, nombre, contenido, es_default)')
          .eq('cliente_id', clienteTenant!.id)
          .order('nombre'),
        supabase
          .from('productos')
          .select('id, nombre, unidad_venta, costo, stock')
          .eq('cliente_id', clienteTenant!.id)
          .eq('estado', 'activo')
          .order('nombre'),
      ]);
      if (!activo) return;

      setInsumosCatalogo(
        ((insumosRes.data ?? []) as any[]).map((i) => ({
          id: i.id,
          nombre: i.nombre,
          unidad: i.unidad as UnidadMedida,
          costo: Number(i.costo),
          stock: Number(i.stock),
          presentaciones: ((i.insumo_presentaciones ?? []) as any[]).map((p) => ({
            id: p.id,
            nombre: p.nombre ?? undefined,
            contenido: Number(p.contenido),
            esDefault: p.es_default,
          })),
        })),
      );
      setProductosCatalogo(
        ((productosRes.data ?? []) as any[]).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          unidad: p.unidad_venta as UnidadMedida,
          costo: Number(p.costo),
          stock: Number(p.stock),
        })),
      );
    }

    cargarCatalogo();
    return () => {
      activo = false;
    };
  }, [open, clienteTenant?.id]);

  const sugerenciasCatalogo = useMemo<SugerenciaCatalogoCompra[]>(() => {
    const q = busquedaCatalogo.trim().toLowerCase();
    if (!q) return [];
    const insumos: SugerenciaCatalogoCompra[] = insumosCatalogo
      .filter((i) => i.nombre.toLowerCase().includes(q))
      .map((item) => ({ tipo: 'insumo' as const, item }));
    const productos: SugerenciaCatalogoCompra[] = productosCatalogo
      .filter((p) => p.nombre.toLowerCase().includes(q))
      .map((item) => ({ tipo: 'producto' as const, item }));
    return [...insumos, ...productos].slice(0, 8);
  }, [busquedaCatalogo, insumosCatalogo, productosCatalogo]);

  /** Una fila "vacía" es la fila manual en blanco que arranca el modal (o
   * cualquier fila agregada con "+Agregar" que el operador todavía no tocó):
   * sin descripción y sin vínculo a catálogo. Al vincular un insumo/producto
   * desde el buscador, esa fila se reutiliza en lugar de sumar una fila
   * nueva y dejarla en blanco (eso rompía el guardado con "línea incompleta"). */
  function filaVacia(item: ComprobanteItemRow): boolean {
    return !item.descripcion.trim() && !item.insumoId && !item.productoId;
  }

  const handleAgregarLineaInsumo = useCallback((insumo: InsumoCatalogoCompra) => {
    const nuevaLinea: ComprobanteItemRow = {
      key: generarId(),
      descripcion: insumo.nombre,
      cantidad: 1,
      precioUnitario: insumo.costo,
      descuento: 0,
      alicuotaIva: 21,
      insumoId: insumo.id,
      unidad: insumo.unidad,
    };
    setItems((prev) => {
      const idxVacia = prev.findIndex(filaVacia);
      if (idxVacia !== -1) return prev.map((it, i) => (i === idxVacia ? nuevaLinea : it));
      return [...prev, nuevaLinea];
    });
    setBusquedaCatalogo('');
  }, []);

  const handleAgregarLineaProducto = useCallback((producto: ProductoCatalogoCompra) => {
    const nuevaLinea: ComprobanteItemRow = {
      key: generarId(),
      descripcion: producto.nombre,
      cantidad: 1,
      precioUnitario: producto.costo,
      descuento: 0,
      alicuotaIva: 21,
      productoId: producto.id,
      unidad: producto.unidad,
    };
    setItems((prev) => {
      const idxVacia = prev.findIndex(filaVacia);
      if (idxVacia !== -1) return prev.map((it, i) => (i === idxVacia ? nuevaLinea : it));
      return [...prev, nuevaLinea];
    });
    setBusquedaCatalogo('');
  }, []);

  const updateItem = (index: number, field: keyof ComprobanteItemRow, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const addItem = () => setItems((prev) => [...prev, newComprobanteItemRow()]);
  const removeItem = (index: number) => { if (items.length > 1) setItems((prev) => prev.filter((_, i) => i !== index)); };

  // Fase 58e: si `precioConIva` está activo, `item.precioUnitario` es el
  // precio FINAL (con IVA) tal cual lo tipeó el operador -- hay que
  // desagregarlo a neto ANTES de aplicar descuento/calcular subtotal, para
  // que el resto de la cuenta (subtotal, IVA, y lo que termina guardado en
  // la base) siga siendo consistente con el resto del sistema (siempre neto).
  const precioNetoUnitario = (item: ComprobanteItemRow) =>
    precioConIva ? item.precioUnitario / (1 + item.alicuotaIva / 100) : item.precioUnitario;
  const getSubtotal = (item: ComprobanteItemRow) => calcularSubtotalItem(item.cantidad, precioNetoUnitario(item), item.descuento);
  const getIva = (item: ComprobanteItemRow) => getSubtotal(item) * (item.alicuotaIva / 100);

  const totalNeto = items.reduce((sum, item) => sum + getSubtotal(item), 0);
  const totalIva = items.reduce((sum, item) => sum + getIva(item), 0);

  const addOtroImpuesto = () => setOtrosImpuestos((prev) => [...prev, nuevoOtroImpuestoRow()]);
  const removeOtroImpuesto = (index: number) => setOtrosImpuestos((prev) => prev.filter((_, i) => i !== index));
  const updateOtroImpuesto = (index: number, field: keyof OtroImpuestoRow, value: string | number) => {
    setOtrosImpuestos((prev) => prev.map((imp, i) => (i === index ? { ...imp, [field]: value } : imp)));
  };
  const totalOtrosImpuestos = otrosImpuestos.reduce((sum, imp) => sum + (imp.monto || 0), 0);

  const totalFinal = totalNeto + totalIva + totalOtrosImpuestos;

  // Solo tiene sentido "Actualizar stock" si al menos una línea está
  // vinculada al catálogo real (insumo o producto) -- una línea de texto
  // libre no tiene a qué sumarle stock.
  const hayLineasVinculadas = items.some((it) => it.insumoId || it.productoId);
  const actualizarStockDisabled = controlRemision === 'si' || !hayLineasVinculadas;

  // Si se deshabilita (se activa Control de Remisión, o se borran todas las
  // líneas vinculadas) desmarcamos el tilde para no dejarlo "marcado pero
  // deshabilitado" -- confundiría qué va a pasar al guardar.
  useEffect(() => {
    if (actualizarStockDisabled) setActualizarStockChecked(false);
  }, [actualizarStockDisabled]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!proveedorId) next.proveedorId = 'Seleccione un proveedor';
    const filasIncompletas = items
      .map((it, i) => (filaItemIncompleta(it) ? i + 1 : null))
      .filter((n): n is number => n !== null);
    if (filasIncompletas.length > 0) {
      const plural = filasIncompletas.length > 1;
      next.items = `Falta descripcion y/o precio en la${plural ? 's filas' : ' fila'} ${filasIncompletas.join(', ')} (resaltada${plural ? 's' : ''} en rojo abajo).`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) setIntentoGuardar(true);
    return Object.keys(next).length === 0;
  };

  const construirItems = (): Omit<ItemComprobanteCompra, 'id'>[] =>
    items.map((item) => {
      const subtotal = getSubtotal(item);
      const montoIva = getIva(item);
      return {
        descripcion: item.descripcion.trim(), cantidad: item.cantidad,
        // Fase 58e: lo que se guarda es siempre el precio NETO -- si el
        // operador tipeó el precio con IVA incluido (`precioConIva`), acá
        // se persiste ya desagregado, para que el resto del sistema
        // (costeo de insumos, valuación de stock) no vea la diferencia.
        precioUnitario: precioNetoUnitario(item), descuento: item.descuento,
        subtotal, alicuotaIva: item.alicuotaIva, montoIva,
        insumoId: item.insumoId, productoId: item.productoId, unidad: item.unidad,
      };
    });

  const handleSave = (actualizarStock: boolean) => {
    if (!validate()) {
      // El mensaje puede quedar fuera de la vista si el usuario scrolleo
      // hacia abajo para completar filas nuevas -- llevamos la seccion de
      // items a la vista para que el error sea imposible de pasar por alto.
      itemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onSave({
      tipo, proveedorId, fecha, fechaVencimiento, medioPago,
      numeroComprobanteProveedor,
      tipoComprobanteCodigo,
      items: construirItems(),
      controlRemision,
      numeroRemito,
      actualizarStock,
      otrosImpuestos: otrosImpuestos
        .filter((imp) => imp.concepto.trim() || imp.monto)
        .map((imp) => ({ id: generarId(), concepto: imp.concepto.trim() || 'Otro impuesto', monto: imp.monto })),
      ordenCompraId: ordenCompra?.id ?? (ordenCompraSeleccionadaId || undefined),
      imagenUrl: imagenPath ?? undefined,
    });
    // La imagen ya quedó vinculada al comprobante recién guardado -- se
    // "suelta" la referencia de limpieza para que handleOpenChange no la
    // borre del bucket al cerrar el modal.
    imagenSubidaEnEstaSesionRef.current = null;
    onOpenChange(false);
  };

  /** Fase 61: si el modal se cierra (Cancelar, X, Escape, click afuera) SIN
   * haber pasado por handleSave, cualquier imagen recién subida en esta
   * apertura queda huérfana en el bucket -- se borra (best-effort). */
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && imagenSubidaEnEstaSesionRef.current) {
      eliminarImagenComprobanteManual(imagenSubidaEnEstaSesionRef.current);
      imagenSubidaEnEstaSesionRef.current = null;
    }
    onOpenChange(nextOpen);
  };

  return (
    <>
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentComprobanteClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Nuevo comprobante de compra</Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Tipo</label>
                <select className={selectClass} value={tipo} onChange={(e) => setTipo(e.target.value as TipoComprobanteCompra)}>
                  {(Object.entries(TIPO_COMPROBANTE_COMPRA_LABEL) as [TipoComprobanteCompra, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Proveedor *</label>
                <select className={selectClass} value={proveedorId} onChange={(e) => { setProveedorId(e.target.value); if (errors.proveedorId) setErrors((p) => ({ ...p, proveedorId: '' })); }}>
                  <option value="">Seleccionar...</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {errors.proveedorId && <p className="text-xs text-red-600 mt-1">{errors.proveedorId}</p>}
              </div>
              <div>
                <label className={labelClass}>Nro. de Comprobante</label>
                <div className="flex items-center gap-1.5">
                  <input
                    className={`${inputClass} w-16 text-center font-mono`}
                    value={comprobantePtoVta}
                    onChange={(e) => setComprobantePtoVta(soloDigitos(e.target.value, 4))}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      setComprobantePtoVta((v) => (v ? v.padStart(4, '0') : v));
                      comprobanteNumeroInputRef.current?.focus();
                    }}
                    onBlur={() => setComprobantePtoVta((v) => (v ? v.padStart(4, '0') : v))}
                    placeholder="0001"
                    maxLength={4}
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    ref={comprobanteNumeroInputRef}
                    className={`${inputClass} w-28 text-center font-mono`}
                    value={comprobanteNumero}
                    onChange={(e) => setComprobanteNumero(soloDigitos(e.target.value, 8))}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      setComprobanteNumero((v) => (v ? v.padStart(8, '0') : v));
                    }}
                    onBlur={() => setComprobanteNumero((v) => (v ? v.padStart(8, '0') : v))}
                    placeholder="00000542"
                    maxLength={8}
                  />
                </div>
              </div>
            </div>

            {/* Fase 61: solo cuando el modal se abrió en blanco (no vino ya
                atado a una OC puntual desde "Registrar factura") y hay
                órdenes de compra recibidas todavía sin facturar. */}
            {!ordenCompra && !!ordenesCompraDisponibles?.length && (
              <div>
                <label className={labelClass}>Facturar una Orden de Compra recibida (opcional)</label>
                <select
                  className={selectClass}
                  value={ordenCompraSeleccionadaId}
                  onChange={(e) => handleSeleccionarOrdenCompra(e.target.value)}
                >
                  <option value="">Sin vincular -- carga manual</option>
                  {ordenesCompraDisponibles.map((oc) => (
                    <option key={oc.id} value={oc.id}>
                      OC-{String(oc.numero).padStart(5, '0')} · {proveedores.find((p) => p.id === oc.proveedorId)?.nombre ?? 'Proveedor'} · {formatARS(oc.total)}
                    </option>
                  ))}
                </select>
                {ordenCompraSeleccionadaId && (
                  <p className="text-xs text-gray-500 mt-1">Se precargaron el proveedor y los ítems de esa OC -- se pueden editar antes de guardar.</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Letra/Tipo (ARCA)</label>
                <select className={selectClass} value={tipoComprobanteCodigo} onChange={(e) => setTipoComprobanteCodigo(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {TIPOS_COMPROBANTE_ARCA.map((t) => (
                    <option key={t.codigo} value={t.codigo}>{t.descripcion}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Fecha</label>
                <input className={inputClass} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Vencimiento</label>
                <input className={inputClass} type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Medio de pago</label>
                <select className={selectClass} value={medioPago} onChange={(e) => setMedioPago(e.target.value as MedioPagoCompra)}>
                  {(Object.entries(MEDIO_PAGO_COMPRA_LABEL) as [MedioPagoCompra, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Fase 61: foto/scan del comprobante -- queda visible en el
                listado con la misma miniatura/lightbox que ya existe para
                los comprobantes que llegan por el agente de WhatsApp. */}
            <div>
              <label className={labelClass}>Foto del comprobante (opcional)</label>
              <div className="flex items-center gap-3">
                {imagenPreviewUrl ? (
                  <div className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-gray-200">
                    <img src={imagenPreviewUrl} alt="Comprobante adjunto" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImagenAmpliadaPreview(imagenPreviewUrl)}
                      className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100"
                      title="Ver más grande"
                    >
                      <ZoomIn className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-300">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputImagenRef.current?.click()}
                      disabled={subiendoImagen}
                      className={`${btnSecondary} flex items-center gap-1.5 text-xs py-1.5 px-3 disabled:opacity-50`}
                    >
                      {subiendoImagen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                      {imagenPreviewUrl ? 'Reemplazar' : 'Adjuntar foto'}
                    </button>
                    {imagenPreviewUrl && (
                      <button type="button" onClick={handleQuitarImagen} className="text-xs text-gray-400 hover:text-red-600">
                        Quitar
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">JPG, PNG o WEBP -- hasta 8 MB.</p>
                  {errorImagen && <p className="text-xs text-red-600">{errorImagen}</p>}
                </div>
                <input
                  ref={fileInputImagenRef}
                  type="file"
                  accept={ACCEPT_IMAGEN_COMPROBANTE}
                  className="hidden"
                  onChange={handleImagenSeleccionada}
                />
              </div>
            </div>

            {/* Items */}
            <div ref={itemsSectionRef}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900">Items</h3>
                <button type="button" className={`${btnSecondary} flex items-center gap-1 text-xs py-1.5 px-3`} onClick={addItem}>
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
              {/* Fase 58e: la mayoría de los proveedores facturan con el
                  precio final (IVA ya adentro) -- este tilde le dice al
                  motor que desagregue en vez de sumar arriba. */}
              <label className="mb-2 flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={precioConIva}
                  onChange={(e) => setPrecioConIva(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Los precios de esta factura ya incluyen IVA (desagregar por alícuota de cada línea)
              </label>
              {errors.items && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-2">
                  <p className="text-xs text-red-700">{errors.items}</p>
                </div>
              )}

              {/* Conexión con Recepción: buscador de insumo/producto real del
                  catálogo -- clic en una sugerencia agrega una fila ya
                  vinculada (con su unidad de stock precargada). La carga
                  manual (texto libre) sigue disponible vía "Agregar". */}
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={busquedaCatalogo}
                  onChange={(e) => setBusquedaCatalogo(e.target.value)}
                  placeholder="Vincular a un insumo o producto del catálogo..."
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900/20"
                />
                {sugerenciasCatalogo.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {sugerenciasCatalogo.map((s) =>
                      s.tipo === 'insumo' ? (
                        <button
                          key={`insumo-${s.item.id}`}
                          type="button"
                          onClick={() => handleAgregarLineaInsumo(s.item)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="flex items-center gap-1.5 text-gray-900">
                            {s.item.nombre}
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                              Insumo
                            </span>
                          </span>
                          <span className="text-gray-500">
                            Stock {s.item.stock} {unidadAbrev(s.item.unidad)}
                          </span>
                        </button>
                      ) : (
                        <button
                          key={`producto-${s.item.id}`}
                          type="button"
                          onClick={() => handleAgregarLineaProducto(s.item)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="flex items-center gap-1.5 text-gray-900">
                            {s.item.nombre}
                            <span className="inline-flex items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                              Producto
                            </span>
                          </span>
                          <span className="text-gray-500">
                            Stock {s.item.stock} {unidadAbrev(s.item.unidad)}
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-x-auto scroll-shadow-x">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                      <th className="text-right px-3 py-2 font-medium w-20">Cant.</th>
                      <th className="text-left px-3 py-2 font-medium w-24">UM</th>
                      <th className="text-right px-3 py-2 font-medium w-24">{precioConIva ? 'Precio (c/IVA)' : 'Precio'}</th>
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
                      const vinculada = Boolean(item.insumoId || item.productoId);
                      return (
                        <tr
                          key={item.key}
                          className={`border-t border-gray-100 ${filaInvalida ? 'bg-red-50' : ''}`}
                        >
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                className={`w-full border-0 bg-transparent text-sm focus:outline-none ${descripcionInvalida ? 'ring-1 ring-red-400 rounded' : ''}`}
                                placeholder={descripcionInvalida ? 'Falta la descripcion' : 'Descripcion'}
                                value={item.descripcion}
                                onChange={(e) => updateItem(idx, 'descripcion', e.target.value)}
                              />
                              {vinculada && (
                                <span
                                  title={item.insumoId ? 'Vinculada a un insumo' : 'Vinculada a un producto'}
                                  className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${item.insumoId ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}
                                >
                                  {item.insumoId ? 'Insumo' : 'Producto'}
                                </span>
                              )}
                            </div>
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
                            {(() => {
                              // Fase 48b: ayuda "≈ N envases" -- ver mismo bloque en CotizacionDialog.
                              const insumo = item.insumoId ? insumosCatalogo.find((i) => i.id === item.insumoId) : undefined;
                              const pres = insumo ? presentacionDefault(insumo.presentaciones ?? []) : undefined;
                              if (!pres || !item.cantidad) return null;
                              return (
                                <p className="text-[10px] text-muted-foreground leading-tight text-right">
                                  ≈ {(item.cantidad / pres.contenido).toFixed(2).replace('.', ',')} env.
                                </p>
                              );
                            })()}
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="w-full border-0 bg-transparent text-xs focus:outline-none"
                              value={item.unidad}
                              onChange={(e) => updateItem(idx, 'unidad', e.target.value as UnidadMedida)}
                            >
                              {UNIDADES.map((u) => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`w-full text-right border-0 bg-transparent text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${precioInvalido ? 'ring-1 ring-red-400 rounded' : ''}`}
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.precioUnitario || ''}
                              onChange={(e) => updateItem(idx, 'precioUnitario', Number(e.target.value))}
                            />
                            {precioConIva && item.precioUnitario > 0 && (
                              <p className="text-[10px] text-muted-foreground leading-tight text-right">
                                neto {formatARS(precioNetoUnitario(item))}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full text-right border-0 bg-transparent text-sm focus:outline-none"
                              type="number"
                              min={0}
                              max={100}
                              value={item.descuento || ''}
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
                          <td className="px-3 py-1.5 text-right text-gray-700 font-medium">{formatARS(getSubtotal(item))}</td>
                          <td className="px-1 py-1.5">
                            <button type="button" className={btnIcon} onClick={() => removeItem(idx)} disabled={items.length <= 1}><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Otros impuestos: percepción de Ganancias, percepción de
                IIBB, impuesto a los débitos y créditos bancarios, etc. */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900">Otros impuestos / percepciones</h3>
                <button type="button" className={`${btnSecondary} flex items-center gap-1 text-xs py-1.5 px-3`} onClick={addOtroImpuesto}>
                  <Plus className="w-3.5 h-3.5" /> Agregar impuesto
                </button>
              </div>
              {otrosImpuestos.length === 0 ? (
                <p className="text-xs text-gray-400">Sin percepciones cargadas -- ej. Ganancias, IIBB, débitos y créditos bancarios.</p>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-x-auto scroll-shadow-x">
                  <table className="w-full text-sm">
                    <tbody>
                      {otrosImpuestos.map((imp, idx) => (
                        <tr key={imp.key} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                          <td className="px-3 py-1.5">
                            <input
                              className="w-full border-0 bg-transparent text-sm focus:outline-none"
                              placeholder="Ej. Percepción IIBB"
                              value={imp.concepto}
                              onChange={(e) => updateOtroImpuesto(idx, 'concepto', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5 w-32">
                            <input
                              className="w-full text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900/20"
                              type="number" min={0} step={0.01} value={imp.monto}
                              onChange={(e) => updateOtroImpuesto(idx, 'monto', Number(e.target.value))}
                            />
                          </td>
                          <td className="px-1 py-1.5 w-10">
                            <button type="button" className={btnIcon} onClick={() => removeOtroImpuesto(idx)}><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Totals */}
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
                {otrosImpuestos.map((imp) => (
                  <div className="flex justify-between" key={imp.key}>
                    <span className="text-gray-500">{imp.concepto.trim() || 'Otro impuesto'}</span>
                    <span className="text-gray-900">{formatARS(imp.monto || 0)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
                  <span className="text-gray-900">TOTAL</span>
                  <span className="text-gray-900">{formatARS(totalFinal)}</span>
                </div>
              </div>
            </div>

            {/* Conexión con Recepción: desdobla el proceso de cargar la
                compra del control de recepción física. Si hay un control de
                remito separado (Sí), "Actualizar stock" queda deshabilitado
                -- la Recepción real se carga a mano más adelante en
                Productos y Stock, con el mismo número de remito para poder
                cruzarlas. */}
            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Control de Remisión</label>
                  <div className="flex items-center gap-4 py-1">
                    <label className="flex items-center gap-1.5 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="control-remision"
                        checked={controlRemision === 'no'}
                        onChange={() => setControlRemision('no')}
                      />
                      No
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="control-remision"
                        checked={controlRemision === 'si'}
                        onChange={() => setControlRemision('si')}
                      />
                      Sí
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">
                    "Sí" si la mercadería se recibe y controla por separado (Recepción en
                    Productos y Stock) -- ahí queda deshabilitado "Actualizar stock" para
                    no duplicar el ingreso.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Nro. de remito</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      className={`${inputClass} w-16 text-center font-mono`}
                      value={remitoPtoVta}
                      onChange={(e) => setRemitoPtoVta(soloDigitos(e.target.value, 4))}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        setRemitoPtoVta((v) => (v ? v.padStart(4, '0') : v));
                        remitoNumeroInputRef.current?.focus();
                      }}
                      onBlur={() => setRemitoPtoVta((v) => (v ? v.padStart(4, '0') : v))}
                      placeholder="0001"
                      maxLength={4}
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      ref={remitoNumeroInputRef}
                      className={`${inputClass} w-28 text-center font-mono`}
                      value={remitoNumero}
                      onChange={(e) => setRemitoNumero(soloDigitos(e.target.value, 8))}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        setRemitoNumero((v) => (v ? v.padStart(8, '0') : v));
                      }}
                      onBlur={() => setRemitoNumero((v) => (v ? v.padStart(8, '0') : v))}
                      placeholder="00000542"
                      maxLength={8}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Tipeá solo los números (ej. "1" Enter, "521" Enter) -- los ceros se
                    completan solos.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-gray-100">
            <label
              className={`flex items-center gap-2 text-sm ${actualizarStockDisabled ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 cursor-pointer'}`}
              title={
                controlRemision === 'si'
                  ? 'Deshabilitado: hay control de remisión pendiente'
                  : !hayLineasVinculadas
                    ? 'Vinculá al menos una línea a un insumo o producto del catálogo'
                    : 'Al guardar, además suma el stock de las líneas vinculadas'
              }
            >
              <input
                type="checkbox"
                checked={actualizarStockChecked}
                disabled={actualizarStockDisabled}
                onChange={(e) => setActualizarStockChecked(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-600 disabled:opacity-50"
              />
              <Factory className="w-4 h-4" />
              Actualizar stock
            </label>
            <div className="flex items-center gap-3">
              <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
              <button className={btnPrimary} onClick={() => handleSave(actualizarStockChecked)}>Guardar</button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <ImageLightbox src={imagenAmpliadaPreview} onClose={() => setImagenAmpliadaPreview(null)} />
    </>
  );
}

// ─── 4. OrdenPagoDialog ─────────────────────────────────────
//
// Fase 22 -- Orden de Pago. Reemplaza al viejo "Registrar pago" (medio
// único + monto único): ahora se arma en estado 'pendiente' con una lista
// de líneas de pago, porque un mismo pago puede combinar formas (ej. parte
// transferencia + 3 cheques a 30/60/90 días, según lo pactado con el
// proveedor). La cuenta bancaria real y los cheques reales se resuelven
// recién al confirmar el pago -- ver ConfirmarPagoDialog más abajo.

interface PagoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proveedor: Proveedor;
  comprobantesPendientes: ComprobanteCompra[];
  onSave: (data: {
    fecha: string;
    monto: number;
    medioPago: MedioPagoCompra;
    imputaciones: ImputacionPago[];
    lineasPago: LineaPago[];
  }) => void;
}

interface ImputacionRow {
  comprobanteId: string;
  numero: number;
  fecha: string;
  saldoPendiente: number;
  // Fase 59 (30/08, a pedido de Carlos): guardado como texto, no number --
  // mismo criterio que CobroDialog (Ventas, tarea #36): un <input
  // type="number"> ni acepta la coma decimal del teclado en español ni se
  // le pueden sacar las flechitas de verdad (el truco CSS para eso rompe
  // en algunos navegadores). Con type="text" + inputMode="decimal" se
  // resuelven los dos problemas de una vez -- se parsea a number recién
  // donde hace falta (sumas, validación, guardado).
  textoImputado: string;
}

interface LineaPagoFormRow {
  key: string;
  medioPago: MedioPagoCompra;
  monto: number;
  chequeNumero: string;
  chequeBanco: string;
  chequeFechaPago: string;
}

function nuevaLineaPagoRow(monto = 0): LineaPagoFormRow {
  return { key: generarId(), medioPago: 'transferencia', monto, chequeNumero: '', chequeBanco: '', chequeFechaPago: '' };
}

export function OrdenPagoDialog({ open, onOpenChange, proveedor, comprobantesPendientes, onSave }: PagoDialogProps) {
  const [fecha, setFecha] = useState(todayISO());
  const [montoTexto, setMontoTexto] = useState('');
  const [imputaciones, setImputaciones] = useState<ImputacionRow[]>([]);
  const [lineasPago, setLineasPago] = useState<LineaPagoFormRow[]>([nuevaLineaPagoRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Fase 59: si está tildado, "Monto a pagar" deja de ser un campo manual y
  // pasa a seguir automáticamente la suma de lo que se va tildando/tipeando
  // en la columna Imputar -- para el flujo "elijo qué facturas pago
  // completas y el total se arma solo", inverso al flujo de siempre (tipear
  // un monto y que se reparta automático entre las facturas más viejas).
  const [seguirTotalImputado, setSeguirTotalImputado] = useState(false);

  const monto = parsearDecimal(montoTexto);

  useEffect(() => {
    if (open) {
      setFecha(todayISO());
      setMontoTexto('');
      setLineasPago([nuevaLineaPagoRow()]);
      setErrors({});
      setSeguirTotalImputado(false);

      const pendientes = comprobantesPendientes
        .filter((c) => c.estado === 'pendiente' || c.estado === 'pagado_parcial')
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((c) => ({
          comprobanteId: c.id,
          numero: c.numero,
          fecha: c.fecha,
          saldoPendiente: c.saldoPendiente,
          textoImputado: '',
        }));
      setImputaciones(pendientes);
    }
  }, [open, comprobantesPendientes]);

  const distribuirMonto = useCallback((montoTextoNuevo: string) => {
    setMontoTexto(montoTextoNuevo);
    let restante = parsearDecimal(montoTextoNuevo);
    setImputaciones((prev) =>
      prev.map((imp) => {
        if (restante <= 0) return { ...imp, textoImputado: '' };
        const asignar = Math.min(restante, imp.saldoPendiente);
        restante -= asignar;
        return { ...imp, textoImputado: decimalATexto(Math.round(asignar * 100) / 100) };
      }),
    );
    // La primer línea de pago sigue al monto total mientras sea la única --
    // en cuanto el usuario agrega otra línea, cada una se edita por separado.
    const montoNumero = parsearDecimal(montoTextoNuevo);
    setLineasPago((prev) => (prev.length === 1 ? [{ ...prev[0], monto: montoNumero }] : prev));
  }, []);

  const updateImputacion = (index: number, textoNuevo: string) => {
    setImputaciones((prev) => prev.map((imp, i) => (i === index ? { ...imp, textoImputado: textoNuevo } : imp)));
  };

  // Fase 59: tilde "pagar completo" por fila -- carga el saldo pendiente
  // tal cual (sirve igual para una factura nueva entera que para el resto
  // que le queda a una vieja ya cobrada en parte) sin tener que retipear el
  // número a mano. Se calcula "tildado" comparando contra lo que hay
  // cargado en vez de guardar un booleano aparte, así destildar (por
  // ejemplo, para cargar un monto parcial distinto) es tan simple como
  // editar el campo -- no hay dos fuentes de verdad que puedan desincronizarse.
  const filaPagadaCompleta = (imp: ImputacionRow) =>
    imp.saldoPendiente > 0 && Math.abs(parsearDecimal(imp.textoImputado) - imp.saldoPendiente) < 0.01;

  const togglePagarCompleto = (index: number, marcar: boolean) => {
    setImputaciones((prev) =>
      prev.map((imp, i) =>
        i === index
          ? { ...imp, textoImputado: marcar ? decimalATexto(Math.round(imp.saldoPendiente * 100) / 100) : '' }
          : imp,
      ),
    );
  };

  const addLineaPago = () => setLineasPago((prev) => [...prev, nuevaLineaPagoRow()]);
  const removeLineaPago = (index: number) => setLineasPago((prev) => prev.filter((_, i) => i !== index));
  const updateLineaPago = (index: number, field: keyof LineaPagoFormRow, value: string | number) => {
    setLineasPago((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const totalImputado = imputaciones.reduce((sum, imp) => sum + parsearDecimal(imp.textoImputado), 0);
  const totalLineasPago = lineasPago.reduce((sum, l) => sum + (l.monto || 0), 0);

  // Fase 59: con el tilde de cabecera activo, "Monto a pagar" se recalcula
  // solo cada vez que cambia la imputación -- y también empuja la línea de
  // pago única, mismo criterio que `distribuirMonto` de arriba.
  useEffect(() => {
    if (!seguirTotalImputado) return;
    const textoNuevo = decimalATexto(Math.round(totalImputado * 100) / 100);
    setMontoTexto(textoNuevo);
    setLineasPago((prev) => (prev.length === 1 ? [{ ...prev[0], monto: totalImputado }] : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seguirTotalImputado, totalImputado]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (monto <= 0) next.monto = 'El monto debe ser mayor a 0';
    if (totalImputado > monto + 0.01) next.imputaciones = 'La suma de imputaciones excede el monto';
    if (imputaciones.some((imp) => parsearDecimal(imp.textoImputado) > imp.saldoPendiente + 0.01)) next.imputaciones = 'Una imputacion excede el saldo pendiente';
    if (Math.abs(totalLineasPago - monto) > 0.01) next.lineasPago = 'La suma de las líneas de pago debe ser igual al monto';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    // Todos los medios de una misma orden coinciden -> ese es el "medio
    // principal" (compat con badges/reportes existentes); si se combinan
    // distintos, queda en 'otro'.
    const medios = new Set(lineasPago.map((l) => l.medioPago));
    const medioPago: MedioPagoCompra = medios.size === 1 ? [...medios][0] : 'otro';

    onSave({
      fecha, monto, medioPago,
      imputaciones: imputaciones
        .map((imp) => ({ comprobanteId: imp.comprobanteId, montoImputado: parsearDecimal(imp.textoImputado) }))
        .filter((imp) => imp.montoImputado > 0),
      lineasPago: lineasPago
        .filter((l) => l.monto > 0)
        .map((l) => ({
          id: generarId(),
          medioPago: l.medioPago,
          monto: l.monto,
          ...(l.medioPago === 'cheque'
            ? {
                chequeNumero: l.chequeNumero.trim() || undefined,
                chequeBanco: l.chequeBanco.trim() || undefined,
                chequeFechaPago: l.chequeFechaPago || undefined,
              }
            : {}),
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
              Nueva Orden de Pago — {proveedor.nombre}
            </Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Fecha</label>
                <input className={inputClass} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Monto a pagar *</label>
                  {/* Fase 59: tilde para que el monto siga a lo imputado en
                      vez de tipearlo -- útil cuando ya tildaste "completo"
                      en una o varias facturas de abajo. */}
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={seguirTotalImputado}
                      onChange={(e) => setSeguirTotalImputado(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Igualar al total imputado
                  </label>
                </div>
                <input
                  className={inputClass}
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  disabled={seguirTotalImputado}
                  value={seguirTotalImputado ? decimalATexto(Math.round(totalImputado * 100) / 100) : montoTexto}
                  onChange={(e) => distribuirMonto(sanitizarDecimal(e.target.value))}
                />
                {errors.monto && <p className="text-xs text-red-600 mt-1">{errors.monto}</p>}
              </div>
            </div>

            {/* Imputacion table */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">Imputación a comprobantes</h3>
              {errors.imputaciones && <p className="text-xs text-red-600 mb-2">{errors.imputaciones}</p>}

              {imputaciones.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No hay comprobantes pendientes para este proveedor.
                </p>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-x-auto scroll-shadow-x">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="text-left px-3 py-2 font-medium">Comprobante</th>
                        <th className="text-left px-3 py-2 font-medium">Fecha</th>
                        <th className="text-right px-3 py-2 font-medium">Saldo pend.</th>
                        <th className="text-right px-3 py-2 font-medium w-32">Imputar</th>
                        {/* Fase 59: tilde "pagar completo" -- carga el saldo
                            pendiente de esa fila sin retipearlo (sirve igual
                            para una factura nueva que para lo que le queda a
                            una vieja ya cobrada en parte). */}
                        <th className="text-center px-2 py-2 font-medium w-16">Completo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {imputaciones.map((imp, idx) => (
                        <tr key={imp.comprobanteId} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-700">#{imp.numero}</td>
                          <td className="px-3 py-2 text-gray-500">{imp.fecha}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{formatARS(imp.saldoPendiente)}</td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900/20"
                              type="text"
                              inputMode="decimal"
                              placeholder="0,00"
                              value={imp.textoImputado}
                              onChange={(e) => updateImputacion(idx, sanitizarDecimal(e.target.value))}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              title="Pagar completo"
                              checked={filaPagadaCompleta(imp)}
                              onChange={(e) => togglePagarCompleto(idx, e.target.checked)}
                              className="rounded border-gray-300"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end mt-3">
                <div className="w-64 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Monto pago</span>
                    <span className="text-gray-900">{formatARS(monto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total imputado</span>
                    <span className="text-gray-900">{formatARS(totalImputado)}</span>
                  </div>
                  {/* Fase 59b (30/08, a pedido de Carlos): "Sin imputar" es
                      monto - totalImputado -- tiene sentido como número
                      positivo (todavía queda plata del pago sin asignar a
                      ninguna factura), pero si tildaste "Completo" en varias
                      facturas SIN tildar "Igualar al total imputado" arriba,
                      totalImputado termina siendo mayor que monto y esta
                      resta da negativa -- no es "sin imputar" en negativo,
                      es justo lo contrario: te comprometiste a pagar más de
                      lo que dice "Monto a pagar". Se muestra como una
                      advertencia aparte, con el monto en positivo, en vez de
                      un "saldo espejo" negativo que no significa nada leído
                      así. */}
                  {monto - totalImputado >= -0.01 ? (
                    <div className="flex justify-between font-medium">
                      <span className="text-gray-500">Sin imputar</span>
                      <span className={monto - totalImputado > 0.01 ? 'text-amber-600' : 'text-gray-900'}>
                        {formatARS(monto - totalImputado)}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between font-medium">
                        <span className="text-red-600">Excede el monto a pagar</span>
                        <span className="text-red-600">{formatARS(totalImputado - monto)}</span>
                      </div>
                      <p className="text-xs text-red-600 mt-0.5">
                        Tildá "Igualar al total imputado" arriba, o ajustá el Monto a pagar a mano.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Líneas de pago -- cómo se paga (puede combinar medios) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900">Líneas de pago</h3>
                <button onClick={addLineaPago} className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
                  <Plus className="w-3.5 h-3.5" /> Agregar línea de pago
                </button>
              </div>
              {errors.lineasPago && <p className="text-xs text-red-600 mb-2">{errors.lineasPago}</p>}
              <p className="text-xs text-gray-400 mb-2">
                La cuenta bancaria y, si corresponde, el cheque real, se eligen recién al confirmar el pago.
              </p>

              <div className="space-y-2">
                {lineasPago.map((linea, idx) => (
                  <div key={linea.key} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        className={`${selectClass} w-40`}
                        value={linea.medioPago}
                        onChange={(e) => updateLineaPago(idx, 'medioPago', e.target.value as MedioPagoCompra)}
                      >
                        {(Object.entries(MEDIO_PAGO_COMPRA_LABEL) as [MedioPagoCompra, string][]).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                      <input
                        className={`${inputClass} flex-1`}
                        type="number" min={0} step={0.01}
                        placeholder="Monto"
                        value={linea.monto}
                        onChange={(e) => updateLineaPago(idx, 'monto', Number(e.target.value))}
                      />
                      <button
                        onClick={() => removeLineaPago(idx)}
                        disabled={lineasPago.length <= 1}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {linea.medioPago === 'cheque' && (
                      <div className="grid grid-cols-3 gap-2 pl-1">
                        <input
                          className={`${inputClass} text-xs`}
                          placeholder="Número de cheque"
                          value={linea.chequeNumero}
                          onChange={(e) => updateLineaPago(idx, 'chequeNumero', e.target.value)}
                        />
                        <input
                          className={`${inputClass} text-xs`}
                          placeholder="Banco"
                          value={linea.chequeBanco}
                          onChange={(e) => updateLineaPago(idx, 'chequeBanco', e.target.value)}
                        />
                        <input
                          className={`${inputClass} text-xs`}
                          type="date"
                          title="Fecha de pago (vencimiento)"
                          value={linea.chequeFechaPago}
                          onChange={(e) => updateLineaPago(idx, 'chequeFechaPago', e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end mt-2">
                <div className="text-sm">
                  <span className="text-gray-500 mr-2">Total líneas de pago</span>
                  <span className={Math.abs(totalLineasPago - monto) > 0.01 ? 'text-amber-600 font-medium' : 'text-gray-900 font-medium'}>
                    {formatARS(totalLineasPago)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
            <button className={btnPrimary} onClick={handleSave}>Guardar</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── 4b. ConfirmarPagoDialog ────────────────────────────────
//
// Ejecuta una Orden de Pago 'pendiente': acá sí se elige la cuenta bancaria
// real para las líneas de transferencia/efectivo, y se terminan de cargar
// los datos del cheque (si no se cargaron ya al armar la orden) para las
// líneas de cheque. Al confirmar, cada línea genera su movimiento real en
// Tesorería (ver store.tsx, CONFIRMAR_PAGO).

export interface CuentaBancariaOpcionDialog {
  id: string;
  banco: string;
  alias: string;
  numero: string;
}

interface ConfirmarPagoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pago?: PagoCompra;
  proveedorNombre?: string;
  /** Fase 67: necesario para subir el ticket al bucket privado (el path
   * de Storage exige el cliente como primer segmento de la carpeta). */
  clienteId?: string;
  cuentas: CuentaBancariaOpcionDialog[];
  onConfirm: (data: { fecha: string; lineasPago: LineaPago[] }) => void;
}

interface LineaPagoConfirmRow extends LineaPago {
  /** Fase 67: true mientras se sube la foto del ticket -- deshabilita el
   * input para no disparar dos subidas en paralelo sobre la misma línea. */
  subiendoTicket?: boolean;
  /** Fase 67: URL YA FIRMADA para previsualizar el ticket recién subido
   * (o el que ya tenía la línea al reabrir el diálogo) -- separada de
   * `imagenUrl`, que guarda el PATH (lo que se persiste). */
  ticketPreviewUrl?: string;
  /** Fase 67: tilde para mostrar los campos de reintegro esperado --
   * borrador de UI, no viaja al guardar (lo que importa es si
   * `reintegroMonto` quedó > 0). */
  mostrarReintegro?: boolean;
}

export function ConfirmarPagoDialog({ open, onOpenChange, pago, proveedorNombre, clienteId, cuentas, onConfirm }: ConfirmarPagoDialogProps) {
  const [fecha, setFecha] = useState(todayISO());
  const [lineas, setLineas] = useState<LineaPagoConfirmRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && pago) {
      setFecha(todayISO());
      const iniciales = pago.lineasPago.map((l) => ({ ...l, cuentaBancariaId: l.cuentaBancariaId ?? cuentas[0]?.id, mostrarReintegro: Boolean(l.reintegroMonto) }));
      setLineas(iniciales);
      setError('');
      // Si alguna línea ya traía un ticket adjuntado (ej. se abrió, se
      // cerró sin confirmar, se reabre), firmamos su URL para la miniatura.
      const paths = iniciales.map((l) => l.imagenUrl).filter((p): p is string => Boolean(p));
      if (paths.length) {
        firmarUrlsDeTickets(paths).then((mapa) => {
          setLineas((prev) => prev.map((l) => (l.imagenUrl ? { ...l, ticketPreviewUrl: mapa.get(l.imagenUrl) } : l)));
        });
      }
    }
  }, [open, pago, cuentas]);

  const updateLinea = (index: number, field: keyof LineaPagoConfirmRow, value: string | number | boolean | undefined) => {
    setLineas((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const handleAdjuntarTicket = async (index: number, file: File | undefined) => {
    if (!file || !clienteId) return;
    updateLinea(index, 'subiendoTicket', true);
    try {
      const { path, signedUrl } = await subirImagenComprobanteManual(file, clienteId);
      setLineas((prev) =>
        prev.map((l, i) => (i === index ? { ...l, imagenUrl: path, ticketPreviewUrl: signedUrl, subiendoTicket: false } : l)),
      );
    } catch (err: any) {
      setError(err?.message || 'No se pudo subir el ticket.');
      updateLinea(index, 'subiendoTicket', false);
    }
  };

  const handleQuitarTicket = (index: number) => {
    const path = lineas[index]?.imagenUrl;
    if (path) eliminarImagenComprobanteManual(path);
    setLineas((prev) => prev.map((l, i) => (i === index ? { ...l, imagenUrl: undefined, ticketPreviewUrl: undefined } : l)));
  };

  const handleConfirm = () => {
    const faltaCuenta = lineas.some((l) => (l.medioPago === 'transferencia' || l.medioPago === 'efectivo' || l.medioPago === 'otro') && !l.cuentaBancariaId);
    const faltaCheque = lineas.some((l) => l.medioPago === 'cheque' && (!l.chequeNumero?.trim() || !l.chequeBanco?.trim() || !l.chequeFechaPago || !l.cuentaBancariaId));
    if (faltaCuenta) return setError('Elegí la cuenta bancaria para todas las líneas de transferencia/efectivo/otro.');
    if (faltaCheque) return setError('Completá número, banco, fecha de pago y cuenta de origen para todas las líneas de cheque.');
    setError('');

    onConfirm({
      fecha,
      // Se sacan los campos que son solo borrador de UI (subiendoTicket,
      // ticketPreviewUrl, mostrarReintegro) -- lo que persiste es
      // imagenUrl (el path) y reintegroConcepto/reintegroMonto si el
      // usuario cargó algo, ver LineaPago en types/index.ts.
      lineasPago: lineas.map(({ subiendoTicket, ticketPreviewUrl, mostrarReintegro, ...l }) => ({
        ...l,
        chequeId: l.medioPago === 'cheque' ? (l.chequeId ?? generarId()) : l.chequeId,
        reintegroMonto: mostrarReintegro && l.reintegroMonto ? l.reintegroMonto : undefined,
        reintegroConcepto: mostrarReintegro && l.reintegroMonto ? l.reintegroConcepto : undefined,
      })),
    });
    onOpenChange(false);
  };

  if (!pago) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentWideClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              Confirmar pago — {proveedorNombre ?? 'Proveedor'}
            </Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>

          <div className="space-y-5">
            <div>
              <label className={labelClass}>Fecha de pago</label>
              <input className={`${inputClass} max-w-xs`} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>

            {cuentas.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No hay ninguna cuenta bancaria cargada en Tesorería. Cargá una en Tesorería &gt; Bancos antes de confirmar transferencias o cheques.
              </p>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="space-y-3">
              {lineas.map((linea, idx) => (
                <div key={linea.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{MEDIO_PAGO_COMPRA_LABEL[linea.medioPago]}</span>
                    <span className="text-sm text-gray-700">{formatARS(linea.monto)}</span>
                  </div>

                  {(linea.medioPago === 'transferencia' || linea.medioPago === 'efectivo' || linea.medioPago === 'otro') && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Cuenta bancaria *</label>
                      <select
                        className={selectClass}
                        value={linea.cuentaBancariaId ?? ''}
                        onChange={(e) => updateLinea(idx, 'cuentaBancariaId', e.target.value)}
                      >
                        <option value="">Seleccionar...</option>
                        {cuentas.map((c) => (
                          <option key={c.id} value={c.id}>{c.banco} — {c.alias || c.numero}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {linea.medioPago === 'cheque' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Número de cheque *</label>
                        <input className={inputClass} value={linea.chequeNumero ?? ''} onChange={(e) => updateLinea(idx, 'chequeNumero', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Banco *</label>
                        <input className={inputClass} value={linea.chequeBanco ?? ''} onChange={(e) => updateLinea(idx, 'chequeBanco', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Fecha de pago *</label>
                        <input className={inputClass} type="date" value={linea.chequeFechaPago ?? ''} onChange={(e) => updateLinea(idx, 'chequeFechaPago', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Cuenta de origen *</label>
                        <select
                          className={selectClass}
                          value={linea.cuentaBancariaId ?? ''}
                          onChange={(e) => updateLinea(idx, 'cuentaBancariaId', e.target.value)}
                        >
                          <option value="">Seleccionar...</option>
                          {cuentas.map((c) => (
                            <option key={c.id} value={c.id}>{c.banco} — {c.alias || c.numero}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Fase 67 (01/09, a pedido de Carlos): ticket del
                      pago (cupón de tarjeta, comprobante de MercadoPago,
                      etc.) + si esa línea generó un reintegro/crédito
                      esperado (ej. Promo Pampa) -- ver src/lib/creditos.ts.
                      No toca el monto de la línea ni el total del pago:
                      el reintegro es plata que el banco te devuelve
                      DESPUÉS, aparte. */}
                  <div className="pt-2 border-t border-gray-100 space-y-2">
                    <div className="flex items-center gap-2">
                      {linea.ticketPreviewUrl ? (
                        <div className="flex items-center gap-2">
                          <a href={linea.ticketPreviewUrl} target="_blank" rel="noreferrer">
                            <img src={linea.ticketPreviewUrl} alt="Ticket" className="h-10 w-10 rounded border border-gray-200 object-cover" />
                          </a>
                          <button type="button" onClick={() => handleQuitarTicket(idx)} className="text-xs text-gray-400 hover:text-red-600">
                            Quitar ticket
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer">
                          {linea.subiendoTicket ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ImagePlus className="w-3.5 h-3.5" />
                          )}
                          {linea.subiendoTicket ? 'Subiendo...' : 'Adjuntar ticket'}
                          <input
                            type="file"
                            accept={ACCEPT_IMAGEN_COMPROBANTE}
                            className="hidden"
                            disabled={linea.subiendoTicket}
                            onChange={(e) => handleAdjuntarTicket(idx, e.target.files?.[0])}
                          />
                        </label>
                      )}
                    </div>

                    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(linea.mostrarReintegro)}
                        onChange={(e) => updateLinea(idx, 'mostrarReintegro', e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      Esta línea genera un reintegro/crédito esperado (ej. promo bancaria)
                    </label>
                    {linea.mostrarReintegro && (
                      <div className="grid grid-cols-3 gap-2 pl-1">
                        <input
                          className={`${inputClass} text-xs col-span-2`}
                          placeholder="Concepto (ej. Promo Pampa 25%, tope $25.000)"
                          value={linea.reintegroConcepto ?? ''}
                          onChange={(e) => updateLinea(idx, 'reintegroConcepto', e.target.value)}
                        />
                        <input
                          className={`${inputClass} text-xs`}
                          type="number" min={0} step={0.01}
                          placeholder="Monto esperado"
                          value={linea.reintegroMonto ?? ''}
                          onChange={(e) => updateLinea(idx, 'reintegroMonto', Number(e.target.value))}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
            <button className={btnPrimary} onClick={handleConfirm}>Confirmar pago</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── 5. OrdenCompraPreciosDialog ────────────────────────────
//
// Punto 3 del pedido de Cotizaciones (Fase 21): una vez generada la OC a
// partir de una cotización respondida, acá se cargan los precios que el
// proveedor cotizó (por si no venían cargados en la cotización, o llegaron
// distintos) y se "confirma" -- guardar acá es la confirmación: deja la OC
// con los precios definitivos, lista para recepción/facturación.

interface OrdenCompraPreciosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orden?: OrdenCompra;
  proveedorNombre?: string;
  onSave: (data: { items: ItemCompra[]; montoIva: number; otrosImpuestos: ImpuestoOrdenCompra[] }) => void;
}

interface OrdenCompraItemRow {
  key: string;
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  productoId?: string;
  insumoId?: string;
  unidad?: UnidadMedida;
  /** IVA por línea -- opcional: no todos los proveedores facturan lo mismo
   * (algunos ítems pueden ir a alícuota reducida, exentos, etc.). */
  alicuotaIva: number;
}

const ALICUOTAS_IVA = [0, 10.5, 21, 27] as const;

interface OtroImpuestoRow {
  key: string;
  concepto: string;
  monto: number;
}

function nuevoOtroImpuestoRow(): OtroImpuestoRow {
  return { key: generarId(), concepto: '', monto: 0 };
}

export function OrdenCompraPreciosDialog({ open, onOpenChange, orden, proveedorNombre, onSave }: OrdenCompraPreciosDialogProps) {
  const [items, setItems] = useState<OrdenCompraItemRow[]>([]);
  // Percepciones/impuestos adicionales cargados a mano -- percepción de
  // Ganancias, percepción de IIBB, impuesto a los débitos y créditos
  // bancarios, etc. Lista libre porque varía según proveedor/jurisdicción.
  const [otrosImpuestos, setOtrosImpuestos] = useState<OtroImpuestoRow[]>([]);

  useEffect(() => {
    if (open && orden) {
      setItems(orden.items.map((it) => ({
        key: it.id, id: it.id, descripcion: it.descripcion, cantidad: it.cantidad,
        precioUnitario: it.precioUnitario, descuento: it.descuento,
        productoId: it.productoId, insumoId: it.insumoId, unidad: it.unidad,
        alicuotaIva: it.alicuotaIva ?? 21,
      })));
      setOtrosImpuestos(
        (orden.otrosImpuestos ?? []).map((imp) => ({ key: imp.id, concepto: imp.concepto, monto: imp.monto })),
      );
    }
  }, [open, orden]);

  const updateItem = (index: number, field: keyof OrdenCompraItemRow, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const getSubtotal = (item: OrdenCompraItemRow) => calcularSubtotalItem(item.cantidad, item.precioUnitario, item.descuento);
  const getIva = (item: OrdenCompraItemRow) => getSubtotal(item) * (item.alicuotaIva / 100);

  const subtotal = items.reduce((sum, item) => sum + getSubtotal(item), 0);
  const totalIva = items.reduce((sum, item) => sum + getIva(item), 0);

  const addOtroImpuesto = () => setOtrosImpuestos((prev) => [...prev, nuevoOtroImpuestoRow()]);
  const removeOtroImpuesto = (index: number) => setOtrosImpuestos((prev) => prev.filter((_, i) => i !== index));
  const updateOtroImpuesto = (index: number, field: keyof OtroImpuestoRow, value: string | number) => {
    setOtrosImpuestos((prev) => prev.map((imp, i) => (i === index ? { ...imp, [field]: value } : imp)));
  };
  const totalOtrosImpuestos = otrosImpuestos.reduce((sum, imp) => sum + (imp.monto || 0), 0);

  const totalFinal = subtotal + totalIva + totalOtrosImpuestos;

  const handleSave = () => {
    onSave({
      items: items.map((item) => ({
        id: item.id, descripcion: item.descripcion, cantidad: item.cantidad,
        precioUnitario: item.precioUnitario, descuento: item.descuento, subtotal: getSubtotal(item),
        productoId: item.productoId, insumoId: item.insumoId, unidad: item.unidad,
        alicuotaIva: item.alicuotaIva, montoIva: getIva(item),
      })),
      montoIva: totalIva,
      otrosImpuestos: otrosImpuestos
        .filter((imp) => imp.concepto.trim() || imp.monto)
        .map((imp) => ({ id: generarId(), concepto: imp.concepto.trim() || 'Otro impuesto', monto: imp.monto })),
    });
    onOpenChange(false);
  };

  if (!orden) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentComprobanteClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              Cargar precios cotizados — OC {formatOCNumeroCorto(orden.numero)}
            </Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>

          {proveedorNombre && (
            <p className="text-sm text-gray-500 -mt-3 mb-4">Proveedor: {proveedorNombre}</p>
          )}

          <div className="space-y-5">
            <div className="border border-gray-200 rounded-lg overflow-x-auto scroll-shadow-x">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                    <th className="text-right px-3 py-2 font-medium w-20">Cant.</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Precio cotizado</th>
                    <th className="text-right px-3 py-2 font-medium w-16">Dto.%</th>
                    <th className="text-right px-3 py-2 font-medium w-20">IVA</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.key} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-900">{item.descripcion}</td>
                      <td className="px-2 py-1.5">
                        <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none" type="number" min={0} step={0.01} value={item.cantidad} onChange={(e) => updateItem(idx, 'cantidad', Number(e.target.value))} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          autoFocus={idx === 0}
                          className="w-full text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900/20"
                          type="number" min={0} step={0.01} value={item.precioUnitario}
                          onChange={(e) => updateItem(idx, 'precioUnitario', Number(e.target.value))}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none" type="number" min={0} max={100} value={item.descuento} onChange={(e) => updateItem(idx, 'descuento', Number(e.target.value))} />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          className="w-full border-0 bg-transparent text-xs text-right focus:outline-none"
                          value={item.alicuotaIva}
                          onChange={(e) => updateItem(idx, 'alicuotaIva', Number(e.target.value))}
                        >
                          {ALICUOTAS_IVA.map((a) => (
                            <option key={a} value={a}>{a}%</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-700 font-medium">{formatARS(getSubtotal(item))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Otros impuestos: percepción de Ganancias, percepción de
                IIBB, impuesto a los débitos y créditos bancarios, etc. */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900">Otros impuestos / percepciones</h3>
                <button type="button" className={`${btnSecondary} flex items-center gap-1 text-xs py-1.5 px-3`} onClick={addOtroImpuesto}>
                  <Plus className="w-3.5 h-3.5" /> Agregar impuesto
                </button>
              </div>
              {otrosImpuestos.length === 0 ? (
                <p className="text-xs text-gray-400">Sin percepciones cargadas -- ej. Ganancias, IIBB, débitos y créditos bancarios.</p>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-x-auto scroll-shadow-x">
                  <table className="w-full text-sm">
                    <tbody>
                      {otrosImpuestos.map((imp, idx) => (
                        <tr key={imp.key} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                          <td className="px-3 py-1.5">
                            <input
                              className="w-full border-0 bg-transparent text-sm focus:outline-none"
                              placeholder="Ej. Percepción IIBB"
                              value={imp.concepto}
                              onChange={(e) => updateOtroImpuesto(idx, 'concepto', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5 w-32">
                            <input
                              className="w-full text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900/20"
                              type="number" min={0} step={0.01} value={imp.monto}
                              onChange={(e) => updateOtroImpuesto(idx, 'monto', Number(e.target.value))}
                            />
                          </td>
                          <td className="px-1 py-1.5 w-10">
                            <button type="button" className={btnIcon} onClick={() => removeOtroImpuesto(idx)}><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <div className="w-64 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-900">{formatARS(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">IVA</span>
                  <span className="text-gray-900">{formatARS(totalIva)}</span>
                </div>
                {otrosImpuestos.map((imp) => (
                  <div className="flex justify-between" key={imp.key}>
                    <span className="text-gray-500">{imp.concepto.trim() || 'Otro impuesto'}</span>
                    <span className="text-gray-900">{formatARS(imp.monto || 0)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
                  <span className="text-gray-900">TOTAL</span>
                  <span className="text-gray-900">{formatARS(totalFinal)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
            <button className={btnPrimary} onClick={handleSave}>Confirmar precios</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function formatOCNumeroCorto(numero: number): string {
  return `OC-${numero.toString().padStart(5, '0')}`;
}
