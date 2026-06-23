import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MODULOS_SUGERIDOS } from '@/types'
import type { Modulo, TipoNegocio } from '@/types'

interface Paso3Props {
  tipoNegocio: TipoNegocio
  onContinuar: (modulosSeleccionados: string[]) => void
}

export function Paso3Modulos({ tipoNegocio, onContinuar }: Paso3Props) {
  const [modulos, setModulos] = useState<Modulo[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase.from('modulos').select('*').order('vertical')
      const lista = data ?? []
      setModulos(lista)

      const sugeridos = MODULOS_SUGERIDOS[tipoNegocio] ?? []
      const preseleccion = lista
        .filter((m) => m.vertical === 'core' || sugeridos.includes(m.slug))
        .map((m) => m.id)
      setSeleccionados(new Set(preseleccion))
      setCargando(false)
    }
    cargar()
  }, [tipoNegocio])

  function toggle(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (cargando) {
    return <p className="text-sm text-gray-400">Cargando módulos disponibles...</p>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-medium text-gray-900">Elegí los módulos para este negocio</h2>
        <p className="mt-1 text-sm text-gray-500">
          Ya te tildamos los recomendados para este tipo de negocio. Podés sumar o sacar los que quieras.
        </p>
      </div>

      <div className="space-y-2">
        {modulos.map((modulo) => (
          <Card key={modulo.id} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-gray-900">{modulo.nombre}</p>
              {modulo.descripcion && (
                <p className="text-sm text-gray-500">{modulo.descripcion}</p>
              )}
            </div>
            <Switch checked={seleccionados.has(modulo.id)} onChange={() => toggle(modulo.id)} />
          </Card>
        ))}
      </div>

      <Button
        className="w-full"
        disabled={seleccionados.size === 0}
        onClick={() => onContinuar(Array.from(seleccionados))}
      >
        Activar {seleccionados.size} módulo{seleccionados.size === 1 ? '' : 's'}
      </Button>
    </div>
  )
}
