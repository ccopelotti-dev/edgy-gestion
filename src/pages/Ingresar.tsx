import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * Hasta ahora el único login real vivía en un modal de la landing
 * (edgysistemas.tech) — un cliente que entraba directo a su propio
 * subdominio (ej. la-charcuteria-express.edgysistemas.tech) sin sesión
 * se encontraba con un mensaje muerto, sin manera de loguearse ahí
 * mismo. Esta pantalla vive en esta misma app, en cualquier
 * subdominio — no depende de la landing.
 */
export function Ingresar() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [recuperando, setRecuperando] = useState(false)
  const [recuperado, setRecuperado] = useState(false)

  async function manejarIngresar() {
    setEnviando(true)
    setError(null)
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    setEnviando(false)

    if (loginError) {
      setError('Email o contraseña incorrectos.')
      return
    }

    navigate('/')
  }

  async function manejarOlvideContrasena() {
    if (!email.trim()) {
      setError('Escribí tu email arriba primero, y volvé a tocar "Olvidé mi contraseña".')
      return
    }
    setRecuperando(true)
    setError(null)
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://panel.edgysistemas.tech/completar-cuenta',
    })
    setRecuperando(false)
    setRecuperado(true)
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-16">
      <div>
        <h1 className="text-base font-medium text-gray-900">Ingresar</h1>
        <p className="mt-1 text-sm text-gray-500">Entrá con tu email y tu contraseña.</p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Email</label>
        <Input
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Contraseña</label>
        <Input
          type="password"
          placeholder="Tu contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}
      {recuperado && (
        <p className="rounded-lg bg-green-50 px-3.5 py-2.5 text-sm text-green-700">
          Si ese email tiene cuenta, te llega un mail para definir una contraseña nueva.
        </p>
      )}

      <Button className="w-full" disabled={enviando} onClick={manejarIngresar}>
        {enviando ? 'Ingresando...' : 'Ingresar'}
      </Button>

      <button
        type="button"
        className="block w-full text-center text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
        disabled={recuperando}
        onClick={manejarOlvideContrasena}
      >
        {recuperando ? 'Enviando...' : 'Olvidé mi contraseña'}
      </button>
    </div>
  )
}
