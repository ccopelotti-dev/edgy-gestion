import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export interface DatosAdmin {
  nombre: string
  email: string
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
 *
 * El Admin siempre entra por email (antes había también un modo
 * CUIL+PIN acá, igual que el resto del equipo en el Paso 4 — se quitó:
 * el Admin es quien necesita una cuenta real, recuperable, no un
 * acceso rápido de piso de venta). CUIL+PIN queda reservado para el
 * resto del equipo.
 */
export function Paso2Admin({ datos, onChange, onContinuar }: Paso2Props) {
  const puedeContinuar = datos.nombre.trim().length > 0 && datos.email.trim().length > 0

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
        <label className="mb-2 block text-sm font-medium text-gray-900">Email</label>
        <Input
          type="email"
          placeholder="admin@elnegocio.com"
          value={datos.email}
          onChange={(e) => onChange({ ...datos, email: e.target.value })}
        />
        <p className="mt-2 text-sm text-gray-500">
          Le va a llegar un mail para que defina su propia contraseña.
        </p>
      </div>

      <Button className="w-full" disabled={!puedeContinuar} onClick={onContinuar}>
        Continuar
      </Button>
    </div>
  )
}
