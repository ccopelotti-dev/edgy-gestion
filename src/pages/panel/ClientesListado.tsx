import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import type { Cliente } from '@/types'

export function ClientesListado() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase.from('clientes').select('*').order('nombre')
      setClientes(data ?? [])
      setCargando(false)
    }
    cargar()
  }, [])

  const filtrados = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium text-gray-900">Clientes</h1>
        <p className="text-sm text-gray-500">{clientes.length} clientes de alta.</p>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      />

      {cargando && <p className="text-sm text-gray-400">Cargando...</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtrados.map((cliente) => (
          <Link key={cliente.id} to={`/panel/clientes/${cliente.id}`}>
            <Card className="flex items-center gap-3 transition-shadow hover:shadow-md">
              {cliente.logo_url ? (
                <img src={cliente.logo_url} alt={cliente.nombre} className="h-10 w-10 rounded-md object-cover" />
              ) : (
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-md text-sm font-medium text-white"
                  style={{ backgroundColor: cliente.color_marca ?? '#0C1A2E' }}
                >
                  {cliente.nombre.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">{cliente.nombre}</p>
                <p className="text-sm capitalize text-gray-500">{cliente.tipo_negocio}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {!cargando && filtrados.length === 0 && (
        <p className="text-sm text-gray-400">No hay clientes que coincidan con esa búsqueda.</p>
      )}
    </div>
  )
}
