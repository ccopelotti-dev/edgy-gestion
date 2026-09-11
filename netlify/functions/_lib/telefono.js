// Fase 75m -- extraído de enviar-documento-whatsapp.js (Fase 50d) para
// reusarlo también en acadeu-sincronizar.js sin duplicar la lógica.
// WhatsApp exige el "9" después del 54 para celulares de Argentina
// (aunque para marcar normalmente no se use): si ya viene con 549 se
// deja igual, si viene con 54 (sin 9) se inserta, y si no tiene código
// de país se asume Argentina + celular. También limpia espacios/guiones
// (ej. "2954 74-8744" tal como se carga en la ficha del integrante).
export function normalizarTelefonoArgentina(telefonoRaw) {
  let d = String(telefonoRaw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('0')) d = d.slice(1)
  if (d.startsWith('549')) return d
  if (d.startsWith('54')) return '549' + d.slice(2)
  return '549' + d
}
