// ============================================================
// Modulo Compras — Ordenes de Compra
// Edgy Gestion · Gestion de ordenes de compra
// ============================================================

import { Fragment, useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  Package,
  XCircle,
  FileText,
  ClipboardList,
  Download,
  Loader2,
  Tag,
  Mail,
  MessageCircle,
  Building2,
} from 'lucide-react';

import { useClienteActual } from '@/hooks/useClienteActual';
import { armarLinkWhatsapp } from '@/lib/whatsapp';
import { enviarDocumentoWhatsapp } from '@/lib/enviarDocumentoWhatsapp';
import { supabase } from '@/lib/supabase';
import { descargarOrdenCompraPdf, generarOrdenCompraPdfBase64 } from '../lib/pdfComprobantes';
import {
  useOrdenesCompra,
  useProveedores,
  useCotizaciones,
  useComprobantesCompra,
  useCompras,
  useComprasDispatch,
} from '../data/store';
import {
  EstadoOCBadge,
  Amount,
  EmptyState,
} from '../components/compras/display';
import { ComprobanteCompraDialog, OrdenCompraPreciosDialog, ProveedorDialog } from '../components/compras/dialogs';
import { actualizarStockPorCompra } from '../lib/actualizarStockCompra';
import {
  formatDate,
  formatARS,
  formatNumero,
  todayISO,
  nowISO,
  PREFIJO_COMPROBANTE_COMPRA,
} from '../lib/format';
import type { EstadoOrdenCompra, TipoComprobanteCompra, ItemComprobanteCompra, ControlRemision, ItemCompra, ImpuestoOrdenCompra, Proveedor, OcBorrador } from '../types';
import {
  ESTADO_OC_LABEL,
  generarId,
  calcularSubtotalItem,
  tomarSiguienteOcBorrador,
  guardarColaOcBorrador,
} from '../types';
import { UNIDADES, unidadAbrev, presentacionDefault, type UnidadMedida, type InsumoPresentacion } from '@/modules/productos-stock/types';

// Conexión Compras -> Productos y Stock: buscador de insumo/producto real
// del catálogo, mismo criterio que en CotizacionDialog/ComprobanteCompraDialog
// (Fase 18/48b) -- este módulo no está montado dentro de
// ProductosStockProvider, así que se consulta Supabase directo en vez de
// usar los hooks de productos-stock/data/store.
interface InsumoCatalogoCompra {
  id: string;
  nombre: string;
  unidad: UnidadMedida;
  costo: number;
  stock: number;
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

/** Una fila de item se considera "vacía" (candidata a reutilizarse al
 * vincular un insumo/producto desde el buscador) si no tiene descripción
 * propia ni ya está vinculada a otra cosa. */
function filaOcVacia(item: { descripcion: string; insumoId?: string; productoId?: string }): boolean {
  return !item.descripcion.trim() && !item.insumoId && !item.productoId;
}

// ─── Componente principal ───────────────────────────────────

export default function OrdenesCompra() {
  const ordenesCompra = useOrdenesCompra();
  const proveedores = useProveedores();
  const cotizaciones = useCotizaciones();
  const comprobantes = useComprobantesCompra();
  const comprasState = useCompras();
  const dispatch = useComprasDispatch();

  // ── Filtros ───────────────────────────────────────────────

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrdenCompra | ''>('');

  // ── Estado de UI ──────────────────────────────────────────

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false);
  // Cuando "Registrar factura" se aprieta desde una OC puntual, guardamos
  // cuál para precargar el comprobante (proveedor, items, IVA y otros
  // impuestos ya confirmados) y vincularlo -- ver ComprobanteCompraDialog
  // prop `ordenCompra`.
  const [ordenParaFacturar, setOrdenParaFacturar] = useState<(typeof ordenesCompra)[number] | null>(null);
  // Fase 17: ícono de descarga de PDF -- mismo motor compartido de Ventas.
  const { cliente: empresaActual } = useClienteActual();
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null);
  const [enviandoWhatsappId, setEnviandoWhatsappId] = useState<string | null>(null);
  // Fase 21 (punto 3 de Cotizaciones): una vez generada la OC desde una
  // cotización respondida, acá se cargan los precios cotizados y se
  // confirman -- ver OrdenCompraPreciosDialog.
  const [preciosOrdenId, setPreciosOrdenId] = useState<string | null>(null);
  // Fase 44 (a pedido de Carlos): antes el proveedor de una OC no se podía
  // cambiar después de creada -- útil sobre todo cuando la OC se generó
  // desde un borrador de faltantes de Producción sin elegir proveedor
  // todavía, o si se equivocó al elegirlo. Solo mientras está 'pendiente'
  // -- una vez parcial/recibida ya hay remitos/facturas atados al proveedor
  // original, cambiarlo ahí desincronizaría todo.
  const [cambioProveedorOcId, setCambioProveedorOcId] = useState<string | null>(null);
  const [nuevoProveedorId, setNuevoProveedorId] = useState('');
  // Fase 44 (a pedido de Carlos): "Nuevo proveedor" desde el propio
  // formulario de OC -- antes había que ir a Proveedores, cargarlo, volver
  // y perdía los items que ya había armado (sobre todo doloroso cuando
  // vienen precargados desde un borrador de Producción). El destino del
  // proveedor recién creado depende de dónde se abrió el diálogo: el
  // formulario de "Nueva OC" o el selector de "Cambiar proveedor" de una
  // OC ya existente.
  const [nuevoProveedorDialogOpen, setNuevoProveedorDialogOpen] = useState(false);
  const [nuevoProveedorDestino, setNuevoProveedorDestino] = useState<'form' | 'cambio'>('form');

  // ── Inline form state ─────────────────────────────────────

  const [formProveedorId, setFormProveedorId] = useState('');
  const [formFecha, setFormFecha] = useState(todayISO());
  const [formFechaEntrega, setFormFechaEntrega] = useState('');
  const [formNotas, setFormNotas] = useState('');
  const [formItems, setFormItems] = useState([
    { key: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0, insumoId: undefined as string | undefined, productoId: undefined as string | undefined, unidad: undefined as UnidadMedida | undefined },
  ]);
  // Buscador de insumo/producto real del catálogo (mismo criterio que
  // Cotizaciones/Comprobantes) -- Carlos pedía que la OC manual también
  // pueda vincularse al catálogo, en vez de tipear descripción y precio a
  // mano y quedar en $0 (auditado 27/08). Reutiliza `empresaActual`,
  // declarado más abajo en el componente (ver PDF) -- se referencia acá
  // sin volver a llamar useClienteActual().
  const [insumosCatalogo, setInsumosCatalogo] = useState<InsumoCatalogoCompra[]>([]);
  const [productosCatalogo, setProductosCatalogo] = useState<ProductoCatalogoCompra[]>([]);
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');

  useEffect(() => {
    if (!showForm || !empresaActual?.id) return;
    let activo = true;

    async function cargarCatalogo() {
      const [insumosRes, productosRes] = await Promise.all([
        supabase
          .from('insumos')
          .select('id, nombre, unidad, costo, stock, insumo_presentaciones(id, nombre, contenido, es_default)')
          .eq('cliente_id', empresaActual!.id)
          .order('nombre'),
        supabase
          .from('productos')
          .select('id, nombre, unidad_venta, costo, stock')
          .eq('cliente_id', empresaActual!.id)
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
  }, [showForm, empresaActual?.id]);

  const sugerenciasCatalogoOC = useMemo<SugerenciaCatalogoCompra[]>(() => {
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

  const handleAgregarInsumoForm = (insumo: InsumoCatalogoCompra) => {
    const nuevaLinea = {
      key: generarId(), descripcion: insumo.nombre, cantidad: 1, precioUnitario: insumo.costo, descuento: 0,
      insumoId: insumo.id, productoId: undefined as string | undefined, unidad: insumo.unidad,
    };
    setFormItems((prev) => {
      const idxVacia = prev.findIndex(filaOcVacia);
      if (idxVacia !== -1) return prev.map((it, i) => (i === idxVacia ? nuevaLinea : it));
      return [...prev, nuevaLinea];
    });
    setBusquedaCatalogo('');
  };

  const handleAgregarProductoForm = (producto: ProductoCatalogoCompra) => {
    const nuevaLinea = {
      key: generarId(), descripcion: producto.nombre, cantidad: 1, precioUnitario: producto.costo, descuento: 0,
      insumoId: undefined as string | undefined, productoId: producto.id, unidad: producto.unidad,
    };
    setFormItems((prev) => {
      const idxVacia = prev.findIndex(filaOcVacia);
      if (idxVacia !== -1) return prev.map((it, i) => (i === idxVacia ? nuevaLinea : it));
      return [...prev, nuevaLinea];
    });
    setBusquedaCatalogo('');
  };
  // Fase 44/45g/45h: aviso de que este formulario se precargó desde un
  // borrador de Producción (faltantes de una fórmula) -- solo para
  // mostrarle a Carlos de dónde salió, no cambia el guardado.
  // `restantes` es cuántas OC más quedan en la cola después de esta
  // (split por proveedor/rubro) -- 0 = era la última.
  const [formOrigenBorrador, setFormOrigenBorrador] = useState<{
    productoNombre?: string;
    proveedorNombre?: string;
    rubroNombre?: string;
    restantes: number;
  } | null>(null);
  // Fase 45j (Etapa 4 del split de OC): aviso de cuántas OC se crearon
  // SOLAS (sin pasar por el formulario) en la última tanda -- ver
  // procesarColaBorradores más abajo.
  const [mensajeAutoOc, setMensajeAutoOc] = useState<string | null>(null);

  const mensajeCreadasAuto = (n: number) =>
    `Se ${n === 1 ? 'creó' : 'crearon'} ${n} Orden${n === 1 ? '' : 'es'} de Compra automáticamente (proveedor ya conocido) -- revisalas en el listado de abajo.`;

  // ── Borrador desde Producción (Fase 44/45g/45h/45j) ────────
  // Si llegamos con ?borrador=1, Producción dejó una cola de OcBorrador en
  // sessionStorage con los insumos que faltaban para un lote, agrupados
  // por proveedor habitual real (cuando el insumo lo tiene cargado) o por
  // rubro (fallback, sin proveedor conocido).

  // Precarga el formulario "Nueva OC" con UN borrador puntual -- se usa
  // solo para el caso "sin proveedor conocido" (Etapa 1/fallback), que sí
  // necesita que Carlos elija a mano.
  const precargarFormDesdeBorrador = (borrador: OcBorrador, restantes: number) => {
    setFormItems(
      borrador.items.map((it) => ({
        key: generarId(),
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        descuento: 0,
        insumoId: it.insumoId,
        productoId: undefined,
        unidad: it.unidad,
      })),
    );
    setFormProveedorId(borrador.proveedorId ?? '');
    setFormFecha(todayISO());
    setFormFechaEntrega('');
    const proveedorNombre = borrador.proveedorId
      ? proveedores.find((p) => p.id === borrador.proveedorId)?.nombre
      : undefined;
    setFormNotas(
      borrador.productoNombre
        ? `Faltantes para producir ${borrador.productoNombre}${
            proveedorNombre
              ? ` — Proveedor: ${proveedorNombre}`
              : borrador.rubroNombre
                ? ` — Rubro: ${borrador.rubroNombre}`
                : ''
          }`
        : '',
    );
    setFormOrigenBorrador({
      productoNombre: borrador.productoNombre,
      proveedorNombre,
      rubroNombre: borrador.rubroNombre,
      restantes,
    });
    setShowForm(true);
  };

  // Fase 45j (Etapa 4): crea directo una OC "pendiente" a partir de un
  // borrador que YA tiene proveedor conocido -- sin pasar por el
  // formulario ni pedirle nada a Carlos. La revisa/ajusta después desde
  // el listado (editar proveedor, precios, etc. -- todo eso ya existía).
  const crearOcDesdeBorrador = (borrador: OcBorrador) => {
    if (!borrador.proveedorId) return;
    const now = nowISO();
    const items = borrador.items.map((it) => ({
      id: generarId(),
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precioUnitario: it.precioUnitario,
      descuento: 0,
      subtotal: calcularSubtotalItem(it.cantidad, it.precioUnitario, 0),
      insumoId: it.insumoId,
      unidad: it.unidad,
    }));
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    dispatch({
      type: 'ADD_ORDEN_COMPRA',
      payload: {
        id: generarId(),
        proveedorId: borrador.proveedorId,
        fecha: todayISO(),
        estado: 'pendiente',
        items,
        subtotal,
        total: subtotal,
        notas: borrador.productoNombre ? `Faltantes para producir ${borrador.productoNombre}` : undefined,
        comprobanteIds: [],
        createdAt: now,
        updatedAt: now,
      },
    });
  };

  // Fase 45j (Etapa 4): recorre la cola completa -- crea directo cada OC
  // que ya tenga proveedor conocido (Etapa 2), y se detiene a precargar
  // el formulario en la primera que NO lo tenga (fallback por rubro,
  // Etapa 1 -- ahí sí hace falta que Carlos elija el proveedor a mano).
  // Se llama tanto al llegar con ?borrador=1 como después de confirmar
  // cada OC manual, para seguir drenando el resto de la cola sola.
  const procesarColaBorradores = (): { creadas: number; cargoManual: boolean } => {
    let creadas = 0;
    while (true) {
      const siguiente = tomarSiguienteOcBorrador();
      if (!siguiente || !siguiente.borrador.items?.length) return { creadas, cargoManual: false };
      const { borrador, restantes } = siguiente;
      if (!borrador.proveedorId) {
        precargarFormDesdeBorrador(borrador, restantes);
        return { creadas, cargoManual: true };
      }
      crearOcDesdeBorrador(borrador);
      creadas++;
    }
  };

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('borrador') !== '1') return
    const next = new URLSearchParams(searchParams)
    next.delete('borrador')
    setSearchParams(next, { replace: true })
    const { creadas } = procesarColaBorradores()
    if (creadas > 0) setMensajeAutoOc(mensajeCreadasAuto(creadas))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Datos filtrados ───────────────────────────────────────

  const ordenesFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return ordenesCompra.filter((o) => {
      if (filtroEstado && o.estado !== filtroEstado) return false;
      if (q) {
        const prov = proveedores.find((p) => p.id === o.proveedorId);
        const matchProv = prov?.nombre.toLowerCase().includes(q);
        const matchNum = String(o.numero).includes(q);
        if (!matchProv && !matchNum) return false;
      }
      return true;
    });
  }, [ordenesCompra, busqueda, filtroEstado, proveedores]);

  // ── Helpers ───────────────────────────────────────────────

  const nombreProveedor = (proveedorId: string) =>
    proveedores.find((p) => p.id === proveedorId)?.nombre ?? 'Desconocido';

  const cotNumero = (cotizacionId?: string) => {
    if (!cotizacionId) return null;
    const cot = cotizaciones.find((c) => c.id === cotizacionId);
    return cot ? formatNumero('COT', cot.numero) : null;
  };

  const comprobantesDeOC = (ocId: string) =>
    comprobantes.filter((c) => c.ordenCompraId === ocId);

  // ── Inline form handlers ──────────────────────────────────

  const resetForm = () => {
    setFormProveedorId('');
    setFormFecha(todayISO());
    setFormFechaEntrega('');
    setFormNotas('');
    setFormItems([{ key: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0, insumoId: undefined, productoId: undefined, unidad: undefined }]);
    setBusquedaCatalogo('');
    // Fase 45g: "Cancelar" descarta el resto de la cola de borradores
    // (si quedaba alguna OC más por generar del split por rubro) -- así
    // no queda nada pendiente en sessionStorage esperando reaparecer solo
    // más adelante. Si en cambio se quiere seguir con la siguiente, hay
    // que confirmar esta OC (ver handleSubmitOC), no cancelarla.
    if (formOrigenBorrador) guardarColaOcBorrador([]);
    setFormOrigenBorrador(null);
    setShowForm(false);
  };

  const addFormItem = () => {
    setFormItems((prev) => [...prev, { key: generarId(), descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0, insumoId: undefined, productoId: undefined, unidad: undefined }]);
  };

  const updateFormItem = (index: number, field: string, value: string | number) => {
    setFormItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const removeFormItem = (index: number) => {
    if (formItems.length > 1) setFormItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitOC = () => {
    if (!formProveedorId || formItems.some((it) => !it.descripcion.trim())) return;

    const now = nowISO();
    const items = formItems.map((it) => ({
      id: generarId(),
      descripcion: it.descripcion.trim(),
      cantidad: it.cantidad,
      precioUnitario: it.precioUnitario,
      descuento: it.descuento,
      subtotal: calcularSubtotalItem(it.cantidad, it.precioUnitario, it.descuento),
      insumoId: it.insumoId,
      productoId: it.productoId,
      unidad: it.unidad,
    }));
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);

    dispatch({
      type: 'ADD_ORDEN_COMPRA',
      payload: {
        id: generarId(),
        proveedorId: formProveedorId,
        fecha: formFecha,
        fechaEntrega: formFechaEntrega || undefined,
        estado: 'pendiente',
        items,
        subtotal,
        total: subtotal,
        notas: formNotas || undefined,
        comprobanteIds: [],
        createdAt: now,
        updatedAt: now,
      },
    });
    // Fase 45g/45j: si quedan más OC en la cola, se sigue procesando --
    // las que ya tengan proveedor conocido se crean solas (Etapa 4), y si
    // aparece una sin proveedor se precarga acá para que Carlos la
    // complete a mano, igual que ahora. Si no queda nada, se cierra el
    // formulario.
    const { creadas, cargoManual } = procesarColaBorradores();
    if (creadas > 0) setMensajeAutoOc(mensajeCreadasAuto(creadas));
    if (!cargoManual) resetForm();
  };

  // ── OC action handlers ────────────────────────────────────

  const cambiarEstado = (id: string, nuevoEstado: EstadoOrdenCompra) => {
    dispatch({ type: 'CAMBIAR_ESTADO_OC', payload: { id, nuevoEstado } });
  };

  const handleGuardarPrecios = (
    ordenId: string,
    data: { items: ItemCompra[]; montoIva: number; otrosImpuestos: ImpuestoOrdenCompra[] },
  ) => {
    const orden = ordenesCompra.find((o) => o.id === ordenId);
    if (!orden) return;
    const subtotal = data.items.reduce((s, i) => s + i.subtotal, 0);
    const totalOtrosImpuestos = data.otrosImpuestos.reduce((s, i) => s + i.monto, 0);
    dispatch({
      type: 'UPDATE_ORDEN_COMPRA',
      payload: {
        ...orden,
        items: data.items,
        subtotal,
        montoIva: data.montoIva,
        otrosImpuestos: data.otrosImpuestos,
        total: subtotal + data.montoIva + totalOtrosImpuestos,
        updatedAt: nowISO(),
      },
    });
  };

  const handleGuardarNuevoProveedor = (
    data: Omit<Proveedor, 'id' | 'saldoCuentaCorriente' | 'activo' | 'createdAt' | 'updatedAt'>,
  ) => {
    const now = nowISO();
    const id = generarId();
    dispatch({
      type: 'ADD_PROVEEDOR',
      payload: { ...data, id, saldoCuentaCorriente: 0, activo: true, createdAt: now, updatedAt: now },
    });
    if (nuevoProveedorDestino === 'cambio') setNuevoProveedorId(id);
    else setFormProveedorId(id);
  };

  const handleGuardarProveedor = (ordenId: string) => {
    const orden = ordenesCompra.find((o) => o.id === ordenId);
    if (!orden || !nuevoProveedorId) return;
    dispatch({
      type: 'UPDATE_ORDEN_COMPRA',
      payload: { ...orden, proveedorId: nuevoProveedorId, updatedAt: nowISO() },
    });
    setCambioProveedorOcId(null);
    setNuevoProveedorId('');
  };

  // Envío por email / WhatsApp al proveedor -- mismo criterio que en
  // Cotizaciones: sin motor de envío real todavía, se arma un link
  // mailto:/wa.me con el detalle de la OC ya redactado.
  const armarTextoOC = (oc: (typeof ordenesCompra)[number]) => {
    const numero = formatNumero('OC', oc.numero);
    const lineas = oc.items.map(
      (it) => `- ${it.descripcion} · cant. ${it.cantidad}${it.unidad ? ` ${it.unidad}` : ''}`,
    );
    return {
      asunto: `Orden de Compra ${numero}`,
      cuerpo:
        `Hola${nombreProveedor(oc.proveedorId) !== 'Desconocido' ? ` ${nombreProveedor(oc.proveedorId)}` : ''},\n\n` +
        `Te enviamos la Orden de Compra ${numero} del ${formatDate(oc.fecha)}` +
        `${oc.fechaEntrega ? `, con entrega estimada para el ${formatDate(oc.fechaEntrega)}` : ''}:\n\n` +
        `${lineas.join('\n')}\n\n` +
        `Total: ${formatARS(oc.total)}\n\n` +
        `${oc.notas ? `Notas: ${oc.notas}\n\n` : ''}` +
        `Saludos.`,
    };
  };

  const handleEnviarEmailOC = (oc: (typeof ordenesCompra)[number], proveedor?: Proveedor) => {
    if (!proveedor?.email) return;
    const { asunto, cuerpo } = armarTextoOC(oc);
    window.open(`mailto:${proveedor.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`, '_blank');
  };

  // Fase 50e (28/08): igual que Cotizaciones/Presupuestos -- manda el
  // PDF real como adjunto de WhatsApp a través del agente, con
  // respaldo a wa.me si falla.
  const handleEnviarWhatsappOC = async (oc: (typeof ordenesCompra)[number], proveedor?: Proveedor) => {
    if (!proveedor?.telefono || !empresaActual) return;
    const numero = formatNumero('OC', oc.numero);
    const { cuerpo } = armarTextoOC(oc);
    setEnviandoWhatsappId(oc.id);
    try {
      const pdfBase64 = await generarOrdenCompraPdfBase64(empresaActual, proveedor, oc, nombreProveedor(oc.proveedorId));
      await enviarDocumentoWhatsapp({
        clienteId: empresaActual.id,
        telefono: proveedor.telefono,
        pdfBase64,
        nombreArchivo: numero,
        caption: cuerpo,
        tipoDocumento: 'orden_compra',
        numeroDocumento: numero,
      });
    } catch (e) {
      console.error('Ordenes de compra: no se pudo enviar por el agente, cae a wa.me', e);
      const motivo = e instanceof Error ? e.message : 'error desconocido';
      window.open(armarLinkWhatsapp(proveedor.telefono, cuerpo), '_blank');
      alert(`No se pudo enviar el PDF automáticamente por WhatsApp (${motivo}).\n\nSe intentó abrir un WhatsApp Web con el texto ya armado -- si no se abrió ninguna pestaña nueva, puede que el navegador haya bloqueado el pop-up.`);
    } finally {
      setEnviandoWhatsappId(null);
    }
  };

  const handleDescargarPdf = async (oc: (typeof ordenesCompra)[number]) => {
    if (!empresaActual) return;
    setGenerandoPdfId(oc.id);
    try {
      const proveedor = proveedores.find((p) => p.id === oc.proveedorId);
      await descargarOrdenCompraPdf(empresaActual, proveedor, oc, nombreProveedor(oc.proveedorId));
    } finally {
      setGenerandoPdfId(null);
    }
  };

  const handleSaveComprobante = async (data: {
    tipo: TipoComprobanteCompra;
    proveedorId: string;
    /** Nro. de comprobante fiscal del proveedor (ej. "0001-00000542"). */
    numeroComprobanteProveedor: string;
    /** Letra/tipo AFIP-ARCA del comprobante (Fase 34, Impuestos). */
    tipoComprobanteCodigo: string;
    fecha: string;
    fechaVencimiento: string;
    medioPago: any;
    items: Omit<ItemComprobanteCompra, 'id'>[];
    controlRemision: ControlRemision;
    numeroRemito: string;
    // Conexión Compras -> Recepción (misma lógica que en Comprobantes.tsx).
    actualizarStock: boolean;
    /** Percepciones/impuestos adicionales -- mismo criterio que en la OC. */
    otrosImpuestos?: ImpuestoOrdenCompra[];
    /** Si viene de "Registrar factura" en una OC puntual, la vincula. */
    ordenCompraId?: string;
  }) => {
    const now = nowISO();
    const subtotal = data.items.reduce((s, i) => s + i.subtotal, 0);
    const montoIva = data.items.reduce((s, i) => s + i.montoIva, 0);
    const otrosImpuestos = data.otrosImpuestos ?? [];
    const totalOtrosImpuestos = otrosImpuestos.reduce((s, imp) => s + (imp.monto || 0), 0);
    const total = subtotal + montoIva + totalOtrosImpuestos;
    const comprobanteId = generarId();
    const itemsConId: ItemComprobanteCompra[] = data.items.map((it) => ({ ...it, id: generarId() }));

    dispatch({
      type: 'ADD_COMPROBANTE_COMPRA',
      payload: {
        id: comprobanteId,
        tipo: data.tipo,
        proveedorId: data.proveedorId,
        ordenCompraId: data.ordenCompraId,
        fecha: data.fecha,
        fechaVencimiento: data.fechaVencimiento || undefined,
        items: itemsConId,
        subtotal,
        montoIva,
        otrosImpuestos,
        total,
        estado: 'pendiente',
        medioPago: data.medioPago,
        montoPagado: 0,
        saldoPendiente: total,
        controlRemision: data.controlRemision,
        numeroRemito: data.numeroRemito || undefined,
        numeroComprobanteProveedor: data.numeroComprobanteProveedor || undefined,
        tipoComprobanteCodigo: data.tipoComprobanteCodigo || undefined,
        stockActualizado: false,
        createdAt: now,
        updatedAt: now,
      },
    });

    if (data.actualizarStock && empresaActual) {
      const numeroFormateado = formatNumero(
        PREFIJO_COMPROBANTE_COMPRA[data.tipo],
        comprasState.nextNumeroComprobante[data.tipo],
      );
      const resultado = await actualizarStockPorCompra(itemsConId, {
        clienteId: empresaActual.id,
        proveedorNombre: nombreProveedor(data.proveedorId),
        fecha: data.fecha,
        numeroRemito: data.numeroRemito || undefined,
        numeroComprobante: numeroFormateado,
      });
      if (resultado) {
        dispatch({
          type: 'MARCAR_STOCK_ACTUALIZADO',
          payload: { comprobanteId, recepcionId: resultado.recepcionId },
        });
        if (resultado.advertenciasConversion.length > 0) {
          alert(
            `Comprobante guardado y stock actualizado, con advertencias:\n\n${resultado.advertenciasConversion.join('\n')}`,
          );
        }
      } else {
        alert(
          'El comprobante se guardó, pero no se pudo actualizar el stock. Podés reintentarlo desde Comprobantes.',
        );
      }
    }
  };

  // ── Render ────────────────────────────────────────────────

  const estados: EstadoOrdenCompra[] = ['pendiente', 'parcial', 'recibida', 'cancelada'];

  return (
    <div className="space-y-4">
      {/* Fase 45j (Etapa 4 del split de OC): aviso de OC creadas solas
          desde un chequeo de faltantes de Producción -- se puede cerrar,
          no bloquea nada. */}
      {mensajeAutoOc && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <span>{mensajeAutoOc}</span>
          <button
            type="button"
            onClick={() => setMensajeAutoOc(null)}
            className="shrink-0 text-emerald-600 hover:text-emerald-900"
            title="Cerrar aviso"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900"
              placeholder="Buscar por proveedor o numero..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <select
            className="rounded-lg border border-gray-300 py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoOrdenCompra | '')}
          >
            <option value="">Todos los estados</option>
            {estados.map((e) => (
              <option key={e} value={e}>{ESTADO_OC_LABEL[e]}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => { if (!showForm) setBusquedaCatalogo(''); setShowForm(!showForm); }}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva OC
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Nueva Orden de Compra</h3>
          {formOrigenBorrador && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              Items precargados con los faltantes para producir {formOrigenBorrador.productoNombre ?? 'una producción'}
              {formOrigenBorrador.proveedorNombre ? (
                <> — Proveedor: <strong>{formOrigenBorrador.proveedorNombre}</strong> (ya seleccionado, es el habitual de estos insumos).</>
              ) : formOrigenBorrador.rubroNombre ? (
                <> — Rubro: {formOrigenBorrador.rubroNombre}. Ninguno tiene proveedor habitual cargado -- elegilo antes de crear la OC.</>
              ) : (
                <>. Elegí el proveedor antes de crear la OC.</>
              )}
              {formOrigenBorrador.restantes > 0 && (
                <>
                  {' '}
                  Quedan {formOrigenBorrador.restantes} orden{formOrigenBorrador.restantes === 1 ? '' : 'es'} más por
                  generar de este chequeo -- se van a ir precargando solas apenas confirmes cada una.
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
              <div className="flex gap-1.5">
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                  value={formProveedorId}
                  onChange={(e) => setFormProveedorId(e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {proveedores.filter((p) => p.activo).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => { setNuevoProveedorDestino('form'); setNuevoProveedorDialogOpen(true); }}
                  title="Nuevo proveedor"
                  className="shrink-0 rounded-lg border border-gray-300 px-2.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20" type="date" value={formFecha} onChange={(e) => setFormFecha(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha entrega</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20" type="date" value={formFechaEntrega} onChange={(e) => setFormFechaEntrega(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20" value={formNotas} onChange={(e) => setFormNotas(e.target.value)} />
            </div>
          </div>

          {/* Items editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Items</span>
              <button onClick={addFormItem} className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Agregar
              </button>
            </div>
            {/* Buscador de insumo/producto real del catálogo -- clic en una
                sugerencia agrega/completa una fila ya vinculada, con precio
                y unidad precargados desde Productos y Stock. La carga
                manual (texto libre) sigue disponible con "Agregar". */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busquedaCatalogo}
                onChange={(e) => setBusquedaCatalogo(e.target.value)}
                placeholder="Vincular a un insumo o producto del catálogo..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900/20"
              />
              {sugerenciasCatalogoOC.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {sugerenciasCatalogoOC.map((s) =>
                    s.tipo === 'insumo' ? (
                      <button
                        key={`insumo-${s.item.id}`}
                        type="button"
                        onClick={() => handleAgregarInsumoForm(s.item)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <span className="flex items-center gap-1.5 text-gray-900">
                          {s.item.nombre}
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                            Insumo
                          </span>
                        </span>
                        <span className="text-gray-500">
                          {formatARS(s.item.costo)} / {unidadAbrev(s.item.unidad)}
                        </span>
                      </button>
                    ) : (
                      <button
                        key={`producto-${s.item.id}`}
                        type="button"
                        onClick={() => handleAgregarProductoForm(s.item)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <span className="flex items-center gap-1.5 text-gray-900">
                          {s.item.nombre}
                          <span className="inline-flex items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                            Producto
                          </span>
                        </span>
                        <span className="text-gray-500">
                          {formatARS(s.item.costo)} / {unidadAbrev(s.item.unidad)}
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
                    <th className="text-left px-3 py-2 font-medium w-20">UM</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Precio</th>
                    <th className="text-right px-3 py-2 font-medium w-16">Dto.%</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Subtotal</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {formItems.map((item, idx) => {
                    const sub = calcularSubtotalItem(item.cantidad, item.precioUnitario, item.descuento);
                    const vinculada = Boolean(item.insumoId || item.productoId);
                    const insumoVinculado = item.insumoId ? insumosCatalogo.find((i) => i.id === item.insumoId) : undefined;
                    const pres = insumoVinculado ? presentacionDefault(insumoVinculado.presentaciones ?? []) : undefined;
                    return (
                      <tr key={item.key} className="border-t border-gray-100">
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <input className="w-full border-0 bg-transparent text-sm focus:outline-none" placeholder="Descripcion" value={item.descripcion} onChange={(e) => updateFormItem(idx, 'descripcion', e.target.value)} />
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
                          <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none" type="number" min={1} value={item.cantidad} onChange={(e) => updateFormItem(idx, 'cantidad', Number(e.target.value))} />
                          {pres && item.cantidad > 0 && (
                            <p className="text-[10px] text-gray-400 leading-tight text-right">
                              ≈ {(item.cantidad / pres.contenido).toFixed(2).replace('.', ',')} env.
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-gray-600">{item.unidad ? unidadAbrev(item.unidad) : '—'}</td>
                        <td className="px-2 py-1.5">
                          <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none" type="number" min={0} step={0.01} value={item.precioUnitario} onChange={(e) => updateFormItem(idx, 'precioUnitario', Number(e.target.value))} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="w-full text-right border-0 bg-transparent text-sm focus:outline-none" type="number" min={0} max={100} value={item.descuento} onChange={(e) => updateFormItem(idx, 'descuento', Number(e.target.value))} />
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-700 font-medium">{formatARS(sub)}</td>
                        <td className="px-1 py-1.5">
                          <button onClick={() => removeFormItem(idx)} disabled={formItems.length <= 1} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30">
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={resetForm} className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSubmitOC}
              disabled={!formProveedorId || formItems.some((it) => !it.descripcion.trim())}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Crear OC
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {ordenesFiltradas.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="No hay ordenes de compra"
          description="Cree una orden de compra o apruebe una cotizacion."
        />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto scroll-shadow-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium w-8" />
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[7rem]">Numero</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[11rem]">Proveedor</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[7rem]">Fecha</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[7rem]">Entrega</th>
                <th className="px-4 py-3 text-right font-medium whitespace-nowrap min-w-[7rem]">Total</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[8rem]">Estado</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ordenesFiltradas.map((oc) => {
                const isExpanded = expandedId === oc.id;
                const linkedCot = cotNumero(oc.cotizacionId);
                const comps = comprobantesDeOC(oc.id);
                const proveedorOC = proveedores.find((p) => p.id === oc.proveedorId);

                return (
                  <Fragment key={oc.id}>
                    <tr
                      className="border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : oc.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{formatNumero('OC', oc.numero)}</td>
                      <td className="px-4 py-3 text-xs font-medium text-gray-900 whitespace-nowrap">{nombreProveedor(oc.proveedorId)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDate(oc.fecha)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{oc.fechaEntrega ? formatDate(oc.fechaEntrega) : '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap"><Amount value={oc.total} size="xs" /></td>
                      <td className="px-4 py-3 whitespace-nowrap"><EstadoOCBadge estado={oc.estado} /></td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDescargarPdf(oc)}
                            disabled={generandoPdfId === oc.id}
                            title="Descargar PDF"
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                          >
                            {generandoPdfId === oc.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleEnviarEmailOC(oc, proveedorOC)}
                            disabled={!proveedorOC?.email}
                            title={proveedorOC?.email ? `Enviar por email a ${proveedorOC.email}` : 'El proveedor no tiene email cargado'}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleEnviarWhatsappOC(oc, proveedorOC)}
                            disabled={!proveedorOC?.telefono || enviandoWhatsappId === oc.id}
                            title={proveedorOC?.telefono ? `Enviar por WhatsApp a ${proveedorOC.telefono}` : 'El proveedor no tiene teléfono cargado'}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
                          >
                            {enviandoWhatsappId === oc.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <MessageCircle className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {oc.estado === 'pendiente' && (
                            <>
                              <button
                                onClick={() => { setCambioProveedorOcId(oc.id); setNuevoProveedorId(oc.proveedorId); setExpandedId(oc.id); }}
                                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                title="Cambiar proveedor"
                              >
                                <Building2 className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setPreciosOrdenId(oc.id)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Cargar precios cotizados, IVA e impuestos / confirmar">
                                <Tag className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => cambiarEstado(oc.id, 'parcial')} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Marcar parcial">
                                <Package className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => cambiarEstado(oc.id, 'recibida')} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Marcar recibida">
                                <PackageCheck className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => { setOrdenParaFacturar(oc); setComprobanteDialogOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Registrar factura">
                                <FileText className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => cambiarEstado(oc.id, 'cancelada')} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancelar">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {oc.estado === 'parcial' && (
                            <>
                              <button onClick={() => cambiarEstado(oc.id, 'recibida')} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Marcar recibida">
                                <PackageCheck className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => { setOrdenParaFacturar(oc); setComprobanteDialogOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Registrar factura">
                                <FileText className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {oc.estado === 'recibida' && comps.length === 0 && (
                            <button onClick={() => { setOrdenParaFacturar(oc); setComprobanteDialogOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Registrar factura">
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50/50 px-8 py-4">
                          {cambioProveedorOcId === oc.id && (
                            <div className="mb-3 flex items-end gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Nuevo proveedor</label>
                                <div className="flex gap-1.5">
                                  <select
                                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                                    value={nuevoProveedorId}
                                    onChange={(e) => setNuevoProveedorId(e.target.value)}
                                  >
                                    <option value="">Seleccionar...</option>
                                    {proveedores.filter((p) => p.activo).map((p) => (
                                      <option key={p.id} value={p.id}>{p.nombre}</option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => { setNuevoProveedorDestino('cambio'); setNuevoProveedorDialogOpen(true); }}
                                    title="Nuevo proveedor"
                                    className="shrink-0 rounded-lg border border-gray-300 px-2 text-gray-500 hover:text-gray-900 hover:bg-white bg-white"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <button
                                onClick={() => handleGuardarProveedor(oc.id)}
                                disabled={!nuevoProveedorId}
                                className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Guardar
                              </button>
                              <button
                                onClick={() => { setCambioProveedorOcId(null); setNuevoProveedorId(''); }}
                                className="px-3 py-1.5 bg-white text-gray-600 text-xs font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          )}
                          {/* Items */}
                          <h4 className="font-semibold text-gray-900 text-sm mb-2">Items</h4>
                          <div className="border border-gray-200 rounded-lg overflow-x-auto scroll-shadow-x mb-3">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 text-gray-600">
                                  <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                                  <th className="text-right px-3 py-2 font-medium">Cant.</th>
                                  <th className="text-right px-3 py-2 font-medium">Precio</th>
                                  <th className="text-right px-3 py-2 font-medium">Dto.%</th>
                                  <th className="text-right px-3 py-2 font-medium">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {oc.items.map((item) => (
                                  <tr key={item.id} className="border-t border-gray-100">
                                    <td className="px-3 py-2">{item.descripcion}</td>
                                    <td className="px-3 py-2 text-right">{item.cantidad}</td>
                                    <td className="px-3 py-2 text-right">{formatARS(item.precioUnitario)}</td>
                                    <td className="px-3 py-2 text-right">{item.descuento}%</td>
                                    <td className="px-3 py-2 text-right font-medium">{formatARS(item.subtotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* IVA / otros impuestos, si ya se cargaron precios */}
                          {((oc.montoIva ?? 0) > 0 || (oc.otrosImpuestos?.length ?? 0) > 0) && (
                            <div className="flex justify-end mb-3">
                              <div className="w-64 text-sm space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Subtotal</span>
                                  <span className="text-gray-900">{formatARS(oc.subtotal)}</span>
                                </div>
                                {(oc.montoIva ?? 0) > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">IVA</span>
                                    <span className="text-gray-900">{formatARS(oc.montoIva ?? 0)}</span>
                                  </div>
                                )}
                                {oc.otrosImpuestos?.map((imp) => (
                                  <div className="flex justify-between" key={imp.id}>
                                    <span className="text-gray-500">{imp.concepto}</span>
                                    <span className="text-gray-900">{formatARS(imp.monto)}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
                                  <span className="text-gray-900">TOTAL</span>
                                  <span className="text-gray-900">{formatARS(oc.total)}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Linked cotizacion */}
                          {linkedCot && (
                            <p className="text-sm text-gray-600 mb-2">
                              Cotizacion vinculada: <span className="font-mono text-xs font-medium">{linkedCot}</span>
                            </p>
                          )}

                          {/* Linked comprobantes */}
                          {comps.length > 0 && (
                            <div className="mb-2">
                              <h4 className="font-semibold text-gray-900 text-sm mb-1">Comprobantes vinculados</h4>
                              <div className="space-y-1">
                                {comps.map((c) => (
                                  <div key={c.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm border border-gray-100">
                                    <span className="font-mono text-xs">{formatNumero(PREFIJO_COMPROBANTE_COMPRA[c.tipo], c.numero)}</span>
                                    <span className="text-gray-500">{formatDate(c.fecha)}</span>
                                    <Amount value={c.total} size="sm" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {oc.notas && (
                            <p className="text-sm text-gray-500 italic">Notas: {oc.notas}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Comprobante Dialog */}
      <ComprobanteCompraDialog
        open={comprobanteDialogOpen}
        onOpenChange={(v) => { setComprobanteDialogOpen(v); if (!v) setOrdenParaFacturar(null); }}
        proveedores={proveedores.filter((p) => p.activo)}
        ordenCompra={ordenParaFacturar ?? undefined}
        onSave={handleSaveComprobante}
      />

      {/* Cargar precios cotizados / confirmar OC */}
      <OrdenCompraPreciosDialog
        open={preciosOrdenId !== null}
        onOpenChange={(v) => { if (!v) setPreciosOrdenId(null); }}
        orden={ordenesCompra.find((o) => o.id === preciosOrdenId) ?? undefined}
        proveedorNombre={preciosOrdenId ? nombreProveedor(ordenesCompra.find((o) => o.id === preciosOrdenId)?.proveedorId ?? '') : undefined}
        onSave={(data) => { if (preciosOrdenId) handleGuardarPrecios(preciosOrdenId, data); }}
      />

      {/* Nuevo proveedor sin salir de la OC (Fase 44) */}
      <ProveedorDialog
        open={nuevoProveedorDialogOpen}
        onOpenChange={setNuevoProveedorDialogOpen}
        onSave={handleGuardarNuevoProveedor}
      />
    </div>
  );
}
