import type { Modulo } from '@/types'

interface ModuloActivo extends Modulo {
  activo: boolean
}

// Fase 8d (auditoría de conexiones Ventas↔Productos): el motor de
// Órdenes de Venta (ordenes_venta, Fase 8a/8b/8c) es el mismo para
// cualquier rubro -- lo único que cambia por Kit es la ETIQUETA que ve
// el operador, nunca el modelo de datos ni la lógica. En Gastronomía
// "Orden de Venta" no es un término que use nadie -- ahí se dice
// "Comanda" (que ya es un pedido de mesa, ver comandas-cocina, por
// eso ese módulo pasó a decir "Comanda de salón" en pantalla, para no
// pisarse con esta).
//
// Se define "tiene Kit Gastronómico" como tener el módulo
// comandas-cocina activo -- es el módulo más representativo del kit y
// ya es lo que usa el resto de la auditoría (Fase 7a/7b) como señal
// de "este cliente es gastronómico".
//
// Todavía no hay ninguna pantalla que use esto (la primera va a ser
// el listado/detalle de Órdenes de Venta de la Fase 8e) -- este
// archivo es el mecanismo compartido para que esa pantalla, y
// cualquier otra que necesite nombrar una orden de venta, no tengan
// que reinventar el criterio cada vez.

export function tieneKitGastronomico(modulosActivos: ModuloActivo[]): boolean {
  return modulosActivos.some((m) => m.slug === 'comandas-cocina' && m.activo)
}

export interface TerminologiaOrdenVenta {
  singular: string
  plural: string
}

export function terminologiaOrdenVenta(modulosActivos: ModuloActivo[]): TerminologiaOrdenVenta {
  if (tieneKitGastronomico(modulosActivos)) {
    return { singular: 'Comanda', plural: 'Comandas' }
  }
  return { singular: 'Orden de venta', plural: 'Órdenes de venta' }
}
