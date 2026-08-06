import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

/**
 * A esta pantalla se llega desde el link de verificación que Supabase
 * manda al email nuevo (ver CambiarEmailObligatorio.tsx). Igual que
 * CompletarCuenta.tsx, supabase-js detecta el token de la URL solo al
 * cargar la página y deja la sesión lista -- acá solo hace falta
 * sincronizar usuarios_cliente con el email nuevo (confirmar_cambio_email(),
 * RPC de la migración 0077).
 *
 * Si el proyecto tiene "secure email change" activado, Supabase pide
 * confirmación desde LAS DOS casillas (vieja y nueva) antes de terminar
 * el cambio -- confirmar_cambio_email() es un no-op seguro si todavía
 * falta la otra confirmación, así que esta pantalla puede caer más de
 * una vez sin romper nada.
 */
export function ConfirmarCambioEmail() {
  const navigate = useNavigate()
  const [verificando, setVerificando] = useState(true)
  const [confirmado, setConfirmado] = useState(false)
  const [pendienteOtraConfirmacion, setPendienteOtraConfirmacion] = useState(false)

  useEffect(() => {
    async function confirmar() {
      const { data: sesion } = await supabase.auth.getSession()
      if (!sesion.session) {
        setVerificando(false)
        return
      }

      await supabase.rpc('confirmar_cambio_email')

      const { data: authData } = await supabase.auth.getUser()
      const { data: fila } = await supabase
        .from('usuarios_cliente')
        .select('debe_cambiar_email')
        .eq('user_id', authData.user?.id ?? '')
        .maybeSingle()

      setConfirmado(!fila?.debe_cambiar_email)
      setPendienteOtraConfirmacion(!!fila?.debe_cambiar_email)
      setVerificando(false)
    }
    confirmar()
  }, [])

  if (verificando) {
    return null
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-16 text-center">
      {confirmado ? (
        <>
          <h1 className="text-base font-medium text-gray-900">Listo, tu email ya está actualizado</h1>
          <p className="text-sm text-gray-500">Ya podés entrar al sistema con tu nuevo email.</p>
          <Button className="w-full" onClick={() => navigate('/')}>
            Ir al sistema
          </Button>
        </>
      ) : pendienteOtraConfirmacion ? (
        <>
          <h1 className="text-base font-medium text-gray-900">Confirmación registrada</h1>
          <p className="text-sm text-gray-500">
            Tu cuenta pide confirmar el cambio desde las dos casillas. Revisá también tu email
            anterior y confirmá desde ahí para terminar.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-base font-medium text-gray-900">Este link ya no es válido</h1>
          <p className="text-sm text-gray-500">
            Puede haber vencido o ya haberse usado. Pedile a Edgy Sistemas que te mande la
            verificación de nuevo.
          </p>
        </>
      )}
    </div>
  )
}
