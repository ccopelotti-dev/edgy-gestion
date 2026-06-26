import type {
  BankAccount,
  BankMovement,
  CajaMovement,
  Cheque,
  TreasuryState,
} from '../types'

const bankAccounts: BankAccount[] = [
  { id: 'acc-galicia', banco: 'Banco Galicia', alias: 'distrib.norte.gali', numero: '4012-3 099-7', cbu: '0070099530004012309971', tipo: 'cuenta_corriente', moneda: 'ARS', saldoInicial: 1_850_000 },
  { id: 'acc-santander', banco: 'Santander', alias: 'distrib.norte.sant', numero: '201-005418/2', cbu: '0720201588000005418021', tipo: 'cuenta_corriente', moneda: 'ARS', saldoInicial: 940_000 },
  { id: 'acc-nacion', banco: 'Banco Nación', alias: 'distrib.norte.bna', numero: '0810-441002-3', cbu: '0110441030044100020035', tipo: 'caja_ahorro', moneda: 'ARS', saldoInicial: 425_000 },
  { id: 'acc-mp', banco: 'MercadoPago', alias: 'distribuidoranorte.mp', numero: 'CVU 000003100', cbu: '0000003100098765432109', tipo: 'caja_ahorro', moneda: 'ARS', saldoInicial: 312_500 },
]

const cajaMovements: CajaMovement[] = [
  { id: 'cm-1', fecha: '2026-06-02', tipo: 'ingreso', concepto: 'Venta mostrador #4471', categoria: 'Ventas', medioPago: 'efectivo', monto: 84_500 },
  { id: 'cm-2', fecha: '2026-06-02', tipo: 'ingreso', concepto: 'Venta mostrador #4472', categoria: 'Ventas', medioPago: 'tarjeta', monto: 156_300 },
  { id: 'cm-3', fecha: '2026-06-02', tipo: 'egreso', concepto: 'Flete entrega zona sur', categoria: 'Gastos varios', medioPago: 'efectivo', monto: 28_000 },
  { id: 'cm-4', fecha: '2026-06-03', tipo: 'ingreso', concepto: 'Cobranza Kiosco El Sol', categoria: 'Cobranza clientes', medioPago: 'mercadopago', monto: 213_900 },
  { id: 'cm-5', fecha: '2026-06-03', tipo: 'ingreso', concepto: 'Venta mostrador #4480', categoria: 'Ventas', medioPago: 'efectivo', monto: 47_200 },
  { id: 'cm-6', fecha: '2026-06-03', tipo: 'egreso', concepto: 'Combustible utilitario', categoria: 'Gastos varios', medioPago: 'tarjeta', monto: 65_000 },
  { id: 'cm-7', fecha: '2026-06-04', tipo: 'ingreso', concepto: 'Cobranza Almacén Don José', categoria: 'Cobranza clientes', medioPago: 'cheque', monto: 480_000 },
  { id: 'cm-8', fecha: '2026-06-04', tipo: 'egreso', concepto: 'Pago proveedor La Serenísima', categoria: 'Pago a proveedores', medioPago: 'transferencia', monto: 392_000 },
  { id: 'cm-9', fecha: '2026-06-04', tipo: 'egreso', concepto: 'Adelanto sueldo R. Gómez', categoria: 'Sueldos y jornales', medioPago: 'efectivo', monto: 120_000 },
  { id: 'cm-10', fecha: '2026-06-05', tipo: 'ingreso', concepto: 'Venta mayorista Supermercado Líder', categoria: 'Ventas', medioPago: 'transferencia', monto: 1_245_000 },
  { id: 'cm-11', fecha: '2026-06-05', tipo: 'ingreso', concepto: 'Venta mostrador #4495', categoria: 'Ventas', medioPago: 'efectivo', monto: 38_700 },
  { id: 'cm-12', fecha: '2026-06-05', tipo: 'egreso', concepto: 'Pago Edenor', categoria: 'Servicios', medioPago: 'mercadopago', monto: 94_300 },
  { id: 'cm-13', fecha: '2026-06-06', tipo: 'ingreso', concepto: 'Cobranza Despensa Norte', categoria: 'Cobranza clientes', medioPago: 'mercadopago', monto: 167_400 },
  { id: 'cm-14', fecha: '2026-06-06', tipo: 'egreso', concepto: 'Compra mercadería bebidas', categoria: 'Mercadería', medioPago: 'cheque', monto: 620_000 },
  { id: 'cm-15', fecha: '2026-06-06', tipo: 'egreso', concepto: 'Retiro a banco (depósito efectivo)', categoria: 'Gastos varios', medioPago: 'efectivo', monto: 150_000 },
  { id: 'cm-16', fecha: '2026-06-07', tipo: 'ingreso', concepto: 'Venta mostrador #4510', categoria: 'Ventas', medioPago: 'tarjeta', monto: 98_600 },
  { id: 'cm-17', fecha: '2026-06-07', tipo: 'ingreso', concepto: 'Venta mostrador #4511', categoria: 'Ventas', medioPago: 'efectivo', monto: 52_300 },
  { id: 'cm-18', fecha: '2026-06-07', tipo: 'egreso', concepto: 'Librería e insumos oficina', categoria: 'Gastos varios', medioPago: 'efectivo', monto: 19_800 },
]

const bankMovements: BankMovement[] = [
  { id: 'bm-1', cuentaId: 'acc-galicia', fecha: '2026-06-02', tipo: 'ingreso', concepto: 'Transferencia cliente Mayorista Sur', categoria: 'Cobranza clientes', medioPago: 'transferencia', monto: 1_245_000 },
  { id: 'bm-2', cuentaId: 'acc-galicia', fecha: '2026-06-03', tipo: 'egreso', concepto: 'Pago AFIP - IVA mensual', categoria: 'Impuestos (AFIP/ARCA)', medioPago: 'transferencia', monto: 538_200 },
  { id: 'bm-3', cuentaId: 'acc-galicia', fecha: '2026-06-04', tipo: 'egreso', concepto: 'Pago proveedor Molinos', categoria: 'Pago a proveedores', medioPago: 'transferencia', monto: 410_000 },
  { id: 'bm-4', cuentaId: 'acc-galicia', fecha: '2026-06-05', tipo: 'egreso', concepto: 'Acreditación sueldos quincena', categoria: 'Sueldos y jornales', medioPago: 'transferencia', monto: 1_120_000 },
  { id: 'bm-5', cuentaId: 'acc-santander', fecha: '2026-06-02', tipo: 'ingreso', concepto: 'Depósito cheque Almacén Don José', categoria: 'Cobranza clientes', medioPago: 'cheque', monto: 480_000, linkId: 'lnk-seed-1', origen: 'cheque' },
  { id: 'bm-6', cuentaId: 'acc-santander', fecha: '2026-06-04', tipo: 'egreso', concepto: 'Pago alquiler depósito', categoria: 'Alquiler', medioPago: 'transferencia', monto: 385_000 },
  { id: 'bm-7', cuentaId: 'acc-santander', fecha: '2026-06-06', tipo: 'ingreso', concepto: 'Transferencia Distribuidora Este', categoria: 'Cobranza clientes', medioPago: 'transferencia', monto: 672_000 },
  { id: 'bm-8', cuentaId: 'acc-nacion', fecha: '2026-06-03', tipo: 'egreso', concepto: 'Débito automático seguro', categoria: 'Servicios', medioPago: 'transferencia', monto: 73_400 },
  { id: 'bm-9', cuentaId: 'acc-nacion', fecha: '2026-06-06', tipo: 'ingreso', concepto: 'Depósito efectivo recaudación', categoria: 'Ventas', medioPago: 'efectivo', monto: 150_000 },
  { id: 'bm-10', cuentaId: 'acc-mp', fecha: '2026-06-03', tipo: 'ingreso', concepto: 'Cobros QR MercadoPago', categoria: 'Ventas', medioPago: 'mercadopago', monto: 213_900 },
  { id: 'bm-11', cuentaId: 'acc-mp', fecha: '2026-06-05', tipo: 'egreso', concepto: 'Comisión MercadoPago', categoria: 'Servicios', medioPago: 'mercadopago', monto: 12_700 },
  { id: 'bm-12', cuentaId: 'acc-mp', fecha: '2026-06-06', tipo: 'ingreso', concepto: 'Cobros QR MercadoPago', categoria: 'Ventas', medioPago: 'mercadopago', monto: 167_400 },
  { id: 'bm-13', cuentaId: 'acc-galicia', fecha: '2026-05-30', tipo: 'ingreso', concepto: 'Cobro cheque N.º 11290345 — Despensa Norte', categoria: 'Cobranza clientes', medioPago: 'cheque', monto: 178_500, linkId: 'lnk-seed-4', origen: 'cheque' },
  { id: 'bm-14', cuentaId: 'acc-galicia', fecha: '2026-06-10', tipo: 'egreso', concepto: 'Pago cheque N.º 00120046 — La Serenísima S.A.', categoria: 'Pago a proveedores', medioPago: 'cheque', monto: 392_000, linkId: 'lnk-seed-8', origen: 'cheque' },
]

const cheques: Cheque[] = [
  { id: 'chq-1', tipo: 'recibido', numero: '20451123', banco: 'Banco Provincia', librador: 'Almacén Don José S.R.L.', fechaRecepcion: '2026-05-28', fechaCobro: '2026-06-02', monto: 480_000, estado: 'depositado', cuentaDepositoId: 'acc-santander', bankMovLinkId: 'lnk-seed-1' },
  { id: 'chq-2', tipo: 'recibido', numero: '88123004', banco: 'Banco Galicia', librador: 'Supermercado Líder S.A.', fechaRecepcion: '2026-06-01', fechaCobro: '2026-06-15', monto: 1_350_000, estado: 'en_cartera' },
  { id: 'chq-3', tipo: 'recibido', numero: '30567812', banco: 'BBVA', librador: 'Kiosco El Sol', fechaRecepcion: '2026-06-03', fechaCobro: '2026-06-20', monto: 215_000, estado: 'en_cartera' },
  { id: 'chq-4', tipo: 'recibido', numero: '11290345', banco: 'Banco Macro', librador: 'Despensa Norte', fechaRecepcion: '2026-05-20', fechaCobro: '2026-05-30', monto: 178_500, estado: 'cobrado', cuentaDepositoId: 'acc-galicia', bankMovLinkId: 'lnk-seed-4' },
  { id: 'chq-5', tipo: 'recibido', numero: '77001245', banco: 'Banco Credicoop', librador: 'Distribuidora Este S.A.', fechaRecepcion: '2026-05-22', fechaCobro: '2026-06-01', monto: 96_000, estado: 'rechazado' },
  { id: 'chq-6', tipo: 'recibido', numero: '45982310', banco: 'Santander', librador: 'Comercial La Estrella', fechaRecepcion: '2026-06-05', fechaCobro: '2026-06-28', monto: 540_000, estado: 'en_cartera' },
  { id: 'chq-7', tipo: 'emitido', numero: '00120045', banco: 'Banco Galicia', librador: 'Bebidas Andinas S.A.', fechaRecepcion: '2026-06-04', fechaCobro: '2026-06-18', monto: 620_000, estado: 'en_cartera', cuentaOrigenId: 'acc-galicia', notas: 'Pago mercadería bebidas' },
  { id: 'chq-8', tipo: 'emitido', numero: '00120046', banco: 'Banco Galicia', librador: 'La Serenísima S.A.', fechaRecepcion: '2026-05-29', fechaCobro: '2026-06-10', monto: 392_000, estado: 'cobrado', cuentaOrigenId: 'acc-galicia', bankMovLinkId: 'lnk-seed-8', notas: 'Pago proveedor lácteos' },
  { id: 'chq-9', tipo: 'emitido', numero: '00120047', banco: 'Santander', librador: 'Transporte Rápido S.A.', fechaRecepcion: '2026-06-05', fechaCobro: '2026-06-12', monto: 285_000, estado: 'en_cartera', cuentaOrigenId: 'acc-santander', notas: 'Flete mensual' },
  { id: 'chq-10', tipo: 'emitido', numero: '00120048', banco: 'Banco Galicia', librador: 'Insumos Pack S.R.L.', fechaRecepcion: '2026-06-06', fechaCobro: '2026-06-24', monto: 168_000, estado: 'en_cartera', cuentaOrigenId: 'acc-galicia', notas: 'Embalajes' },
]

export const seedState: TreasuryState = {
  cajaMovements,
  bankAccounts,
  bankMovements,
  cheques,
}
