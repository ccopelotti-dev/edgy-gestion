// Gate del módulo Impuestos: un monotributista no liquida IVA por
// régimen general, así que el Libro IVA y la Posición Mensual no le
// aplican -- solo lee `clientes_arca_config.condicion_iva` (Fase 11)
// para decidir qué pestañas mostrar. Si el cliente todavía no
// configuró ARCA, se asume que puede ser responsable inscripto (no
// se oculta nada) para no bloquear a nadie sin datos.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useClienteId } from './useClienteId'

interface UseCondicionIvaResult {
  condicionIva: string | null
  esMonotributo: boolean
  cargando: boolean
}

export function useCondicionIva(): UseCondicionIvaResult {
  const { clienteId, cargando: cargandoClienteId } = useClienteId()
  const [condicionIva, setCondicionIva] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (cargandoClienteId) return
    if (!clienteId) {
      setCargando(false)
      return
    }

    let activo = true
    // Fase 43b (20/08): `clientes_arca_config` tiene RLS activado sin
    // políticas -- un select directo desde acá siempre devolvía vacío
    // (bug preexistente, encontrado al armar el encabezado de Toma de
    // Pedidos). Se lee vía RPC angosta que solo expone `condicion_iva`,
    // sin abrir el resto de la tabla (certificado/clave privada ARCA).
    supabase
      .rpc('obtener_condicion_iva', { p_cliente_id: clienteId })
      .then(({ data }) => {
        if (!activo) return
        setCondicionIva((data as string | null) ?? null)
        setCargando(false)
      })

    return () => {
      activo = false
    }
  }, [clienteId, cargandoClienteId])

  return {
    condicionIva,
    esMonotributo: condicionIva === 'monotributista',
    cargando: cargando || cargandoClienteId,
  }
}
