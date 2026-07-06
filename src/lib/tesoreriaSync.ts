// ============================================================
// Sincronización automática Ventas/Compras -> Tesorería
//
// Cuando Ventas o Compras registran un movimiento de dinero real
// (un Cobro, un Pago, o un Comprobante que se cobra/paga al
// instante) con un medio de pago que NO es 'cuenta_corriente', se
// refleja automáticamente en Tesorería:
//   - Siempre se crea un movimiento de caja.
//   - Si el medio de pago se liquida en banco (transferencia,
//     tarjeta, MercadoPago), además se crea el movimiento bancario
//     espejo en la primera cuenta bancaria cargada del cliente.
//     Si todavía no hay ninguna cuenta bancaria cargada, se omite
//     el espejo bancario (se deja constancia en consola) pero el
//     movimiento de caja sí se registra.
//
// Nota: el medio de pago "cheque" queda excluido de este
// auto-registro. En Tesorería los cheques son una entidad propia
// (número, banco, librador, fecha de cobro) que Ventas/Compras no
// capturan, así que un cheque cargado en una venta/compra no
// genera automáticamente un registro en el módulo de Cheques —
// eso requiere alta manual en Tesorería > Cheques.
// ============================================================

import { supabase } from './supabase';

type MedioPagoTesoreria = 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta' | 'mercadopago';

const BANK_SETTLED: MedioPagoTesoreria[] = ['transferencia', 'tarjeta', 'mercadopago'];

function mapMedioPago(medioPago: string): MedioPagoTesoreria | null {
  switch (medioPago) {
    case 'efectivo':
      return 'efectivo';
    case 'transferencia':
      return 'transferencia';
    case 'tarjeta_debito':
    case 'tarjeta_credito':
      return 'tarjeta';
    case 'mercadopago':
      return 'mercadopago';
    case 'cheque':
      return null; // se maneja aparte en Tesorería > Cheques, no auto-sincronizado
    case 'cuenta_corriente':
      return null; // todavía no es un movimiento de dinero real
    case 'otro':
      return 'efectivo'; // fallback razonable
    default:
      return null;
  }
}

interface RegistrarMovimientoOpts {
  clienteId: string;
  tipo: 'ingreso' | 'egreso';
  medioPago: string;
  monto: number;
  concepto: string;
  categoria: string;
  fecha: string;
  origenModulo: 'ventas' | 'compras';
}

export async function registrarMovimientoTesoreria(opts: RegistrarMovimientoOpts): Promise<void> {
  if (!(opts.monto > 0)) return;

  const medio = mapMedioPago(opts.medioPago);
  if (!medio) return;

  const linkId = crypto.randomUUID();

  const { error: errCaja } = await supabase.from('movimientos_caja').insert({
    id: crypto.randomUUID(),
    cliente_id: opts.clienteId,
    fecha: opts.fecha,
    tipo: opts.tipo,
    concepto: opts.concepto,
    categoria: opts.categoria,
    medio_pago: medio,
    monto: opts.monto,
    cuenta_id: null,
    link_id: linkId,
  });
  if (errCaja) {
    console.error(`Tesorería · error registrando movimiento de caja desde ${opts.origenModulo}:`, errCaja);
    return;
  }

  if (!BANK_SETTLED.includes(medio)) return;

  const { data: cuentas, error: errCuentas } = await supabase
    .from('cuentas_bancarias')
    .select('id')
    .eq('cliente_id', opts.clienteId)
    .order('created_at')
    .limit(1);

  if (errCuentas) {
    console.error('Tesorería · error buscando cuenta bancaria para el espejo:', errCuentas);
    return;
  }

  const cuenta = cuentas?.[0];
  if (!cuenta) {
    console.warn(
      `Tesorería · no se generó el movimiento bancario espejo (origen: ${opts.origenModulo}, medio: "${medio}") porque no hay ninguna cuenta bancaria cargada. Cargá una cuenta en Tesorería > Bancos.`,
    );
    return;
  }

  const { error: errBanco } = await supabase.from('movimientos_bancarios').insert({
    id: crypto.randomUUID(),
    cliente_id: opts.clienteId,
    cuenta_id: cuenta.id,
    fecha: opts.fecha,
    tipo: opts.tipo,
    concepto: opts.concepto,
    categoria: opts.categoria,
    medio_pago: medio,
    monto: opts.monto,
    link_id: linkId,
    origen: opts.origenModulo,
  });
  if (errBanco) {
    console.error(`Tesorería · error registrando movimiento bancario espejo desde ${opts.origenModulo}:`, errBanco);
  }
}
