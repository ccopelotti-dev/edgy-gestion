import { createClient } from '@supabase/supabase-js'

// Auth server-to-server para los endpoints /agente-* (Fase 50, Capa 2
// del esquema de Carlos). A diferencia del resto de las Netlify
// Functions de este repo -- que validan una sesión de usuario (Bearer
// del login) o se autoverifican contra un proveedor externo (los
// webhooks de pago) -- estos endpoints los va a llamar el futuro VPS
// (n8n), que no tiene sesión de usuario ni nada que verificar contra
// un tercero. Se valida con una API key fija por tenant, mandada en el
// header `X-Api-Key`, contra clientes_agente_config.
//
// El prefijo `_` en el nombre de la carpeta es a propósito -- Netlify
// ignora archivos/carpetas que empiezan con `_` al armar la lista de
// endpoints, así que esto queda como helper compartido y no como una
// función pública más.
//
// Carpeta `_lib` -- primer helper compartido entre Netlify Functions de
// este repo (hasta ahora cada función repetía su propio código). Si se
// suma un segundo caso de reutilización real, vale la pena mover acá
// más lógica común (ej. el patrón de validar sesión + admin que
// comparten pago-guardar-config.js/getnet-guardar-config.js/etc.).

export function crearSupabaseAdmin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'edgy_gestion' } },
  )
}

// Devuelve { clienteId } si la API key es válida y el tenant está
// activo, o null si no. No lanza -- el caller decide qué status code
// devolver (siempre 401 en la práctica).
export async function autenticarAgente(req, supabaseAdmin) {
  const apiKey = req.headers.get('x-api-key') || ''
  if (!apiKey) return null

  const { data, error } = await supabaseAdmin
    .from('clientes_agente_config')
    .select('cliente_id, activo')
    .eq('api_key', apiKey)
    .maybeSingle()

  if (error || !data || !data.activo) return null
  return { clienteId: data.cliente_id }
}
