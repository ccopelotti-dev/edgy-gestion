// Helper compartido para armar links de WhatsApp (`wa.me`).
//
// Fase 50d (28/08, a pedido de Carlos): antes cada uno de los cuatro
// lugares que arman un link de WhatsApp (Presupuestos.tsx en Ventas,
// Cotizaciones.tsx/OrdenesCompra.tsx en Compras, y este mismo archivo)
// solo sacaba los caracteres no numéricos y usaba el teléfono TAL CUAL
// está cargado en la ficha -- si el cliente/proveedor lo cargó en
// formato local (ej. "2945464634", sin el código de país), el link
// salía roto o WhatsApp no encontraba el contacto. Se detectó con un
// caso real: un cliente de Punto Tex cargado como "2945464634" en vez
// de "+54 9 2945 46-4634".
//
// `normalizarTelefonoArgentina` centraliza la regla acá (y en su
// equivalente del lado del backend, `netlify/functions/enviar-documento-whatsapp.js`,
// que no puede importar este archivo por ser un runtime aparte -- se
// mantienen las dos copias en sync a mano) para que CUALQUIER lugar que
// arme un link de WhatsApp o mande un mensaje por la API de Evolution
// use el mismo criterio, sin duplicarlo de nuevo. No se toca el dato
// guardado en la ficha (se sigue mostrando tal cual lo cargó el
// usuario) -- la normalización es solo al momento de mandar.
export function normalizarTelefonoArgentina(telefonoRaw: string): string {
  let d = telefonoRaw.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = d.slice(1);
  // WhatsApp exige el "9" después del código de país (54) para
  // celulares de Argentina, aunque para marcar normalmente no se use.
  if (d.startsWith('549')) return d;
  if (d.startsWith('54')) return '549' + d.slice(2);
  return '549' + d;
}

// Fase 22d: primer uso fuera de esos tres, para el aviso de "pedido en
// camino" desde Ordenes.tsx -- se extrae acá para no duplicarlo una
// cuarta vez.
export function armarLinkWhatsapp(telefono: string, texto: string): string {
  const soloDigitos = normalizarTelefonoArgentina(telefono);
  return `https://wa.me/${soloDigitos}?text=${encodeURIComponent(texto)}`;
}
