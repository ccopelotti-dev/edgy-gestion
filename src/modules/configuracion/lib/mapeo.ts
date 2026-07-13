// Mapeo entre las filas de Supabase (snake_case) y los tipos del
// módulo (camelCase). Centralizado acá para no repetir el mapeo en
// cada hook/página.
import type { DatosEmpresa, PuntoVenta } from '../types'

export function filaAEmpresa(fila: Record<string, any>): DatosEmpresa {
  return {
    id: fila.id,
    nombre: fila.nombre,
    tipoNegocio: fila.tipo_negocio,
    titular: fila.titular,
    direccion: fila.direccion,
    telefono: fila.telefono,
    cuit: fila.cuit,
    logoUrl: fila.logo_url,
    colorMarca: fila.color_marca,
    slug: fila.slug,
    estado: fila.estado,
    categoriaImpositiva: fila.categoria_impositiva,
    personeria: fila.personeria,
    inicioActividades: fila.inicio_actividades,
    provincia: fila.provincia,
    localidad: fila.localidad,
    codigoPostal: fila.codigo_postal,
    horarioActivo: fila.horario_activo ?? false,
    horarioApertura: fila.horario_apertura,
    horarioCierre: fila.horario_cierre,
    horarioDias: fila.horario_dias ?? [0, 1, 2, 3, 4, 5, 6],
    combosTituloSeccion: fila.combos_titulo_seccion ?? 'Combos',
  }
}

// Solo mapea los campos editables desde Configuración > Empresa. Los
// protegidos (slug, estado, cuit, tipo_negocio) ni siquiera se
// consideran acá — están además bloqueados por un trigger en Supabase
// (proteger_columnas_sensibles_clientes, migración 0009), esto es
// defensa en profundidad, no la única barrera.
export function empresaAFila(cambios: Partial<DatosEmpresa>): Record<string, unknown> {
  const fila: Record<string, unknown> = {}
  if ('nombre' in cambios) fila.nombre = cambios.nombre
  if ('titular' in cambios) fila.titular = cambios.titular
  if ('direccion' in cambios) fila.direccion = cambios.direccion
  if ('telefono' in cambios) fila.telefono = cambios.telefono
  if ('categoriaImpositiva' in cambios) fila.categoria_impositiva = cambios.categoriaImpositiva
  if ('personeria' in cambios) fila.personeria = cambios.personeria
  if ('inicioActividades' in cambios) fila.inicio_actividades = cambios.inicioActividades
  if ('provincia' in cambios) fila.provincia = cambios.provincia
  if ('localidad' in cambios) fila.localidad = cambios.localidad
  if ('codigoPostal' in cambios) fila.codigo_postal = cambios.codigoPostal
  // Logo y color de marca: antes solo se cargaban una vez en el
  // onboarding (Paso 1) y no había forma de cambiarlos. Fase 10 los
  // suma acá porque el motor de PDF de comprobantes los usa como
  // identidad visual del cliente (ver Empresa.tsx).
  if ('logoUrl' in cambios) fila.logo_url = cambios.logoUrl
  if ('colorMarca' in cambios) fila.color_marca = cambios.colorMarca
  // Fase 16: horario de atención del Catálogo público.
  if ('horarioActivo' in cambios) fila.horario_activo = cambios.horarioActivo
  if ('horarioApertura' in cambios) fila.horario_apertura = cambios.horarioApertura
  if ('horarioCierre' in cambios) fila.horario_cierre = cambios.horarioCierre
  if ('horarioDias' in cambios) fila.horario_dias = cambios.horarioDias
  // Fase 19 (prep): título personalizable de la sección de Combos.
  if ('combosTituloSeccion' in cambios) fila.combos_titulo_seccion = cambios.combosTituloSeccion
  return fila
}

export function filaAPuntoVenta(fila: Record<string, any>): PuntoVenta {
  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    numero: fila.numero,
    alias: fila.alias,
    direccion: fila.direccion,
    activo: fila.activo,
    porDefecto: fila.por_defecto,
    paraIntegraciones: fila.para_integraciones,
    fechaBaja: fila.fecha_baja,
    createdAt: fila.created_at,
  }
}
