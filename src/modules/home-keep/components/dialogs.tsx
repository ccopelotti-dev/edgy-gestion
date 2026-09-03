// ============================================================
// Modulo Home Keep ("Kit Hogar") — Dialogs
// Edgy Gestion · React 19 + Radix UI + Tailwind CSS 4
//
// Clon recortado de compras/components/compras/dialogs.tsx: solo 4
// diálogos (ProveedorDialog, ComprobanteDialog, PagoDialog,
// ConfirmarPagoDialog) -- sin CotizacionDialog ni
// OrdenCompraPreciosDialog, y sin nada de catálogo de Insumos/Productos
// (Home Keep no maneja stock). En todos los textos visibles se usa
// "Pago(s)" en vez de "Orden(es) de Pago" -- el modelo de datos interno
// sigue llamándose "pago" tal cual, sin cambios.
//
// Nombres de componentes (decisión de diseño, ver reporte): acá se
// llaman ComprobanteDialog y PagoDialog (en Compras son
// ComprobanteCompraDialog y OrdenPagoDialog) -- no hay "compra" ni
// "orden" en el dominio de Home Keep, así que se sacó ese sufijo.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Trash2, ImagePlus, Loader2 } from 'lucide-react';

import type {
  Proveedor,
  CondicionIvaProveedor,
  TipoComprobante,
  MedioPago,
  Comprobante,
  ImputacionPago,
  ItemComprobante,
  ImpuestoAdicional,
  Pago,
  LineaPago,
  TipoIngreso,
  TarjetaCredito,
  ConsumoTarjeta,
  ResumenTarjeta,
} from '../types';

import {
  calcularSubtotalItem,
  generarId,
  CONDICION_IVA_PROV_LABEL,
  TIPO_COMPROBANTE_LABEL,
  MEDIO_PAGO_LABEL,
  TIPO_INGRESO_LABEL,
} from '../types';

import { formatARS, todayISO } from '../lib/format';
import { esCuitValido } from '@/lib/validarCuit';
import { UNIDADES, type UnidadMedida } from '@/modules/productos-stock/types';
import {
  subirImagenComprobanteManual,
  eliminarImagenComprobanteManual,
  firmarUrlsDeTickets,
  ACCEPT_IMAGEN_COMPROBANTE,
  TAMANIO_MAXIMO_IMAGEN_COMPROBANTE,
} from '@/lib/imagenComprobanteAgente';

// ─── Shared styles ───────────────────────────────────────────

const overlayClass =
  'fixed inset-0 bg-black/50 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0';

const contentClass =
  'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto z-50';

const contentWideClass =
  'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto z-50';

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
// (idéntico a Compras)

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
              <input className={inputClass} value={form.nombreFantasia} onChange={(e) => update('nombreFantasia', e.target.value)} placeholder="Nombre de fantasia" />
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

// ─── 2. ComprobanteDialog ───────────────────────────────────
// Equivalente recortado de ComprobanteCompraDialog: sin vínculo a Orden
// de Compra, sin catálogo de Insumos/Productos (Home Keep no tiene
// stock), sin Control de Remisión ni "Actualizar stock", sin Letra/Tipo
// ARCA (comprobantes_hogar no tiene esa columna).

interface ComprobanteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proveedores: Proveedor[];
  onSave: (data: {
    tipo: TipoComprobante;
    proveedorId: string;
    /** Nro. de comprobante fiscal del proveedor (ej. "0001-00000542"). */
    numeroComprobanteProveedor: string;
    fecha: string;
    fechaVencimiento: string;
    medioPago: MedioPago;
    items: Omit<ItemComprobante, 'id'>[];
    otrosImpuestos: ImpuestoAdicional[];
  }) => void;
}

interface ComprobanteItemRow {
  key: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  alicuotaIva: number;
  unidad: UnidadMedida;
}

function newComprobanteItemRow(): ComprobanteItemRow {
  return { key: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0, alicuotaIva: 21, unidad: 'unidad' };
}

/** Una fila de item se considera incompleta si falta la descripcion o el precio. */
function filaItemIncompleta(item: ComprobanteItemRow): boolean {
  return !item.descripcion.trim() || item.precioUnitario <= 0;
}

interface OtroImpuestoRow {
  key: string;
  concepto: string;
  monto: number;
}

function nuevoOtroImpuestoRow(): OtroImpuestoRow {
  return { key: generarId(), concepto: '', monto: 0 };
}

/** Deja solo dígitos y corta a `max` caracteres -- para los campos de Pto.
 * Vta / Número de comprobante del proveedor. */
function soloDigitos(raw: string, max: number): string {
  return raw.replace(/\D/g, '').slice(0, max);
}

export function ComprobanteDialog({ open, onOpenChange, proveedores, onSave }: ComprobanteDialogProps) {
  const [tipo, setTipo] = useState<TipoComprobante>('factura');
  const [proveedorId, setProveedorId] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [medioPago, setMedioPago] = useState<MedioPago>('transferencia');
  const [items, setItems] = useState<ComprobanteItemRow[]>([newComprobanteItemRow()]);
  const [otrosImpuestos, setOtrosImpuestos] = useState<OtroImpuestoRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Se activa recien despues del primer intento fallido de guardar: a partir
  // de ahi, las filas incompletas se resaltan en rojo en vivo.
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const itemsSectionRef = useRef<HTMLDivElement>(null);

  // Nro. de comprobante fiscal del PROVEEDOR (el impreso en la factura
  // física, ej. "0001-00000542") -- distinto del correlativo interno de
  // Edgy Gestión. Dos campos (Pto. Vta 4 díg. + Número 8 díg.) con
  // autocompletado de ceros y avance de foco al presionar Enter.
  const [comprobantePtoVta, setComprobantePtoVta] = useState('');
  const [comprobanteNumero, setComprobanteNumero] = useState('');
  const comprobanteNumeroInputRef = useRef<HTMLInputElement>(null);
  const numeroComprobanteProveedor =
    comprobantePtoVta || comprobanteNumero
      ? `${comprobantePtoVta.padStart(4, '0')}-${comprobanteNumero.padStart(8, '0')}`
      : '';

  useEffect(() => {
    if (open) {
      setTipo('factura');
      setProveedorId('');
      setFecha(todayISO());
      setFechaVencimiento('');
      setMedioPago('transferencia');
      setItems([newComprobanteItemRow()]);
      setOtrosImpuestos([]);
      setErrors({});
      setIntentoGuardar(false);
      setComprobantePtoVta('');
      setComprobanteNumero('');
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

  const addOtroImpuesto = () => setOtrosImpuestos((prev) => [...prev, nuevoOtroImpuestoRow()]);
  const removeOtroImpuesto = (index: number) => setOtrosImpuestos((prev) => prev.filter((_, i) => i !== index));
  const updateOtroImpuesto = (index: number, field: keyof OtroImpuestoRow, value: string | number) => {
    setOtrosImpuestos((prev) => prev.map((imp, i) => (i === index ? { ...imp, [field]: value } : imp)));
  };
  const totalOtrosImpuestos = otrosImpuestos.reduce((sum, imp) => sum + (imp.monto || 0), 0);

  const totalFinal = totalNeto + totalIva + totalOtrosImpuestos;

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

  const construirItems = (): Omit<ItemComprobante, 'id'>[] =>
    items.map((item) => {
      const subtotal = getSubtotal(item);
      const montoIva = getIva(item);
      return {
        descripcion: item.descripcion.trim(), cantidad: item.cantidad,
        precioUnitario: item.precioUnitario, descuento: item.descuento,
        subtotal, alicuotaIva: item.alicuotaIva, montoIva,
        unidad: item.unidad,
      };
    });

  const handleSave = () => {
    if (!validate()) {
      itemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onSave({
      tipo, proveedorId, fecha, fechaVencimiento, medioPago,
      numeroComprobanteProveedor,
      items: construirItems(),
      otrosImpuestos: otrosImpuestos
        .filter((imp) => imp.concepto.trim() || imp.monto)
        .map((imp) => ({ id: generarId(), concepto: imp.concepto.trim() || 'Otro impuesto', monto: imp.monto })),
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentComprobanteClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Nuevo comprobante</Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Tipo</label>
                <select className={selectClass} value={tipo} onChange={(e) => setTipo(e.target.value as TipoComprobante)}>
                  {(Object.entries(TIPO_COMPROBANTE_LABEL) as [TipoComprobante, string][]).map(([val, label]) => (
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
                <select className={selectClass} value={medioPago} onChange={(e) => setMedioPago(e.target.value as MedioPago)}>
                  {(Object.entries(MEDIO_PAGO_LABEL) as [MedioPago, string][]).map(([val, label]) => (
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

              <div className="border border-gray-200 rounded-lg overflow-x-auto scroll-shadow-x">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                      <th className="text-right px-3 py-2 font-medium w-20">Cant.</th>
                      <th className="text-left px-3 py-2 font-medium w-24">UM</th>
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
                              className="w-full text-right border-0 bg-transparent text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.cantidad || ''}
                              onChange={(e) => updateItem(idx, 'cantidad', Number(e.target.value))}
                            />
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

// ─── 3. PagoDialog ──────────────────────────────────────────
// Equivalente recortado de OrdenPagoDialog: arma un Pago en estado
// 'pendiente' con una lista de líneas de pago (puede combinar formas --
// ej. parte transferencia + cheques). La cuenta bancaria real y los
// cheques reales se resuelven recién al confirmar el pago -- ver
// ConfirmarPagoDialog más abajo.

interface PagoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proveedor: Proveedor;
  comprobantesPendientes: Comprobante[];
  onSave: (data: {
    fecha: string;
    monto: number;
    medioPago: MedioPago;
    imputaciones: ImputacionPago[];
    lineasPago: LineaPago[];
  }) => void;
}

interface ImputacionRow {
  comprobanteId: string;
  numero: number;
  fecha: string;
  saldoPendiente: number;
  montoImputado: number;
}

interface LineaPagoFormRow {
  key: string;
  medioPago: MedioPago;
  monto: number;
  chequeNumero: string;
  chequeBanco: string;
  chequeFechaPago: string;
}

function nuevaLineaPagoRow(monto = 0): LineaPagoFormRow {
  return { key: generarId(), medioPago: 'transferencia', monto, chequeNumero: '', chequeBanco: '', chequeFechaPago: '' };
}

export function PagoDialog({ open, onOpenChange, proveedor, comprobantesPendientes, onSave }: PagoDialogProps) {
  const [fecha, setFecha] = useState(todayISO());
  const [monto, setMonto] = useState(0);
  const [imputaciones, setImputaciones] = useState<ImputacionRow[]>([]);
  const [lineasPago, setLineasPago] = useState<LineaPagoFormRow[]>([nuevaLineaPagoRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setFecha(todayISO());
      setMonto(0);
      setLineasPago([nuevaLineaPagoRow()]);
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
    // La primer línea de pago sigue al monto total mientras sea la única --
    // en cuanto el usuario agrega otra línea, cada una se edita por separado.
    setLineasPago((prev) => (prev.length === 1 ? [{ ...prev[0], monto: nuevoMonto }] : prev));
  }, []);

  const updateImputacion = (index: number, value: number) => {
    setImputaciones((prev) => prev.map((imp, i) => (i === index ? { ...imp, montoImputado: value } : imp)));
  };

  const addLineaPago = () => setLineasPago((prev) => [...prev, nuevaLineaPagoRow()]);
  const removeLineaPago = (index: number) => setLineasPago((prev) => prev.filter((_, i) => i !== index));
  const updateLineaPago = (index: number, field: keyof LineaPagoFormRow, value: string | number) => {
    setLineasPago((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const totalImputado = imputaciones.reduce((sum, imp) => sum + imp.montoImputado, 0);
  const totalLineasPago = lineasPago.reduce((sum, l) => sum + (l.monto || 0), 0);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (monto <= 0) next.monto = 'El monto debe ser mayor a 0';
    if (totalImputado > monto + 0.01) next.imputaciones = 'La suma de imputaciones excede el monto';
    if (imputaciones.some((imp) => imp.montoImputado > imp.saldoPendiente + 0.01)) next.imputaciones = 'Una imputacion excede el saldo pendiente';
    if (Math.abs(totalLineasPago - monto) > 0.01) next.lineasPago = 'La suma de las líneas de pago debe ser igual al monto';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    // Todos los medios de un mismo pago coinciden -> ese es el "medio
    // principal" (compat con badges/reportes existentes); si se combinan
    // distintos, queda en 'otro'.
    const medios = new Set(lineasPago.map((l) => l.medioPago));
    const medioPago: MedioPago = medios.size === 1 ? [...medios][0] : 'otro';

    onSave({
      fecha, monto, medioPago,
      imputaciones: imputaciones
        .filter((imp) => imp.montoImputado > 0)
        .map(({ comprobanteId, montoImputado }) => ({ comprobanteId, montoImputado })),
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
              Nuevo pago — {proveedor.nombre}
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
                <label className={labelClass}>Monto a pagar *</label>
                <input className={inputClass} type="number" min={0} step={0.01} value={monto} onChange={(e) => distribuirMonto(Number(e.target.value))} />
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
                        onChange={(e) => updateLineaPago(idx, 'medioPago', e.target.value as MedioPago)}
                      >
                        {(Object.entries(MEDIO_PAGO_LABEL) as [MedioPago, string][]).map(([val, label]) => (
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

// ─── 4. ConfirmarPagoDialog ─────────────────────────────────
// (idéntico a Compras) Ejecuta un Pago 'pendiente': acá sí se elige la
// cuenta bancaria real para las líneas de transferencia/efectivo, y se
// terminan de cargar los datos del cheque para las líneas de cheque. Al
// confirmar, cada línea genera su movimiento real en Tesorería (ver
// store.tsx, CONFIRMAR_PAGO).

export interface CuentaBancariaOpcionDialog {
  id: string;
  banco: string;
  alias: string;
  numero: string;
}

interface ConfirmarPagoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pago?: Pago;
  proveedorNombre?: string;
  cuentas: CuentaBancariaOpcionDialog[];
  onConfirm: (data: { fecha: string; lineasPago: LineaPago[] }) => void;
  /** Fase 67 (01/09): necesario para subir el ticket de pago al bucket
   * privado (path {clienteId}/manual-...) -- ver src/lib/imagenComprobanteAgente.ts. */
  clienteId?: string;
}

interface LineaPagoConfirmRow extends LineaPago {
  subiendoTicket?: boolean;
  ticketPreviewUrl?: string;
  mostrarReintegro?: boolean;
}

export function ConfirmarPagoDialog({ open, onOpenChange, pago, proveedorNombre, cuentas, onConfirm, clienteId }: ConfirmarPagoDialogProps) {
  const [fecha, setFecha] = useState(todayISO());
  const [lineas, setLineas] = useState<LineaPagoConfirmRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && pago) {
      setFecha(todayISO());
      const filas = pago.lineasPago.map((l) => ({
        ...l,
        cuentaBancariaId: l.cuentaBancariaId ?? cuentas[0]?.id,
        mostrarReintegro: Boolean(l.reintegroMonto),
      }));
      setLineas(filas);
      setError('');

      const paths = filas.map((l) => l.imagenUrl).filter((p): p is string => Boolean(p));
      if (paths.length > 0) {
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
      setLineas((prev) => prev.map((l, i) => (i === index ? { ...l, imagenUrl: path, ticketPreviewUrl: signedUrl, subiendoTicket: false } : l)));
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
                    <span className="text-sm font-medium text-gray-900">{MEDIO_PAGO_LABEL[linea.medioPago]}</span>
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

                  <div className="pt-1 space-y-2">
                    {linea.ticketPreviewUrl ? (
                      <div className="flex items-center gap-2">
                        <a href={linea.ticketPreviewUrl} target="_blank" rel="noreferrer">
                          <img src={linea.ticketPreviewUrl} alt="Ticket de pago" className="w-12 h-12 object-cover rounded border border-gray-200" />
                        </a>
                        <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => handleQuitarTicket(idx)}>
                          Quitar ticket
                        </button>
                      </div>
                    ) : (
                      <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 cursor-pointer">
                        {linea.subiendoTicket ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                        {linea.subiendoTicket ? 'Subiendo...' : 'Adjuntar ticket'}
                        <input
                          type="file"
                          accept={ACCEPT_IMAGEN_COMPROBANTE}
                          className="hidden"
                          disabled={!clienteId || linea.subiendoTicket}
                          onChange={(e) => handleAdjuntarTicket(idx, e.target.files?.[0])}
                        />
                      </label>
                    )}

                    <label className="flex items-center gap-1.5 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={Boolean(linea.mostrarReintegro)}
                        onChange={(e) => updateLinea(idx, 'mostrarReintegro', e.target.checked)}
                      />
                      Esta línea genera un reintegro/crédito esperado (ej. promo bancaria)
                    </label>

                    {linea.mostrarReintegro && (
                      <div className="grid grid-cols-2 gap-2 pl-5">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Concepto</label>
                          <input
                            className={inputClass}
                            placeholder="Ej. Promo Pampa"
                            value={linea.reintegroConcepto ?? ''}
                            onChange={(e) => updateLinea(idx, 'reintegroConcepto', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Monto esperado</label>
                          <input
                            className={inputClass}
                            type="number"
                            value={linea.reintegroMonto ?? ''}
                            onChange={(e) => updateLinea(idx, 'reintegroMonto', Number(e.target.value))}
                          />
                        </div>
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

// ─── IngresoDialog (Fase 70) ────────────────────────────────
// De dónde sale la plata: aporte de la Charcutería (con doble registro
// en su Tesorería, ver store.tsx) o ingreso fijo de un familiar.

interface IngresoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    fecha: string;
    tipo: TipoIngreso;
    origen: string;
    concepto: string;
    monto: number;
    medioPago?: MedioPago;
    recurrente: boolean;
    diaMesRecurrente?: number;
    notas: string;
  }) => void;
}

export function IngresoDialog({ open, onOpenChange, onSave }: IngresoDialogProps) {
  const [fecha, setFecha] = useState(todayISO());
  const [tipo, setTipo] = useState<TipoIngreso>('aporte_negocio');
  const [origen, setOrigen] = useState('La Charcutería');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState(0);
  const [medioPago, setMedioPago] = useState<MedioPago>('transferencia');
  const [recurrente, setRecurrente] = useState(false);
  const [diaMesRecurrente, setDiaMesRecurrente] = useState(1);
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setFecha(todayISO());
      setTipo('aporte_negocio');
      setOrigen('La Charcutería');
      setConcepto('');
      setMonto(0);
      setMedioPago('transferencia');
      setRecurrente(false);
      setDiaMesRecurrente(1);
      setNotas('');
      setError('');
    }
  }, [open]);

  const handleTipo = (nuevo: TipoIngreso) => {
    setTipo(nuevo);
    if (nuevo === 'aporte_negocio') setOrigen('La Charcutería');
    else if (origen === 'La Charcutería') setOrigen('');
  };

  const handleSave = () => {
    if (monto <= 0) {
      setError('El monto debe ser mayor a cero');
      return;
    }
    onSave({
      fecha,
      tipo,
      origen: origen.trim(),
      concepto: concepto.trim(),
      monto,
      medioPago: tipo === 'aporte_negocio' ? medioPago : undefined,
      recurrente,
      diaMesRecurrente: recurrente ? diaMesRecurrente : undefined,
      notas: notas.trim(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Nuevo ingreso</Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>Tipo</label>
              <select className={selectClass} value={tipo} onChange={(e) => handleTipo(e.target.value as TipoIngreso)}>
                {(Object.entries(TIPO_INGRESO_LABEL) as [TipoIngreso, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              {tipo === 'aporte_negocio' && (
                <p className="text-xs text-gray-400 mt-1">
                  Se registra doble: acá como ingreso, y como egreso real en la Tesorería de la Charcutería.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Fecha</label>
                <input type="date" className={inputClass} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Monto *</label>
                <input type="number" className={inputClass} value={monto || ''} onChange={(e) => setMonto(Number(e.target.value))} />
              </div>
            </div>

            <div>
              <label className={labelClass}>{tipo === 'ingreso_familiar' ? 'Nombre del familiar' : 'Origen'}</label>
              <input
                className={inputClass}
                value={origen}
                onChange={(e) => setOrigen(e.target.value)}
                placeholder={tipo === 'ingreso_familiar' ? 'Ej. Esposa' : 'Ej. La Charcutería'}
              />
            </div>

            <div>
              <label className={labelClass}>Concepto</label>
              <input className={inputClass} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Opcional" />
            </div>

            {tipo === 'aporte_negocio' && (
              <div>
                <label className={labelClass}>Cómo salió de la Charcutería</label>
                <select className={selectClass} value={medioPago} onChange={(e) => setMedioPago(e.target.value as MedioPago)}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ingreso-recurrente"
                checked={recurrente}
                onChange={(e) => setRecurrente(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="ingreso-recurrente" className="text-sm text-gray-700">Ingreso fijo mensual (recordar cada mes)</label>
            </div>
            {recurrente && (
              <div>
                <label className={labelClass}>Día del mes</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className={inputClass}
                  value={diaMesRecurrente}
                  onChange={(e) => setDiaMesRecurrente(Number(e.target.value))}
                />
              </div>
            )}

            <div>
              <label className={labelClass}>Notas</label>
              <textarea className={inputClass} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
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

// ─── TarjetaDialog (Fase 70) ────────────────────────────────

interface TarjetaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tarjeta?: TarjetaCredito;
  onSave: (data: Omit<TarjetaCredito, 'id' | 'activa' | 'createdAt' | 'updatedAt'>) => void;
}

export function TarjetaDialog({ open, onOpenChange, tarjeta, onSave }: TarjetaDialogProps) {
  const [nombre, setNombre] = useState('');
  const [banco, setBanco] = useState('');
  const [titular, setTitular] = useState('');
  const [ultimosDigitos, setUltimosDigitos] = useState('');
  const [diaCierre, setDiaCierre] = useState<number | ''>('');
  const [diaVencimiento, setDiaVencimiento] = useState<number | ''>('');
  const [limite, setLimite] = useState<number | ''>('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setNombre(tarjeta?.nombre ?? '');
      setBanco(tarjeta?.banco ?? '');
      setTitular(tarjeta?.titular ?? '');
      setUltimosDigitos(tarjeta?.ultimosDigitos ?? '');
      setDiaCierre(tarjeta?.diaCierre ?? '');
      setDiaVencimiento(tarjeta?.diaVencimiento ?? '');
      setLimite(tarjeta?.limite ?? '');
      setError('');
    }
  }, [open, tarjeta]);

  const handleSave = () => {
    if (!nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    onSave({
      nombre: nombre.trim(),
      banco: banco.trim() || undefined,
      titular: titular.trim() || undefined,
      ultimosDigitos: ultimosDigitos.trim() || undefined,
      diaCierre: diaCierre === '' ? undefined : Number(diaCierre),
      diaVencimiento: diaVencimiento === '' ? undefined : Number(diaVencimiento),
      limite: limite === '' ? undefined : Number(limite),
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">{tarjeta ? 'Editar tarjeta' : 'Nueva tarjeta'}</Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nombre *</label>
              <input className={inputClass} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Visa Santander - Carlos" />
              {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Banco</label>
                <input className={inputClass} value={banco} onChange={(e) => setBanco(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Titular</label>
                <input className={inputClass} value={titular} onChange={(e) => setTitular(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Últimos 4 dígitos</label>
                <input className={inputClass} maxLength={4} value={ultimosDigitos} onChange={(e) => setUltimosDigitos(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Día de cierre</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className={inputClass}
                  value={diaCierre}
                  onChange={(e) => setDiaCierre(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div>
                <label className={labelClass}>Día de vencimiento</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className={inputClass}
                  value={diaVencimiento}
                  onChange={(e) => setDiaVencimiento(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Límite</label>
              <input
                type="number"
                className={inputClass}
                value={limite}
                onChange={(e) => setLimite(e.target.value === '' ? '' : Number(e.target.value))}
              />
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

// ─── ResumenTarjetaDialog (Fase 70) ─────────────────────────
// Carga de un resumen con detalle completo de consumos y cuotas (a
// pedido explícito de Carlos, para poder ver qué compra puntual
// compone cada resumen mensual). El total NO se tipea a mano: se
// calcula solo, sumando los consumos -- mismo criterio que
// ComprobanteDialog con sus ítems.

interface ConsumoRow {
  id: string;
  descripcion: string;
  fechaConsumo: string;
  monto: number;
  cuotaActual: number;
  cuotasTotales: number;
}

function newConsumoRow(): ConsumoRow {
  return { id: generarId(), descripcion: '', fechaConsumo: todayISO(), monto: 0, cuotaActual: 1, cuotasTotales: 1 };
}

interface ResumenTarjetaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tarjetas: TarjetaCredito[];
  onSave: (data: {
    tarjetaId: string;
    periodo: string;
    fechaCierre: string;
    fechaVencimiento: string;
    pagoMinimo?: number;
    notas: string;
    consumos: Omit<ConsumoTarjeta, 'id' | 'compraId'>[];
  }) => void;
}

export function ResumenTarjetaDialog({ open, onOpenChange, tarjetas, onSave }: ResumenTarjetaDialogProps) {
  const [tarjetaId, setTarjetaId] = useState('');
  const [periodo, setPeriodo] = useState(() => todayISO().slice(0, 7));
  const [fechaCierre, setFechaCierre] = useState(todayISO());
  const [fechaVencimiento, setFechaVencimiento] = useState(todayISO());
  const [pagoMinimo, setPagoMinimo] = useState<number | ''>('');
  const [notas, setNotas] = useState('');
  const [consumos, setConsumos] = useState<ConsumoRow[]>([newConsumoRow()]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setTarjetaId(tarjetas[0]?.id ?? '');
      setPeriodo(todayISO().slice(0, 7));
      setFechaCierre(todayISO());
      setFechaVencimiento(todayISO());
      setPagoMinimo('');
      setNotas('');
      setConsumos([newConsumoRow()]);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateConsumo = (idx: number, field: keyof ConsumoRow, value: string | number) => {
    setConsumos((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };
  const addConsumo = () => setConsumos((prev) => [...prev, newConsumoRow()]);
  const removeConsumo = (idx: number) => {
    if (consumos.length > 1) setConsumos((prev) => prev.filter((_, i) => i !== idx));
  };

  const total = consumos.reduce((sum, c) => sum + (Number(c.monto) || 0), 0);

  const handleSave = () => {
    if (!tarjetaId) {
      setError('Elegí una tarjeta');
      return;
    }
    if (!periodo.trim()) {
      setError('El período es obligatorio');
      return;
    }
    const incompletos = consumos.some((c) => !c.descripcion.trim() || c.monto <= 0);
    if (incompletos) {
      setError('Completá descripción y monto en todas las filas');
      return;
    }
    onSave({
      tarjetaId,
      periodo: periodo.trim(),
      fechaCierre,
      fechaVencimiento,
      pagoMinimo: pagoMinimo === '' ? undefined : Number(pagoMinimo),
      notas: notas.trim(),
      consumos: consumos.map((c) => ({
        descripcion: c.descripcion.trim(),
        fechaConsumo: c.fechaConsumo,
        monto: Number(c.monto),
        cuotaActual: Number(c.cuotaActual),
        cuotasTotales: Number(c.cuotasTotales),
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
            <Dialog.Title className="text-lg font-semibold text-gray-900">Nuevo resumen de tarjeta</Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Tarjeta *</label>
                <select className={selectClass} value={tarjetaId} onChange={(e) => setTarjetaId(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {tarjetas.map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Período (AAAA-MM) *</label>
                <input className={inputClass} value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="2026-09" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Fecha de cierre</label>
                <input type="date" className={inputClass} value={fechaCierre} onChange={(e) => setFechaCierre(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Fecha de vencimiento</label>
                <input type="date" className={inputClass} value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Pago mínimo</label>
                <input
                  type="number"
                  className={inputClass}
                  value={pagoMinimo}
                  onChange={(e) => setPagoMinimo(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`${labelClass} mb-0`}>Consumos</label>
                <button type="button" onClick={addConsumo} className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
              <div className="space-y-2">
                {consumos.map((c, idx) => (
                  <div key={c.id} className="grid grid-cols-12 gap-2 items-center rounded-lg border border-gray-100 p-2">
                    <input
                      className={`${inputClass} col-span-4`}
                      placeholder="Descripción"
                      value={c.descripcion}
                      onChange={(e) => updateConsumo(idx, 'descripcion', e.target.value)}
                    />
                    <input
                      type="date"
                      className={`${inputClass} col-span-2`}
                      value={c.fechaConsumo}
                      onChange={(e) => updateConsumo(idx, 'fechaConsumo', e.target.value)}
                    />
                    <input
                      type="number"
                      className={`${inputClass} col-span-2`}
                      placeholder="Monto cuota"
                      value={c.monto || ''}
                      onChange={(e) => updateConsumo(idx, 'monto', Number(e.target.value))}
                    />
                    <input
                      type="number"
                      min={1}
                      title="Cuota actual"
                      className={`${inputClass} col-span-1`}
                      value={c.cuotaActual}
                      onChange={(e) => updateConsumo(idx, 'cuotaActual', Number(e.target.value))}
                    />
                    <span className="col-span-1 text-center text-gray-400 text-sm">/</span>
                    <input
                      type="number"
                      min={1}
                      title="Cuotas totales"
                      className={`${inputClass} col-span-1`}
                      value={c.cuotasTotales}
                      onChange={(e) => updateConsumo(idx, 'cuotasTotales', Number(e.target.value))}
                    />
                    <button type="button" className={`${btnIcon} col-span-1`} onClick={() => removeConsumo(idx)} disabled={consumos.length <= 1}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Cuota actual / cuotas totales -- ej. 3 / 12 para la tercera cuota de una compra en 12 pagos. Las cuotas de
                una misma compra se agrupan automáticamente entre resúmenes por descripción.
              </p>
            </div>

            <div>
              <label className={labelClass}>Notas</label>
              <textarea className={inputClass} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>

            <div className="flex justify-end text-sm font-semibold text-gray-900">Total: {formatARS(total)}</div>

            {error && <p className="text-xs text-red-600">{error}</p>}
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

// ─── PagarResumenDialog (Fase 70) ───────────────────────────
// Pago simplificado del resumen (un solo medio de pago por vez, sin el
// circuito completo de Pago/imputaciones -- una tarjeta se suele pagar
// de una sola vez, no combinando cheques/transferencias como una
// factura de proveedor).

interface PagarResumenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumen?: ResumenTarjeta;
  onSave: (data: { monto: number; fecha: string; medioPago: MedioPago }) => void;
}

export function PagarResumenDialog({ open, onOpenChange, resumen, onSave }: PagarResumenDialogProps) {
  const [monto, setMonto] = useState(0);
  const [fecha, setFecha] = useState(todayISO());
  const [medioPago, setMedioPago] = useState<MedioPago>('transferencia');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && resumen) {
      setMonto(resumen.saldoPendiente);
      setFecha(todayISO());
      setMedioPago('transferencia');
      setError('');
    }
  }, [open, resumen]);

  if (!resumen) return null;

  const handleSave = () => {
    if (monto <= 0) {
      setError('El monto debe ser mayor a cero');
      return;
    }
    if (monto > resumen.saldoPendiente + 0.01) {
      setError('El monto supera el saldo pendiente');
      return;
    }
    onSave({ monto, fecha, medioPago });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentClass}>
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Pagar resumen — {resumen.periodo}</Dialog.Title>
            <Dialog.Close className={btnIcon}><X className="w-5 h-5" /></Dialog.Close>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Saldo pendiente: <span className="font-semibold text-gray-900">{formatARS(resumen.saldoPendiente)}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Fecha</label>
                <input type="date" className={inputClass} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Monto</label>
                <input type="number" className={inputClass} value={monto || ''} onChange={(e) => setMonto(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Medio de pago</label>
              <select className={selectClass} value={medioPago} onChange={(e) => setMedioPago(e.target.value as MedioPago)}>
                {(Object.entries(MEDIO_PAGO_LABEL) as [MedioPago, string][])
                  .filter(([val]) => val !== 'cheque')
                  .map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
              </select>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <Dialog.Close className={btnSecondary}>Cancelar</Dialog.Close>
            <button className={btnPrimary} onClick={handleSave}>Confirmar pago</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
