import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { TipoNegocio } from '@/types'

const TIPOS_NEGOCIO: { value: TipoNegocio; label: string }[] = [
  { value: 'gastronomico', label: 'Gastronómico (bar, restorán, café)' },
  { value: 'comercio', label: 'Comercio' },
  { value: 'logistica', label: 'Logística y transporte' },
  { value: 'produccion', label: 'Producción' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'agro', label: 'Agro' },
]

export interface DatosIdentidad {
  nombre: string
  tipoNegocio: TipoNegocio | ''
  logoFile: File | null
  colorMarca: string
}

interface Paso1Props {
  datos: DatosIdentidad
  onChange: (datos: DatosIdentidad) => void
  onContinuar: () => void
}

export function Paso1Identidad({ datos, onChange, onContinuar }: Paso1Props) {
  const puedeContinuar = datos.nombre.trim().length > 0 && datos.tipoNegocio !== ''

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">
          Nombre de tu negocio
        </label>
        <Input
          placeholder="Ej: Café de la Esquina"
          value={datos.nombre}
          onChange={(e) => onChange({ ...datos, nombre: e.target.value })}
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

      <Button className="w-full" disabled={!puedeContinuar} onClick={onContinuar}>
        Continuar
      </Button>
    </div>
  )
}
