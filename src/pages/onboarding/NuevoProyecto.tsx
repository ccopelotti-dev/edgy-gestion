import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { guardarAdmin, guardarEquipo } from '@/lib/altaEquipo'
import { Paso1Identidad, type DatosIdentidad } from './Paso1Identidad'
import { Paso2Admin, type DatosAdmin } from './Paso2Admin'
import { Paso3Modulos } from './Paso3Modulos'
import { Paso4Permisos, type ResultadoEquipo } from './Paso4Permisos'
import { Paso5Activacion } from './Paso5Activacion'
import type { Modulo, TipoNegocio } from '@/types'

type Paso = 1 | 2 | 3 | 4 | 5

const PASOS_LABEL: Record<Paso, string> = {
  1: 'Cliente',
  2: 'Admin',
  3: 'Módulos',
  4: 'Equipo',
  5: 'Activación',
}

// Traduce los errores más comunes de Postgres a algo que tenga sentido
// para quien está completando el wizard, en vez de mostrar el mensaje
// crudo de la base (o, peor, no mostrar nada).
function traducirErrorCliente(error: { code?: string; message?: string } | null): string {
  if (error?.code === '23505') {
    if (error.message?.includes('cuit')) {
      return 'Ya existe un cliente con ese CUIT. Revisá el dato, o buscalo en "Clientes" si ya está cargado.'
    }
    if (error.message?.includes('slug')) {
      return 'Ese subdominio ya lo está usando otro cliente. Probá con otra variante.'
    }
    return 'Ya existe un cliente con esos datos.'
  }
  if (error?.code === '23514' && error.message?.includes('clientes_slug_formato')) {
    return 'El subdominio solo puede tener minúsculas, números y guiones.'
  }
  return 'No pudimos crear el cliente. Probá de nuevo en un momento.'
}

export function NuevoProyecto() {
  const navigate = useNavigate()
  const [paso, setPaso] = useState<Paso>(1)
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [modulosActivos, setModulosActivos] = useState<Modulo[]>([])
  const [datosIdentidad, setDatosIdentidad] = useState<DatosIdentidad>({
    nombre: '',
    titular: '',
    direccion: '',
    cuit: '',
    telefono: '',
    tipoNegocio: '',
    logoFile: null,
    colorMarca: '#D4537E',
    slug: '',
  })
  const [datosAdmin, setDatosAdmin] = useState<DatosAdmin>({
    nombre: '',
    email: '',
  })
  const [enviandoPaso1, setEnviandoPaso1] = useState(false)
  const [errorPaso1, setErrorPaso1] = useState<string | null>(null)

  // Paso 1 -> crea la fila en `clientes`. A partir de aca ya existe el tenant.
  // Ya no hace falta sobrevivir a una recarga de pagina por un link de
  // correo: todo el wizard lo completa personal de Edgy de una sentada.
  async function crearCliente() {
    setEnviandoPaso1(true)
    setErrorPaso1(null)

    let logoUrl: string | null = null
    if (datosIdentidad.logoFile) {
      const ruta = `${Date.now()}-${datosIdentidad.logoFile.name}`
      const { data: subida, error: errSubida } = await supabase.storage
        .from('logos-clientes')
        .upload(ruta, datosIdentidad.logoFile)
      if (subida) {
        logoUrl = supabase.storage.from('logos-clientes').getPublicUrl(subida.path).data.publicUrl
      } else if (errSubida) {
        // El logo es opcional — si falla la subida no bloqueamos la
        // creación del cliente, pero lo dejamos anotado en la consola
        // para poder diagnosticarlo (ej: si el bucket no existe todavía).
        // eslint-disable-next-line no-console
        console.error('No se pudo subir el logo (se sigue sin logo)', errSubida)
      }
    }

    const { data, error } = await supabase
      .from('clientes')
      .insert({
        nombre: datosIdentidad.nombre,
        titular: datosIdentidad.titular || null,
        direccion: datosIdentidad.direccion || null,
        cuit: datosIdentidad.cuit || null,
        telefono: datosIdentidad.telefono || null,
        tipo_negocio: datosIdentidad.tipoNegocio,
        logo_url: logoUrl,
        color_marca: datosIdentidad.colorMarca,
        slug: datosIdentidad.slug,
      })
      .select()
      .single()

    if (error || !data) {
      // eslint-disable-next-line no-console
      console.error('Error creando cliente', error)
      setErrorPaso1(traducirErrorCliente(error))
      setEnviandoPaso1(false)
      return
    }

    setClienteId(data.id)
    setEnviandoPaso1(false)
    setPaso(2)
  }

  // Paso 3 -> activa los modulos elegidos para este cliente
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

  // Paso 4 -> crea el rol Dueno + los roles operativos con su bundle de
  // permisos, da de alta al Admin (datos del Paso 2) y al resto del
  // equipo que se haya agregado. Todo en terminos de ROLES reutilizables,
  // no de permisos sueltos por persona.
  async function finalizar(resultado: ResultadoEquipo) {
    if (!clienteId) return

    await guardarAdmin(clienteId, datosAdmin)
    await guardarEquipo(clienteId, resultado)

    setPaso(5)
  }

  // Paso 5 -> marca el cliente como activo, agrega su subdominio como
  // domain_alias en Netlify (Opción A: Netlify no soporta wildcard real,
  // así que cada cliente se registra individualmente — ver
  // netlify/functions/agregar-dominio.js), e invita al Admin real por
  // mail para que defina su propia contraseña (ver
  // netlify/functions/invitar-admin.js). El DNS wildcard en el
  // proveedor (Porkbun) sigue siendo una sola vez, no por cliente.
  async function activarCliente() {
    if (!clienteId) return

    const { error } = await supabase
      .from('clientes')
      .update({ estado: 'activo' })
      .eq('id', clienteId)

    if (error) throw error

    const { data: sesion } = await supabase.auth.getSession()
    const token = sesion.session?.access_token
    if (!token) throw new Error('No hay sesión activa para habilitar el subdominio')

    const respDominio = await fetch('/.netlify/functions/agregar-dominio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slug: datosIdentidad.slug }),
    })
    const resultadoDominio = await respDominio.json()
    if (!respDominio.ok || !resultadoDominio.ok) {
      throw new Error(resultadoDominio.error || 'No pudimos habilitar el subdominio en Netlify')
    }

    const respInvite = await fetch('/.netlify/functions/invitar-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clienteId }),
    })
    const resultadoInvite = await respInvite.json()
    if (!respInvite.ok || !resultadoInvite.ok) {
      throw new Error(resultadoInvite.error || 'No pudimos invitar al Admin por mail')
    }
  }

  return (
    <div>
      <div className="mx-auto mb-10 flex max-w-2xl items-center justify-center gap-2">
        {([1, 2, 3, 4, 5] as Paso[]).map((p) => (
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
            {p < 5 && <span className="mx-1 h-px w-6 bg-gray-200" />}
          </div>
        ))}
      </div>

      {paso === 1 && (
        <Paso1Identidad
          datos={datosIdentidad}
          onChange={setDatosIdentidad}
          onContinuar={crearCliente}
          error={errorPaso1}
          enviando={enviandoPaso1}
        />
      )}
      {paso === 2 && (
        <Paso2Admin datos={datosAdmin} onChange={setDatosAdmin} onContinuar={() => setPaso(3)} />
      )}
      {paso === 3 && (
        <Paso3Modulos
          tipoNegocio={datosIdentidad.tipoNegocio as TipoNegocio}
          onContinuar={activarModulos}
        />
      )}
      {paso === 4 && (
        <Paso4Permisos
          tipoNegocio={datosIdentidad.tipoNegocio as TipoNegocio}
          modulosActivos={modulosActivos}
          onFinalizar={finalizar}
        />
      )}
      {paso === 5 && (
        <Paso5Activacion
          nombre={datosIdentidad.nombre}
          slug={datosIdentidad.slug}
          emailAdmin={datosAdmin.email}
          onActivar={activarCliente}
          onIrAlCliente={() => navigate(`/panel/clientes/${clienteId}`)}
        />
      )}
    </div>
  )
}
