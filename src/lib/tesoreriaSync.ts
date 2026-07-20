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
  /**
   * Cuenta bancaria real a debitar/acreditar (Orden de Pago, Fase 22) --
   * cuando se pasa explícita, se usa tal cual y NO se auto-selecciona "la
   * primera cuenta del cliente". Si se omite, se mantiene el comportamiento
   * anterior (auto-selección) por compatibilidad con los llamadores
   * existentes que todavía no permiten elegir cuenta.
   */
  cuentaBancariaId?: string;
  /** Id de la entidad de origen (ej. PagoCompra) para trazabilidad. */
  origenId?: string;
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

  let cuentaId = opts.cuentaBancariaId;
  if (!cuentaId) {
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
    cuentaId = cuentas?.[0]?.id;
  }

  if (!cuentaId) {
    console.warn(
      `Tesorería · no se generó el movimiento bancario espejo (origen: ${opts.origenModulo}, medio: "${medio}") porque no hay ninguna cuenta bancaria cargada. Cargá una cuenta en Tesorería > Bancos.`,
    );
    return;
  }

  const { error: errBanco } = await supabase.from('movimientos_bancarios').insert({
    id: crypto.randomUUID(),
    cliente_id: opts.clienteId,
    cuenta_id: cuentaId,
    fecha: opts.fecha,
    tipo: opts.tipo,
    concepto: opts.concepto,
    categoria: opts.categoria,
    medio_pago: medio,
    monto: opts.monto,
    link_id: linkId,
    origen: opts.origenModulo,
    origen_id: opts.origenId ?? null,
  });
  if (errBanco) {
    console.error(`Tesorería · error registrando movimiento bancario espejo desde ${opts.origenModulo}:`, errBanco);
  }
}

// ─── Cuentas bancarias (para elegir cuenta real al confirmar un pago) ────

export interface CuentaBancariaOpcion {
  id: string;
  banco: string;
  alias: string;
  numero: string;
}

export async function listarCuentasBancarias(clienteId: string): Promise<CuentaBancariaOpcion[]> {
  const { data, error } = await supabase
    .from('cuentas_bancarias')
    .select('id, banco, alias, numero')
    .eq('cliente_id', clienteId)
    .order('created_at');
  if (error) {
    console.error('Tesorería · error listando cuentas bancarias:', error);
    return [];
  }
  return (data ?? []) as CuentaBancariaOpcion[];
}

// ─── Cheque emitido a un proveedor (Orden de Pago, Fase 22) ──────────────
//
// Se crea directo en estado 'en_cartera' ("a pagar") -- el débito bancario
// real recién ocurre cuando alguien lo marca 'cobrado' en Tesorería >
// Cheques (mismo criterio que ya usa ese módulo: chequeAfectaBanco solo es
// true para emitido+cobrado). Acá solo dejamos el cheque cargado con todos
// sus datos, incluida la cuenta de origen, para que esa transición futura
// no tenga que pedir nada más.

export interface EmitirChequeOpts {
  id: string;
  clienteId: string;
  numero: string;
  banco: string;
  /** Beneficiario -- a nombre de quién se emite (el proveedor). */
  beneficiario: string;
  fechaEmision: string;
  fechaPago: string;
  monto: number;
  cuentaOrigenId: string;
  notas?: string;
  origenId?: string;
}

export async function emitirChequeProveedor(opts: EmitirChequeOpts): Promise<void> {
  const { error } = await supabase.from('cheques').insert({
    id: opts.id,
    cliente_id: opts.clienteId,
    tipo: 'emitido',
    numero: opts.numero,
    banco: opts.banco,
    librador: opts.beneficiario,
    fecha_recepcion: opts.fechaEmision,
    fecha_cobro: opts.fechaPago,
    monto: opts.monto,
    estado: 'en_cartera',
    cuenta_origen_id: opts.cuentaOrigenId,
    notas: opts.notas ?? null,
    origen_modulo: 'compras',
    origen_id: opts.origenId ?? null,
  });
  if (error) {
    console.error('Tesorería · error emitiendo cheque a proveedor:', error);
  }
}
