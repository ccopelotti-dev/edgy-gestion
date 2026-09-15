// Módulo Landing -- Fase 79 ("Capa 1" del plan de redes): lista de
// productos y combos reales del catálogo, con todos los datos que
// necesita el generador de imagen promocional (nombre, descripción,
// precio, galería de fotos, etiqueta). Mismo criterio de "disponible +
// activo" que ya usa useCatalogoParaLanding.ts y menu_publico.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import type { ItemContenido } from '../types'

interface FilaProducto {
  id: string
  nombre: string
  descripcion: string | null
  precio_venta: number
  imagenes: string[] | null
}

interface FilaCombo {
  id: string
  nombre: string
  descripcion: string | null
  precio_venta: number
  imagenes: string[] | null
  etiqueta: string | null
}

export function useContenidoCatalogo() {
  const { cliente } = useClienteActual()
  const clienteId = cliente?.id ?? null

  const [items, setItems] = useState<ItemContenido[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let cancelado = false

    async function cargar() {
      if (!clienteId) {
        setCargando(false)
        return
      }
      setCargando(true)

      const [productosRes, combosRes] = await Promise.all([
        supabase
          .from('productos')
          .select('id, nombre, descripcion, precio_venta, imagenes')
          .eq('disponible', true)
          .eq('estado', 'activo')
          .order('nombre'),
        supabase
          .from('combos')
          .select('id, nombre, descripcion, precio_venta, imagenes, etiqueta')
          .eq('disponible', true)
          .order('nombre'),
      ])

      if (cancelado) return

      const productos: ItemContenido[] = ((productosRes.data as FilaProducto[] | null) ?? []).map((p) => ({
        id: p.id,
        tipo: 'producto',
        nombre: p.nombre,
        descripcion: p.descripcion ?? '',
        precio: p.precio_venta,
        imagenes: p.imagenes ?? [],
      }))

      const combos: ItemContenido[] = ((combosRes.data as FilaCombo[] | null) ?? []).map((c) => ({
        id: c.id,
        tipo: 'combo',
        nombre: c.nombre,
        descripcion: c.descripcion ?? '',
        precio: c.precio_venta,
        imagenes: c.imagenes ?? [],
        etiqueta: c.etiqueta ?? undefined,
      }))

      setItems([...combos, ...productos])
      setCargando(false)
    }

    cargar()
    return () => {
      cancelado = true
    }
  }, [clienteId])

  return { items, cargando }
}
