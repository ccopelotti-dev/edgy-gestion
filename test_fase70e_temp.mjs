import { intentarCargarComprobante } from './netlify/functions/_lib/agenteComprobanteCompra.js';

function makeSupabaseMock({ proveedores = [], maxNumeroComprobante = 0, maxNumeroPago = 0 }) {
  const inserts = {};
  const record = (table, rows) => { (inserts[table] ||= []).push(...rows); };

  const chain = (table) => {
    const state = { table, filters: {}, order: null };
    const api = {
      select: (cols) => api,
      eq: (k, v) => { state.filters[k] = v; return api; },
      in: () => api,
      order: (col, opts) => { state.order = { col, opts }; return api; },
      limit: () => api,
      maybeSingle: async () => {
        if (table === 'comprobantes_hogar' || table === 'comprobantes_compra') {
          return { data: maxNumeroComprobante ? { numero: maxNumeroComprobante } : null, error: null };
        }
        if (table === 'pagos_hogar' || table === 'pagos_compra') {
          return { data: maxNumeroPago ? { numero: maxNumeroPago } : null, error: null };
        }
        return { data: null, error: null };
      },
      single: async () => {
        if (table === 'proveedores_hogar' || table === 'proveedores') {
          return { data: proveedores[0] || null, error: null };
        }
        return { data: null, error: null };
      },
      insert: (rows) => {
        record(table, rows);
        return {
          select: () => ({
            single: async () => {
              if (table === 'comprobantes_hogar' || table === 'comprobantes_compra') {
                return { data: { id: 'comp-1' }, error: null };
              }
              if (table === 'pagos_hogar' || table === 'pagos_compra') {
                return { data: { id: 'pago-1', numero: maxNumeroPago + 1 }, error: null };
              }
              return { data: { id: 'x' }, error: null };
            },
          }),
          then: (resolve) => resolve({ error: null }),
        };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return api;
  };

  const admin = {
    from: (table) => {
      if (table === 'proveedores_hogar' && proveedores.length) {
        return {
          select: () => ({ eq: async () => ({ data: proveedores, error: null }) }),
        };
      }
      return chain(table);
    },
  };
  return { admin, inserts };
}

async function run() {
  const proveedor = { id: 'prov-1', nombre: 'Fortes Pascual Gerardo', nombre_fantasia: 'Calidad frutas y verduras', cuit: '20938996688' };

  // Caso 1: efectivo (contado) -- debe auto-pagar
  {
    const { admin, inserts } = makeSupabaseMock({ proveedores: [proveedor] });
    const datosExtraidos = {
      tipo: 'factura',
      total: 32410,
      fecha: '2026-08-31',
      formaPagoDetectada: 'efectivo',
      proveedorCuit: '20938996688',
      items: [{ descripcion: 'Frutas y verduras', cantidad: 1, precioUnitario: 32410 }],
    };
    const resultado = await intentarCargarComprobante({
      supabaseAdmin: admin,
      clienteId: 'cliente-1',
      comprobanteRecibidoId: 'rec-1',
      datosExtraidos,
      destino: 'hogar',
    });
    console.log('--- CASO 1 (efectivo) ---');
    console.log('resultado:', JSON.stringify(resultado));
    console.log('pagos_hogar inserts:', JSON.stringify(inserts['pagos_hogar'] || []));
    console.log('pago_hogar_imputaciones inserts:', JSON.stringify(inserts['pago_hogar_imputaciones'] || []));
    console.log('movimientos_caja inserts:', JSON.stringify(inserts['movimientos_caja'] || []));
    console.log('comprobantes_hogar inserts:', JSON.stringify(inserts['comprobantes_hogar'] || []));
    if (!resultado.creado) throw new Error('Caso 1: esperaba creado=true');
    if (!resultado.pagadoAutomaticamente) throw new Error('Caso 1: esperaba pagadoAutomaticamente=true');
    const filaComp = (inserts['comprobantes_hogar'] || [])[0];
    if (!filaComp || filaComp.estado !== 'pagado' || filaComp.monto_pagado !== 32410 || filaComp.saldo_pendiente !== 0) {
      throw new Error('Caso 1: comprobante no quedo marcado pagado correctamente: ' + JSON.stringify(filaComp));
    }
    if (!(inserts['pagos_hogar'] || []).length) throw new Error('Caso 1: no se creo el pago');
    if (!(inserts['pago_hogar_imputaciones'] || []).length) throw new Error('Caso 1: no se creo la imputacion');
    if (!(inserts['movimientos_caja'] || []).length) throw new Error('Caso 1: no se creo el movimiento de caja');
  }

  // Caso 2: cuenta_corriente -- NO debe auto-pagar
  {
    const { admin, inserts } = makeSupabaseMock({ proveedores: [proveedor] });
    const datosExtraidos = {
      tipo: 'factura',
      total: 100000,
      fecha: '2026-08-31',
      formaPagoDetectada: 'cuenta corriente',
      proveedorCuit: '20938996688',
      items: [{ descripcion: 'Compra a credito', cantidad: 1, precioUnitario: 100000 }],
    };
    const resultado = await intentarCargarComprobante({
      supabaseAdmin: admin,
      clienteId: 'cliente-1',
      comprobanteRecibidoId: 'rec-2',
      datosExtraidos,
      destino: 'hogar',
    });
    console.log('--- CASO 2 (cuenta corriente) ---');
    console.log('resultado:', JSON.stringify(resultado));
    if (!resultado.creado) throw new Error('Caso 2: esperaba creado=true');
    if (resultado.pagadoAutomaticamente) throw new Error('Caso 2: NO esperaba pagadoAutomaticamente');
    if ((inserts['pagos_hogar'] || []).length) throw new Error('Caso 2: no deberia haber creado un pago');
    if ((inserts['movimientos_caja'] || []).length) throw new Error('Caso 2: no deberia haber tocado Tesoreria');
    const filaComp = (inserts['comprobantes_hogar'] || [])[0];
    if (!filaComp || filaComp.estado !== 'pendiente' || filaComp.monto_pagado !== 0 || filaComp.saldo_pendiente !== 100000) {
      throw new Error('Caso 2: comprobante deberia seguir pendiente: ' + JSON.stringify(filaComp));
    }
  }

  console.log('\nTODOS LOS CASOS OK');
}

run().catch((e) => { console.error('FALLO:', e); process.exit(1); });
