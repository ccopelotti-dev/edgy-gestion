import { createClient } from '@supabase/supabase-js'
import { storageCompartidoEntreSubdominios } from './storageCompartido'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copiá .env.example a .env y completá los valores de tu proyecto Supabase.',
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  db: { schema: 'edgy_gestion' },
  auth: {
    // Cookie compartida entre edgysistemas.tech y sus subdominios (ver
    // storageCompartido.ts) en vez del localStorage por defecto, que no
    // cruza de un subdominio a otro.
    storage: storageCompartidoEntreSubdominios,
  },
})

