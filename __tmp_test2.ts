import { jsPDF } from 'jspdf'
import fs from 'fs'
// import the private function indirectly by rendering a full ficha via generarFichaMedidaPdf is heavier;
// instead just sanity check colorLegibleSobreBlanco output
import { colorLegibleSobreBlanco } from '@/lib/comprobantes-pdf/pdfHelpers'
console.log('e7e0cd ->', colorLegibleSobreBlanco('#e7e0cd'))
console.log('0F6E56 ->', colorLegibleSobreBlanco('#0F6E56'))
