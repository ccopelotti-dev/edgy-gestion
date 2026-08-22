import { generarComprobantePdf, type EmpresaParaPdf, type ComprobanteParaPdf } from './src/lib/comprobantes-pdf/generarComprobantePdf'
import fs from 'fs'

// Simular jsPDF.save para capturar el buffer en Node (no hay DOM/file
// download acá) -- parcheamos doc.save vía imprimirOGuardarPdf no es
// directo, así que en cambio monkeypatcheamos globalThis.

async function main() {
  const empresa: EmpresaParaPdf = {
    nombre: 'Punto Tex',
    cuit: '20-22701473-4',
    direccion: 'Quemu Quemu 3380', // domicilio FISCAL -- no debería aparecer
    telefono: '11-5555-5555',
    logoUrl: null,
    colorMarca: '#e7e0cd',
    ingresosBrutosCondicion: 'inscripto_convenio_multilateral',
    ingresosBrutosNumero: '901-123456-7',
    inicioActividades: '2015-03-01',
    provincia: 'Buenos Aires',
    titular: 'Copelotti Marina Alejandra',
    sitioWeb: 'puntotex.com.ar',
    instagram: '@puntotex',
    whatsappComercial: '11-4444-3333',
  }

  const comprobante: ComprobanteParaPdf = {
    tipoLabel: 'Factura B',
    numero: 'FAC-00007',
    fecha: '20/08/2026',
    fechaIso: '2026-08-20',
    clienteNombre: 'Carlos Copelotti',
    clienteDocumento: 'CUIT 20227014734',
    clienteDireccion: 'Av. Siempre Viva 123',
    clienteTelefono: '11-2222-1111',
    clienteCondicionIva: 'Consumidor Final',
    puntoVentaDireccion: 'Av. Corrientes 1234, CABA', // dirección del PUNTO DE VENTA -- ESTA debe verse
    condicionVenta: 'Contado',
    items: [
      { descripcion: 'Cortina Roller Blackout 1.30 x 1.42', cantidad: 1, precioUnitario: 45000, subtotal: 45000 },
      { descripcion: 'Instalación', cantidad: 1, precioUnitario: 8000, subtotal: 8000 },
    ],
    subtotal: 53000,
    montoIva: 11130,
    total: 64130,
    notas: 'Gracias por su compra.',
    letraFiscal: 'B',
    afip: {
      cae: '75312345678901',
      vencimientoCae: '2026-09-01',
      puntoVenta: 5,
      tipoComprobanteAfip: 6,
      numeroComprobante: 7,
      docTipoReceptor: 96,
      tipoFiscal: 'B',
      condicionIvaEmisor: 'responsable_inscripto',
    },
  }

  await generarComprobantePdf(empresa, comprobante, '/tmp/test_motor_compartido')
}

main().catch((e) => { console.error(e); process.exit(1) })
