// Helper compartido para armar links de WhatsApp (`wa.me`).
//
// Mismo criterio de normalización que ya usaban -- cada uno por su
// lado -- Presupuestos.tsx (Ventas) y Cotizaciones.tsx/OrdenesCompra.tsx
// (Compras): se sacan todos los caracteres no numéricos del teléfono,
// sin anteponer código de país -- el número se usa tal cual está
// cargado en la ficha del cliente/proveedor/contacto.
//
// Fase 22d: primer uso fuera de esos tres, para el aviso de "pedido en
// camino" desde Ordenes.tsx -- se extrae acá para no duplicarlo una
// cuarta vez.
export function armarLinkWhatsapp(telefono: string, texto: string): string {
  const soloDigitos = telefono.replace(/\D/g, '');
  return `https://wa.me/${soloDigitos}?text=${encodeURIComponent(texto)}`;
}
