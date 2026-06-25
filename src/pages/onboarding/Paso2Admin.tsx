import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AuthMode } from '@/types'

export interface DatosAdmin {
  nombre: string
  modo: AuthMode
  email: string
  cuil: string
}

interface Paso2Props {
  datos: DatosAdmin
  onChange: (datos: DatosAdmin) => void
  onContinuar: () => void
}

/**
 * Antes este paso era un login (la persona se autenticaba ahí mismo y
 * quedaba auto-asignada como admin). Eso asumía autoservicio, y ya no
 * es así: el alta la hace personal de Edgy de punta a punta. Esto pasa
 * a ser solo un formulario — los datos del primer Admin se guardan en
 * usuarios_cliente recién al finalizar el wizard (Paso 4), igual que
 * el resto del equipo.
 */
export function Paso2Admin({ datos, onChange, onContinuar }: Paso2Props) {
  const puedeContinuar =
    datos.nombre.trim().length > 0 &&
    (datos.modo === 'full' ? datos.email.trim().length > 0 : datos.cuil.length === 11)

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h2 className="text-base font-medium text-gray-900">Datos del Admin</h2>
        <p className="mt-1 text-sm text-gray-500">
          Quién va a poder modificar el sistema de este cliente una vez entregado — el dueño, o
          quien ustedes designen.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Nombre</label>
        <Input
          placeholder="Nombre y apellido"
          value={datos.nombre}
          onChange={(e) => onChange({ ...datos, nombre: e.target.value })}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Modo de acceso</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={cn(
              'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
              datos.modo === 'full'
                ? 'border-brand-500 bg-brand-50 text-brand-500'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50',
            )}
            onClick={() => onChange({ ...datos, modo: 'full' })}
          >
            Email
          </button>
          <button
            type="button"
            className={cn(
              'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
              datos.modo === 'pin'
                ? 'border-brand-500 bg-brand-50 text-brand-500'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50',
            )}
            onClick={() => onChange({ ...datos, modo: 'pin' })}
          >
            CUIL + PIN
          </button>
        </div>
      </div>

      {datos.modo === 'full' ? (
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-900">Email</label>
          <Input
            type="email"
            placeholder="admin@elnegocio.com"
            value={datos.email}
            onChange={(e) => onChange({ ...datos, email: e.target.value })}
          />
        </div>
      ) : (
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-900">CUIL</label>
          <Input
            placeholder="20XXXXXXXXX (11 dígitos, sin guiones)"
            value={datos.cuil}
            onChange={(e) => onChange({ ...datos, cuil: e.target.value.replace(/\D/g, '') })}
            maxLength={11}
          />
          <p className="mt-2 text-sm text-gray-500">
            El PIN se lo va a pedir el sistema a esta persona la primera vez que entre.
          </p>
        </div>
      )}

      <Button className="w-full" disabled={!puedeContinuar} onClick={onContinuar}>
        Continuar
      </Button>
    </div>
  )
}
