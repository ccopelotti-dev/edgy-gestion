const { jsPDF } = require('jspdf');

function run(letraFiscal, conAfip) {
  const doc = new jsPDF({ unit: 'mm', format: [200, 150], orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  console.log('page size', pageWidth, pageHeight);

  const marginX = 8;
  const color = '#0F6E56';
  const anchoBanda = 18;
  doc.setFillColor(color);
  doc.rect(0, 0, pageWidth, anchoBanda, 'F');
  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Punto Tex SRL', marginX, 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Av. Siempre Viva 123, CABA', marginX, 14.5);

  let y = anchoBanda + 3;

  if (letraFiscal) {
    const yBox = y;
    const hBox = 28;
    const xColA = marginX;
    const xDivisor1 = marginX + 94;
    const xDivisor2 = xDivisor1 + 22;
    const xColBFin = pageWidth - marginX;

    doc.setDrawColor(150,150,150);
    doc.setLineWidth(0.35);
    doc.rect(xColA, yBox, xColBFin - xColA, hBox, 'S');
    doc.line(xDivisor1, yBox, xDivisor1, yBox + hBox);
    doc.line(xDivisor2, yBox, xDivisor2, yBox + hBox);

    let yA = yBox + 6;
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor('#222222');
    doc.text('Punto Tex SRL', xColA+3, yA);
    yA += 5.5;
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor('#555555');
    doc.text('Av. Siempre Viva 123, CABA', xColA+3, yA);
    yA += 5.5;
    doc.text('IVA Responsable Inscripto', xColA+3, yA);

    const xLetra = (xDivisor1 + xDivisor2)/2;
    doc.setFont('helvetica','bold'); doc.setFontSize(22); doc.setTextColor('#222222');
    doc.text(letraFiscal, xLetra, yBox+18, {align:'center'});
    doc.setFontSize(6); doc.setFont('helvetica','normal'); doc.setTextColor('#777777');
    doc.text(conAfip ? 'COD. 06' : 'S/N', xLetra, yBox+hBox-3, {align:'center'});

    const xColB = xDivisor2 + 3;
    let yB = yBox + 6;
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor('#222222');
    doc.text('FACTURA', xColB, yB);
    yB += 5.5;
    doc.setFontSize(9);
    doc.text('N.º ' + (conAfip ? '0001-00000094' : 'FAC-00042'), xColB, yB);
    yB += 5;
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor('#555555');
    doc.text('Fecha: 15/08/2026', xColB, yB);
    yB += 4.5;
    doc.setFontSize(6.5);
    doc.text('CUIT: 30-71234567-8', xColB, yB);
    yB += 4;
    doc.text('IIBB N.º 12345678 (CABA) · Inicio activ. 01/01/2020', xColB, yB);

    y = yBox + hBox + 6;
    console.log('xColBFin', xColBFin, 'right edge check', xColBFin <= pageWidth);
  }

  doc.setTextColor('#3a3a3a'); doc.setFont('helvetica','normal'); doc.setFontSize(9.5);
  doc.text('Cliente: Consumidor Final', marginX, y);
  doc.text('Cond. de venta: Efectivo', pageWidth - marginX, y, {align:'right'});
  y += 5;

  console.log('y after header block:', y, 'pageHeight', pageHeight, 'remaining', pageHeight - y);

  const out = doc.output('arraybuffer');
  console.log('PDF byte length:', out.byteLength, 'letraFiscal:', letraFiscal, 'conAfip:', conAfip);
}

run('B', true);
console.log('---');
run('X', false);
console.log('---');
run(undefined, false);
