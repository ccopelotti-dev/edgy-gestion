import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function Paso2Auth() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function continuarConGoogle() {
    setError(null)
    const { error: errOAuth } = await supabase.auth.signInWithOAuth({ provider: 'google' })
    if (errOAuth) setError(errOAuth.message)
  }

  async function continuarConCorreo() {
    if (!email.trim()) return
    setEnviando(true)
    setError(null)
    const { error: errOtp } = await supabase.auth.signInWithOtp({ email })
    setEnviando(false)
    if (errOtp) {
      setError(errOtp.message)
      return
    }
    setEnviado(true)
  }

  if (enviado) {
    return (
      <div className="mx-auto max-w-md space-y-3 text-center">
        <p className="text-base font-medium text-gray-900">Revisá tu correo</p>
        <p className="text-sm text-gray-500">
          Te mandamos un link de acceso a <span className="font-medium">{email}</span>. Abrilo
          (podés hacerlo en esta pestaña o en una nueva, da igual) y vas a volver acá solo, en el
          paso de módulos.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Button variant="secondary" className="w-full" onClick={continuarConGoogle}>
        Continuar con Google
      </Button>
      <p className="text-center text-sm text-gray-500">
        Tu correo queda confirmado al instante · sin contraseñas
      </p>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400">
        <span className="h-px flex-1 bg-gray-200" />
        O con tu correo
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Tu correo</label>
        <Input
          type="email"
          placeholder="vos@tunegocio.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="mt-2 text-sm text-gray-500">
          Te mandamos un link de acceso a esa dirección, sin contraseñas.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button className="w-full" disabled={enviando || !email.trim()} onClick={continuarConCorreo}>
        {enviando ? 'Enviando...' : 'Continuar'}
      </Button>
    </div>
  )
}
