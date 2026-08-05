import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Cliente, ClienteModulo, Modulo, VistaRol } from '@/types'

interface ModuloActivo extends Modulo {
  activo: boolean
}

// Rol del usuario logueado, ya resuelto -- lo que necesita el frontend
// para decidir qué ve (ej. DashboardHome usa `vista` para elegir entre
// el resumen ejecutivo y el panel operativo). Usuarios legados sin
// rol_id asignado todavía quedan con rolActual = null.
interface RolActual {
  id: string
  nombre: string
  esAdmin: boolean
  vista: VistaRol
}

// Fase 27a: versión liviana de un punto de venta -- solo lo que
// necesita el selector/switcher. La forma completa (numero, dirección,
// por_defecto, etc.) vive en src/modules/configuracion/types
// (`PuntoVenta`), que es donde se administra de verdad.
interface PuntoVentaLiviano {
  id: string
  alias: string
  activo: boolean
}

interface UseClienteActualResult {
  cliente: Cliente | null
  modulosActivos: ModuloActivo[]
  rolActual: RolActual | null
  /** Fase 27a: todos los puntos de venta del cliente (vacío si nunca
   * cargó ninguno -- sigue siendo un cliente de un solo local, como
   * siempre). */
  puntosVenta: PuntoVentaLiviano[]
  /** Punto de venta al que está restringido el usuario logueado --
   * null significa acceso global (ve/opera todos). No confundir con
   * rolActual.esAdmin: son restricciones independientes. */
  puntoVentaUsuarioId: string | null
  cargando: boolean
  error: string | null
}

/**
 * Trae el cliente (tenant) del usuario logueado, la lista de módulos
 * que tiene activos, y el rol de ese usuario (con su `vista`). RLS en
 * Supabase garantiza que solo se vea lo que corresponde a ese cliente,
 * no hace falta filtrar nada extra acá.
 */
export function useClienteActual(): UseClienteActualResult {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [modulosActivos, setModulosActivos] = useState<ModuloActivo[]>([])
  const [rolActual, setRolActual] = useState<RolActual | null>(null)
  const [puntosVenta, setPuntosVenta] = useState<PuntoVentaLiviano[]>([])
  const [puntoVentaUsuarioId, setPuntoVentaUsuarioId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true

    async function cargar() {
      setCargando(true)
      setError(null)

      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) {
        if (activo) {
          setCliente(null)
          setModulosActivos([])
          setRolActual(null)
          setPuntosVenta([])
          setPuntoVentaUsuarioId(null)
          setCargando(false)
        }
        return
      }

      // Trae también el rol vinculado (rol_id) con su nombre/es_admin/vista
      // -- join por FK, mismo patrón que 'cliente_modulos(activo, modulos(*))'
      // más abajo. rol_id es nullable (usuarios legados), así que `roles`
      // puede venir null sin que la fila deje de resolverse.
      // punto_venta_id (Fase 27a) también es nullable -- null es "acceso
      // global" a todos los puntos de venta del cliente.
      const { data: usuarioCliente, error: errUsuario } = await supabase
        .from('usuarios_cliente')
        .select('cliente_id, rol_id, punto_venta_id, roles(nombre, es_admin, vista)')
        .eq('user_id', authData.user.id)
        .single()

      if (errUsuario || !usuarioCliente) {
        if (activo) {
          setError('No encontramos un negocio asociado a este usuario.')
          setCargando(false)
        }
        return
      }

      const { data: clienteData } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', usuarioCliente.cliente_id)
        .single()

      const { data: clienteModulos } = await supabase
        .from('cliente_modulos')
        .select('activo, modulos(*)')
        .eq('cliente_id', usuarioCliente.cliente_id)
        .eq('activo', true)

      // Fase 27a: lista de puntos de venta del cliente (vacía en
      // clientes de un solo local, que son la inmensa mayoría hoy --
      // no rompe nada).
      const { data: puntosVentaData } = await supabase
        .from('puntos_venta')
        .select('id, alias, activo')
        .eq('cliente_id', usuarioCliente.cliente_id)
        .order('alias')

      if (!activo) return

      setCliente((clienteData as Cliente) ?? null)
      setPuntosVenta((puntosVentaData as PuntoVentaLiviano[]) ?? [])
      setPuntoVentaUsuarioId((usuarioCliente.punto_venta_id as string | null) ?? null)
      setModulosActivos(
        (clienteModulos ?? []).map((row: any) => ({
          ...(row.modulos as Modulo),
          activo: row.activo as boolean,
        })),
      )

      const rolRow = (usuarioCliente as any).roles as
        | { nombre: string; es_admin: boolean; vista: VistaRol }
        | null
      setRolActual(
        usuarioCliente.rol_id && rolRow
          ? { id: usuarioCliente.rol_id as string, nombre: rolRow.nombre, esAdmin: rolRow.es_admin, vista: rolRow.vista }
          : null,
      )

      setCargando(false)
    }

    cargar()
    return () => {
      activo = false
    }
  }, [])

  return { cliente, modulosActivos, rolActual, puntosVenta, puntoVentaUsuarioId, cargando, error }
}

// Tipo auxiliar reexportado para los componentes que listan módulos
export type { ModuloActivo }
export type { ClienteModulo }
export type { RolActual }
