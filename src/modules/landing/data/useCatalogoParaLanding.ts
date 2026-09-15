// Módulo Landing -- lista liviana de productos reales del catálogo,
// para el selector de "Nuestros productos" (y el producto destacado del
// hero). Se apoya en las mismas tablas que ya usa productos-stock
// (productos, rubros), filtrando solo lo que efectivamente aparecería
// en el catálogo público (mismo criterio que menu_publico: disponible +
// activo). No se toca precio acá -- el precio real se resuelve del lado
// público (menu_publico/conector_landing), esto es solo para elegir QUÉ
// productos destacar.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import type { ProductoCatalogoOpcion } from '../types'

interface FilaProducto {
  id: string
  nombre: string
  imagenes: string[] | null
  rubro_id: string | null
}

interface FilaRubro {
  id: string
  nombre: string
}

export function useCatalogoParaLanding() {
  const { cliente } = useClienteActual()
  const clienteId = cliente?.id ?? null

  const [productos, setProductos] = useState<ProductoCatalogoOpcion[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let cancelado = false

    async function cargar() {
      if (!clienteId) {
        setCargando(false)
        return
      }
      setCargando(true)

      const [productosRes, rubrosRes] = await Promise.all([
        supabase
          .from('productos')
          .select('id, nombre, imagenes, rubro_id')
          .eq('disponible', true)
          .eq('estado', 'activo')
          .order('nombre'),
        supabase.from('rubros').select('id, nombre'),
      ])

      if (cancelado) return

      const rubroNombrePorId = new Map<string, string>(
        ((rubrosRes.data as FilaRubro[] | null) ?? []).map((r) => [r.id, r.nombre]),
      )

      const lista: ProductoCatalogoOpcion[] = ((productosRes.data as FilaProducto[] | null) ?? []).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        imagen: p.imagenes?.[0] ?? null,
        rubroNombre: p.rubro_id ? (rubroNombrePorId.get(p.rubro_id) ?? null) : null,
      }))

      setProductos(lista)
      setCargando(false)
    }

    cargar()
    return () => {
      cancelado = true
    }
  }, [clienteId])

  return { productos, cargando }
}
