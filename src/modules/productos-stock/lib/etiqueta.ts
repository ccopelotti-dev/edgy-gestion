// Generación de código interno para productos que no vienen con código de
// fábrica (EAN-13/UPC-A). No sigue el formato AFIP de códigos internos
// (prefijo 20-29 + dígito verificador) porque acá el código no se usa para
// facturación fiscal, solo para que el propio lector del negocio lo
// reconozca en un QR — cualquier texto único alcanza.
export function generarCodigoInterno(): string {
  const fecha = Date.now().toString(36).toUpperCase()
  const azar = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `ED-${fecha}-${azar}`
}
