// ============================================================
// Fase 26 · Modo Mostrador
// Edgy Gestión · Accesos grandes para el puesto de Caja/Mostrador
// ============================================================
//
// Pantalla de reemplazo del dashboard operativo genérico (lista de
// módulos) para quien atiende caja/mostrador: 5 botones grandes que
// disparan directo la acción más común, sin pasar por los menús del
// módulo Ventas completo. Reutiliza los dialogs ya existentes de
// Ventas (ClienteDialog/CobroDialog/PresupuestoDialog) -- por eso este
// componente se envuelve en su propio VentasProvider, ya que /dashboard
// es una ruta hermana, no anidada dentro de /m/ventas. "Facturar" no
// tiene un dialog equivalente (el POS es una pantalla completa, con
// catálogo/stock/garantías), así que ese botón navega directo a
// Ventas → Punto de venta.
//
// Es un "modo", no una vista fija por rol -- ver useModoMostrador.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Banknote, Search, UserPlus, FileText, ShoppingBag, ClipboardList, CircleCheck, CircleAlert } from 'lucide-react';
import { VentasProvider, useVentas, useVentasDispatch } from '@/modules/ventas/data/store';
import { ClienteDialog, CobroDialog, PresupuestoDialog } from '@/modules/ventas/components/ventas/dialogs';
import {
  generarId,
  CONSUMIDOR_FINAL_ID,
  type Cliente,
  type PresupuestoItem,
  type MedioPago,
  type ImputacionCobro,
} from '@/modules/ventas/types';
import { todayISO, nowISO, formatARS } from '@/modules/ventas/lib/format';
// Compras es núcleo (siempre activo, a diferencia de Ventas) -- por eso el
// botón "Comprar" no está condicionado a ningún módulo activo, a diferencia
// del resto de esta pantalla (que sí depende de que Ventas esté activo).
import { ComprasProvider, useCompras, useComprasDispatch, useProveedores } from '@/modules/compras/data/store';
import { ComprobanteCompraDialog, CotizacionDialog } from '@/modules/compras/components/compras/dialogs';
import { actualizarStockPorCompra } from '@/modules/compras/lib/actualizarStockCompra';
import { formatNumero, PREFIJO_COMPROBANTE_COMPRA } from '@/modules/compras/lib/format';
import type {
  TipoComprobanteCompra,
  MedioPagoCompra,
  ItemComprobanteCompra,
  ControlRemision,
  ImpuestoOrdenCompra,
} from '@/modules/compras/types';
import type { UnidadMedida } from '@/modules/productos-stock/types';
import { useClienteActual, type ModuloActivo } from '@/hooks/useClienteActual';
import { supabase } from '@/lib/supabase';
import { ModoMostradorToggle } from './ModoMostradorToggle';
import { ConsultarArticulo } from './ConsultarArticulo';
import { EvolucionMostrador } from './EvolucionMostrador';

interface Props {
  modulosActivos: ModuloActivo[];
  onCambiarModo: (activo: boolean) => void;
}

export function ModoMostrador({ modulosActivos, onCambiarModo }: Props) {
  const tieneCajaTurno = modulosActivos.some((m) => m.slug === 'caja-turno');
  return (
    <VentasProvider>
      <ComprasProvider>
        <ModoMostradorInterior tieneCajaTurno={tieneCajaTurno} onCambiarModo={onCambiarModo} />
      </ComprasProvider>
    </VentasProvider>
  );
}

function ModoMostradorInterior({
  tieneCajaTurno,
  onCambiarModo,
}: {
  tieneCajaTurno: boolean;
  onCambiarModo: (activo: boolean) => void;
}) {
  const navigate = useNavigate();
  const { comprobantes, cobros, clientes, config } = useVentas();
  const dispatch = useVentasDispatch();
  const proveedores = useProveedores();
  const comprasState = useCompras();
  const dispatchCompras = useComprasDispatch();
  const { cliente: clienteTenant } = useClienteActual();

  const hoy = todayISO();
  const ventasHoy = useMemo(
    () => comprobantes.filter((c) => c.fecha === hoy && c.estado !== 'anulado').length,
    [comprobantes, hoy],
  );
  const cobradoHoy = useMemo(
    () => cobros.filter((c) => c.fecha === hoy).reduce((sum, c) => sum + c.monto, 0),
    [cobros, hoy],
  );

  // Turno de caja: consulta liviana aparte (no viene en VentasState),
  // mismo criterio que useResumenOperativoGastronomico -- solo se pide
  // si el cliente tiene el módulo Caja por turno activo.
  const [turnoAbierto, setTurnoAbierto] = useState<boolean | null>(null);
  useEffect(() => {
    if (!tieneCajaTurno || !clienteTenant?.id) return;
    let activo = true;
    supabase
      .from('turnos_caja')
      .select('id')
      .eq('cliente_id', clienteTenant.id)
      .eq('estado', 'abierto')
      .limit(1)
      .then(({ data }) => {
        if (activo) setTurnoAbierto((data ?? []).length > 0);
      });
    return () => {
      activo = false;
    };
  }, [tieneCajaTurno, clienteTenant?.id]);

  // ── Facturar ──────────────────────────────────────────────
  // Sin dialog propio -- Punto de venta ya es una pantalla completa
  // (catálogo, stock, garantías); no tiene sentido duplicar esa lógica
  // en un modal chico. Se navega directo, VentasProvider ya está activo.
  function irAFacturar() {
    navigate('/m/ventas/punto-de-venta');
  }

  // ── Cargar cliente ────────────────────────────────────────
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);

  function handleSaveCliente(data: Omit<Cliente, 'id' | 'saldoCuentaCorriente' | 'activo' | 'createdAt' | 'updatedAt'>) {
    const now = nowISO();
    dispatch({
      type: 'ADD_CLIENTE',
      payload: {
        ...data,
        id: generarId(),
        saldoCuentaCorriente: 0,
        activo: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    setClienteDialogOpen(false);
  }

  // ── Cobrar ────────────────────────────────────────────────
  // CobroDialog necesita un cliente puntual (y sus comprobantes
  // pendientes) -- acá se agrega un paso previo de selección, ya que
  // Modo Mostrador no parte de un listado de clientes como Cobranzas.tsx.
  const [selectorCobroOpen, setSelectorCobroOpen] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [cobroClienteId, setCobroClienteId] = useState<string | null>(null);

  const clientesElegibles = useMemo(
    () => clientes.filter((c) => c.activo && c.id !== CONSUMIDOR_FINAL_ID),
    [clientes],
  );
  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    const base = q ? clientesElegibles.filter((c) => c.nombre.toLowerCase().includes(q)) : clientesElegibles;
    return base.slice(0, 8);
  }, [clientesElegibles, busquedaCliente]);

  const cobroCliente = cobroClienteId ? clientes.find((c) => c.id === cobroClienteId) : undefined;
  const comprobantesCobroCliente = cobroCliente
    ? comprobantes.filter(
        (c) => c.clienteId === cobroCliente.id && (c.estado === 'emitido' || c.estado === 'cobrado_parcial'),
      )
    : [];

  function elegirClienteParaCobrar(id: string) {
    setCobroClienteId(id);
    setSelectorCobroOpen(false);
    setBusquedaCliente('');
  }

  function handleSaveCobro(data: { fecha: string; monto: number; medioPago: MedioPago; imputaciones: ImputacionCobro[] }) {
    if (!cobroClienteId) return;
    dispatch({
      type: 'ADD_COBRO',
      payload: {
        id: generarId(),
        clienteId: cobroClienteId,
        fecha: data.fecha,
        monto: data.monto,
        medioPago: data.medioPago,
        imputaciones: data.imputaciones,
        createdAt: nowISO(),
      },
    });
    setCobroClienteId(null);
  }

  // ── Cotización (Presupuesto) ──────────────────────────────
  const [presupuestoDialogOpen, setPresupuestoDialogOpen] = useState(false);

  function handleSavePresupuesto(data: {
    clienteId: string;
    fecha: string;
    validezDias: number;
    condiciones: string;
    notas: string;
    items: Omit<PresupuestoItem, 'id'>[];
    descuentoGeneral: number;
  }) {
    const now = nowISO();
    const items: PresupuestoItem[] = data.items.map((it) => ({ ...it, id: generarId() }));
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const total = subtotal * (1 - data.descuentoGeneral / 100);
    const fechaVencimiento = (() => {
      const d = new Date(data.fecha);
      d.setDate(d.getDate() + data.validezDias);
      return d.toISOString().split('T')[0];
    })();

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
    setPresupuestoDialogOpen(false);
  }

  // ── Consultar artículo ────────────────────────────────────
  const [articuloOpen, setArticuloOpen] = useState(false);

  // ── Comprar ───────────────────────────────────────────────
  // "Comprar" agrupa 3 acciones bien distintas del ciclo de compra --
  // pedir presupuesto, generar una orden de compra y cargar el
  // comprobante ya recibido -- así que primero se elige cuál, en vez de
  // ir directo a un solo dialog (mismo criterio del selector previo de
  // "Cobrar"). "Generar orden de compra" no tiene un dialog reutilizable
  // propio todavía (ese formulario vive embebido en OrdenesCompra.tsx),
  // así que ahí se navega a Compras en vez de duplicar el formulario acá.
  const [selectorCompraOpen, setSelectorCompraOpen] = useState(false);

  // Espejo exacto de handleSaveComprobante en compras/pages/Comprobantes.tsx
  // -- alta manual (sin ordenCompra) del mismo comprobante de compra, con el
  // mismo flujo opcional de "Actualizar stock" contra Recepción.
  const [compraDialogOpen, setCompraDialogOpen] = useState(false);

  // Espejo exacto de handleSaveCotizacion en compras/pages/Cotizaciones.tsx
  // (rama de alta -- acá no hay edición, solo carga nueva).
  const [cotizacionCompraDialogOpen, setCotizacionCompraDialogOpen] = useState(false);

  function handleSaveCotizacionCompra(data: {
    proveedorId: string;
    fecha: string;
    validezDias: number;
    notas: string;
    items: {
      descripcion: string; cantidad: number; precioUnitario: number; descuento: number; subtotal: number;
      insumoId?: string; productoId?: string; unidad?: UnidadMedida;
    }[];
  }) {
    const now = nowISO();
    const fechaVenc = new Date(data.fecha);
    fechaVenc.setDate(fechaVenc.getDate() + data.validezDias);
    dispatchCompras({
      type: 'ADD_COTIZACION',
      payload: {
        id: generarId(),
        proveedorId: data.proveedorId,
        fecha: data.fecha,
        validezDias: data.validezDias,
        fechaVencimiento: fechaVenc.toISOString().split('T')[0],
        estado: 'borrador',
        items: data.items.map((it) => ({ ...it, id: generarId() })),
        subtotal: data.items.reduce((s, i) => s + i.subtotal, 0),
        total: data.items.reduce((s, i) => s + i.subtotal, 0),
        notas: data.notas || undefined,
        createdAt: now,
        updatedAt: now,
      },
    });
    setCotizacionCompraDialogOpen(false);
  }

  // Sin dialog propio (ver comentario arriba) -- se navega directo a
  // Compras > Órdenes de compra, mismo criterio que "Facturar".
  function irAOrdenCompra() {
    setSelectorCompraOpen(false);
    navigate('/m/compras/ordenes-compra');
  }

  async function handleSaveCompra(data: {
    tipo: TipoComprobanteCompra;
    proveedorId: string;
    numeroComprobanteProveedor: string;
    fecha: string;
    fechaVencimiento: string;
    medioPago: MedioPagoCompra;
    items: Omit<ItemComprobanteCompra, 'id'>[];
    controlRemision: ControlRemision;
    numeroRemito: string;
    actualizarStock: boolean;
    otrosImpuestos: ImpuestoOrdenCompra[];
    ordenCompraId?: string;
  }) {
    const now = nowISO();
    const subtotal = data.items.reduce((s, i) => s + i.subtotal, 0);
    const montoIva = data.items.reduce((s, i) => s + i.montoIva, 0);
    const total = subtotal + montoIva;
    const comprobanteId = generarId();
    const itemsConId: ItemComprobanteCompra[] = data.items.map((it) => ({ ...it, id: generarId() }));

    dispatchCompras({
      type: 'ADD_COMPROBANTE_COMPRA',
      payload: {
        id: comprobanteId,
        tipo: data.tipo,
        proveedorId: data.proveedorId,
        fecha: data.fecha,
        fechaVencimiento: data.fechaVencimiento || undefined,
        items: itemsConId,
        subtotal,
        montoIva,
        total,
        estado: 'pendiente',
        medioPago: data.medioPago,
        montoPagado: 0,
        saldoPendiente: total,
        controlRemision: data.controlRemision,
        numeroRemito: data.numeroRemito || undefined,
        numeroComprobanteProveedor: data.numeroComprobanteProveedor || undefined,
        stockActualizado: false,
        createdAt: now,
        updatedAt: now,
      },
    });

    if (data.actualizarStock && clienteTenant) {
      const numeroFormateado = formatNumero(
        PREFIJO_COMPROBANTE_COMPRA[data.tipo],
        comprasState.nextNumeroComprobante[data.tipo],
      );
      const proveedorNombre = proveedores.find((p) => p.id === data.proveedorId)?.nombre ?? 'Desconocido';
      const resultado = await actualizarStockPorCompra(itemsConId, {
        clienteId: clienteTenant.id,
        proveedorNombre,
        fecha: data.fecha,
        numeroRemito: data.numeroRemito || undefined,
        numeroComprobante: numeroFormateado,
      });
      if (resultado) {
        dispatchCompras({
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
          'El comprobante se guardó, pero no se pudo actualizar el stock. Podés reintentarlo desde Compras > Comprobantes.',
        );
      }
    }
    setCompraDialogOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-gray-900">Mostrador</h1>
          <p className="text-sm text-gray-500">Accesos directos para atender en caja.</p>
        </div>
        <ModoMostradorToggle activo onChange={onCambiarModo} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {tieneCajaTurno && (
          <StatCard
            label="Turno"
            value={turnoAbierto === null ? '…' : turnoAbierto ? 'Abierto' : 'Cerrado'}
            icon={turnoAbierto ? CircleCheck : CircleAlert}
            accent={turnoAbierto ? 'text-emerald-600' : 'text-amber-600'}
          />
        )}
        <StatCard label="Ventas hoy" value={String(ventasHoy)} />
        <StatCard label="Cobrado hoy" value={formatARS(cobradoHoy)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <BotonGrande icon={Receipt} label="Facturar" accent="indigo" onClick={irAFacturar} />
        <BotonGrande icon={Banknote} label="Cobrar" accent="emerald" onClick={() => setSelectorCobroOpen(true)} />
        <BotonGrande icon={Search} label="Consultar artículo" accent="blue" onClick={() => setArticuloOpen(true)} />
        <BotonGrande icon={UserPlus} label="Cargar cliente" accent="violet" onClick={() => setClienteDialogOpen(true)} />
        <BotonGrande icon={FileText} label="Cotización" accent="amber" onClick={() => setPresupuestoDialogOpen(true)} />
        <BotonGrande icon={ShoppingBag} label="Comprar" accent="orange" onClick={() => setSelectorCompraOpen(true)} />
      </div>

      <EvolucionMostrador
        clienteId={clienteTenant?.id}
        comprobantesVenta={comprobantes}
        cobros={cobros}
        comprobantesCompra={comprasState.comprobantes}
      />

      {/* ── Selector de cliente previo a Cobrar ─────────────── */}
      {selectorCobroOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-semibold text-gray-900">¿A quién le vas a cobrar?</p>
              <button
                onClick={() => setSelectorCobroOpen(false)}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cerrar
              </button>
            </div>
            <input
              autoFocus
              type="text"
              value={busquedaCliente}
              onChange={(e) => setBusquedaCliente(e.target.value)}
              placeholder="Buscar cliente..."
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900"
            />
            <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
              {clientesFiltrados.map((c) => (
                <button
                  key={c.id}
                  onClick={() => elegirClienteParaCobrar(c.id)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                >
                  <span className="text-gray-900">{c.nombre}</span>
                  {c.saldoCuentaCorriente > 0 && (
                    <span className="text-gray-500">Debe {formatARS(c.saldoCuentaCorriente)}</span>
                  )}
                </button>
              ))}
              {clientesFiltrados.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-gray-400">Sin resultados.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {cobroClienteId && cobroCliente && (
        <CobroDialog
          open={!!cobroClienteId}
          onOpenChange={(open) => {
            if (!open) setCobroClienteId(null);
          }}
          cliente={cobroCliente}
          comprobantesCliente={comprobantesCobroCliente}
          onSave={handleSaveCobro}
        />
      )}

      {/* ── Selector de acción previo a Comprar ─────────────── */}
      {selectorCompraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-semibold text-gray-900">¿Qué querés hacer?</p>
              <button
                onClick={() => setSelectorCompraOpen(false)}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cerrar
              </button>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setSelectorCompraOpen(false);
                  setCotizacionCompraDialogOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 text-left text-sm hover:border-amber-300 hover:bg-amber-50"
              >
                <FileText className="h-5 w-5 text-amber-600" />
                <span>
                  <span className="block font-medium text-gray-900">Pedir presupuesto</span>
                  <span className="block text-xs text-gray-500">Cotización a un proveedor</span>
                </span>
              </button>
              <button
                onClick={irAOrdenCompra}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 text-left text-sm hover:border-orange-300 hover:bg-orange-50"
              >
                <ClipboardList className="h-5 w-5 text-orange-600" />
                <span>
                  <span className="block font-medium text-gray-900">Generar orden de compra</span>
                  <span className="block text-xs text-gray-500">Te lleva a Compras &gt; Órdenes de compra</span>
                </span>
              </button>
              <button
                onClick={() => {
                  setSelectorCompraOpen(false);
                  setCompraDialogOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 text-left text-sm hover:border-red-300 hover:bg-red-50"
              >
                <Receipt className="h-5 w-5 text-red-600" />
                <span>
                  <span className="block font-medium text-gray-900">Cargar comprobante</span>
                  <span className="block text-xs text-gray-500">La mercadería ya llegó, con factura del proveedor</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <CotizacionDialog
        open={cotizacionCompraDialogOpen}
        onOpenChange={setCotizacionCompraDialogOpen}
        proveedores={proveedores.filter((p) => p.activo)}
        validezDefault={comprasState.config.validezCotizacionDias}
        onSave={handleSaveCotizacionCompra}
      />

      <ClienteDialog open={clienteDialogOpen} onOpenChange={setClienteDialogOpen} onSave={handleSaveCliente} />

      <PresupuestoDialog
        open={presupuestoDialogOpen}
        onOpenChange={setPresupuestoDialogOpen}
        clientes={clientes}
        validezDefault={config.validezPresupuestoDias}
        onSave={handleSavePresupuesto}
      />

      <ConsultarArticulo open={articuloOpen} onOpenChange={setArticuloOpen} />

      <ComprobanteCompraDialog
        open={compraDialogOpen}
        onOpenChange={setCompraDialogOpen}
        proveedores={proveedores.filter((p) => p.activo)}
        onSave={handleSaveCompra}
      />
    </div>
  );
}

// Acentos de color por botón -- detalle estético a pedido del usuario
// (Fase 26 cont.), pensado para poder revertirse fácil: si no convence,
// alcanza con volver todos los BotonGrande a accent="indigo" (el color
// único que tenían antes) o borrar la prop por completo.
const ACENTOS_BOTON = {
  indigo: { bg: 'bg-indigo-50/60', border: 'hover:border-indigo-300 hover:bg-indigo-50', icon: 'text-indigo-600' },
  emerald: { bg: 'bg-emerald-50/60', border: 'hover:border-emerald-300 hover:bg-emerald-50', icon: 'text-emerald-600' },
  blue: { bg: 'bg-blue-50/60', border: 'hover:border-blue-300 hover:bg-blue-50', icon: 'text-blue-600' },
  violet: { bg: 'bg-violet-50/60', border: 'hover:border-violet-300 hover:bg-violet-50', icon: 'text-violet-600' },
  amber: { bg: 'bg-amber-50/60', border: 'hover:border-amber-300 hover:bg-amber-50', icon: 'text-amber-600' },
  orange: { bg: 'bg-orange-50/60', border: 'hover:border-orange-300 hover:bg-orange-50', icon: 'text-orange-600' },
} as const;

type AcentoBoton = keyof typeof ACENTOS_BOTON;

function BotonGrande({
  icon: Icon,
  label,
  accent = 'indigo',
  onClick,
}: {
  icon: typeof Receipt;
  label: string;
  accent?: AcentoBoton;
  onClick: () => void;
}) {
  const a = ACENTOS_BOTON[accent];
  return (
    <button
      onClick={onClick}
      className={`flex h-24 flex-col items-center justify-center gap-2 rounded-lg border border-gray-200 text-center transition-colors ${a.bg} ${a.border}`}
    >
      <Icon className={`h-7 w-7 ${a.icon}`} />
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </button>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon?: typeof CircleCheck;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-gray-500">{label}</span>
        {Icon && <Icon className={`h-4 w-4 ${accent ?? 'text-gray-400'}`} />}
      </div>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}
