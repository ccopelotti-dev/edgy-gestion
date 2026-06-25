import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * A esta pantalla se llega desde el link del mail de invitación
 * (inviteUserByEmail, ver netlify/functions/invitar-admin.js). El link
 * trae el token en la URL; supabase-js lo detecta solo al cargar la
 * página y deja una sesión temporal lista — acá solo hace falta pedir
 * la contraseña nueva y confirmarla.
 */
export function CompletarCuenta() {
  const navigate = useNavigate()
  const [verificando, setVerificando] = useState(true)
  const [sesionValida, setSesionValida] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesionValida(!!data.session)
      setVerificando(false)
    })
  }, [])

  const puedeGuardar = password.length >= 6 && password === confirmar

  async function manejarGuardar() {
    setGuardando(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setGuardando(false)
      setError('No pudimos guardar la contraseña. Probá de nuevo en un momento.')
      return
    }

    // Recién acá existe una sesión real con la contraseña ya puesta —
    // vinculamos esta cuenta a la fila de usuarios_cliente que el
    // wizard dejó esperando (matchea por email, ver migración 0006).
    const { error: vincularError } = await supabase.rpc('vincular_usuario_actual')
    setGuardando(false)

    if (vincularError) {
      setError('Guardamos la contraseña, pero no pudimos vincular tu cuenta. Avisale a Edgy Sistemas.')
      return
    }

    setListo(true)
  }

  if (verificando) {
    return null
  }

  if (!sesionValida) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <h1 className="text-base font-medium text-gray-900">Este link ya no es válido</h1>
        <p className="text-sm text-gray-500">
          Puede haber vencido o ya haberse usado. Pedile a Edgy Sistemas que te mande una invitación
          nueva.
        </p>
      </div>
    )
  }

  if (listo) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-16 text-center">
        <h1 className="text-base font-medium text-gray-900">Listo, tu cuenta ya está activa</h1>
        <p className="text-sm text-gray-500">Ya podés entrar con tu email y la contraseña que definiste.</p>
        <Button className="w-full" onClick={() => navigate('/')}>
          Ir al sistema
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-16">
      <div>
        <h1 className="text-base font-medium text-gray-900">Definí tu contraseña</h1>
        <p className="mt-1 text-sm text-gray-500">Es la primera vez que entrás — elegí una contraseña para tu cuenta.</p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Contraseña</label>
        <Input
          type="password"
          placeholder="Mínimo 6 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Repetila</label>
        <Input
          type="password"
          placeholder="Repetí la contraseña"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
        />
        {confirmar.length > 0 && password !== confirmar && (
          <p className="mt-2 text-sm text-red-600">No coinciden.</p>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}

      <Button className="w-full" disabled={!puedeGuardar || guardando} onClick={manejarGuardar}>
        {guardando ? 'Guardando...' : 'Guardar y entrar'}
      </Button>
    </div>
  )
}
