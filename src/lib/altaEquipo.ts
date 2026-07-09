import { supabase } from '@/lib/supabase'
import type { DatosAdmin } from '@/pages/onboarding/Paso2Admin'
import type { ResultadoEquipo } from '@/pages/onboarding/Paso4Permisos'

/**
 * Busca el rol "Dueño" de este cliente, o lo crea si todavía no existe.
 * Idempotente a propósito: si esta función se llama dos veces para el
 * mismo cliente (por ejemplo, porque alguien completó el alta a medias
 * y la retoma después), no duplica el rol.
 */
async function asegurarRolDueno(clienteId: string): Promise<string> {
  const { data: existente } = await supabase
    .from('roles')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('nombre', 'Dueño')
    .maybeSingle()

  if (existente) return existente.id

  const { data: creado, error } = await supabase
    .from('roles')
    .insert({ cliente_id: clienteId, nombre: 'Dueño', es_sistema: true, es_admin: true, vista: 'administrativo' })
    .select()
    .single()

  if (error || !creado) throw error ?? new Error('No se pudo crear el rol Dueño')
  return creado.id
}

/** Da de alta al Admin del cliente con los datos del Paso 2 (o lo deja
 * como está si ya había uno cargado con el rol Dueño). */
export async function guardarAdmin(clienteId: string, datosAdmin: DatosAdmin): Promise<void> {
  const rolDuenoId = await asegurarRolDueno(clienteId)

  const { data: yaExiste } = await supabase
    .from('usuarios_cliente')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('rol_id', rolDuenoId)
    .maybeSingle()

  if (yaExiste) return

  await supabase.from('usuarios_cliente').insert({
    cliente_id: clienteId,
    rol_id: rolDuenoId,
    rol: 'Dueño',
    nombre: datosAdmin.nombre,
    auth_mode: 'full',
    email: datosAdmin.email,
    cuil: null,
  })
}

/** Crea los roles operativos con su bundle de permisos, y da de alta al
 * resto del equipo (Paso 4). Reusa roles que ya existan por nombre, en
 * vez de duplicarlos, para poder llamarse más de una vez sin romper. */
export async function guardarEquipo(clienteId: string, resultado: ResultadoEquipo): Promise<void> {
  const idsPorNombreRol = new Map<string, string>()

  for (const rolDraft of resultado.roles) {
    const { data: existente } = await supabase
      .from('roles')
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('nombre', rolDraft.nombre)
      .maybeSingle()

    let rolId = existente?.id as string | undefined

    if (!rolId) {
      // vista se deriva de esAdmin por ahora (mismo criterio que el
      // backfill de 0022_dashboard_operativo.sql): un rol admin ve el
      // resumen ejecutivo, el resto ve el panel operativo. El wizard
      // no tiene todavía un selector propio para 'vista' -- si algún
      // rol necesita divergir de esta regla, se ajusta a mano después
      // desde el panel (roles.vista es un campo independiente).
      const { data: creado, error } = await supabase
        .from('roles')
        .insert({
          cliente_id: clienteId,
          nombre: rolDraft.nombre,
          es_sistema: true,
          es_admin: rolDraft.esAdmin,
          vista: rolDraft.esAdmin ? 'administrativo' : 'operativo',
        })
        .select()
        .single()

      if (error || !creado) {
        // eslint-disable-next-line no-console
        console.error('Error creando rol', rolDraft.nombre, error)
        continue
      }
      rolId = creado.id
    }

    if (!rolId) continue

    idsPorNombreRol.set(rolDraft.nombre, rolId)

    const filasPermisos = Object.entries(rolDraft.permisos).map(([moduloId, nivel]) => ({
      rol_id: rolId,
      modulo_id: moduloId,
      nivel,
    }))
    if (filasPermisos.length > 0) {
      await supabase.from('permisos_rol').upsert(filasPermisos, { onConflict: 'rol_id,modulo_id' })
    }
  }

  for (const persona of resultado.personas) {
    const rolId = idsPorNombreRol.get(persona.rolNombre)
    if (!rolId) continue

    await supabase.from('usuarios_cliente').insert({
      cliente_id: clienteId,
      rol_id: rolId,
      rol: persona.rolNombre,
      nombre: persona.nombre,
      cuil: persona.cuil,
      auth_mode: 'pin',
    })
  }
}
