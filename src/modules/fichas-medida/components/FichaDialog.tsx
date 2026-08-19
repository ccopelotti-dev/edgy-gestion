// Dialog de carga/edición de Ficha de medida.
//
// Encabezado de cliente/pedido reutilizable + selector de "tipo de
// ítem" (Genérica / Cortinas) que cambia qué columnas se piden -- ver
// comentario de tipos/index.ts. Pensado mobile-first (Marina lo usa
// parada en la casa del cliente): inputs de texto con coma decimal
// (mismo patrón que Mostrador/Cotización) en vez de spinners, y chips
// en vez de selects para Tipo de barral / Tipo de cortina.
//
// El cliente NO se reescribe acá -- se busca o se crea (mismo
// ClienteDialog de Ventas) y queda linkeado por id, así no hay fichas
// duplicadas con el mismo cliente escrito distinto cada vez.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Plus, Trash2, UserPlus, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ClienteDialog } from '@/modules/ventas/components/ventas/dialogs';
import type { Cliente } from '@/modules/ventas/types';
import {
  MODALIDAD_ENTREGA_LABEL,
  TIPOS_BARRAL,
  TIPOS_CORTINA,
  TIPO_FICHA_LABEL,
  type EstadoFicha,
  type FichaMedida,
  type ItemFichaMedida,
  type ModalidadEntrega,
  type PanoMedida,
  type TipoFicha,
} from '../types';
import type { NuevaFichaMedida } from '../data/useFichasMedida';

const overlayClass =
  'fixed inset-0 bg-black/50 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0';
const contentClass =
  'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto z-50';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900';

interface CandidatoCliente {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
}

interface ItemFormRow {
  key: string;
  producto: string;
  /** Fase 41 (Producción a medida): vínculo opcional a un Producto real
   * del catálogo -- ver comentario en types/index.ts. */
  productoId: string;
  tela: string;
  textoCantidad: string;
  medida: string;
  peso: string;
  incluyeBarral: boolean;
  tipoBarral: string;
  tipoCortina: string;
  notas: string;
  panos: { key: string; textoAncho: string; textoAlto: string }[];
}

function nuevaFilaItem(): ItemFormRow {
  return {
    key: crypto.randomUUID(),
    producto: '',
    productoId: '',
    tela: '',
    textoCantidad: '1',
    medida: '',
    peso: '',
    incluyeBarral: false,
    tipoBarral: '',
    tipoCortina: '',
    notas: '',
    panos: [],
  };
}

function nuevoPano() {
  return { key: crypto.randomUUID(), textoAncho: '', textoAlto: '' };
}

function itemFormAFila(it: ItemFichaMedida): ItemFormRow {
  return {
    key: it.id,
    producto: it.producto,
    productoId: it.productoId ?? '',
    tela: it.tela ?? '',
    textoCantidad: String(it.cantidad ?? 1),
    medida: it.medida ?? '',
    peso: it.peso ?? '',
    incluyeBarral: it.incluyeBarral ?? false,
    tipoBarral: it.tipoBarral ?? '',
    tipoCortina: it.tipoCortina ?? '',
    notas: it.notas ?? '',
    panos: (it.panos ?? []).map((p: PanoMedida) => ({
      key: p.id,
      textoAncho: p.ancho !== null ? String(p.ancho) : '',
      textoAlto: p.alto !== null ? String(p.alto) : '',
    })),
  };
}

function parseDecimal(texto: string): number {
  const limpio = texto.replace(',', '.').trim();
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}

function sanitizarDecimal(valor: string): string {
  return valor.replace(/[^0-9.,]/g, '');
}

// ─── Buscador de producto del catálogo (combobox) ────────────────────────────
// A pedido de Carlos (18/08): el <select> nativo de "Vincular a producto del
// catálogo" se vuelve una lista larguísima para recorrer a ciegas con un
// catálogo grande (mismo problema ya resuelto en Formular Producto con
// ProductoCombobox). Acá NO se puede portar ese mismo patrón tal cual: ese
// combobox vive en una página normal, mientras que este vive DENTRO de un
// Dialog.Content de Radix -- Radix cierra el diálogo ante cualquier
// pointerdown que caiga fuera del DOM de su propio Content, y un dropdown
// portado a document.body (como hacía la versión anterior) queda FUERA de
// ese árbol, así que un click en una opción se leía como "click afuera" y
// cerraba la ficha antes de que la selección llegara a guardarse -- el bug
// real detrás de "no me deja linkear". Fix: dropdown inline (position:
// absolute dentro del mismo wrapper relative), sin portal, para que Radix
// lo vea como parte del diálogo.

interface ProductoCatalogoOpcion {
  id: string;
  nombre: string;
}

function ProductoCatalogoCombobox({
  value,
  options,
  onSelect,
}: {
  value: string;
  options: ProductoCatalogoOpcion[];
  onSelect: (id: string) => void;
}) {
  const seleccionado = options.find((o) => o.id === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickFuera(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.nombre.toLowerCase().includes(q)) : options;
    return base.slice(0, 40);
  }, [query, options]);

  function seleccionar(id: string) {
    onSelect(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
      <input
        className={inputClass + ' pl-7'}
        value={open ? query : seleccionado?.nombre ?? ''}
        placeholder="Vincular a producto del catálogo (opcional)"
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (filtradas.length > 0) seleccionar(filtradas[0].id);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="absolute left-0 top-full z-[60] mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-left text-sm text-gray-400 hover:bg-gray-50"
            onClick={() => seleccionar('')}
          >
            Sin vincular (solo texto libre)
          </button>
          {filtradas.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">Sin resultados</p>
          ) : (
            filtradas.map((o) => (
              <button
                key={o.id}
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                onClick={() => seleccionar(o.id)}
              >
                <span className="truncate">{o.nombre}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteTenantId: string | null;
  /** Ficha existente a editar -- si no se pasa, es alta nueva. */
  ficha?: FichaMedida;
  /** Cantidad de fichas previas del mismo cliente ya cargadas -- para el
   * aviso "ya tiene N fichas" al elegirlo (ayuda a no cargar una repetida
   * sin darse cuenta). */
  contarFichasDeCliente: (clienteVentaId: string) => number;
  onSave: (data: NuevaFichaMedida) => Promise<unknown>;
}

export function FichaDialog({ open, onOpenChange, clienteTenantId, ficha, contarFichasDeCliente, onSave }: Props) {
  const [clienteVentaId, setClienteVentaId] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteDireccion, setClienteDireccion] = useState('');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [candidatosCliente, setCandidatosCliente] = useState<CandidatoCliente[]>([]);
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);

  const [tipo, setTipo] = useState<TipoFicha>('generica');
  const [estado, setEstado] = useState<EstadoFicha>('borrador');
  const [fechaPedido, setFechaPedido] = useState('');
  // Fase 41.4 (rediseño de Carlos, 19/08): antes se inferí­a "hay
  // replanteo" de si fechaReplanteo tenía algo tipeado -- poco claro en
  // mobile (había que escribir una fecha para que aparecieran más
  // campos). Ahora es un tilde explícito, en su propia línea.
  const [replanteoActivo, setReplanteoActivo] = useState(false);
  const [fechaReplanteo, setFechaReplanteo] = useState('');
  const [horaReplanteo, setHoraReplanteo] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [modalidadEntrega, setModalidadEntrega] = useState<ModalidadEntrega>('retiro_local');
  // Fase 41.4: antes había un tilde "Usar domicilio distinto al del
  // cliente" con dos modos (texto fijo de solo lectura vs. campo vacío
  // para reescribir todo). Ahora es un único campo siempre editable,
  // precargado con la dirección del cliente (ver elegirCliente /
  // handleSaveClienteNuevo) -- el agente lo edita in place si hace falta.
  const [domicilioTrabajo, setDomicilioTrabajo] = useState('');
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<ItemFormRow[]>([nuevaFilaItem()]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (ficha) {
      setClienteVentaId(ficha.clienteVentaId);
      setClienteNombre(ficha.clienteNombre);
      setClienteDireccion(ficha.clienteDireccion ?? '');
      setTipo(ficha.tipo);
      setEstado(ficha.estado);
      setFechaPedido(ficha.fechaPedido);
      setReplanteoActivo(Boolean(ficha.fechaReplanteo));
      setFechaReplanteo(ficha.fechaReplanteo ?? '');
      setHoraReplanteo(ficha.horaReplanteo ?? '');
      setFechaEntrega(ficha.fechaEntrega ?? '');
      setModalidadEntrega(ficha.modalidadEntrega ?? 'retiro_local');
      setDomicilioTrabajo(ficha.domicilioTrabajo ?? ficha.clienteDireccion ?? '');
      setNotas(ficha.notas ?? '');
      setItems(ficha.items.length > 0 ? ficha.items.map(itemFormAFila) : [nuevaFilaItem()]);
    } else {
      setClienteVentaId('');
      setClienteNombre('');
      setClienteDireccion('');
      setTipo('generica');
      setEstado('borrador');
      setFechaPedido(new Date().toISOString().split('T')[0]);
      setReplanteoActivo(false);
      setFechaReplanteo('');
      setHoraReplanteo('');
      setFechaEntrega('');
      setModalidadEntrega('retiro_local');
      setDomicilioTrabajo('');
      setNotas('');
      setItems([nuevaFilaItem()]);
    }
    setBusquedaCliente('');
    setCandidatosCliente([]);
    setError(null);
  }, [open, ficha]);

  // ── Búsqueda de cliente (clientes_venta) ─────────────────────
  useEffect(() => {
    if (!open || !clienteTenantId) return;
    const q = busquedaCliente.trim();
    if (!q) {
      setCandidatosCliente([]);
      return;
    }
    let activo = true;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('clientes_venta')
        .select('id, nombre, telefono, direccion')
        .eq('cliente_id', clienteTenantId)
        .eq('activo', true)
        .ilike('nombre', `%${q}%`)
        .order('nombre')
        .limit(8);
      if (activo) setCandidatosCliente((data ?? []) as CandidatoCliente[]);
    }, 250);
    return () => {
      activo = false;
      clearTimeout(timer);
    };
  }, [busquedaCliente, open, clienteTenantId]);

  // ── Catálogo de productos (Fase 41, Producción a medida) ─────
  // Fetch único al abrir el diálogo -- catálogo de un comercio a medida,
  // no miles de filas, no hace falta debounce ni paginar (mismo criterio
  // que el resto de este archivo, ver comentario de SELECT_FICHA).
  //
  // A pedido de Carlos (18/08): filtra por modalidad_stock = 'a_medida' --
  // vincular acá solo tiene sentido para productos que Producción va a
  // fabricar por pedido (ver Producto.modalidadStock). Mostrar TODO el
  // catálogo (productos de depósito incluidos) era la fricción real: una
  // lista larga para buscar a mano un producto que ni siquiera aplica a
  // este flujo.
  const [productosCatalogo, setProductosCatalogo] = useState<{ id: string; nombre: string }[]>([]);
  useEffect(() => {
    if (!open || !clienteTenantId) return;
    let activo = true;
    supabase
      .from('productos')
      .select('id, nombre')
      .eq('cliente_id', clienteTenantId)
      .eq('disponible', true)
      .eq('modalidad_stock', 'a_medida')
      .order('nombre')
      .then(({ data }) => {
        if (activo) setProductosCatalogo((data ?? []) as { id: string; nombre: string }[]);
      });
    return () => {
      activo = false;
    };
  }, [open, clienteTenantId]);

  function elegirCliente(c: CandidatoCliente) {
    setClienteVentaId(c.id);
    setClienteNombre(c.nombre);
    setClienteDireccion(c.direccion ?? '');
    // Fase 41.4: precarga el domicilio de trabajo con el del cliente
    // recién elegido -- default editable, no pisa nada que el agente ya
    // haya tipeado a mano en una ficha existente si solo está cambiando
    // de cliente por error, así que se resetea a propósito acá.
    setDomicilioTrabajo(c.direccion ?? '');
    setBusquedaCliente('');
    setCandidatosCliente([]);
  }

  async function handleSaveClienteNuevo(data: Omit<Cliente, 'id' | 'saldoCuentaCorriente' | 'activo' | 'createdAt' | 'updatedAt'>) {
    if (!clienteTenantId) return;
    const nuevoId = crypto.randomUUID();
    const { error: errInsert } = await supabase.from('clientes_venta').insert({
      id: nuevoId,
      cliente_id: clienteTenantId,
      nombre: data.nombre,
      tipo_documento: data.tipoDocumento,
      documento: data.documento,
      condicion_iva: data.condicionIva,
      email: data.email || null,
      telefono: data.telefono || null,
      direccion: data.direccion || null,
      localidad: data.localidad || null,
      provincia: data.provincia || null,
      categoria_id: data.categoriaId || null,
      limite_credito: data.limiteCredito,
      saldo_cuenta_corriente: 0,
      notas: data.notas || null,
      activo: true,
      metadatos: data.metadatos || null,
    });
    if (errInsert) {
      setError('No pudimos crear el cliente.');
      return;
    }
    setClienteVentaId(nuevoId);
    setClienteNombre(data.nombre);
    setClienteDireccion(data.direccion ?? '');
    setDomicilioTrabajo(data.direccion ?? '');
    setClienteDialogOpen(false);
  }

  const fichasPrevias = clienteVentaId ? contarFichasDeCliente(clienteVentaId) : 0;

  // ── Ítems ─────────────────────────────────────────────────
  function actualizarItem(key: string, patch: Partial<ItemFormRow>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function agregarItem() {
    setItems((prev) => [...prev, nuevaFilaItem()]);
  }
  function eliminarItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }
  function agregarPano(itemKey: string) {
    setItems((prev) =>
      prev.map((it) => (it.key === itemKey ? { ...it, panos: [...it.panos, nuevoPano()] } : it)),
    );
  }
  function actualizarPano(itemKey: string, panoKey: string, patch: Partial<{ textoAncho: string; textoAlto: string }>) {
    setItems((prev) =>
      prev.map((it) =>
        it.key === itemKey
          ? { ...it, panos: it.panos.map((p) => (p.key === panoKey ? { ...p, ...patch } : p)) }
          : it,
      ),
    );
  }
  function eliminarPano(itemKey: string, panoKey: string) {
    setItems((prev) =>
      prev.map((it) => (it.key === itemKey ? { ...it, panos: it.panos.filter((p) => p.key !== panoKey) } : it)),
    );
  }

  // Fase 41.1 "vericuetos": handleSave acepta un estado a forzar -- lo usa
  // el botón "Marcar como Lista y continuar" para no depender del timing
  // de setEstado (async) antes de armar `data` en el mismo click.
  async function handleSave(estadoForzado?: EstadoFicha) {
    if (!clienteVentaId) {
      setError('Elegí o cargá un cliente antes de guardar.');
      return;
    }
    const itemsValidos = items.filter((it) => it.producto.trim());
    if (itemsValidos.length === 0) {
      setError('Cargá al menos un ítem con producto.');
      return;
    }

    setGuardando(true);
    setError(null);

    const data: NuevaFichaMedida = {
      clienteVentaId,
      tipo,
      estado: estadoForzado ?? estado,
      fechaPedido,
      fechaReplanteo: replanteoActivo ? fechaReplanteo || undefined : undefined,
      horaReplanteo: replanteoActivo && fechaReplanteo ? horaReplanteo || undefined : undefined,
      fechaEntrega: fechaEntrega || undefined,
      domicilioTrabajo: domicilioTrabajo.trim() || undefined,
      modalidadEntrega,
      // Fase 41.4: Seña y Total salieron del formulario -- sin uso real
      // desde que el cobro de seña se desacopló de la Ficha (ahora vive
      // en Presupuesto, Fase 41.2). Quedan en 0 acá para no tocar el
      // contrato de NuevaFichaMedida/la columna en Supabase.
      sena: 0,
      total: 0,
      notas: notas.trim() || undefined,
      items: itemsValidos.map((it) => ({
        producto: it.producto.trim(),
        productoId: it.productoId || undefined,
        tela: it.tela.trim() || undefined,
        cantidad: parseDecimal(it.textoCantidad) || 1,
        medida: tipo === 'generica' ? it.medida.trim() || undefined : undefined,
        peso: tipo === 'generica' ? it.peso.trim() || undefined : undefined,
        incluyeBarral: tipo === 'cortinas' ? it.incluyeBarral : undefined,
        tipoBarral: tipo === 'cortinas' ? it.tipoBarral || undefined : undefined,
        tipoCortina: tipo === 'cortinas' ? it.tipoCortina || undefined : undefined,
        notas: it.notas.trim() || undefined,
        panos:
          tipo === 'cortinas'
            ? it.panos
                .filter((p) => p.textoAncho.trim() || p.textoAlto.trim())
                .map((p) => ({
                  id: crypto.randomUUID(),
                  ancho: p.textoAncho.trim() ? parseDecimal(p.textoAncho) : null,
                  alto: p.textoAlto.trim() ? parseDecimal(p.textoAlto) : null,
                }))
            : [],
      })),
    };

    const ok = await onSave(data);
    setGuardando(false);
    if (ok !== null && ok !== false) {
      onOpenChange(false);
    } else {
      setError('No pudimos guardar la ficha. Probá de nuevo.');
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={contentClass}>
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              {ficha ? 'Editar ficha de medida' : 'Nueva ficha de medida'}
            </Dialog.Title>
            <Dialog.Close className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="space-y-5">
            {/* ── Cliente ── */}
            <div>
              <label className={labelClass}>Cliente *</label>
              {clienteVentaId ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm">
                  <div>
                    <span className="font-medium text-gray-900">{clienteNombre}</span>
                    {fichasPrevias > 0 && (
                      <span className="ml-2 text-xs text-amber-700">
                        · ya tiene {fichasPrevias} {fichasPrevias === 1 ? 'ficha cargada' : 'fichas cargadas'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setClienteVentaId('');
                      setClienteNombre('');
                    }}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={busquedaCliente}
                      onChange={(e) => setBusquedaCliente(e.target.value)}
                      placeholder="Buscar cliente por nombre..."
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                  {candidatosCliente.length > 0 && (
                    <div className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200">
                      {candidatosCliente.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => elegirCliente(c)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="text-gray-900">{c.nombre}</span>
                          <span className="text-gray-500">{c.telefono ?? ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setClienteDialogOpen(true)}
                    className="mt-2 flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Cargar cliente nuevo
                  </button>
                </div>
              )}
            </div>

            {/* ── Encabezado de pedido ── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <label className={labelClass}>Tipo</label>
                <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoFicha)} className={inputClass}>
                  <option value="generica">{TIPO_FICHA_LABEL.generica}</option>
                  <option value="cortinas">{TIPO_FICHA_LABEL.cortinas}</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Estado</label>
                <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoFicha)} className={inputClass}>
                  <option value="borrador">Borrador</option>
                  <option value="lista">Lista</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Fecha de pedido</label>
                <input type="date" value={fechaPedido} onChange={(e) => setFechaPedido(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Fecha de entrega</label>
                <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} className={inputClass} />
                <p className="mt-1 text-[11px] text-gray-400">También impacta en Agenda.</p>
              </div>
              <div>
                <label className={labelClass}>Modalidad de entrega</label>
                <select
                  value={modalidadEntrega}
                  onChange={(e) => setModalidadEntrega(e.target.value as ModalidadEntrega)}
                  className={inputClass}
                >
                  <option value="retiro_local">{MODALIDAD_ENTREGA_LABEL.retiro_local}</option>
                  <option value="obra_instalacion">{MODALIDAD_ENTREGA_LABEL.obra_instalacion}</option>
                </select>
                {modalidadEntrega === 'obra_instalacion' && (
                  <p className="mt-1 text-[11px] text-gray-400">Agrega una línea de instalación al presupuesto.</p>
                )}
              </div>
            </div>

            {/* ── Replanteo (Fase 41.4: tilde explícito, en su propia línea) ── */}
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={replanteoActivo}
                  onChange={(e) => {
                    const activo = e.target.checked;
                    setReplanteoActivo(activo);
                    if (!activo) {
                      setFechaReplanteo('');
                      setHoraReplanteo('');
                    }
                  }}
                />
                Replanteo
              </label>
              {replanteoActivo && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Fecha</label>
                    <input
                      type="date"
                      value={fechaReplanteo}
                      onChange={(e) => setFechaReplanteo(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Hora</label>
                    <input
                      type="time"
                      value={horaReplanteo}
                      onChange={(e) => setHoraReplanteo(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <p className="col-span-2 -mt-1 text-[11px] text-gray-400">Crea una tarea en Agenda automáticamente.</p>
                </div>
              )}
            </div>

            {/* ── Domicilio de trabajo (Replanteo / Instalación) ──
                Fase 41.4: campo siempre editable, precargado con la
                dirección del cliente (ver elegirCliente /
                handleSaveClienteNuevo) -- el agente lo corrige in place
                si el trabajo es en otro domicilio, o lo completa de cero
                si el cliente no tiene uno cargado. */}
            {(replanteoActivo || modalidadEntrega === 'obra_instalacion') && (
              <div>
                <label className={labelClass}>Domicilio {replanteoActivo ? 'a replantear' : 'de instalación'}</label>
                <input
                  type="text"
                  value={domicilioTrabajo}
                  onChange={(e) => setDomicilioTrabajo(e.target.value)}
                  placeholder="Domicilio donde se hace el replanteo / la instalación"
                  className={inputClass}
                />
              </div>
            )}

            {/* ── Ítems ── */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className={labelClass + ' mb-0'}>Ítems</label>
                <button
                  onClick={agregarItem}
                  className="flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100"
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar ítem
                </button>
              </div>

              <div className="space-y-3">
                {items.map((it) => (
                  <div key={it.key} className="rounded-lg border border-gray-200 p-3">
                    {/* A pedido de Carlos (18/08): orden de campos calcado al orden real
                        de la entrevista con el cliente -- primero Producto, después
                        Medidas (lo primero que dice el cliente: "quiero una cortina de
                        0.80 x 1 metro para la cocina"), recién después los datos
                        secundarios (Tela, Cantidad, Barral, Tipo de cortina). */}
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Producto</label>
                      <input
                        type="text"
                        value={it.producto}
                        onChange={(e) => actualizarItem(it.key, { producto: e.target.value })}
                        placeholder="Ej. Cortina living"
                        className={inputClass}
                      />
                      {productosCatalogo.length > 0 && (
                        <div className="mt-1">
                          <ProductoCatalogoCombobox
                            value={it.productoId}
                            options={productosCatalogo}
                            onSelect={(id) => actualizarItem(it.key, { productoId: id })}
                          />
                        </div>
                      )}
                    </div>

                    {tipo === 'cortinas' && (
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-sm font-medium text-gray-700">Medidas (Ancho × Alto por paño)</label>
                          <button
                            onClick={() => agregarPano(it.key)}
                            className="flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100"
                          >
                            <Plus className="h-3 w-3" /> Agregar paño
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {it.panos.map((p, idx) => (
                            <div key={p.key} className="flex items-center gap-2">
                              <span className="w-4 text-xs text-gray-400">{idx + 1}</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="Ancho"
                                value={p.textoAncho}
                                onChange={(e) => actualizarPano(it.key, p.key, { textoAncho: sanitizarDecimal(e.target.value) })}
                                className={inputClass}
                              />
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="Alto"
                                value={p.textoAlto}
                                onChange={(e) => actualizarPano(it.key, p.key, { textoAlto: sanitizarDecimal(e.target.value) })}
                                className={inputClass}
                              />
                              <button onClick={() => eliminarPano(it.key, p.key)} className="text-gray-400 hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          {it.panos.length === 0 && (
                            <p className="text-xs text-gray-400">Sin medidas cargadas todavía.</p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 border-t border-gray-100 pt-3">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Tela</label>
                        <input
                          type="text"
                          value={it.tela}
                          onChange={(e) => actualizarItem(it.key, { tela: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Cantidad</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={it.textoCantidad}
                          onChange={(e) => actualizarItem(it.key, { textoCantidad: sanitizarDecimal(e.target.value) })}
                          className={inputClass}
                        />
                      </div>

                      {tipo === 'generica' && (
                        <>
                          <div>
                            <label className="mb-1 block text-xs text-gray-500">Medida</label>
                            <input
                              type="text"
                              value={it.medida}
                              onChange={(e) => actualizarItem(it.key, { medida: e.target.value })}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-gray-500">Peso</label>
                            <input
                              type="text"
                              value={it.peso}
                              onChange={(e) => actualizarItem(it.key, { peso: e.target.value })}
                              className={inputClass}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {tipo === 'cortinas' && (
                      <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                        <div>
                          <label className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                            <input
                              type="checkbox"
                              checked={it.incluyeBarral}
                              onChange={(e) => actualizarItem(it.key, { incluyeBarral: e.target.checked })}
                            />
                            Incluir barral
                          </label>
                          {it.incluyeBarral && (
                            <div className="flex flex-wrap gap-1.5">
                              {TIPOS_BARRAL.map((tb) => (
                                <button
                                  key={tb}
                                  type="button"
                                  onClick={() => actualizarItem(it.key, { tipoBarral: tb })}
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                    it.tipoBarral === tb
                                      ? 'bg-teal-600 text-white'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  {tb}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-gray-500">Tipo de cortina</label>
                          <div className="flex flex-wrap gap-1.5">
                            {TIPOS_CORTINA.map((tc) => (
                              <button
                                key={tc}
                                type="button"
                                onClick={() => actualizarItem(it.key, { tipoCortina: tc })}
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                  it.tipoCortina === tc
                                    ? 'bg-teal-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                {tc}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => eliminarItem(it.key)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Quitar ítem
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>Notas</label>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={inputClass} />
            </div>

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSave()}
                disabled={guardando}
                className="rounded-lg border border-teal-200 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60"
              >
                {guardando ? 'Guardando...' : 'Guardar ficha'}
              </button>
              {/* Fase 41.1 "vericuetos" (pedido de Carlos): el dropdown de
                  Estado quedaba perdido entre los otros campos del
                  encabezado -- este botón es la acción prominente para
                  cerrar la toma de medidas y avisar que ya está lista para
                  presupuestar, sin que el operador tenga que acordarse de
                  ir a cambiar el select a mano. */}
              {estado !== 'lista' && estado !== 'convertida' && (
                <button
                  onClick={() => handleSave('lista')}
                  disabled={guardando}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {guardando ? 'Guardando...' : 'Marcar como Lista y continuar'}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      <ClienteDialog open={clienteDialogOpen} onOpenChange={setClienteDialogOpen} onSave={handleSaveClienteNuevo} />
    </Dialog.Root>
  );
}
