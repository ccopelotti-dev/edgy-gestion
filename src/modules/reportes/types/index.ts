// Modelo de dominio del Módulo Reportes.
// Reportes no persiste nada propio -- es una capa de consultas + filtros +
// export sobre lo que ya generan otros módulos. Ver Diseno_Modulo_Reportes.md.
//
// Limitación real de arquitectura (motivo de las 2 fuentes de dato distintas
// más abajo): Reportes es un módulo separado, con su propio árbol de rutas
// -- no puede "espiar" el estado local (Context + localStorage) de otro
// módulo como Productos y Stock o Tesorería. Solo puede leer datos reales
// consultando Supabase directo. Hoy únicamente Productos, Rubros y
// Servicios tienen tabla real (ver 0008/0010/0011) -- Tesorería, Ventas y
// Compras siguen 100% en localStorage, sin ninguna tabla que este módulo
// pueda consultar. Por eso:
//   - Inventario: datos REALES (consulta Supabase en el momento)
//   - Financiero / Gestión: datos DE EJEMPLO, estáticos, etiquetados como
//     tales en la UI -- dejan de serlo cuando Tesorería/Ventas/Compras
//     tengan su propia tabla
//   - Contable: "próximamente" -- el módulo ni existe todavía

export type CategoriaReporte = 'inventario' | 'financiero' | 'gestion' | 'contable'

export interface DefinicionReporte {
  id: string
  nombre: string
  categoria: CategoriaReporte
  descripcion: string
  /** Si es false, la UI muestra un banner "Datos de ejemplo" -- el reporte
   * no lee ninguna tabla real todavía. */
  datosReales: boolean
}

/** Resultado de correr un reporte: filas + columnas, calculadas al vuelo.
 * No se persiste nunca -- ni siquiera los reportes con datosReales=false
 * "inventan" una tabla, son un array literal en el código. */
export interface ResultadoReporte {
  columnas: string[]
  filas: Record<string, string | number>[]
}

// ─── Filtros comunes a los reportes de Inventario ──────────────────────────

export interface FiltrosInventario {
  rubroId?: string
  busqueda?: string
}
