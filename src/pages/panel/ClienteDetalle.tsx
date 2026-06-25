import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Paso3Modulos } from '@/pages/onboarding/Paso3Modulos'
import type { Cliente, UsuarioCliente } from '@/types'

interface FilaClienteModulo {
  id: string
  modulo_id: string
  activo: boolean
}

export function ClienteDetalle() {
  const { id } = useParams<{ id: string }>()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioCliente[]>([])
  const [filasModulos, setFilasModulos] = useState<FilaClienteModulo[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function cargarTodo() {
    if (!id) return
    setCargando(true)

    const [{ data: clienteData }, { data: usuariosData }, { data: clienteModulosData }] =
      await Promise.all([
        supabase.from('clientes').select('*').eq('id', id).single(),
        supabase.from('usuarios_cliente').select('*').eq('cliente_id', id),
        supabase.from('cliente_modulos').select('id, modulo_id, activo').eq('cliente_id', id),
      ])

    setCliente(clienteData ?? null)
    setUsuarios(usuariosData ?? [])
    setFilasModulos(clienteModulosData ?? [])
    setCargando(false)
  }

  useEffect(() => {
    cargarTodo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Guarda el delta entre lo que ya estaba activo y lo que se eligió en
  // pantalla — nunca un insert ciego, porque cliente_modulos tiene una fila
  // por (cliente_id, modulo_id) y reinsertar rompería la unicidad.
  async function guardarModulos(seleccionados: string[]) {
    if (!id) return
    setGuardando(true)
    setMensaje(null)

    const nuevoSet = new Set(seleccionados)
    const porModuloId = new Map(filasModulos.map((f) => [f.modulo_id, f]))

    const aInsertar = seleccionados
      .filter((moduloId) => !porModuloId.has(moduloId))
      .map((moduloId) => ({
        cliente_id: id,
        modulo_id: moduloId,
        activo: true,
        activado_en: new Date().toISOString(),
      }))

    const aReactivar = filasModulos.filter((f) => !f.activo && nuevoSet.has(f.modulo_id))
    const aDesactivar = filasModulos.filter((f) => f.activo && !nuevoSet.has(f.modulo_id))

    if (aInsertar.length > 0) {
      await supabase.from('cliente_modulos').insert(aInsertar)
    }
    for (const fila of aReactivar) {
      await supabase.from('cliente_modulos').update({ activo: true }).eq('id', fila.id)
    }
    for (const fila of aDesactivar) {
      await supabase.from('cliente_modulos').update({ activo: false }).eq('id', fila.id)
    }

    await cargarTodo()
    setGuardando(false)
    setMensaje('Guardado.')
  }

  if (cargando) {
    return <p className="text-sm text-gray-400">Cargando...</p>
  }

  if (!cliente) {
    return <p className="text-sm text-gray-500">No encontramos ese cliente.</p>
  }

  const moduloIdsActivos = filasModulos.filter((f) => f.activo).map((f) => f.modulo_id)

  return (
    <div className="space-y-8">
      <div>
        <Link to="/panel/clientes" className="text-sm text-gray-400 hover:text-gray-600">
          ← Clientes
        </Link>
        <h1 className="mt-2 text-lg font-medium text-gray-900">{cliente.nombre}</h1>
        <p className="text-sm capitalize text-gray-500">{cliente.tipo_negocio}</p>
      </div>

      <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Dato label="Titular" valor={cliente.titular} />
        <Dato label="CUIT" valor={cliente.cuit} />
        <Dato label="Dirección" valor={cliente.direccion} />
        <Dato label="Teléfono" valor={cliente.telefono} />
      </Card>

      <div>
        <h2 className="mb-3 text-base font-medium text-gray-900">Módulos activos</h2>
        {guardando && <p className="mb-3 text-sm text-gray-400">Guardando...</p>}
        {mensaje && !guardando && <p className="mb-3 text-sm text-green-600">{mensaje}</p>}
        <Paso3Modulos
          tipoNegocio={cliente.tipo_negocio}
          preseleccionados={moduloIdsActivos}
          onContinuar={guardarModulos}
          textoBoton={() => 'Guardar cambios'}
        />
      </div>

      <div>
        <h2 className="mb-3 text-base font-medium text-gray-900">Equipo</h2>
        <div className="space-y-2">
          {usuarios.length === 0 && (
            <p className="text-sm text-gray-400">Todavía no hay nadie cargado.</p>
          )}
          {usuarios.map((u) => (
            <Card key={u.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{u.nombre ?? u.email ?? u.cuil}</p>
                <p className="text-sm text-gray-500">
                  {u.auth_mode === 'full' ? u.email : `CUIL ${u.cuil}`}
                </p>
              </div>
              <span className="text-sm capitalize text-gray-500">{u.rol}</span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-900">{valor ?? '—'}</p>
    </div>
  )
}
