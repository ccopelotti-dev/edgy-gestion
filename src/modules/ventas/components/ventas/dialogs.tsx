// ============================================================
// Módulo Ventas — Dialogs
// Edgy Gestión · React 19 + Radix UI + Tailwind CSS 4
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Trash2 } from 'lucide-react';

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
} from '../../types';

import {
  calcularSubtotalItem,
  calcularTotalConIva,
  generarId,
  TIPO_DOCUMENTO_LABEL,
  CONDICION_IVA_LABEL,
  TIPO_COMPROBANTE_LABEL,
  MEDIO_PAGO_LABEL,
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
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={form.limiteCredito}
                  onChange={(e) => update('limiteCredito', Number(e.target.value))}
                />
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
  onSave: (data: {
    tipo: TipoComprobante;
    clienteId: string;
    fecha: string;
    medioPago: MedioPago;
    modoEmision: ModoEmision;
    items: Omit<ComprobanteItem, 'id'>[];
    descuentoGeneral: number;
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

export function ComprobanteDialog({
  open,
  onOpenChange,
  clientes,
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Se activa recién después del primer intento fallido de guardar: a partir
  // de ahí, las filas incompletas se resaltan en rojo en vivo a medida que
  // el usuario las va completando (o dejando incompletas).
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const itemsSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTipo('factura');
      setClienteId('');
      setFecha(todayISO());
      setMedioPago('efectivo');
      setModoEmision(modoEmisionDefault);
      setItems([newItemRow()]);
      setDescuentoGeneral(0);
      setErrors({});
      setIntentoGuardar(false);
    }
  }, [open, modoEmisionDefault]);

  const updateItem = (index: number, field: keyof ItemRow, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const addItem = () => setItems((prev) => [...prev, newItemRow()]);

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
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
                <select
                  className={selectClass}
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoComprobante)}
                >
                  {(Object.entries(TIPO_COMPROBANTE_LABEL) as [TipoComprobante, string][]).map(
                    ([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ),
                  )}
                </select>
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
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
                {errors.clienteId && <p className="text-xs text-red-600 mt-1">{errors.clienteId}</p>}
              </div>
            </div>

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

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (monto <= 0) next.monto = 'El monto debe ser mayor a 0';
    if (totalImputado > monto + 0.01) next.imputaciones = 'La suma de imputaciones excede el monto';
    const invalid = imputaciones.some((imp) => imp.montoImputado > imp.saldoPendiente + 0.01);
    if (invalid) next.imputaciones = 'Una imputación excede el saldo pendiente';
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
                    <span className="text-gray-500">Sin imputar</span>
                    <span className={monto - totalImputado > 0.01 ? 'text-amber-600' : 'text-gray-900'}>
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
}

interface PresupuestoItemRow {
  key: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
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

export function PresupuestoDialog({
  open,
  onOpenChange,
  clientes,
  presupuesto,
  onSave,
  validezDefault,
}: PresupuestoDialogProps) {
  const [clienteId, setClienteId] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [validezDias, setValidezDias] = useState(validezDefault);
  const [condiciones, setCondiciones] = useState('');
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<PresupuestoItemRow[]>([newPresupuestoItemRow()]);
  const [descuentoGeneral, setDescuentoGeneral] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    }
  }, [open, presupuesto, validezDefault]);

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
    const hasEmpty = items.some((it) => !it.descripcion.trim() || it.precioUnitario <= 0);
    if (hasEmpty) next.items = 'Complete la descripción y precio de cada ítem';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      clienteId,
      fecha,
      validezDias,
      condiciones,
      notas,
      descuentoGeneral,
      items: items.map((item) => ({
        productoId: '',
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
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900">Ítems</h3>
                <button type="button" className={`${btnSecondary} flex items-center gap-1 text-xs py-1.5 px-3`} onClick={addItem}>
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
              {errors.items && <p className="text-xs text-red-600 mb-2">{errors.items}</p>}

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
                    {items.map((item, idx) => (
                      <tr key={item.key} className="border-t border-gray-100">
                        <td className="px-2 py-1.5">
                          <input
                            className="w-full border-0 bg-transparent text-sm focus:outline-none"
                            placeholder="Descripción"
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
                            className="w-full text-right border-0 bg-transparent text-sm focus:outline-none"
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
                    ))}
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
