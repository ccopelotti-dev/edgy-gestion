import { generarReciboPdf, type ReciboParaPdf } from './src/lib/comprobantes-pdf/generarReciboPdf'
import type { EmpresaParaPdf } from './src/lib/comprobantes-pdf/pdfHelpers'

async function main() {
  const empresa: EmpresaParaPdf = {
    nombre: 'Punto Tex',
    cuit: '23-23186089-4',
    direccion: 'Quemu Quemu 3380', // fiscal -- NO debe aparecer
    telefono: '11-5555-5555',
    logoUrl: null,
    colorMarca: '#e7e0cd',
  }
  const recibo: ReciboParaPdf = {
    numero: 'COB-00003',
    fecha: '20/08/2026',
    recibidoDe: 'Carlos Copelotti',
    recibidoDeDocumento: '20-22701473-4',
    monto: 3384.02,
    medioPagoLabel: 'Efectivo',
    imputaciones: [
      { comprobante: 'FAC-00005', montoImputado: 2417.38 },
      { comprobante: 'FAC-00006', montoImputado: 483.48 },
      { comprobante: 'FAC-00007', montoImputado: 483.17 },
    ],
  }
  await generarReciboPdf(empresa, recibo, '/tmp/test_recibo_migrado')
}
main().catch((e) => { console.error(e); process.exit(1) })
