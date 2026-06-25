import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { urlCliente } from '@/lib/slug'

interface Paso5Props {
  nombre: string
  slug: string
  emailAdmin: string
  onActivar: () => Promise<void>
  onIrAlCliente: () => void
}

/**
 * Último paso del wizard: marca el cliente como activo, agrega su
 * subdominio como domain_alias en Netlify, e invita al Admin real por
 * mail para que defina su propia contraseña (todo vía onActivar, en
 * NuevoProyecto.tsx — ver netlify/functions/agregar-dominio.js e
 * invitar-admin.js).
 */
export function Paso5Activacion({ nombre, slug, emailAdmin, onActivar, onIrAlCliente }: Paso5Props) {
  const [activando, setActivando] = useState(false)
  const [activado, setActivado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const url = urlCliente(slug)

  async function manejarActivar() {
    setActivando(true)
    setError(null)
    try {
      await onActivar()
      setActivado(true)
    } catch {
      setError('No pudimos activar el cliente. Probá de nuevo en un momento.')
    } finally {
      setActivando(false)
    }
  }

  async function copiarUrl() {
    await navigator.clipboard.writeText(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (activado) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <h2 className="text-base font-medium text-gray-900">{nombre} ya está activo</h2>
          <p className="mt-1 text-sm text-gray-500">
            Pasale esta URL al cliente para que entre con sus credenciales.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3.5 py-2.5">
          <span className="truncate text-sm text-gray-900">{url}</span>
          <button
            type="button"
            className="shrink-0 text-sm font-medium text-brand-500"
            onClick={copiarUrl}
          >
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>

        <p className="text-sm text-gray-500">
          Le mandamos una invitación a <span className="font-medium text-gray-900">{emailAdmin}</span> para
          que defina su contraseña — todavía no puede entrar hasta que abra ese mail.
        </p>

        <Button className="w-full" onClick={onIrAlCliente}>
          Ir a la ficha del cliente
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h2 className="text-base font-medium text-gray-900">Activación</h2>
        <p className="mt-1 text-sm text-gray-500">
          Última revisión antes de poner a {nombre} en producción.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">URL final</label>
        <div className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900">
          {url}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Admin</label>
        <div className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900">
          {emailAdmin}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}

      <Button className="w-full" disabled={activando} onClick={manejarActivar}>
        {activando ? 'Activando...' : 'Activar cliente'}
      </Button>
    </div>
  )
}
