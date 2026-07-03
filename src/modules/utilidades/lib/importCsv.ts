// Parser y validación de CSV para Importación masiva.
//
// Deliberadamente simple: no es una librería de parsing CSV completa (no
// maneja campos multilínea entre comillas, por ejemplo) -- alcanza para el
// caso de uso real (planillas de Excel exportadas a CSV, una fila por
// registro, sin saltos de línea dentro de una celda). Acepta separador por
// coma o punto y coma (Excel exporta distinto según la configuración
// regional -- ver instrucciones de Contabilium, que mencionan ambos).

import type { EntidadImportable, FilaImportacion } from '../types'

// ─── Parser ─────────────────────────────────────────────────────────────────

export interface CsvParseado {
  headers: string[]
  filas: string[][]
}

function detectarSeparador(primeraLinea: string): string {
  const comas = (primeraLinea.match(/,/g) ?? []).length
  const puntoYComa = (primeraLinea.match(/;/g) ?? []).length
  return puntoYComa > comas ? ';' : ','
}

function parsearLinea(linea: string, separador: string): string[] {
  // Soporta campos entre comillas dobles con el separador adentro (ej.
  // "Empresa, S.A."), pero no comillas escapadas ("") ni saltos de línea
  // dentro del campo.
  const resultado: string[] = []
  let actual = ''
  let entreComillas = false

  for (let i = 0; i < linea.length; i++) {
    const char = linea[i]
    if (char === '"') {
      entreComillas = !entreComillas
    } else if (char === separador && !entreComillas) {
      resultado.push(actual.trim())
      actual = ''
    } else {
      actual += char
    }
  }
  resultado.push(actual.trim())
  return resultado
}

export function parsearCSV(texto: string): CsvParseado {
  const lineas = texto
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lineas.length === 0) {
    return { headers: [], filas: [] }
  }

  const separador = detectarSeparador(lineas[0])
  const headers = parsearLinea(lineas[0], separador).map((h) => h.trim())
  const filas = lineas.slice(1).map((l) => parsearLinea(l, separador))

  return { headers, filas }
}

/** Convierte una fila (array posicional) + headers en un objeto { columna: valor },
 * case-insensitive respecto de los nombres de columna esperados. */
function filaAObjeto(headers: string[], fila: string[]): Record<string, string> {
  const obj: Record<string, string> = {}
  headers.forEach((h, idx) => {
    obj[h.toLowerCase()] = (fila[idx] ?? '').trim()
  })
  return obj
}

// ─── Esquemas por entidad (columnas esperadas, para plantilla/ejemplo) ──────

interface ColumnaEsquema {
  nombre: string
  requerida: boolean
  ejemplo: string
}

const ESQUEMAS: Record<EntidadImportable, ColumnaEsquema[]> = {
  productos: [
    { nombre: 'Nombre', requerida: true, ejemplo: 'Coca Cola 500ml' },
    { nombre: 'Codigo', requerida: false, ejemplo: 'COC-500' },
    { nombre: 'Descripcion', requerida: false, ejemplo: 'Gaseosa cola 500ml' },
    { nombre: 'Rubro', requerida: true, ejemplo: 'Bebidas' },
    { nombre: 'SubRubro', requerida: false, ejemplo: 'Gaseosas' },
    { nombre: 'PrecioVenta', requerida: true, ejemplo: '1500' },
    { nombre: 'Costo', requerida: false, ejemplo: '900' },
    { nombre: 'IVA', requerida: false, ejemplo: '21' },
    { nombre: 'UnidadVenta', requerida: false, ejemplo: 'unidad' },
    { nombre: 'Stock', requerida: false, ejemplo: '50' },
    { nombre: 'StockMinimo', requerida: false, ejemplo: '10' },
    { nombre: 'CodigoBarras', requerida: false, ejemplo: '7790895000782' },
  ],
  rubros_producto: [
    { nombre: 'Nombre', requerida: true, ejemplo: 'Bebidas' },
    { nombre: 'Tipo', requerida: false, ejemplo: 'ambos' },
  ],
  servicios: [
    { nombre: 'Titulo', requerida: true, ejemplo: 'Consulta medica' },
    { nombre: 'Descripcion', requerida: false, ejemplo: 'Consulta clinica general' },
    { nombre: 'Rubro', requerida: true, ejemplo: 'Salud' },
    { nombre: 'SubRubro', requerida: false, ejemplo: 'Clinica medica' },
    { nombre: 'Tipo', requerida: false, ejemplo: 'unico' },
    { nombre: 'ModalidadPrecio', requerida: false, ejemplo: 'por_sesion' },
    { nombre: 'Precio', requerida: false, ejemplo: '15000' },
    { nombre: 'Estado', requerida: false, ejemplo: 'activo' },
  ],
  rubros_servicio: [{ nombre: 'Nombre', requerida: true, ejemplo: 'Salud' }],
}

export function generarPlantillaCSV(entidad: EntidadImportable): string {
  const cols = ESQUEMAS[entidad]
  return cols.map((c) => c.nombre).join(';') + '\n'
}

export function generarEjemploCSV(entidad: EntidadImportable): string {
  const cols = ESQUEMAS[entidad]
  const header = cols.map((c) => c.nombre).join(';')
  const ejemplo = cols.map((c) => c.ejemplo).join(';')
  return `${header}\n${ejemplo}\n`
}

// ─── Validación por entidad ─────────────────────────────────────────────────
// Devuelve, por cada fila, si es válida y (si lo es) el objeto listo para
// insertar en la tabla real de Supabase (snake_case, con cliente_id todavía
// sin resolver -- eso lo agrega quien llama, en el momento del insert).

export interface RubroExistente {
  id: string
  nombre: string
}

function buscarRubro(nombre: string, rubros: RubroExistente[]): RubroExistente | undefined {
  const q = nombre.trim().toLowerCase()
  return rubros.find((r) => r.nombre.trim().toLowerCase() === q)
}

const IVA_VALIDOS = ['0', '10.5', '10,5', '21', '27']
const TIPOS_RUBRO = ['producto', 'insumo', 'ambos']
const TIPOS_SERVICIO = ['unico', 'con_variantes']
const MODALIDADES = ['fijo', 'por_hora', 'por_sesion', 'a_convenir']
const ESTADOS = ['activo', 'inactivo']

export interface FilaConPayload extends FilaImportacion {
  payload?: Record<string, unknown>
}

export function validarProductos(
  csv: CsvParseado,
  rubros: RubroExistente[],
  subRubros: { id: string; rubroId: string; nombre: string }[],
): FilaConPayload[] {
  return csv.filas.map((fila, idx) => {
    const obj = filaAObjeto(csv.headers, fila)
    const numeroFila = idx + 2 // +1 por header, +1 por index base 1

    const nombre = obj['nombre']
    const rubroNombre = obj['rubro']
    const precioVenta = obj['precioventa']

    if (!nombre) return err(numeroFila, obj, 'Falta Nombre')
    if (!rubroNombre) return err(numeroFila, obj, 'Falta Rubro')
    if (!precioVenta || isNaN(Number(precioVenta.replace(',', '.')))) {
      return err(numeroFila, obj, 'PrecioVenta inválido o vacío')
    }

    const rubro = buscarRubro(rubroNombre, rubros)
    if (!rubro) {
      return err(numeroFila, obj, `Rubro "${rubroNombre}" no encontrado -- creálo primero en Rubros`)
    }

    let subRubroId: string | undefined
    if (obj['subrubro']) {
      const sr = subRubros.find(
        (s) => s.rubroId === rubro.id && s.nombre.trim().toLowerCase() === obj['subrubro'].trim().toLowerCase(),
      )
      if (!sr) {
        return err(numeroFila, obj, `Sub-rubro "${obj['subrubro']}" no encontrado dentro de "${rubroNombre}"`)
      }
      subRubroId = sr.id
    }

    const iva = obj['iva']?.replace(',', '.') || '21'
    if (!IVA_VALIDOS.map((v) => v.replace(',', '.')).includes(iva)) {
      return err(numeroFila, obj, `IVA "${obj['iva']}" inválido (0, 10.5, 21 o 27)`)
    }

    return {
      numeroFila,
      datos: obj,
      valida: true,
      payload: {
        nombre,
        codigo: obj['codigo'] || null,
        descripcion: obj['descripcion'] || '',
        rubro_id: rubro.id,
        sub_rubro_id: subRubroId ?? null,
        precio_venta: Number(precioVenta.replace(',', '.')),
        costo: obj['costo'] ? Number(obj['costo'].replace(',', '.')) : 0,
        iva: Number(iva),
        unidad_venta: obj['unidadventa'] || 'unidad',
        stock: obj['stock'] ? Number(obj['stock'].replace(',', '.')) : 0,
        stock_minimo: obj['stockminimo'] ? Number(obj['stockminimo'].replace(',', '.')) : 0,
        codigo_barras: obj['codigobarras'] || null,
      },
    }
  })
}

export function validarRubrosProducto(csv: CsvParseado): FilaConPayload[] {
  return csv.filas.map((fila, idx) => {
    const obj = filaAObjeto(csv.headers, fila)
    const numeroFila = idx + 2
    const nombre = obj['nombre']
    if (!nombre) return err(numeroFila, obj, 'Falta Nombre')

    const tipo = (obj['tipo'] || 'ambos').toLowerCase()
    if (!TIPOS_RUBRO.includes(tipo)) {
      return err(numeroFila, obj, `Tipo "${obj['tipo']}" inválido (producto, insumo o ambos)`)
    }

    return { numeroFila, datos: obj, valida: true, payload: { nombre, tipo } }
  })
}

export function validarServicios(
  csv: CsvParseado,
  rubros: RubroExistente[],
  subRubros: { id: string; rubroId: string; nombre: string }[],
): FilaConPayload[] {
  return csv.filas.map((fila, idx) => {
    const obj = filaAObjeto(csv.headers, fila)
    const numeroFila = idx + 2

    const titulo = obj['titulo']
    const rubroNombre = obj['rubro']
    if (!titulo) return err(numeroFila, obj, 'Falta Titulo')
    if (!rubroNombre) return err(numeroFila, obj, 'Falta Rubro')

    const rubro = buscarRubro(rubroNombre, rubros)
    if (!rubro) {
      return err(numeroFila, obj, `Rubro "${rubroNombre}" no encontrado -- creálo primero en Rubros`)
    }

    let subRubroId: string | undefined
    if (obj['subrubro']) {
      const sr = subRubros.find(
        (s) => s.rubroId === rubro.id && s.nombre.trim().toLowerCase() === obj['subrubro'].trim().toLowerCase(),
      )
      if (!sr) {
        return err(numeroFila, obj, `Sub-rubro "${obj['subrubro']}" no encontrado dentro de "${rubroNombre}"`)
      }
      subRubroId = sr.id
    }

    const tipo = (obj['tipo'] || 'unico').toLowerCase()
    if (!TIPOS_SERVICIO.includes(tipo)) {
      return err(numeroFila, obj, `Tipo "${obj['tipo']}" inválido (unico o con_variantes)`)
    }

    const modalidad = (obj['modalidadprecio'] || 'fijo').toLowerCase()
    if (!MODALIDADES.includes(modalidad)) {
      return err(numeroFila, obj, `ModalidadPrecio "${obj['modalidadprecio']}" inválida`)
    }

    const estado = (obj['estado'] || 'activo').toLowerCase()
    if (!ESTADOS.includes(estado)) {
      return err(numeroFila, obj, `Estado "${obj['estado']}" inválido (activo o inactivo)`)
    }

    if (tipo === 'con_variantes') {
      return err(
        numeroFila,
        obj,
        'Tipo con_variantes no se puede importar por CSV -- cargalo manualmente en Servicios',
      )
    }

    return {
      numeroFila,
      datos: obj,
      valida: true,
      payload: {
        titulo,
        descripcion: obj['descripcion'] || '',
        rubro_id: rubro.id,
        sub_rubro_id: subRubroId ?? null,
        tipo,
        modalidad_precio: modalidad,
        precio: obj['precio'] ? Number(obj['precio'].replace(',', '.')) : null,
        estado,
      },
    }
  })
}

export function validarRubrosServicio(csv: CsvParseado): FilaConPayload[] {
  return csv.filas.map((fila, idx) => {
    const obj = filaAObjeto(csv.headers, fila)
    const numeroFila = idx + 2
    const nombre = obj['nombre']
    if (!nombre) return err(numeroFila, obj, 'Falta Nombre')
    return { numeroFila, datos: obj, valida: true, payload: { nombre } }
  })
}

function err(numeroFila: number, datos: Record<string, string>, error: string): FilaConPayload {
  return { numeroFila, datos, valida: false, error }
}
