// ============================================================
// Metadata de "kits" (verticales no-core)
// Edgy Gestión · Fase 25
//
// Un solo lugar compartido por Sidebar.tsx, ModulosListado.tsx (panel
// interno) y Paso3Modulos.tsx (wizard de alta de cliente) para
// etiqueta/color por `vertical` -- cuando se sume un kit nuevo (ej.
// 'transporte' para un cliente de logística) alcanza con agregar una
// entrada acá, no hay que tocar los tres archivos por separado.
//
// `vertical` viene de la tabla `modulos` (columna `vertical`, texto
// libre desde el día 1 -- ver 0001_init.sql): 'core' es el núcleo
// administrativo (Tesorería, Ventas, Compras, etc.), cualquier otro
// valor identifica un kit vendible por separado. Existen 'gastronomico'
// y 'a-medida' (Fichas de medida -- Fase 0082, primer cliente Punto
// Tex); los kits sin entrada acá todavía (futuros) caen en un
// label/color genérico en vez de romper o quedar sin agrupar.
// ============================================================

export const LABEL_POR_VERTICAL: Record<string, string> = {
  core: 'Núcleo',
  gastronomico: 'Kit Gastronómico',
  'a-medida': 'Kit A Medida',
}

export const COLOR_POR_VERTICAL: Record<string, string> = {
  gastronomico: '#F97316', // naranja cálido
  'a-medida': '#0D9488', // teal
}

export const COLOR_KIT_DEFAULT = '#64748B' // slate -- fallback para kits futuros sin color asignado

export function labelDeVertical(vertical: string): string {
  return LABEL_POR_VERTICAL[vertical] ?? vertical.charAt(0).toUpperCase() + vertical.slice(1)
}

export function colorDeKit(vertical: string): string {
  return COLOR_POR_VERTICAL[vertical] ?? COLOR_KIT_DEFAULT
}
