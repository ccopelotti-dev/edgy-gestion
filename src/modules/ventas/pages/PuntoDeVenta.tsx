// ============================================================
// Módulo Ventas — Punto de Venta
// Edgy Gestión · Facturación rápida / POS simplificado
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search,
  Plus,
  Trash2,
  ShoppingCart,
  Clock,
  Receipt,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';

import {
  useClientes,
  useVentas,
  useVentasDispatch,
} from '../data/store';
import { Amount, EmptyState } from '../components/ventas/display';
import {
  formatARS,
  formatDateTime,
  formatNumero,
  PREFIJO_COMPROBANTE,
  nowISO,
  todayISO,
} from '../lib/format';
import {
  calcularSubtotalItem,
  calcularTotalConIva,
  generarId,
  CONSUMIDOR_FINAL_ID,
  clienteConsumidorFinal,
  MEDIO_PAGO_LABEL,
  type MedioPago,
  type ModoEmision,
  type ComprobanteItem,
} from '../types';
import { supabase } from '@/lib/supabase';
import { useClienteActual } from '@/hooks/useClienteActual';
import { descontarStockPorVenta } from '../lib/descontarStockVenta';
import { activarGarantiasPorVenta, type LineaGarantia } from '../lib/activarGarantiasVenta';

// ─── Tipos locales ──────────────────────────────────────────

interface LineaVenta {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  /** Vínculo permanente al catálogo real (productos-stock) -- opcional:
   * si se deja sin vincular, la línea sigue siendo texto libre como
   * siempre (comportamiento default sin cambios, Fase 6c del refactor
   * de Productos). Vinculado, permite descontar stock y activar
   * garantía automáticamente al facturar. */
  productoId?: string;
  varianteId?: string;
}

interface VarianteCatalogo {
  id: string;
  color?: string;
  talle?: string;
  stock: number;
}

interface PlantillaGarantiaLite {
  id: string;
  nombre: string;
  duracionMeses: number;
  cobertura: string;
}

interface ProductoCatalogo {
  id: string;
  nombre: string;
  precioVenta: number;
  stock: number;
  controlaStock: boolean;
  tipo: 'unico' | 'con_variantes';
  variantes: VarianteCatalogo[];
  /** Plantilla de garantía efectiva (propia del producto, o heredada de
   * su rubro si el producto no tiene una asignada puntual) -- Fase 6b
   * del refactor de Productos. undefined = sin garantía. */
  plantillaGarantia?: PlantillaGarantiaLite;
}

function etiquetaVariante(v: VarianteCatalogo): string {
  return [v.color, v.talle].filter(Boolean).join(' / ') || 'Variante';
}

// ─── Componente principal ───────────────────────────────────

export default function PuntoDeVenta() {
  const clientes = useClientes();
  const { config, nextNumeroComprobante } = useVentas();
  const dispatch = useVentasDispatch();
  const { cliente: clienteTenant } = useClienteActual();

  // ── Estado del formulario ─────────────────────────────────

  const [lineas, setLineas] = useState<LineaVenta[]>([]);
  const [clienteId, setClienteId] = useState<string>(CONSUMIDOR_FINAL_ID);
  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo');
  const [modoEmision, setModoEmision] = useState<ModoEmision>(config.modoEmisionDefault);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [ahora, setAhora] = useState(nowISO());
  const [toast, setToast] = useState<string | null>(null);
  const [productosCatalogo, setProductosCatalogo] = useState<ProductoCatalogo[]>([]);
  const [erroresStock, setErroresStock] = useState<
    { nombre: string; solicitado: number; disponible: number }[] | null
  >(null);
  const [facturando, setFacturando] = useState(false);
  // Datos de contacto para activar garantía cuando se factura a
  // "Consumidor Final" (no hay ficha de cliente de la que sacarlos) --
  // Fase 6b del refactor de Productos.
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoTelefono, setContactoTelefono] = useState('');

  // Reloj en vivo
  useEffect(() => {
    const timer = setInterval(() => setAhora(nowISO()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Auto-ocultar toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Fase 6c del refactor de Productos: si el cliente configuró una lista
  // de precio para Ventas/Facturación (Productos → Listas de precio →
  // "Uso por canal"), el precio de cada producto del catálogo se calcula
  // igual que calcularPrecioLista() en productos-stock/data/store.tsx
  // (override manual en producto_precios, si no costo * (1 + %recargo))
  // -- pero reimplementado acá con consultas directas a Supabase, porque
  // este módulo no está montado dentro de ProductosStockProvider. Si NO
  // hay lista configurada, el precio sigue siendo precio_venta del
  // producto (comportamiento default, mismo criterio que Fase 6a).
  //
  // Fase 6b: en el mismo Promise.all se trae también, por producto, la
  // plantilla de garantía efectiva -- propia (productos.plantilla_
  // garantia_id) o heredada de su rubro (rubros.plantilla_garantia_id)
  // si el producto no tiene una asignada puntual -- mismo criterio que
  // resolverPlantillaGarantia() en productos-stock/data/store.tsx,
  // reimplementado acá porque este módulo no lee ese Context.
  useEffect(() => {
    if (!clienteTenant?.id) return;
    let activo = true;
    const listaId = clienteTenant.lista_precio_ventas_id;

    async function cargarCatalogo() {
      const [productosRes, listaRes, overridesRes, variantesRes, rubrosRes, plantillasRes] =
        await Promise.all([
          supabase
            .from('productos')
            .select('id, nombre, precio_venta, costo, stock, controla_stock, tipo, rubro_id, plantilla_garantia_id')
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
          supabase.from('producto_variantes').select('id, producto_id, color, talle, stock'),
          supabase.from('rubros').select('id, plantilla_garantia_id'),
          supabase.from('plantillas_garantia').select('id, nombre, duracion_meses, cobertura'),
        ]);

      if (!activo) return;

      const porcentaje = listaRes.data ? Number(listaRes.data.porcentaje_recargo) : 0;
      const overridesPorProducto = new Map<string, number>();
      for (const o of overridesRes.data ?? []) {
        overridesPorProducto.set(o.producto_id, Number(o.precio));
      }

      const variantesPorProducto = new Map<string, VarianteCatalogo[]>();
      for (const v of (variantesRes.data ?? []) as any[]) {
        const arr = variantesPorProducto.get(v.producto_id) ?? [];
        arr.push({
          id: v.id,
          color: v.color ?? undefined,
          talle: v.talle ?? undefined,
          stock: Number(v.stock),
        });
        variantesPorProducto.set(v.producto_id, arr);
      }

      const plantillaGarantiaPorRubro = new Map<string, string>();
      for (const r of (rubrosRes.data ?? []) as any[]) {
        if (r.plantilla_garantia_id) plantillaGarantiaPorRubro.set(r.id, r.plantilla_garantia_id);
      }

      const plantillasPorId = new Map<string, PlantillaGarantiaLite>();
      for (const pg of (plantillasRes.data ?? []) as any[]) {
        plantillasPorId.set(pg.id, {
          id: pg.id,
          nombre: pg.nombre,
          duracionMeses: Number(pg.duracion_meses),
          cobertura: pg.cobertura ?? '',
        });
      }

      setProductosCatalogo(
        ((productosRes.data ?? []) as any[]).map((p) => {
          const override = overridesPorProducto.get(p.id);
          const calculado = Number(p.costo) * (1 + porcentaje / 100);
          const precioVenta = listaId ? override ?? calculado : Number(p.precio_venta);
          const idPlantillaEfectiva = p.plantilla_garantia_id ?? plantillaGarantiaPorRubro.get(p.rubro_id);
          return {
            id: p.id,
            nombre: p.nombre,
            precioVenta,
            stock: Number(p.stock),
            controlaStock: !!p.controla_stock,
            tipo: p.tipo === 'con_variantes' ? 'con_variantes' : 'unico',
            variantes: variantesPorProducto.get(p.id) ?? [],
            plantillaGarantia: idPlantillaEfectiva ? plantillasPorId.get(idPlantillaEfectiva) : undefined,
          } as ProductoCatalogo;
        }),
      );
    }

    cargarCatalogo();
    return () => {
      activo = false;
    };
  }, [clienteTenant?.id, clienteTenant?.lista_precio_ventas_id]);

  const catalogoPorId = useMemo(() => {
    const map = new Map<string, ProductoCatalogo>();
    for (const p of productosCatalogo) map.set(p.id, p);
    return map;
  }, [productosCatalogo]);

  const sugerencias = useMemo(() => {
    const q = busquedaProducto.trim().toLowerCase();
    if (!q) return [];
    return productosCatalogo.filter((p) => p.nombre.toLowerCase().includes(q)).slice(0, 8);
  }, [busquedaProducto, productosCatalogo]);

  // ── Cálculos derivados ────────────────────────────────────

  const subtotalNeto = useMemo(
    () =>
      lineas.reduce(
        (sum, l) => sum + calcularSubtotalItem(l.cantidad, l.precioUnitario, l.descuento),
        0,
      ),
    [lineas],
  );

  const { montoIva, total } = useMemo(
    () => calcularTotalConIva(subtotalNeto, config.ivaDefault),
    [subtotalNeto, config.ivaDefault],
  );

  // Lista de clientes para el selector (Consumidor Final + activos)
  const opcionesCliente = useMemo(
    () => [clienteConsumidorFinal, ...clientes.filter((c) => c.activo)],
    [clientes],
  );

  // Si alguna línea vinculada a un producto con variantes todavía no
  // tiene la variante elegida, no se puede facturar -- necesitamos
  // saber exactamente qué unidad de stock descontar.
  const faltanVariantes = useMemo(
    () =>
      lineas.some((l) => {
        if (!l.productoId) return false;
        const p = catalogoPorId.get(l.productoId);
        return p?.tipo === 'con_variantes' && !l.varianteId;
      }),
    [lineas, catalogoPorId],
  );

  // Líneas vinculadas a un producto con garantía asignada -- Fase 6b.
  const lineasConGarantia = useMemo(
    () =>
      lineas.filter((l) => {
        if (!l.productoId) return false;
        return !!catalogoPorId.get(l.productoId)?.plantillaGarantia;
      }),
    [lineas, catalogoPorId],
  );

  // Si hay garantía en la venta y se factura a "Consumidor Final", no
  // hay ficha de la que sacar nombre/teléfono -- hace falta pedirlos a
  // mano antes de poder facturar.
  const necesitaContactoGarantia = lineasConGarantia.length > 0 && clienteId === CONSUMIDOR_FINAL_ID;
  const faltaContactoGarantia =
    necesitaContactoGarantia && (!contactoNombre.trim() || !contactoTelefono.trim());

  // ── Handlers de líneas ────────────────────────────────────

  const handleAgregarLinea = useCallback(() => {
    const desc = busquedaProducto.trim();
    setLineas((prev) => [
      ...prev,
      {
        id: generarId(),
        descripcion: desc || 'Producto',
        cantidad: 1,
        precioUnitario: 0,
        descuento: 0,
      },
    ]);
    setBusquedaProducto('');
  }, [busquedaProducto]);

  const handleAgregarLineaCatalogo = useCallback((producto: ProductoCatalogo) => {
    setLineas((prev) => [
      ...prev,
      {
        id: generarId(),
        descripcion: producto.nombre,
        cantidad: 1,
        precioUnitario: producto.precioVenta,
        descuento: 0,
        productoId: producto.id,
      },
    ]);
    setBusquedaProducto('');
  }, []);

  const handleEliminarLinea = useCallback((id: string) => {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const handleCambioLinea = useCallback(
    (id: string, campo: keyof LineaVenta, valor: string) => {
      setLineas((prev) =>
        prev.map((l) => {
          if (l.id !== id) return l;
          if (campo === 'descripcion') return { ...l, descripcion: valor };
          if (campo === 'varianteId') return { ...l, varianteId: valor || undefined };
          const num = parseFloat(valor) || 0;
          return { ...l, [campo]: Math.max(0, num) };
        }),
      );
    },
    [],
  );

  // ── Validación de stock (bloqueante) ──────────────────────

  async function validarStockDisponible(lineasAFacturar: LineaVenta[]) {
    const pedido = new Map<
      string,
      { productoId: string; varianteId?: string; cantidad: number; nombre: string }
    >();
    for (const l of lineasAFacturar) {
      if (!l.productoId) continue;
      const key = `${l.productoId}::${l.varianteId ?? ''}`;
      const prev = pedido.get(key);
      if (prev) prev.cantidad += l.cantidad;
      else pedido.set(key, { productoId: l.productoId, varianteId: l.varianteId, cantidad: l.cantidad, nombre: l.descripcion });
    }

    const errores: { nombre: string; solicitado: number; disponible: number }[] = [];
    for (const { productoId, varianteId, cantidad, nombre } of pedido.values()) {
      const { data: producto } = await supabase
        .from('productos')
        .select('stock, controla_stock')
        .eq('id', productoId)
        .maybeSingle();
      if (!producto || !producto.controla_stock) continue;

      let disponible = Number(producto.stock);
      let etiqueta = nombre;
      if (varianteId) {
        const { data: variante } = await supabase
          .from('producto_variantes')
          .select('stock, color, talle')
          .eq('id', varianteId)
          .maybeSingle();
        if (variante) {
          disponible = Number(variante.stock);
          const partes = [variante.color, variante.talle].filter(Boolean).join(' / ');
          if (partes) etiqueta = `${nombre} (${partes})`;
        }
      }

      if (disponible < cantidad) {
        errores.push({ nombre: etiqueta, solicitado: cantidad, disponible });
      }
    }
    return errores;
  }

  // ── Facturar ──────────────────────────────────────────────

  const handleFacturar = useCallback(async () => {
    if (lineas.length === 0 || faltanVariantes || facturando || faltaContactoGarantia) return;

    setFacturando(true);
    setErroresStock(null);

    const lineasCatalogo = lineas.filter((l) => l.productoId);
    if (lineasCatalogo.length > 0) {
      const errores = await validarStockDisponible(lineasCatalogo);
      if (errores.length > 0) {
        setErroresStock(errores);
        setFacturando(false);
        return;
      }
    }

    const now = nowISO();
    const hoy = todayISO();

    // Construir items del comprobante
    const items: ComprobanteItem[] = lineas.map((l) => {
      const sub = calcularSubtotalItem(l.cantidad, l.precioUnitario, l.descuento);
      const iva = sub * (config.ivaDefault / 100);
      return {
        id: generarId(),
        productoId: l.productoId,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        descuento: l.descuento,
        alicuotaIva: config.ivaDefault,
        subtotal: sub,
        montoIva: iva,
      };
    });

    const comprobanteId = generarId();
    const esPagoCompleto = medioPago === 'efectivo';
    const numFactura = nextNumeroComprobante.factura;

    dispatch({
      type: 'ADD_COMPROBANTE',
      payload: {
        id: comprobanteId,
        tipo: 'factura',
        modoEmision,
        clienteId,
        fecha: hoy,
        items,
        subtotal: subtotalNeto,
        descuentoGeneral: 0,
        montoIva,
        total,
        estado: esPagoCompleto ? 'cobrado' : 'emitido',
        medioPago,
        montoCobrado: esPagoCompleto ? total : 0,
        saldoPendiente: esPagoCompleto ? 0 : total,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Si es efectivo, registrar cobro automático
    if (esPagoCompleto) {
      dispatch({
        type: 'ADD_COBRO',
        payload: {
          id: generarId(),
          clienteId,
          fecha: hoy,
          monto: total,
          medioPago: 'efectivo',
          imputaciones: [{ comprobanteId, montoImputado: total }],
          createdAt: now,
        },
      });
    }

    // Descuento de stock (Fase 6c) -- fire-and-forget, ya se validó que
    // había stock suficiente unos instantes antes.
    if (lineasCatalogo.length > 0 && clienteTenant?.id) {
      descontarStockPorVenta(lineasCatalogo, clienteTenant.id, numFactura, hoy).catch(() => {
        // El comprobante ya se generó igual -- si falla el descuento de
        // stock (ej. permisos), no se revierte la venta, pero conviene
        // que quede constancia en consola para diagnosticar.
        // eslint-disable-next-line no-console
        console.error('No se pudo descontar el stock de la venta', numFactura);
      });
    }

    // Activación de garantía (Fase 6b) -- fire-and-forget, mismo
    // criterio que el descuento de stock. Si el cliente es real, se
    // usan sus datos de contacto ya cargados; si es "Consumidor Final",
    // se usan los que se pidieron en el mini-formulario (el botón
    // Facturar está deshabilitado hasta completarlos, ver
    // faltaContactoGarantia).
    if (lineasConGarantia.length > 0 && clienteTenant?.id) {
      const clienteReal = clientes.find((c) => c.id === clienteId);
      const nombreContacto = clienteId === CONSUMIDOR_FINAL_ID ? contactoNombre : clienteReal?.nombre ?? '';
      const telefonoContacto = clienteId === CONSUMIDOR_FINAL_ID ? contactoTelefono : clienteReal?.telefono ?? '';

      const lineasGarantia: LineaGarantia[] = lineasConGarantia.map((l) => {
        const producto = catalogoPorId.get(l.productoId!)!;
        const pg = producto.plantillaGarantia!;
        return {
          productoId: l.productoId!,
          varianteId: l.varianteId,
          cantidad: l.cantidad,
          productoNombre: producto.nombre,
          plantillaGarantiaId: pg.id,
          nombrePlantilla: pg.nombre,
          duracionMeses: pg.duracionMeses,
          cobertura: pg.cobertura,
        };
      });

      activarGarantiasPorVenta(
        lineasGarantia,
        clienteTenant.id,
        numFactura,
        hoy,
        nombreContacto,
        telefonoContacto,
      ).catch(() => {
        // eslint-disable-next-line no-console
        console.error('No se pudo activar la garantía de la venta', numFactura);
      });
    }

    setToast(`Factura ${formatNumero(PREFIJO_COMPROBANTE.factura, numFactura)} generada`);

    // Limpiar formulario
    setLineas([]);
    setClienteId(CONSUMIDOR_FINAL_ID);
    setMedioPago('efectivo');
    setBusquedaProducto('');
    setContactoNombre('');
    setContactoTelefono('');
    setFacturando(false);
  }, [
    lineas,
    faltanVariantes,
    facturando,
    faltaContactoGarantia,
    lineasConGarantia,
    catalogoPorId,
    clientes,
    clienteId,
    contactoNombre,
    contactoTelefono,
    medioPago,
    modoEmision,
    config.ivaDefault,
    subtotalNeto,
    montoIva,
    total,
    nextNumeroComprobante,
    dispatch,
    clienteTenant?.id,
  ]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Punto de Venta</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock className="h-4 w-4" />
          {formatDateTime(ahora)}
        </div>
      </div>

      {/* Toast de confirmación */}
      {toast && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <Receipt className="h-4 w-4" />
          {toast}
        </div>
      )}

      {/* Bloqueo por stock insuficiente */}
      {erroresStock && erroresStock.length > 0 && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-red-800">
            <AlertTriangle className="h-5 w-5" />
            No se pudo facturar: stock insuficiente
          </div>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            {erroresStock.map((e, i) => (
              <li key={i}>
                <span className="font-semibold">{e.nombre}</span>: pedido {e.solicitado}, disponible{' '}
                {e.disponible}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs font-medium text-red-700">
            Esto refleja un desvío en el control de stock, no un error del sistema. Corregí el
            stock manualmente en Productos antes de volver a intentar facturar.
          </p>
        </div>
      )}

      <div className="flex gap-6">
        {/* ── Panel izquierdo: Items (70%) ──────────────────── */}
        <div className="w-[70%] space-y-4">
          {/* Buscador / agregar producto */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && busquedaProducto.trim()) {
                    handleAgregarLinea();
                  }
                }}
                placeholder="Buscar en el catálogo o escribir descripción libre..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {sugerencias.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {sugerencias.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleAgregarLineaCatalogo(p)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-indigo-50"
                    >
                      <span className="flex items-center gap-1.5 text-gray-900">
                        {p.nombre}
                        {p.plantillaGarantia && (
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                      </span>
                      <span className="text-gray-500">
                        {formatARS(p.precioVenta)}
                        {p.controlaStock ? ` · Stock ${p.stock}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleAgregarLinea}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Agregar
            </button>
          </div>

          {/* Tabla de items */}
          {lineas.length === 0 ? (
            <EmptyState title="Agregue productos para comenzar la venta" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-4 py-3 font-medium">Descripción</th>
                    <th className="px-4 py-3 font-medium w-24">Cantidad</th>
                    <th className="px-4 py-3 font-medium w-32">Precio Unit.</th>
                    <th className="px-4 py-3 font-medium w-24">Dto. %</th>
                    <th className="px-4 py-3 text-right font-medium w-32">Subtotal</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((linea) => {
                    const sub = calcularSubtotalItem(
                      linea.cantidad,
                      linea.precioUnitario,
                      linea.descuento,
                    );
                    const productoVinculado = linea.productoId
                      ? catalogoPorId.get(linea.productoId)
                      : undefined;
                    return (
                      <tr
                        key={linea.id}
                        className="border-b border-gray-50 last:border-0"
                      >
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={linea.descripcion}
                            onChange={(e) =>
                              handleCambioLinea(linea.id, 'descripcion', e.target.value)
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          {productoVinculado && (
                            <div className="mt-1 flex items-center gap-2">
                              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
                                Catálogo
                              </span>
                              {productoVinculado.plantillaGarantia && (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                                  <ShieldCheck className="h-3 w-3" />
                                  Garantía {productoVinculado.plantillaGarantia.duracionMeses}m
                                </span>
                              )}
                              {productoVinculado.tipo === 'con_variantes' && (
                                <select
                                  value={linea.varianteId ?? ''}
                                  onChange={(e) =>
                                    handleCambioLinea(linea.id, 'varianteId', e.target.value)
                                  }
                                  className="rounded border border-gray-200 px-1 py-0.5 text-[11px] text-gray-700 focus:border-indigo-500 focus:outline-none"
                                >
                                  <option value="">Elegir variante…</option>
                                  {productoVinculado.variantes.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {etiquetaVariante(v)} · Stock {v.stock}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={linea.cantidad}
                            onChange={(e) =>
                              handleCambioLinea(linea.id, 'cantidad', e.target.value)
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={linea.precioUnitario}
                            onChange={(e) =>
                              handleCambioLinea(linea.id, 'precioUnitario', e.target.value)
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={linea.descuento}
                            onChange={(e) =>
                              handleCambioLinea(linea.id, 'descuento', e.target.value)
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Amount value={sub} />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => handleEliminarLinea(linea.id)}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Panel derecho: Resumen (30%) ─────────────────── */}
        <div className="w-[30%] space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
            {/* Cliente */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Cliente
              </label>
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {opcionesCliente.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Datos de contacto para garantía (solo Consumidor Final + hay garantía) */}
            {necesitaContactoGarantia && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                  <ShieldCheck className="h-4 w-4" />
                  Datos para la garantía
                </p>
                <input
                  type="text"
                  value={contactoNombre}
                  onChange={(e) => setContactoNombre(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  value={contactoTelefono}
                  onChange={(e) => setContactoTelefono(e.target.value)}
                  placeholder="Teléfono"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-emerald-700">
                  Necesarios para poder ubicar al cliente si reclama la garantía.
                </p>
              </div>
            )}

            {/* Totales */}
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal neto</span>
                <Amount value={subtotalNeto} />
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>IVA ({config.ivaDefault}%)</span>
                <Amount value={montoIva} />
              </div>
              <div className="flex justify-between text-lg font-bold text-gray-900 border-t border-gray-200 pt-2">
                <span>Total</span>
                <span>{formatARS(total)}</span>
              </div>
            </div>

            {/* Medio de pago */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Medio de pago
              </label>
              <select
                value={medioPago}
                onChange={(e) => setMedioPago(e.target.value as MedioPago)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {(Object.keys(MEDIO_PAGO_LABEL) as MedioPago[]).map((mp) => (
                  <option key={mp} value={mp}>
                    {MEDIO_PAGO_LABEL[mp]}
                  </option>
                ))}
              </select>
            </div>

            {/* Modo de emisión */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Modo de emisión
              </label>
              <div className="flex gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="modoEmision"
                    value="interno"
                    checked={modoEmision === 'interno'}
                    onChange={() => setModoEmision('interno')}
                    className="accent-indigo-600"
                  />
                  Interno
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="modoEmision"
                    value="electronica"
                    checked={modoEmision === 'electronica'}
                    onChange={() => setModoEmision('electronica')}
                    className="accent-indigo-600"
                  />
                  Electrónica
                </label>
              </div>
            </div>

            {faltanVariantes && (
              <p className="text-xs font-medium text-amber-700">
                Elegí la variante de cada producto vinculado antes de facturar.
              </p>
            )}

            {faltaContactoGarantia && (
              <p className="text-xs font-medium text-amber-700">
                Completá nombre y teléfono para poder facturar (hay garantía en la venta).
              </p>
            )}

            {/* Botón FACTURAR */}
            <button
              onClick={handleFacturar}
              disabled={
                lineas.length === 0 ||
                total <= 0 ||
                faltanVariantes ||
                facturando ||
                faltaContactoGarantia
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-base font-bold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              <ShoppingCart className="h-5 w-5" />
              {facturando ? 'FACTURANDO…' : 'FACTURAR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
