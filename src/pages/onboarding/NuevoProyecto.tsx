import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Paso1Identidad, type DatosIdentidad } from './Paso1Identidad'
import { Paso2Auth } from './Paso2Auth'
import { Paso3Modulos } from './Paso3Modulos'
import { Paso4Permisos, type UsuarioNuevo } from './Paso4Permisos'
import type { Modulo, TipoNegocio } from '@/types'

type Paso = 1 | 2 | 3 | 4

const PASOS_LABEL: Record<Paso, string> = {
  1: 'Tu negocio',
  2: 'Acceso',
  3: 'Módulos',
  4: 'Equipo',
}

// Usamos localStorage (no sessionStorage) a propósito: el link de
// confirmación de correo suele abrirse en una pestaña nueva, y
// localStorage es lo único que esa pestaña nueva puede leer porque
// comparte origen con la pestaña donde arrancó el wizard.
const CLAVE_CLIENTE_PENDIENTE = 'edgy_pending_cliente_id'

export function NuevoProyecto() {
  const navigate = useNavigate()
  const [paso, setPaso] = useState<Paso>(1)
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [modulosActivos, setModulosActivos] = useState<Modulo[]>([])
  const [datosIdentidad, setDatosIdentidad] = useState<DatosIdentidad>({
    nombre: '',
    tipoNegocio: '',
    logoFile: null,
    colorMarca: '#D4537E',
  })

  // Paso 2 → vincula al usuario ya logueado con el cliente que quedó
  // pendiente. Recibe el clienteId como parámetro (no de React state) para
  // que funcione incluso si esta función corre en el primer render, antes
  // de que el estado del componente termine de inicializarse.
  async function vincularUsuarioAlCliente(clienteIdPendiente: string) {
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) return

    const { data: existente } = await supabase
      .from('usuarios_cliente')
      .select('id')
      .eq('cliente_id', clienteIdPendiente)
      .eq('user_id', authData.user.id)
      .maybeSingle()

    if (!existente) {
      await supabase.from('usuarios_cliente').insert({
        cliente_id: clienteIdPendiente,
        user_id: authData.user.id,
        email: authData.user.email,
        rol: 'admin',
      })
    }

    localStorage.removeItem(CLAVE_CLIENTE_PENDIENTE)
    setClienteId(clienteIdPendiente)
    setPaso(3)
  }

  // Al montar: si quedó un cliente a mitad de camino (porque el link de
  // correo recargó la página, en esta pestaña o en una nueva), lo
  // recuperamos. Y nos suscribimos a los cambios de sesión: en cuanto
  // Supabase confirme el login —ya sea por Google o por el link de
  // correo— seguimos solos, sin que el usuario tenga que volver a tocar
  // "Continuar".
  useEffect(() => {
    const idPendiente = localStorage.getItem(CLAVE_CLIENTE_PENDIENTE)
    if (idPendiente) {
      setClienteId(idPendiente)
      setPaso((actual) => (actual === 1 ? 2 : actual))
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const idActual = localStorage.getItem(CLAVE_CLIENTE_PENDIENTE)
      if (session && idActual) {
        vincularUsuarioAlCliente(idActual)
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Paso 1 → crea la fila en `clientes`. A partir de acá ya existe el tenant.
  async function crearCliente() {
    let logoUrl: string | null = null
    if (datosIdentidad.logoFile) {
      const ruta = `${Date.now()}-${datosIdentidad.logoFile.name}`
      const { data: subida } = await supabase.storage
        .from('logos-clientes')
        .upload(ruta, datosIdentidad.logoFile)
      if (subida) {
        logoUrl = supabase.storage.from('logos-clientes').getPublicUrl(subida.path).data.publicUrl
      }
    }

    const { data, error } = await supabase
      .from('clientes')
      .insert({
        nombre: datosIdentidad.nombre,
        tipo_negocio: datosIdentidad.tipoNegocio,
        logo_url: logoUrl,
        color_marca: datosIdentidad.colorMarca,
      })
      .select()
      .single()

    if (error || !data) {
      // eslint-disable-next-line no-console
      console.error('Error creando cliente', error)
      return
    }

    localStorage.setItem(CLAVE_CLIENTE_PENDIENTE, data.id)
    setClienteId(data.id)
    setPaso(2)
  }

  // Paso 3 → activa los módulos elegidos para este cliente
  async function activarModulos(modulosSeleccionados: string[]) {
    if (!clienteId) return

    const filas = modulosSeleccionados.map((moduloId) => ({
      cliente_id: clienteId,
      modulo_id: moduloId,
      activo: true,
      activado_en: new Date().toISOString(),
    }))
    await supabase.from('cliente_modulos').insert(filas)

    const { data: modulosData } = await supabase
      .from('modulos')
      .select('*')
      .in('id', modulosSeleccionados)
    setModulosActivos(modulosData ?? [])
    setPaso(4)
  }

  // Paso 4 → equipo y permisos, y listo: el dashboard ya tiene todo lo que necesita
  async function finalizar(usuarios: UsuarioNuevo[]) {
    if (!clienteId) return

    for (const usuario of usuarios) {
      const { data: usuarioCliente } = await supabase
        .from('usuarios_cliente')
        .insert({ cliente_id: clienteId, email: usuario.email, rol: usuario.rol })
        .select()
        .single()

      if (!usuarioCliente) continue

      const filasPermisos = Object.entries(usuario.permisos).map(([moduloId, nivel]) => ({
        usuario_cliente_id: usuarioCliente.id,
        modulo_id: moduloId,
        nivel,
      }))
      if (filasPermisos.length > 0) {
        await supabase.from('permisos').insert(filasPermisos)
      }
    }

    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* Panel de marca — fijo, no se ve en pantallas chicas para no robarle
          espacio al formulario en celulares */}
      <aside className="hidden w-72 shrink-0 flex-col justify-between bg-brand-500 px-8 py-10 text-white md:flex">
        <div>
          <span className="text-lg font-semibold tracking-tight">Edgy Sistemas</span>
          <p className="mt-2 text-sm text-white/70">
            Sistema de gestión modular para PyMEs
          </p>
        </div>
        <p className="text-xs text-white/50">Edgy Gestión · Panel de alta de clientes</p>
      </aside>

      <div className="flex-1 px-4 py-10">
        <div className="mx-auto mb-10 flex max-w-2xl items-center justify-center gap-2">
          {([1, 2, 3, 4] as Paso[]).map((p) => (
            <div key={p} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  p === paso
                    ? 'bg-brand-500 text-white'
                    : p < paso
                      ? 'bg-brand-50 text-brand-500'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {p}
              </div>
              <span className="text-xs text-gray-500">{PASOS_LABEL[p]}</span>
              {p < 4 && <span className="mx-1 h-px w-6 bg-gray-200" />}
            </div>
          ))}
        </div>

      {paso === 1 && (
        <Paso1Identidad
          datos={datosIdentidad}
          onChange={setDatosIdentidad}
          onContinuar={crearCliente}
        />
      )}
      {paso === 2 && <Paso2Auth />}
      {paso === 3 && (
        <Paso3Modulos
          tipoNegocio={datosIdentidad.tipoNegocio as TipoNegocio}
          onContinuar={activarModulos}
        />
      )}
      {paso === 4 && <Paso4Permisos modulosActivos={modulosActivos} onFinalizar={finalizar} />}
      </div>
    </div>
  )
}
