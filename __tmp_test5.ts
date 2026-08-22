import { generarComprobantePdf, type EmpresaParaPdf, type ComprobanteParaPdf } from './src/lib/comprobantes-pdf/generarComprobantePdf'

async function main() {
  const empresa: EmpresaParaPdf = {
    nombre: 'Punto Tex',
    cuit: '20-22701473-4',
    direccion: 'Quemu Quemu 3380',
    telefono: '11-5555-5555',
    logoUrl: null,
    colorMarca: '#0F6E56',
  }
  const comprobante: ComprobanteParaPdf = {
    tipoLabel: 'Presupuesto',
    numero: 'PRE-00012',
    fecha: '20/08/2026',
    clienteNombre: 'Carlos Copelotti',
    items: [
      { descripcion: 'Cortina Roller Blackout 1.30 x 1.42', cantidad: 1, precioUnitario: 45000, subtotal: 45000 },
    ],
    subtotal: 45000,
    total: 54450,
    notas: 'Presupuesto válido por 15 días.',
  }
  await generarComprobantePdf(empresa, comprobante, '/tmp/test_presupuesto_migrado')
}
main().catch((e) => { console.error(e); process.exit(1) })
