// ============================================================
// Modulo Home Keep — Servicios (Fase 74, 07/09, a pedido de Carlos)
// Edgy Gestion · Panel dinámico de "pagos de servicios continuos"
// (impuestos, tasas, seguros, luz/gas/internet, colegios, etc.).
//
// Reemplaza el Excel manual que usaba Rosana: cada Servicio es la
// "ficha" de una obligación recurrente (con estimación de monto/día de
// vencimiento para precargar el panel), y en cuanto llega el
// comprobante real (WhatsApp, carga manual) vinculado a esa Servicio
// (Comprobante.servicioHogarId), el panel muestra el monto real y, una
// vez pagado, el ítem se "desagota" de pendientes -- criterio pedido
// explícitamente por Carlos.
//
// Criterio de trazabilidad (idem Vehículos/Inmuebles, Fase 74): acá NO
// se dan de alta vehículos/inmuebles/personas -- eso ya se hizo en
// Perfil Familiar. Acá solo se elige a cuál de esos ya cargados se
// vincula cada Servicio.
// ============================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit2, Power, Wrench, Car, Building2, User, Layers } from 'lucide-react';

import {
  useServiciosHogar,
  usePanelServicios,
  useVehiculos,
  useInmuebles,
  useCategoriasGasto,
  useProveedores,
  useHomeKeepDispatch,
  type ItemPanelServicio,
} from '../data/store';
import { ServicioDialog } from '../components/dialogs';
import { Amount, EmptyState, KpiCard } from '../components/display';
import { formatARS, formatDate, nowISO } from '../lib/format';
import { supabase } from '@/lib/supabase';
import { useClienteActual } from '@/hooks/useClienteActual';
import type { ServicioHogar, TipoVinculoServicio } from '../types';
import { TIPO_VINCULO_SERVICIO_LABEL, PERIODICIDAD_SERVICIO_LABEL, generarId } from '../types';

const iconoVinculo: Record<TipoVinculoServicio, typeof Car> = {
  vehiculo: Car,
  inmueble: Building2,
  persona: User,
  general: Layers,
};

function EstadoBadge({ estado }: { estado: ItemPanelServicio['estado'] }) {
  if (estado === 'cubierto') {
    return <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Pagado</span>;
  }
  if (estado === 'pendiente_pago') {
    return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Comprobante cargado -- pendiente de pago</span>;
  }
  return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Estimado -- todavía no llegó el comprobante</span>;
}

export default function Servicios() {
  const serviciosHogar = useServiciosHogar();
  const { items, totalPendiente } = usePanelServicios();
  const vehiculos = useVehiculos();
  const inmuebles = useInmuebles();
  const categorias = useCategoriasGasto();
  const proveedores = useProveedores();
  const dispatch = useHomeKeepDispatch();
  const { cliente } = useClienteActual();

  // Nombres de titulares de vehículos/inmuebles + lista de personas para
  // el selector "Vinculado a: Persona" -- mismo patrón de solo-lectura
  // que TarjetasCredito.tsx (Fase 72c): el alta de la persona en sí pasa
  // por Perfil Familiar, acá solo se las referencia.
  const [personas, setPersonas] = useState<{ id: string; nombre: string }[]>([]);
  useEffect(() => {
    if (!cliente) return;
    supabase
      .from('usuarios_cliente')
      .select('id, nombre, email')
      .eq('cliente_id', cliente.id)
      .then(({ data }) => {
        setPersonas((data ?? []).map((u: any) => ({ id: u.id, nombre: u.nombre || u.email || 'Sin nombre' })));
      });
  }, [cliente]);

  const nombrePersona = (id?: string) => (id ? personas.find((p) => p.id === id)?.nombre : undefined);
  const nombreVehiculo = (id?: string) => {
    const v = vehiculos.find((x) => x.id === id);
    if (!v) return undefined;
    return [v.marca, v.modelo].filter(Boolean).join(' ') || v.patente || 'Vehículo';
  };
  const nombreInmueble = (id?: string) => inmuebles.find((x) => x.id === id)?.nombre;

  function nombreVinculo(s: ServicioHogar): string | undefined {
    if (s.tipoVinculo === 'vehiculo') return nombreVehiculo(s.vehiculoId);
    if (s.tipoVinculo === 'inmueble') return nombreInmueble(s.inmuebleId);
    if (s.tipoVinculo === 'persona') return nombrePersona(s.usuarioClienteId);
    return undefined;
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editServicio, setEditServicio] = useState<ServicioHogar | null>(null);

  const handleEditar = (s: ServicioHogar) => {
    setEditServicio(s);
    setDialogOpen(true);
  };

  const handleSave = (data: Omit<ServicioHogar, 'id' | 'activo' | 'createdAt' | 'updatedAt'>) => {
    const now = nowISO();
    if (editServicio) {
      dispatch({ type: 'UPDATE_SERVICIO_HOGAR', payload: { ...editServicio, ...data, updatedAt: now } });
    } else {
      dispatch({ type: 'ADD_SERVICIO_HOGAR', payload: { ...data, id: generarId(), activo: true, createdAt: now, updatedAt: now } });
    }
  };

  const handleToggleActivo = (id: string) => {
    dispatch({ type: 'TOGGLE_SERVICIO_HOGAR_ACTIVO', payload: { id } });
  };

  const pendientes = items.filter((i) => i.estado !== 'cubierto').sort((a, b) => (a.servicio.diaVencimientoAproximado ?? 99) - (b.servicio.diaVencimientoAproximado ?? 99));
  const cubiertos = items.filter((i) => i.estado === 'cubierto');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Servicios</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Pagos de servicios continuos: impuestos, tasas, seguros, luz/gas/internet, colegios, etc.
          </p>
        </div>
        <button
          onClick={() => { setEditServicio(null); setDialogOpen(true); }}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo servicio
        </button>
      </div>

      {/* Fase 74: vehículos/inmuebles se cargan en Perfil Familiar, no
          acá -- atajo visible por si todavía no se cargó ninguno. */}
      {(vehiculos.length === 0 || inmuebles.length === 0) && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Los vehículos e inmuebles se dan de alta desde la ficha de cada integrante en{' '}
          <Link to="/perfil-familiar" className="font-medium text-gray-700 underline">Perfil Familiar</Link>.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard title="Pendiente de imputar" value={formatARS(totalPendiente)} subtitle={`${pendientes.length} servicio(s)`} />
        <KpiCard title="Servicios activos" value={serviciosHogar.filter((s) => s.activo).length} />
        <KpiCard title="Pagados este período" value={cubiertos.length} />
      </div>

      {serviciosHogar.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-10 w-10" />}
          title="No hay servicios cargados"
          description="Cargá cada obligación recurrente (impuesto, tasa, seguro, servicio) con su estimación de monto y vencimiento para empezar a armar el panel."
        />
      ) : (
        <div className="space-y-2">
          {pendientes.map(({ servicio: s, comprobante, monto, estado }) => {
            const Icono = iconoVinculo[s.tipoVinculo];
            const vinculo = nombreVinculo(s);
            return (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
                <div className="flex items-center gap-3">
                  <Icono className="h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{s.nombre}</span>
                      {!s.activo && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] text-gray-600">Inactivo</span>}
                    </div>
                    <div className="text-xs text-gray-500">
                      {vinculo && <span>{vinculo} · </span>}
                      {PERIODICIDAD_SERVICIO_LABEL[s.periodicidad]}
                      {s.diaVencimientoAproximado && <span> · vence aprox. día {s.diaVencimientoAproximado}</span>}
                      {comprobante?.fechaVencimiento && <span> · vence {formatDate(comprobante.fechaVencimiento)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <EstadoBadge estado={estado} />
                  <Amount value={monto} size="sm" />
                  <button onClick={() => handleEditar(s)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Editar">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggleActivo(s.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                    title={s.activo ? 'Desactivar' : 'Activar'}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {cubiertos.length > 0 && (
            <details className="rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3">
              <summary className="cursor-pointer text-xs font-medium text-gray-500">
                {cubiertos.length} servicio(s) ya pagados este período
              </summary>
              <div className="mt-2 space-y-1.5">
                {cubiertos.map(({ servicio: s, monto }) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm border border-gray-100">
                    <span className="text-gray-700">{s.nombre}</span>
                    <Amount value={monto} size="sm" />
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <ServicioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        servicio={editServicio ?? undefined}
        categorias={categorias}
        proveedores={proveedores}
        vehiculos={vehiculos}
        inmuebles={inmuebles}
        personas={personas}
        onSave={handleSave}
      />
    </div>
  );
}
