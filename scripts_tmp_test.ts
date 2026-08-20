import { jsPDF } from 'jspdf'
import { dibujarEncabezadoConDatosFiscales, dibujarPie, formatNumeroConPuntoVenta } from '@/lib/comprobantes-pdf/pdfHelpers'
import fs from 'fs'

async function main() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const empresa = {
    nombre: 'Punto Tex',
    cuit: '23231860894',
    direccion: 'Quemu Quemu 3380',
    telefono: '2954 231003',
    logoUrl: 'https://ipnufyqwbjbocsezdkiw.supabase.co/storage/v1/object/public/logos-clientes/1786438603747-WhatsApp%20Image%202026-08-03%20at%2019.26.41.jpeg',
    colorMarca: '#e7e0cd',
    ingresosBrutosCondicion: 'inscripto_convenio_multilateral',
    ingresosBrutosNumero: '197658/8',
    inicioActividades: '2014-01-01',
    provincia: 'La Pampa',
    sitioWeb: 'www.puntotex.com',
    instagram: '@Puntotexlp',
    whatsappComercial: '+542954633972',
  }
  const numero = formatNumeroConPuntoVenta('0005', 1)
  const { y, color } = await dibujarEncabezadoConDatosFiscales(
    doc,
    empresa,
    'Toma de pedidos',
    numero,
    '20/08/2026',
    'responsable_inscripto',
  )
  doc.setFontSize(10)
  doc.setTextColor('#333333')
  doc.text('Cliente: Juan Perez', 15, y + 5)
  dibujarPie(doc, empresa)
  const buf = Buffer.from(doc.output('arraybuffer'))
  fs.writeFileSync('/tmp/test_ficha_header.pdf', buf)
  console.log('OK, color=', color, 'y=', y)
}
main()
