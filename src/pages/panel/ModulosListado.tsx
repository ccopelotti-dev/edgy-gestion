import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { REGISTRO_MODULOS } from '@/modules/registry'
import { iconoDeModulo } from '@/modules/iconosModulo'

// Catálogo estático solo para mostrar nombre/descripción en esta lista.
// A propósito no depende de la tabla `modulos` de Supabase: esa tabla
// puede estar incompleta (ej. a un módulo nuevo se le puede haber
// olvidado el insert del catálogo) y aun así el módulo ya existe en el
// código y conviene poder verlo acá. La fuente de verdad de "qué módulos
// existen" es REGISTRO_MODULOS (src/modules/registry.ts).
const DESCRIPCION_MODULOS: Record<string, { nombre: string; descripcion: string }> = {
  tesoreria: { nombre: 'Tesorería', descripcion: 'Salud financiera, reservas líquidas y movimientos de caja' },
  'productos-stock': { nombre: 'Productos y stock', descripcion: 'Catálogo de productos y control de stock' },
  ventas: { nombre: 'Ventas', descripcion: 'Registro de ventas y facturación' },
  compras: { nombre: 'Compras', descripcion: 'Órdenes de compra a proveedores' },
  configuracion: { nombre: 'Configuración', descripcion: 'Datos fiscales, puntos de venta e integraciones del negocio' },
  reportes: { nombre: 'Reportes', descripcion: 'Consultas, filtros y exportación sobre los datos de los demás módulos' },
  utilidades: { nombre: 'Utilidades', descripcion: 'Explorador de archivos, importación masiva de datos y tracking de horas' },
  servicios: { nombre: 'Servicios', descripcion: 'Catálogo de servicios ofrecidos a clientes profesionales' },
  contable: { nombre: 'Contable', descripcion: 'Plan de cuentas, asientos de partida doble, libros y estados contables' },
}

export function ModulosListado() {
  const [busqueda, setBusqueda] = useState('')

  const slugs = Object.keys(REGISTRO_MODULOS)
  const filtrados = slugs.filter((slug) => {
    const info = DESCRIPCION_MODULOS[slug]
    const nombre = info?.nombre ?? slug
    return nombre.toLowerCase().includes(busqueda.toLowerCase())
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium text-gray-900">Módulos</h1>
        <p className="text-sm text-gray-500">{slugs.length} módulos existentes en el código.</p>
        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          "Entrar" abre una vista previa de staff: el módulo real, pero sin cliente
          asociado, así que se ve vacío -- sirve para revisar qué pantallas y funciones
          tiene. Para probarlo con datos de un cliente de verdad, activalo desde{' '}
          <Link to="/panel/clientes" className="text-brand-500 hover:underline">Clientes</Link>{' '}
          y entrá con la sesión de ese cliente.
        </p>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtrados.map((slug) => {
          const info = DESCRIPCION_MODULOS[slug]
          const Icono = iconoDeModulo(slug)
          return (
            <Link key={slug} to={`/panel/modulos/${slug}`}>
              <Card className="flex h-full items-start gap-3 p-4 transition-shadow hover:shadow-md">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-brand-500/10 text-brand-500">
                  <Icono size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{info?.nombre ?? slug}</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {info?.descripcion ?? 'Sin descripción todavía.'}
                  </p>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>

      {filtrados.length === 0 && (
        <p className="text-sm text-gray-400">No hay módulos que coincidan con esa búsqueda.</p>
      )}
    </div>
  )
}
