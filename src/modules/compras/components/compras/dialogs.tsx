// ============================================================
// Modulo Compras — Dialogs
// Edgy Gestion · React 19 + Radix UI + Tailwind CSS 4
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Trash2 } from 'lucide-react';

import type {
  Proveedor,
  CondicionIvaProveedor,
  PedidoCotizacion,
  TipoComprobanteCompra,
  MedioPagoCompra,
  ComprobanteCompra,
  ImputacionPago,
  ItemComprobanteCompra,
} from '../../types';

import {
  calcularSubtotalItem,
  generarId,
  CONDICION_IVA_PROV_LABEL,
  TIPO_COMPROBANTE_COMPRA_LABEL,
  MEDIO_PAGO_COMPRA_LABEL,
} from '../../types';

import { formatARS, todayISO } from '../../lib/format';

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

// ─── 1. ProveedorDialog ─────────────────────────────────────

interface ProveedorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proveedor?: Proveedor;
  onSave: (data: Omit<Proveedor, 'id' | 'saldoCuentaCorriente' | 'activo' | 'createdAt' | 'updatedAt'>) => void;
}

interface ProveedorForm {
  nombre: string;
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
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      nombre: form.nombre.trim(),
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
    items: { descripcion: string; cantidad: number; precioUnitario: number; descuento: number; subtotal: number }[];
  }) => void;
}

interface CotizacionItemRow {
  key: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
}

function newCotizacionItemRow(): CotizacionItemRow {
  return { key: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0 };
}

export function CotizacionDialog({ open, onOpenChange, proveedores, cotizacion, validezDefault, onSave }: CotizacionDialogProps) {
  const [proveedorId, setProveedorId] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [validezDias, setValidezDias] = useState(validezDefault);
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<CotizacionItemRow[]>([newCotizacionItemRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      if (cotizacion) {
        setProveedorId(cotizacion.proveedorId);
        setFecha(cotizacion.fecha);
        setValidezDias(cotizacion.validezDias);
        setNotas(cotizacion.notas ?? '');
        setItems(cotizacion.items.map((it) => ({
          key: it.id, descripcion: it.descripcion, cantidad: it.cantidad, precioUnitario: it.precioUnitario, descuento: it.descuento,
        })));
      } else {
        setProveedorId('');
        setFecha(todayISO());
        setValidezDias(validezDefault);
        setNotas('');
        setItems([newCotizacionItemRow()]);
      }
      setErrors({});
    }
  }, [open, cotizacion, validezDefault]);

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
    if (items.some((it) => !it.descripcion.trim())) next.items = 'Complete la descripcion de cada item';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      proveedorId, fecha, validezDias, notas,
      items: items.map((item) => ({
        descripcion: item.descripcion.trim(), cantidad: item.cantidad,
        precioUnitario: item.precioUnitario, descuento: item.descuento, subtotal: getSubtotal(item),
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
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900">Items</h3>
                <button type="button" className={`${btnSecondary} flex items-center gap-1 text-xs py-1.5 px-3`} onClick={addItem}>
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
              {errors.items && <p className="text-xs text-red-600 mb-2">{errors.items}</p>}

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                      <th className="text-right px-3 py-2 font-medium w-20">Cant.</th>
                      <th className="text-right px-3 py-2 font-medium w-24">Precio</th>
                      <th className="text-right px-3 py-2 font-medium w-16">Dto.%</th>
                      <th className="text-right px-3 py-2 font-medium w-24">Subtotal</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.key} className="border-t border-gray-100">
                        <td className="px-2 py-1.5">
                          <input className="w-full border-0 bg-transparent text-sm focus:outline-none" placeholder="Descripcion" value={item.descripcion} onChange={(e) => updateItem(idx, 'descripcion', e.target.value)} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none" type="number" min={1} value={item.cantidad} onChange={(e) => updateItem(idx, 'cantidad', Number(e.target.value))} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none" type="number" min={0} step={0.01} value={item.precioUnitario} onChange={(e) => updateItem(idx, 'precioUnitario', Number(e.target.value))} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none" type="number" min={0} max={100} value={item.descuento} onChange={(e) => updateItem(idx, 'descuento', Number(e.target.value))} />
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-700 font-medium">{formatARS(getSubtotal(item))}</td>
                        <td className="px-1 py-1.5">
                          <button type="button" className={btnIcon} onClick={() => removeItem(idx)} disabled={items.length <= 1}><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))}
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
  onSave: (data: {
    tipo: TipoComprobanteCompra;
    proveedorId: string;
    fecha: string;
    fechaVencimiento: string;
    medioPago: MedioPagoCompra;
    items: Omit<ItemComprobanteCompra, 'id'>[];
  }) => void;
}

interface ComprobanteItemRow {
  key: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  alicuotaIva: number;
}

function newComprobanteItemRow(): ComprobanteItemRow {
  return { key: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0, alicuotaIva: 21 };
}

/** Una fila de item se considera incompleta si falta la descripcion o el precio. */
function filaItemIncompleta(item: ComprobanteItemRow): boolean {
  return !item.descripcion.trim() || item.precioUnitario <= 0;
}

export function ComprobanteCompraDialog({ open, onOpenChange, proveedores, onSave }: ComprobanteCompraDialogProps) {
  const [tipo, setTipo] = useState<TipoComprobanteCompra>('factura');
  const [proveedorId, setProveedorId] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [medioPago, setMedioPago] = useState<MedioPagoCompra>('transferencia');
  const [items, setItems] = useState<ComprobanteItemRow[]>([newComprobanteItemRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Se activa recien despues del primer intento fallido de guardar: a partir
  // de ahi, las filas incompletas se resaltan en rojo en vivo.
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const itemsSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTipo('factura');
      setProveedorId('');
      setFecha(todayISO());
      setFechaVencimiento('');
      setMedioPago('transferencia');
      setItems([newComprobanteItemRow()]);
      setErrors({});
      setIntentoGuardar(false);
    }
  }, [open]);

  const updateItem = (index: number, field: keyof ComprobanteItemRow, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const addItem = () => setItems((prev) => [...prev, newComprobanteItemRow()]);
  const removeItem = (index: number) => { if (items.length > 1) setItems((prev) => prev.filter((_, i) => i !== index)); };

  const getSubtotal = (item: ComprobanteItemRow) => calcularSubtotalItem(item.cantidad, item.precioUnitario, item.descuento);
  const getIva = (item: ComprobanteItemRow) => getSubtotal(item) * (item.alicuotaIva / 100);

  const totalNeto = items.reduce((sum, item) => sum + getSubtotal(item), 0);
  const totalIva = items.reduce((sum, item) => sum + getIva(item), 0);
  const totalFinal = totalNeto + totalIva;

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

  const handleSave = () => {
    if (!validate()) {
      // El mensaje puede quedar fuera de la vista si el usuario scrolleo
      // hacia abajo para completar filas nuevas -- llevamos la seccion de
      // items a la vista para que el error sea imposible de pasar por alto.
      itemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onSave({
      tipo, proveedorId, fecha, fechaVencimiento, medioPago,
      items: items.map((item) => {
        const subtotal = getSubtotal(item);
        const montoIva = getIva(item);
        return {
          descripcion: item.descripcion.trim(), cantidad: item.cantidad,
          precioUnitario: item.precioUnitario, descuento: item.descuento,
          subtotal, alicuotaIva: item.alicuotaIva, montoIva,
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
            <Dialog.Title className="text-lg font-semibold text-gray-900">Nuevo comprobante de compra</Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <div className="grid grid-cols-3 gap-3">
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

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-left px-3 py-2 font-medium">Descripcion</th>
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
                              placeholder={descripcionInvalida ? 'Falta la descripcion' : 'Descripcion'}
                              value={item.descripcion}
                              onChange={(e) => updateItem(idx, 'descripcion', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full text-right border-0 bg-transparent text-sm focus:outline-none"
                              type="number"
                              min={1}
                              value={item.cantidad}
                              onChange={(e) => updateItem(idx, 'cantidad', Number(e.target.value))}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`w-full text-right border-0 bg-transparent text-sm focus:outline-none ${precioInvalido ? 'ring-1 ring-red-400 rounded' : ''}`}
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.precioUnitario}
                              onChange={(e) => updateItem(idx, 'precioUnitario', Number(e.target.value))}
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
                <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
                  <span className="text-gray-900">TOTAL</span>
                  <span className="text-gray-900">{formatARS(totalFinal)}</span>
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

// ─── 4. PagoDialog ──────────────────────────────────────────

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
  }) => void;
}

interface ImputacionRow {
  comprobanteId: string;
  numero: number;
  fecha: string;
  saldoPendiente: number;
  montoImputado: number;
}

export function PagoDialog({ open, onOpenChange, proveedor, comprobantesPendientes, onSave }: PagoDialogProps) {
  const [fecha, setFecha] = useState(todayISO());
  const [monto, setMonto] = useState(0);
  const [medioPago, setMedioPago] = useState<MedioPagoCompra>('transferencia');
  const [imputaciones, setImputaciones] = useState<ImputacionRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setFecha(todayISO());
      setMonto(0);
      setMedioPago('transferencia');
      setErrors({});

      const pendientes = comprobantesPendientes
        .filter((c) => c.estado === 'pendiente' || c.estado === 'pagado_parcial')
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
  }, [open, comprobantesPendientes]);

  const distribuirMonto = useCallback((nuevoMonto: number) => {
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
  }, []);

  const updateImputacion = (index: number, value: number) => {
    setImputaciones((prev) => prev.map((imp, i) => (i === index ? { ...imp, montoImputado: value } : imp)));
  };

  const totalImputado = imputaciones.reduce((sum, imp) => sum + imp.montoImputado, 0);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (monto <= 0) next.monto = 'El monto debe ser mayor a 0';
    if (totalImputado > monto + 0.01) next.imputaciones = 'La suma de imputaciones excede el monto';
    if (imputaciones.some((imp) => imp.montoImputado > imp.saldoPendiente + 0.01)) next.imputaciones = 'Una imputacion excede el saldo pendiente';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      fecha, monto, medioPago,
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
              Registrar pago — {proveedor.nombre}
            </Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Fecha</label>
                <input className={inputClass} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Monto *</label>
                <input className={inputClass} type="number" min={0} step={0.01} value={monto} onChange={(e) => distribuirMonto(Number(e.target.value))} />
                {errors.monto && <p className="text-xs text-red-600 mt-1">{errors.monto}</p>}
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

            {/* Imputacion table */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">Imputacion a comprobantes</h3>
              {errors.imputaciones && <p className="text-xs text-red-600 mb-2">{errors.imputaciones}</p>}

              {imputaciones.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No hay comprobantes pendientes para este proveedor.
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
                          <td className="px-3 py-2 text-right text-gray-700">{formatARS(imp.saldoPendiente)}</td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900/20"
                              type="number" min={0} max={imp.saldoPendiente} step={0.01}
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
                  <div className="flex justify-between font-medium">
                    <span className="text-gray-500">Sin imputar</span>
                    <span className={monto - totalImputado > 0.01 ? 'text-amber-600' : 'text-gray-900'}>
                      {formatARS(monto - totalImputado)}
                    </span>
                  </div>
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
