// ============================================================
// Módulo Ventas — Presupuestos
// Edgy Gestión · Listado, detalle y gestión de presupuestos
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  Edit2,
  Check,
  CheckCircle2,
  XCircle,
  Link2,
  Calendar,
  FileText,
  Receipt,
  Download,
  Loader2,
  Mail,
  MessageCircle,
  HandCoins,
  FileDown,
  Ruler,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { useClienteActual } from '@/hooks/useClienteActual';
import { enviarDocumentoWhatsapp } from '@/lib/enviarDocumentoWhatsapp';
import { armarLinkWhatsapp } from '@/lib/whatsapp';
import { descargarPresupuestoPdf, descargarReciboPdf, generarPresupuestoPdfBase64 } from '../lib/pdfComprobantes';
import { aplicarEfectosCatalogoAlFacturar } from '../lib/efectosCatalogoFacturar';
import { buscarSenaPendiente } from '../lib/senaHelpers';
import {
  usePresupuestos,
  useClientes,
  useVentas,
  useVentasDispatch,
} from '../data/store';
import {
  EstadoPresupuestoBadge,
  Amount,
  EmptyState,
} from '../components/ventas/display';
import { PresupuestoDialog, ComprobanteDialog, SenaDialog } from '../components/ventas/dialogs';
import {
  formatDate,
  formatARS,
  formatNumero,
  formatPct,
  nowISO,
  PREFIJO_ORDEN,
  conIvaIncluido,
} from '../lib/format';
import type {
  Presupuesto,
  PresupuestoItem,
  EstadoPresupuesto,
  TipoOrden,
  Cliente,
  TipoComprobante,
  MedioPago,
  ModoEmision,
  ComprobanteItem,
} from '../types';
import {
  ESTADO_PRESUPUESTO_LABEL,
  calcularSubtotalItem,
  generarId,
} from '../types';

// ─── Prefijo presupuesto ────────────────────────────────────

const PREFIJO_PRESUPUESTO = 'PRE';

// ─── Componente principal ───────────────────────────────────

export default function Presupuestos() {
  const todosPresupuestos = usePresupuestos();
  const clientes = useClientes();
  const { ordenes, cobros, comprobantes, config, nextNumeroComprobante } = useVentas();
  const dispatch = useVentasDispatch();

  // ── Filtros ───────────────────────────────────────────────

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoPresupuesto | ''>('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // ── Estado de UI ──────────────────────────────────────────

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPresupuesto, setEditPresupuesto] = useState<Presupuesto | null>(null);
  // Fase 17: ícono de descarga de PDF -- mismo motor compartido que
  // Comprobantes.tsx (src/lib/comprobantes-pdf), con tipoLabel
  // "Presupuesto" en vez de Factura/Recibo.
  const { cliente: empresaActual } = useClienteActual();
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null);

  // Fase 41.7 (20/08, a pedido de Carlos): "Detalle relevado" opcional en
  // el PDF de Presupuesto -- el segundo ícono de descarga (con el
  // esquema técnico de la Ficha) solo tiene sentido mostrarlo cuando el
  // presupuesto realmente viene de una Ficha de medida de cortinas. Un
  // solo fetch liviano acá (ids de presupuesto, no el detalle completo)
  // para saber en qué filas mostrarlo -- el detalle real recién se trae
  // al momento de descargar (ver descargarPresupuestoPdf).
  const [presupuestosConFichaCortinas, setPresupuestosConFichaCortinas] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = todosPresupuestos.map((p) => p.id);
    if (ids.length === 0) return;
    let activo = true;
    supabase
      .from('fichas_medida')
      .select('presupuesto_id')
      .eq('tipo', 'cortinas')
      .in('presupuesto_id', ids)
      .then(({ data }) => {
        if (activo) setPresupuestosConFichaCortinas(new Set((data ?? []).map((r) => r.presupuesto_id as string)));
      });
    return () => {
      activo = false;
    };
  }, [todosPresupuestos]);
  const [generandoPdfDetalleId, setGenerandoPdfDetalleId] = useState<string | null>(null);

  // "Facturar directamente": convierte un presupuesto confirmado ('enviado')
  // en un comprobante sin pasar por una Orden en el medio -- mismo criterio
  // que "Facturar" desde Ordenes.tsx (ComprobanteDialog prefilleado), pero
  // acá se precarga desde el Presupuesto en vez de la Orden.
  const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false);
  const [presupuestoParaFacturar, setPresupuestoParaFacturar] = useState<Presupuesto | null>(null);

  // Atajo "Ir a Presupuesto" desde Fichas de medida (Fase 41.1): llega acá
  // con ?presupuesto=<id>, limpia cualquier filtro que lo pudiera estar
  // ocultando, lo expande y hace scroll -- mismo criterio que el deep link
  // ?itemId= de Movimientos.tsx (productos-stock).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const presupuestoParam = searchParams.get('presupuesto');
    if (!presupuestoParam) return;
    if (!todosPresupuestos.some((p) => p.id === presupuestoParam)) return;

    setFiltroEstado('');
    setBusqueda('');
    setFechaDesde('');
    setFechaHasta('');
    setExpandedId(presupuestoParam);

    const next = new URLSearchParams(searchParams);
    next.delete('presupuesto');
    setSearchParams(next, { replace: true });

    requestAnimationFrame(() => {
      document.getElementById(`presupuesto-row-${presupuestoParam}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, todosPresupuestos]);

  // ── Helpers ───────────────────────────────────────────────

  const clienteNombre = useCallback(
    (clienteId: string) => {
      const c = clientes.find((cl) => cl.id === clienteId);
      return c?.nombre ?? 'Desconocido';
    },
    [clientes],
  );

  const ordenNumero = useCallback(
    (ordenId: string) => {
      const o = ordenes.find((or) => or.id === ordenId);
      if (!o) return '—';
      return formatNumero(PREFIJO_ORDEN[o.tipo], o.numero);
    },
    [ordenes],
  );

  // ── Datos filtrados ───────────────────────────────────────

  const presupuestosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();

    return todosPresupuestos.filter((p) => {
      // Filtro estado
      if (filtroEstado && p.estado !== filtroEstado) return false;

      // Filtro fecha desde
      if (fechaDesde && p.fecha < fechaDesde) return false;

      // Filtro fecha hasta
      if (fechaHasta && p.fecha > fechaHasta) return false;

      // Búsqueda por nombre de cliente
      if (q) {
        const nombre = clienteNombre(p.clienteId).toLowerCase();
        if (!nombre.includes(q)) return false;
      }

      return true;
    });
  }, [todosPresupuestos, busqueda, filtroEstado, fechaDesde, fechaHasta, clienteNombre]);

  // ── Handlers ──────────────────────────────────────────────

  const handleNuevo = () => {
    setEditPresupuesto(null);
    setDialogOpen(true);
  };

  const handleEditar = (presupuesto: Presupuesto) => {
    setEditPresupuesto(presupuesto);
    setDialogOpen(true);
  };

  const handleEnviar = (id: string) => {
    dispatch({
      type: 'CAMBIAR_ESTADO_PRESUPUESTO',
      payload: { id, nuevoEstado: 'enviado' },
    });
  };

  const handleCancelar = (id: string) => {
    dispatch({
      type: 'CAMBIAR_ESTADO_PRESUPUESTO',
      payload: { id, nuevoEstado: 'cancelado' },
    });
  };

  const handleAprobar = (presupuestoId: string, tipoOrden: TipoOrden = 'pedido') => {
    dispatch({
      type: 'CONVERTIR_PRESUPUESTO_A_ORDEN',
      payload: { presupuestoId, tipoOrden },
    });
  };

  // Fase 41.2: cobro de seña -- desenganchado a propósito de "Aprobar y
  // crear orden" y de la Ficha de medida (ese campo Seña se carga en la
  // visita a domicilio, ANTES de que exista un precio real, así que no es
  // confiable como disparador automático). En vez de un prompt que
  // interrumpe al aprobar, queda como una acción de a demanda -- un ícono
  // propio en la fila del presupuesto, disponible en cualquier momento
  // mientras el presupuesto siga vivo (el cliente puede confirmar hoy y
  // venir a pagar la seña recién unos días después).
  const [senaDialogPresupuesto, setSenaDialogPresupuesto] = useState<Presupuesto | null>(null);

  const handleCobrarSena = (data: { monto: number; medioPago: MedioPago }) => {
    if (!senaDialogPresupuesto) return;
    const presupuesto = senaDialogPresupuesto;
    const pct = presupuesto.total > 0 ? (data.monto / presupuesto.total) * 100 : 0;
    dispatch({
      type: 'ADD_COBRO',
      payload: {
        id: generarId(),
        clienteId: presupuesto.clienteId,
        fecha: nowISO().split('T')[0],
        monto: data.monto,
        medioPago: data.medioPago,
        imputaciones: [],
        presupuestoId: presupuesto.id,
        notas: `Seña — Presupuesto ${formatNumero(PREFIJO_PRESUPUESTO, presupuesto.numero)} (${formatPct(pct)} del total).`,
        createdAt: nowISO(),
      },
    });
    setSenaDialogPresupuesto(null);
  };

  // Confirma un presupuesto en borrador (pasa a 'enviado') sin necesidad de
  // mandarlo por email/WhatsApp -- desbloquea "Aprobar y crear orden" y
  // "Facturar directamente". Reutiliza el mismo dispatch que ya usaba el
  // envío automático (marcarEnviadoSiBorrador, ver abajo).
  const handleConfirmar = (id: string) => {
    dispatch({
      type: 'CAMBIAR_ESTADO_PRESUPUESTO',
      payload: { id, nuevoEstado: 'enviado' },
    });
  };

  const handleFacturar = (pres: Presupuesto) => {
    setPresupuestoParaFacturar(pres);
    setComprobanteDialogOpen(true);
  };

  // Mismo criterio simplificado que Ordenes.tsx (handleSaveComprobante):
  // arma el Comprobante directo desde los datos del diálogo, sin pasar por
  // Orden. El presupuesto queda 'aprobado' (mismo estado final que si se
  // hubiera convertido a orden) para reflejar que ya se resolvió.
  const handleSaveComprobante = (data: {
    tipo: TipoComprobante;
    clienteId: string;
    fecha: string;
    medioPago: MedioPago;
    modoEmision: ModoEmision;
    items: Omit<ComprobanteItem, 'id'>[];
    descuentoGeneral: number;
    puntoVentaId?: string;
  }) => {
    const items: ComprobanteItem[] = data.items.map((i) => ({
      ...i,
      id: generarId(),
    }));

    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const montoIva = items.reduce((s, i) => s + i.montoIva, 0);
    const totalBruto = subtotal + montoIva;
    const total = totalBruto * (1 - data.descuentoGeneral / 100);
    // Capturado ANTES del dispatch: ADD_COMPROBANTE incrementa el contador,
    // así que este es el número que le va a tocar a este comprobante en
    // particular (mismo criterio que Comprobantes.tsx/PuntoDeVenta.tsx).
    const numeroAsignado = nextNumeroComprobante[data.tipo];
    const comprobanteId = generarId();

    dispatch({
      type: 'ADD_COMPROBANTE',
      payload: {
        id: comprobanteId,
        tipo: data.tipo,
        modoEmision: data.modoEmision,
        clienteId: data.clienteId,
        puntoVentaId: data.puntoVentaId,
        fecha: data.fecha,
        items,
        subtotal,
        descuentoGeneral: data.descuentoGeneral,
        montoIva,
        total,
        estado: 'emitido',
        medioPago: data.medioPago,
        montoCobrado: 0,
        saldoPendiente: total,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      },
    });

    // Fase 41.2: si este presupuesto ya tiene una seña cobrada (al
    // aprobarlo) sin imputar todavía, se aplica acá contra la factura
    // recién creada -- así el saldo pendiente del comprobante ya refleja
    // ese descuento en vez de mostrar el total bruto.
    if (data.tipo === 'factura' && presupuestoParaFacturar) {
      const sena = buscarSenaPendiente(cobros, presupuestoParaFacturar.id);
      if (sena) {
        dispatch({
          type: 'IMPUTAR_COBRO',
          payload: { cobroId: sena.cobroId, comprobanteId, montoImputado: Math.min(sena.montoDisponible, total) },
        });
      }
    }

    // Fase 22b: cierre de un gap pre-existente -- "Facturar directamente"
    // desde acá nunca había descontado stock ni activado garantía para
    // líneas vinculadas al catálogo (a diferencia de Comprobantes.tsx/
    // PuntoDeVenta.tsx). Fire-and-forget, mismo criterio que el resto de
    // los side-effects de Ventas: el comprobante ya se generó igual. Un
    // Presupuesto siempre tiene un Cliente real vinculado (no hay
    // contacto suelto como en Ordenes/Ventas Online).
    if (data.tipo === 'factura' && empresaActual?.id) {
      const clienteReal = clientes.find((c) => c.id === data.clienteId);
      aplicarEfectosCatalogoAlFacturar(
        items,
        empresaActual.id,
        numeroAsignado,
        data.fecha,
        clienteReal?.nombre ?? '',
        clienteReal?.telefono ?? '',
      );
    }

    if (presupuestoParaFacturar) {
      dispatch({
        type: 'CAMBIAR_ESTADO_PRESUPUESTO',
        payload: { id: presupuestoParaFacturar.id, nuevoEstado: 'aprobado' },
      });
    }

    setComprobanteDialogOpen(false);
    setPresupuestoParaFacturar(null);
  };

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleDescargarPdf = async (pres: Presupuesto) => {
    if (!empresaActual) return;
    setGenerandoPdfId(pres.id);
    try {
      const cliente = clientes.find((c) => c.id === pres.clienteId);
      await descargarPresupuestoPdf(empresaActual, cliente, pres, clienteNombre(pres.clienteId), config.ivaDefault);
    } finally {
      setGenerandoPdfId(null);
    }
  };

  // Fase 41.7: mismo PDF, con el "Detalle relevado" (esquema técnico de
  // la Ficha) agregado al final -- ver comentario en
  // presupuestosConFichaCortinas más arriba.
  const handleDescargarPdfConDetalle = async (pres: Presupuesto) => {
    if (!empresaActual) return;
    setGenerandoPdfDetalleId(pres.id);
    try {
      const cliente = clientes.find((c) => c.id === pres.clienteId);
      await descargarPresupuestoPdf(empresaActual, cliente, pres, clienteNombre(pres.clienteId), config.ivaDefault, true);
    } finally {
      setGenerandoPdfDetalleId(null);
    }
  };

  // Fase 41.2: descarga del recibo de la seña ya cobrada -- reusa el mismo
  // motor de Recibo que Cobranzas.tsx (ver descargarReciboPdf), buscando el
  // Cobro vinculado a este presupuesto por presupuestoId. Si en el futuro
  // se cobra en más de una tanda, esto baja el recibo de la primera --
  // alcanza para el caso de uso de hoy (una seña por presupuesto).
  const [generandoReciboId, setGenerandoReciboId] = useState<string | null>(null);
  const handleDescargarRecibo = async (pres: Presupuesto) => {
    if (!empresaActual) return;
    const cobro = cobros.find((c) => c.presupuestoId === pres.id);
    if (!cobro) return;
    setGenerandoReciboId(pres.id);
    try {
      const cliente = clientes.find((c) => c.id === pres.clienteId);
      await descargarReciboPdf(empresaActual, cliente, cobro, comprobantes, clienteNombre(pres.clienteId));
    } finally {
      setGenerandoReciboId(null);
    }
  };

  // Envío por email / WhatsApp al cliente -- mismo criterio que Cotizaciones
  // (Compras): todavía no hay un motor de envío real, así que se arma un
  // link mailto:/wa.me con asunto y texto ya redactados a partir de los
  // datos del presupuesto, y se abre el cliente de correo o WhatsApp Web
  // del propio usuario. Un borrador enviado por cualquiera de las dos vías
  // pasa automáticamente a estado 'enviado'.
  const armarTextoPresupuesto = (pres: Presupuesto) => {
    const numero = formatNumero(PREFIJO_PRESUPUESTO, pres.numero);
    const lineas = pres.items.map((it) => `- ${it.descripcion} · cant. ${it.cantidad}`);
    return {
      asunto: `Presupuesto ${numero}`,
      cuerpo:
        `Hola${clienteNombre(pres.clienteId) !== 'Desconocido' ? ` ${clienteNombre(pres.clienteId)}` : ''},\n\n` +
        `Le enviamos el presupuesto ${numero} (válido ${pres.validezDias} días desde el ${formatDate(pres.fecha)}):\n\n` +
        `${lineas.join('\n')}\n\n` +
        `Total: ${formatARS(pres.total)}\n\n` +
        `${pres.condiciones ? `Condiciones: ${pres.condiciones}\n\n` : ''}` +
        `${pres.notas ? `Notas: ${pres.notas}\n\n` : ''}` +
        `Quedamos a disposición.\nSaludos.`,
    };
  };

  const marcarEnviadoSiBorrador = (pres: Presupuesto) => {
    if (pres.estado === 'borrador') handleEnviar(pres.id);
  };

  const handleEnviarEmail = (pres: Presupuesto, cliente?: Cliente) => {
    if (!cliente?.email) return;
    const { asunto, cuerpo } = armarTextoPresupuesto(pres);
    const url = `mailto:${cliente.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    window.open(url, '_blank');
    marcarEnviadoSiBorrador(pres);
  };

  // Fase 50d (28/08): antes esto abría un link `wa.me` con el texto y
  // dejaba que el operador adjuntara el PDF a mano. Ahora, si el
  // tenant ya tiene el agente configurado como canal de salida
  // (`clientes_agente_config.evolution_instance_nombre`), manda el PDF
  // real como documento adjunto. Si el envío falla (o el tenant no
  // tiene canal configurado todavía -- ver enviar-documento-whatsapp.js),
  // cae al comportamiento viejo (wa.me + texto) para no dejar al
  // operador sin salida.
  const [enviandoWhatsappId, setEnviandoWhatsappId] = useState<string | null>(null);
  const handleEnviarWhatsapp = async (pres: Presupuesto, cliente?: Cliente) => {
    if (!cliente?.telefono || !empresaActual) return;
    const numero = formatNumero(PREFIJO_PRESUPUESTO, pres.numero);
    const { cuerpo } = armarTextoPresupuesto(pres);
    setEnviandoWhatsappId(pres.id);
    try {
      const pdfBase64 = await generarPresupuestoPdfBase64(empresaActual, cliente, pres, clienteNombre(pres.clienteId), config.ivaDefault);
      await enviarDocumentoWhatsapp({
        clienteId: empresaActual.id,
        telefono: cliente.telefono,
        pdfBase64,
        nombreArchivo: numero,
        caption: cuerpo,
      });
      marcarEnviadoSiBorrador(pres);
    } catch (e) {
      console.error('Presupuestos: no se pudo enviar por el agente, cae a wa.me', e);
      window.open(armarLinkWhatsapp(cliente.telefono, cuerpo), '_blank');
      marcarEnviadoSiBorrador(pres);
    } finally {
      setEnviandoWhatsappId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Presupuestos</h1>

        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo presupuesto
        </button>
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Búsqueda por cliente */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre de cliente..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Filtro estado */}
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as EstadoPresupuesto | '')}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_PRESUPUESTO_LABEL) as EstadoPresupuesto[]).map((est) => (
            <option key={est} value={est}>
              {ESTADO_PRESUPUESTO_LABEL[est]}
            </option>
          ))}
        </select>

        {/* Fecha desde */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Fecha hasta */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Tabla de presupuestos */}
      {presupuestosFiltrados.length === 0 ? (
        <EmptyState title="No se encontraron presupuestos con los filtros seleccionados" />
      ) : (
        <div className="overflow-x-auto scroll-shadow-x rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Validez</th>
                <th className="px-4 py-3 text-right font-medium">Total (IVA incl.)</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Acciones</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {presupuestosFiltrados.map((pres) => {
                const cliente = clientes.find((c) => c.id === pres.clienteId);
                const senaMonto = cobros
                  .filter((c) => c.presupuestoId === pres.id)
                  .reduce((sum, c) => sum + c.monto, 0);
                return (
                  <PresupuestoRow
                    key={pres.id}
                    presupuesto={pres}
                    isExpanded={expandedId === pres.id}
                    clienteNombre={clienteNombre(pres.clienteId)}
                    cliente={cliente}
                    ordenNumero={pres.ordenId ? ordenNumero(pres.ordenId) : null}
                    onToggleExpand={() => handleToggleExpand(pres.id)}
                    onEditar={() => handleEditar(pres)}
                    onCancelar={() => handleCancelar(pres.id)}
                    onConfirmar={() => handleConfirmar(pres.id)}
                    onAprobar={(tipo) => handleAprobar(pres.id, tipo)}
                    onFacturar={() => handleFacturar(pres)}
                    onDescargarPdf={() => handleDescargarPdf(pres)}
                    generandoPdf={generandoPdfId === pres.id}
                    ivaDefault={config.ivaDefault}
                    tieneFichaCortinas={presupuestosConFichaCortinas.has(pres.id)}
                    onDescargarPdfConDetalle={() => handleDescargarPdfConDetalle(pres)}
                    generandoPdfDetalle={generandoPdfDetalleId === pres.id}
                    onEnviarEmail={() => handleEnviarEmail(pres, cliente)}
                    onEnviarWhatsapp={() => handleEnviarWhatsapp(pres, cliente)}
                    enviandoWhatsapp={enviandoWhatsappId === pres.id}
                    onCobrarSena={() => setSenaDialogPresupuesto(pres)}
                    senaMonto={senaMonto}
                    onDescargarRecibo={() => handleDescargarRecibo(pres)}
                    generandoRecibo={generandoReciboId === pres.id}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      <PresupuestoDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditPresupuesto(null);
        }}
        clientes={clientes}
        presupuesto={editPresupuesto ?? undefined}
        validezDefault={config.validezPresupuestoDias}
        onConfirmar={handleConfirmar}
        onSave={(data) => {
          const now = nowISO();
          const items: PresupuestoItem[] = data.items.map((it) => ({
            ...it,
            id: generarId(),
          }));
          const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
          const total = subtotal * (1 - data.descuentoGeneral / 100);
          const fechaVencimiento = (() => {
            const d = new Date(data.fecha);
            d.setDate(d.getDate() + data.validezDias);
            return d.toISOString().split('T')[0];
          })();

          if (editPresupuesto) {
            dispatch({
              type: 'UPDATE_PRESUPUESTO',
              payload: {
                ...editPresupuesto,
                clienteId: data.clienteId,
                fecha: data.fecha,
                validezDias: data.validezDias,
                fechaVencimiento,
                items,
                subtotal,
                descuentoGeneral: data.descuentoGeneral,
                total,
                condiciones: data.condiciones || undefined,
                notas: data.notas || undefined,
                updatedAt: now,
              },
            });
          } else {
            dispatch({
              type: 'ADD_PRESUPUESTO',
              payload: {
                id: generarId(),
                clienteId: data.clienteId,
                fecha: data.fecha,
                validezDias: data.validezDias,
                fechaVencimiento,
                estado: 'borrador',
                items,
                subtotal,
                descuentoGeneral: data.descuentoGeneral,
                total,
                condiciones: data.condiciones || undefined,
                notas: data.notas || undefined,
                createdAt: now,
                updatedAt: now,
              },
            });
          }
          setDialogOpen(false);
          setEditPresupuesto(null);
        }}
      />

      {/* Facturar directamente (sin pasar por Orden) */}
      {comprobanteDialogOpen && presupuestoParaFacturar && (
        <ComprobanteDialog
          open={comprobanteDialogOpen}
          onOpenChange={(open) => {
            setComprobanteDialogOpen(open);
            if (!open) setPresupuestoParaFacturar(null);
          }}
          clientes={clientes}
          presupuesto={presupuestoParaFacturar}
          soloFactura
          onSave={handleSaveComprobante}
          modoEmisionDefault={config.modoEmisionDefault}
        />
      )}

      {/* Fase 41.2: cobro de seña -- acción de a demanda, ver ícono en Acciones */}
      {senaDialogPresupuesto && (
        <SenaDialog
          open={Boolean(senaDialogPresupuesto)}
          onOpenChange={(open) => {
            if (!open) setSenaDialogPresupuesto(null);
          }}
          presupuesto={senaDialogPresupuesto}
          onConfirmar={handleCobrarSena}
        />
      )}
    </div>
  );
}

// ─── Fila de presupuesto con panel expandible ───────────────

interface PresupuestoRowProps {
  presupuesto: Presupuesto;
  isExpanded: boolean;
  clienteNombre: string;
  cliente?: Cliente;
  ordenNumero: string | null;
  onToggleExpand: () => void;
  onEditar: () => void;
  onCancelar: () => void;
  onConfirmar: () => void;
  onAprobar: (tipo: TipoOrden) => void;
  onFacturar: () => void;
  onDescargarPdf: () => void;
  generandoPdf: boolean;
  /** Fase 42: alícuota de IVA a mostrar sobre los montos netos guardados
   * (ver conIvaIncluido en lib/format.ts) -- viene de config.ivaDefault,
   * no de un campo propio del Presupuesto. */
  ivaDefault: number;
  /** Fase 41.7: solo true cuando el presupuesto viene de una Ficha de
   * medida de cortinas -- habilita el segundo ícono de descarga (con
   * el esquema técnico incluido). */
  tieneFichaCortinas: boolean;
  onDescargarPdfConDetalle: () => void;
  generandoPdfDetalle: boolean;
  onEnviarEmail: () => void;
  onEnviarWhatsapp: () => void;
  enviandoWhatsapp: boolean;
  onCobrarSena: () => void;
  senaMonto: number;
  onDescargarRecibo: () => void;
  generandoRecibo: boolean;
}

function PresupuestoRow({
  presupuesto,
  isExpanded,
  clienteNombre,
  cliente,
  ordenNumero,
  onToggleExpand,
  onEditar,
  onCancelar,
  onConfirmar,
  onAprobar,
  onFacturar,
  onDescargarPdf,
  generandoPdf,
  ivaDefault,
  tieneFichaCortinas,
  onDescargarPdfConDetalle,
  generandoPdfDetalle,
  onEnviarEmail,
  onEnviarWhatsapp,
  enviandoWhatsapp,
  onCobrarSena,
  senaMonto,
  onDescargarRecibo,
  generandoRecibo,
}: PresupuestoRowProps) {
  const p = presupuesto;

  return (
    <>
      {/* Fila principal */}
      <tr
        id={`presupuesto-row-${p.id}`}
        onClick={onToggleExpand}
        className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50 last:border-0"
      >
        <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
          {formatNumero(PREFIJO_PRESUPUESTO, p.numero)}
        </td>
        <td className="px-4 py-3 text-gray-900">{clienteNombre}</td>
        <td className="px-4 py-3 text-gray-600">{formatDate(p.fecha)}</td>
        <td className="px-4 py-3 text-gray-600">
          {p.validezDias} {p.validezDias === 1 ? 'día' : 'días'}
        </td>
        <td className="px-4 py-3 text-right">
          <Amount value={conIvaIncluido(p.total, ivaDefault)} />
        </td>
        <td className="px-4 py-3">
          <EstadoPresupuestoBadge estado={p.estado} />
        </td>
        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <button
              onClick={onDescargarPdf}
              disabled={generandoPdf}
              title="Descargar PDF"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              {generandoPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </button>
            {tieneFichaCortinas && (
              <button
                onClick={onDescargarPdfConDetalle}
                disabled={generandoPdfDetalle}
                title="Descargar PDF con Detalle relevado (esquema técnico de la Ficha)"
                className="p-1.5 text-gray-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg disabled:opacity-50"
              >
                {generandoPdfDetalle ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Ruler className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <button
              onClick={onEnviarEmail}
              disabled={!cliente?.email}
              title={cliente?.email ? `Enviar por email a ${cliente.email}` : 'El cliente no tiene email cargado'}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
            >
              <Mail className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onEnviarWhatsapp}
              disabled={!cliente?.telefono || enviandoWhatsapp}
              title={cliente?.telefono ? `Enviar por WhatsApp a ${cliente.telefono}` : 'El cliente no tiene teléfono cargado'}
              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
            >
              {enviandoWhatsapp ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageCircle className="h-3.5 w-3.5" />
              )}
            </button>
            {p.estado === 'borrador' && (
              <>
                <button onClick={onConfirmar} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Confirmar presupuesto">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={onEditar} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Editar">
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={onCancelar} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancelar">
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {p.estado === 'enviado' && (
              <>
                <button onClick={() => onAprobar('pedido')} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Aprobar y crear orden">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={onFacturar} className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg" title="Facturar directamente">
                  <Receipt className="h-3.5 w-3.5" />
                </button>
                <button onClick={onCancelar} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancelar">
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {p.estado === 'aprobado' && (
              <>
                {/* Fase 41.2: cobro de seña -- a propósito solo disponible
                    DESPUÉS de aprobar (pedido explícito de Carlos: primero
                    se aprueba, después se puede cobrar, nunca antes). El
                    cliente puede aprobar hoy y venir a pagar la seña
                    recién más adelante, por eso queda disponible acá de
                    forma permanente y no solo en el momento de aprobar. */}
                <button onClick={onCobrarSena} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Cobrar seña">
                  <HandCoins className="h-3.5 w-3.5" />
                </button>
                {senaMonto > 0 && (
                  <button
                    onClick={onDescargarRecibo}
                    disabled={generandoRecibo}
                    className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg disabled:opacity-50"
                    title="Descargar recibo de seña"
                  >
                    {generandoRecibo ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {ordenNumero && (
                  <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                    <Link2 className="h-3 w-3 inline mr-1" />{ordenNumero}
                  </span>
                )}
              </>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </td>
      </tr>

      {/* Panel expandido */}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="bg-gray-50 px-4 py-5">
            <div className="space-y-5">
              {/* Tabla de items */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  Detalle de items
                </h3>
                <div className="overflow-x-auto scroll-shadow-x rounded-lg border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-gray-500">
                        <th className="px-3 py-2 font-medium">Descripción</th>
                        <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                        <th className="px-3 py-2 text-right font-medium">Precio Unit. (IVA incl.)</th>
                        <th className="px-3 py-2 text-right font-medium">Dto.</th>
                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.items.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-gray-50 last:border-0"
                        >
                          <td className="px-3 py-2 text-gray-900">
                            {item.descripcion}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {item.cantidad}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Amount value={conIvaIncluido(item.precioUnitario, ivaDefault)} />
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {item.descuento > 0 ? formatPct(item.descuento) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Amount value={conIvaIncluido(item.subtotal, ivaDefault)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {p.descuentoGeneral > 0 && (
                        <tr className="border-t border-gray-100">
                          <td colSpan={4} className="px-3 py-2 text-right text-sm text-gray-500">
                            Descuento general ({formatPct(p.descuentoGeneral)})
                          </td>
                          <td className="px-3 py-2 text-right text-sm text-red-600">
                            -{formatARS(conIvaIncluido(p.subtotal * (p.descuentoGeneral / 100), ivaDefault))}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-gray-200">
                        <td colSpan={4} className="px-3 py-2 text-right font-semibold text-gray-900">
                          Total (IVA incluido)
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                          {formatARS(conIvaIncluido(p.total, ivaDefault))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Condiciones y notas */}
              {(p.condiciones || p.notas) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {p.condiciones && (
                    <div>
                      <h4 className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Condiciones comerciales
                      </h4>
                      <p className="text-sm text-gray-700 whitespace-pre-line">
                        {p.condiciones}
                      </p>
                    </div>
                  )}
                  {p.notas && (
                    <div>
                      <h4 className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Notas
                      </h4>
                      <p className="text-sm text-gray-700 whitespace-pre-line">
                        {p.notas}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Info de vencimiento */}
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Calendar className="h-4 w-4" />
                Vence: {formatDate(p.fechaVencimiento)}
                {senaMonto > 0 && (
                  <span className="text-amber-700">
                    · Anticipo recibido de {formatARS(senaMonto)}
                  </span>
                )}
              </div>

              {/* Orden vinculada (si aprobado) */}
              {p.estado === 'aprobado' && p.ordenId && (
                <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
                  <Link2 className="h-4 w-4" />
                  Orden generada: <span className="font-mono font-medium">{ordenNumero}</span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
