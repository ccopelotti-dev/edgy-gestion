import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * Fase 30: pantalla que intercepta a un usuario con
 * usuarios_cliente.debe_cambiar_email = true (lo prende el staff desde
 * ClienteDetalle.tsx, ej. cuando se cargó una cuenta con un mail
 * provisorio de Edgy para hacer el trabajo pesado antes de entregarla).
 * DashboardLayout (components/Layout.tsx) la muestra en vez del panel
 * normal hasta que el flag se apague solo -- lo hace
 * confirmar_cambio_email() cuando detecta que auth.users.email
 * realmente cambió, ver ConfirmarCambioEmail.tsx.
 */
export function CambiarEmailObligatorio() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function manejarEnviar() {
    if (!email.trim()) return
    setEnviando(true)
    setError(null)

    const { error: updateError } = await supabase.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: `${window.location.origin}/confirmar-cambio-email` },
    )

    setEnviando(false)
    if (updateError) {
      setError('No pudimos registrar el cambio. Probá de nuevo en un momento.')
      return
    }
    setEnviado(true)
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
    window.location.href = '/ingresar'
  }

  if (enviado) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="mx-auto max-w-md space-y-4 py-16 text-center">
          <h1 className="text-base font-medium text-gray-900">Revisá tu casilla</h1>
          <p className="text-sm text-gray-500">
            Te mandamos un mail a <strong>{email.trim()}</strong> para confirmar el cambio. Si tu
            cuenta pide doble verificación, también puede llegarte un aviso a tu casilla anterior
            -- confirmalo ahí también. Hasta que confirmes, seguís entrando con tu email de
            siempre.
          </p>
          <Button variant="secondary" className="w-full" onClick={cerrarSesion}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-md space-y-6 py-16">
        <div>
          <h1 className="text-base font-medium text-gray-900">Definí tu email de acceso</h1>
          <p className="mt-1 text-sm text-gray-500">
            Antes de seguir, necesitamos que confirmes con qué email vas a entrar de acá en más.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-900">Email nuevo</label>
          <Input
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}

        <Button className="w-full" disabled={!email.trim() || enviando} onClick={manejarEnviar}>
          {enviando ? 'Enviando...' : 'Enviar verificación'}
        </Button>

        <button
          type="button"
          className="block w-full text-center text-sm text-gray-500 hover:text-gray-700"
          onClick={cerrarSesion}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
