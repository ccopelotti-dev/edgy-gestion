import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MODULOS_SUGERIDOS } from '@/types'
import type { Modulo, TipoNegocio } from '@/types'
import { colorDeKit, labelDeVertical } from '@/modules/kits'

interface Paso3Props {
  tipoNegocio: TipoNegocio
  onContinuar: (modulosSeleccionados: string[]) => void
  /** Si se pasa, se usa tal cual en vez de calcular la sugerencia por tipo
   * de negocio — es el caso de "gestionar módulos de un cliente existente",
   * donde la preselección tiene que ser lo que ya está activo de verdad. */
  preseleccionados?: string[]
  textoBoton?: (cantidad: number) => string
}

export function Paso3Modulos({
  tipoNegocio,
  onContinuar,
  preseleccionados,
  textoBoton,
}: Paso3Props) {
  const [modulos, setModulos] = useState<Modulo[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase.from('modulos').select('*').order('vertical')
      const lista = data ?? []
      setModulos(lista)

      if (preseleccionados) {
        setSeleccionados(new Set(preseleccionados))
      } else {
        const sugeridos = MODULOS_SUGERIDOS[tipoNegocio] ?? []
        const preseleccion = lista
          .filter((m) => m.vertical === 'core' || sugeridos.includes(m.slug))
          .map((m) => m.id)
        setSeleccionados(new Set(preseleccion))
      }
      setCargando(false)
    }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Fase 25c: agrupar por vertical (Núcleo primero, después cada kit con
  // su color -- mismo criterio visual que Sidebar.tsx y ModulosListado.tsx)
  // en vez de una lista plana. Deja la base lista para cuando Fase 15
  // subdivida 'gastronomico' en variantes con/sin salón: cada variante
  // aparecería acá como su propia sección.
  const grupos = new Map<string, Modulo[]>()
  for (const m of modulos) {
    const lista = grupos.get(m.vertical) ?? []
    lista.push(m)
    grupos.set(m.vertical, lista)
  }
  const ordenGrupos = Array.from(grupos.keys()).sort((a, b) => {
    if (a === 'core') return -1
    if (b === 'core') return 1
    return a.localeCompare(b)
  })

  function toggleSeccion(idsDeLaSeccion: string[], activar: boolean) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      for (const id of idsDeLaSeccion) {
        if (activar) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-medium text-gray-900">Elegí los módulos para este negocio</h2>
        <p className="mt-1 text-sm text-gray-500">
          Ya te tildamos los recomendados para este tipo de negocio. Podés sumar o sacar los que quieras.
        </p>
      </div>

      <div className="space-y-6">
        {ordenGrupos.map((vertical) => {
          const esNucleo = vertical === 'core'
          const color = esNucleo ? null : colorDeKit(vertical)
          const idsDeLaSeccion = (grupos.get(vertical) ?? []).map((m) => m.id)
          const todosActivos = idsDeLaSeccion.every((id) => seleccionados.has(id))

          return (
            <div key={vertical}>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
                  <h3 className="text-sm font-semibold text-gray-700">{labelDeVertical(vertical)}</h3>
                </div>
                {!esNucleo && (
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-500 hover:underline"
                    onClick={() => toggleSeccion(idsDeLaSeccion, !todosActivos)}
                  >
                    {todosActivos ? 'Desactivar todo' : 'Activar todo el kit'}
                  </button>
                )}
              </div>
              <div
                className="space-y-2 rounded-xl"
                style={color ? { backgroundColor: `${color}0D`, padding: '0.75rem', boxShadow: `inset 0 0 0 1px ${color}33` } : undefined}
              >
                {(grupos.get(vertical) ?? []).map((modulo) => (
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
            </div>
          )
        })}
      </div>

      <Button
        className="w-full"
        disabled={seleccionados.size === 0}
        onClick={() => onContinuar(Array.from(seleccionados))}
      >
        {textoBoton
          ? textoBoton(seleccionados.size)
          : `Activar ${seleccionados.size} módulo${seleccionados.size === 1 ? '' : 's'}`}
      </Button>
    </div>
  )
}
