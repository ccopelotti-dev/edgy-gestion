import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { generarSlug, slugValido, urlCliente } from '@/lib/slug'
import type { TipoNegocio } from '@/types'

const TIPOS_NEGOCIO: { value: TipoNegocio; label: string }[] = [
  { value: 'gastronomico_con_salon', label: 'Gastronómico con salón (bar, restorán, café)' },
  { value: 'gastronomico_sin_salon', label: 'Gastronómico sin salón (rotisería, delivery)' },
  { value: 'comercio', label: 'Comercio' },
  { value: 'logistica', label: 'Logística y transporte' },
  { value: 'produccion', label: 'Producción' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'agro', label: 'Agro' },
]

export interface DatosIdentidad {
  nombre: string
  titular: string
  direccion: string
  cuit: string
  telefono: string
  tipoNegocio: TipoNegocio | ''
  logoFile: File | null
  colorMarca: string
  slug: string
}

interface Paso1Props {
  datos: DatosIdentidad
  onChange: (datos: DatosIdentidad) => void
  onContinuar: () => void
  error?: string | null
  enviando?: boolean
}

export function Paso1Identidad({ datos, onChange, onContinuar, error, enviando }: Paso1Props) {
  const [slugTocado, setSlugTocado] = useState(datos.slug !== generarSlug(datos.nombre))

  const slugFormatoOk = datos.slug.trim().length > 0 && slugValido(datos.slug)
  const puedeContinuar =
    datos.nombre.trim().length > 0 && datos.tipoNegocio !== '' && slugFormatoOk

  function actualizarNombre(nombre: string) {
    onChange({
      ...datos,
      nombre,
      slug: slugTocado ? datos.slug : generarSlug(nombre),
    })
  }

  function actualizarSlug(valor: string) {
    setSlugTocado(true)
    const limpio = valor
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
    onChange({ ...datos, slug: limpio })
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">
          Nombre Comercial
        </label>
        <Input
          placeholder="Ej: Café de la Esquina"
          value={datos.nombre}
          onChange={(e) => actualizarNombre(e.target.value)}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Subdominio</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">https://</span>
          <Input
            placeholder="cafe-de-la-esquina"
            value={datos.slug}
            onChange={(e) => actualizarSlug(e.target.value)}
            className="flex-1"
          />
          <span className="text-sm text-gray-400">.edgysistemas.tech</span>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {datos.slug
            ? slugFormatoOk
              ? `Va a entrar por ${urlCliente(datos.slug)}`
              : 'Solo minúsculas, números y guiones, sin espacios.'
            : 'Se completa solo a partir del nombre, lo podés editar.'}
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Titular</label>
        <Input
          placeholder="Nombre y apellido del titular"
          value={datos.titular}
          onChange={(e) => onChange({ ...datos, titular: e.target.value })}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Dirección</label>
        <Input
          placeholder="Calle, número, localidad"
          value={datos.direccion}
          onChange={(e) => onChange({ ...datos, direccion: e.target.value })}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">CUIT</label>
        <Input
          placeholder="20XXXXXXXXX (11 dígitos, sin guiones)"
          value={datos.cuit}
          onChange={(e) => onChange({ ...datos, cuit: e.target.value.replace(/\D/g, '') })}
          maxLength={11}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Teléfono</label>
        <Input
          placeholder="Ej: 2954123456"
          value={datos.telefono}
          onChange={(e) => onChange({ ...datos, telefono: e.target.value })}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Tipo de negocio</label>
        <select
          className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          value={datos.tipoNegocio}
          onChange={(e) => onChange({ ...datos, tipoNegocio: e.target.value as TipoNegocio })}
        >
          <option value="">Elegí...</option>
          {TIPOS_NEGOCIO.map((tipo) => (
            <option key={tipo.value} value={tipo.value}>
              {tipo.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Logo (opcional)</label>
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-300">
            {datos.logoFile ? (
              <img
                src={URL.createObjectURL(datos.logoFile)}
                alt="Logo"
                className="h-full w-full rounded-md object-cover"
              />
            ) : (
              '+'
            )}
          </div>
          <label className="cursor-pointer rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Subir imagen
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onChange({ ...datos, logoFile: e.target.files?.[0] ?? null })}
            />
          </label>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Color de marca</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={datos.colorMarca}
            onChange={(e) => onChange({ ...datos, colorMarca: e.target.value })}
            className="h-10 w-10 cursor-pointer rounded-md border border-gray-200"
          />
          <Input
            value={datos.colorMarca}
            onChange={(e) => onChange({ ...datos, colorMarca: e.target.value })}
            className="w-32"
          />
          <p className="text-sm text-gray-500">
            Subí tu logo y lo tomamos solo, o elegilo a mano.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      )}

      <Button className="w-full" disabled={!puedeContinuar || enviando} onClick={onContinuar}>
        {enviando ? 'Creando...' : 'Continuar'}
      </Button>
    </div>
  )
}
