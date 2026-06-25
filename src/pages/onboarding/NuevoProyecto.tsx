import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Paso1Identidad, type DatosIdentidad } from './Paso1Identidad'
import { Paso2Admin, type DatosAdmin } from './Paso2Admin'
import { Paso3Modulos } from './Paso3Modulos'
import { Paso4Permisos, type ResultadoEquipo } from './Paso4Permisos'
import type { Modulo, TipoNegocio } from '@/types'

type Paso = 1 | 2 | 3 | 4

const PASOS_LABEL: Record<Paso, string> = {
  1: 'Cliente',
  2: 'Admin',
  3: 'Módulos',
  4: 'Equipo',
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
  })
  const [datosAdmin, setDatosAdmin] = useState<DatosAdmin>({
    nombre: '',
    modo: 'full',
    email: '',
    cuil: '',
  })

  // Paso 1 -> crea la fila en `clientes`. A partir de aca ya existe el tenant.
  // Ya no hace falta sobrevivir a una recarga de pagina por un link de
  // correo: todo el wizard lo completa personal de Edgy de una sentada.
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
        titular: datosIdentidad.titular || null,
        direccion: datosIdentidad.direccion || null,
        cuit: datosIdentidad.cuit || null,
        telefono: datosIdentidad.telefono || null,
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

    setClienteId(data.id)
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

    const { data: rolDueno, error: errDueno } = await supabase
      .from('roles')
      .insert({ cliente_id: clienteId, nombre: 'Dueño', es_sistema: true, es_admin: true })
      .select()
      .single()

    if (errDueno || !rolDueno) {
      // eslint-disable-next-line no-console
      console.error('Error creando el rol Dueño', errDueno)
      return
    }

    await supabase.from('usuarios_cliente').insert({
      cliente_id: clienteId,
      rol_id: rolDueno.id,
      rol: 'Dueño',
      nombre: datosAdmin.nombre,
      auth_mode: datosAdmin.modo,
      email: datosAdmin.modo === 'full' ? datosAdmin.email : null,
      cuil: datosAdmin.modo === 'pin' ? datosAdmin.cuil : null,
    })

    const idsPorNombreRol = new Map<string, string>()

    for (const rolDraft of resultado.roles) {
      const { data: rolCreado, error: errRol } = await supabase
        .from('roles')
        .insert({
          cliente_id: clienteId,
          nombre: rolDraft.nombre,
          es_sistema: true,
          es_admin: rolDraft.esAdmin,
        })
        .select()
        .single()

      if (errRol || !rolCreado) {
        // eslint-disable-next-line no-console
        console.error('Error creando rol', rolDraft.nombre, errRol)
        continue
      }

      idsPorNombreRol.set(rolDraft.nombre, rolCreado.id)

      const filasPermisos = Object.entries(rolDraft.permisos).map(([moduloId, nivel]) => ({
        rol_id: rolCreado.id,
        modulo_id: moduloId,
        nivel,
      }))
      if (filasPermisos.length > 0) {
        await supabase.from('permisos_rol').insert(filasPermisos)
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

    navigate(`/panel/clientes/${clienteId}`)
  }

  return (
    <div>
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
    </div>
  )
}
