import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { REGISTRO_MODULOS } from '@/modules/registry'
import { iconoDeModulo } from '@/modules/iconosModulo'
import { colorDeKit, labelDeVertical } from '@/modules/kits'

// Fase 25b: antes esto usaba un diccionario hardcodeado de
// nombre/descripción, desacoplado a propósito de la tabla `modulos` de
// Supabase -- pero nunca se actualizó con los módulos gastronómicos, por
// eso aparecían como "Sin descripción todavía." aunque la tabla real sí
// tenía el dato. Ahora se lee la tabla real (nombre/descripcion/vertical
// ya están ahí desde las migraciones 0001/0018/0019) y se agrupa el grid
// por vertical -- Núcleo primero, después cada kit con su color.
//
// La fuente de verdad de "qué módulos EXISTEN" sigue siendo
// REGISTRO_MODULOS (src/modules/registry.ts): si a un módulo nuevo se le
// olvidó el insert en la tabla `modulos`, igual aparece acá (agrupado
// como "Sin categoría"), en vez de desaparecer silenciosamente.
interface ModuloInfo {
  slug: string
  nombre: string
  descripcion: string | null
  vertical: string
}

const SIN_CATEGORIA = '__sin_categoria__'

export function ModulosListado() {
  const [busqueda, setBusqueda] = useState('')
  const [porSlug, setPorSlug] = useState<Record<string, ModuloInfo>>({})

  useEffect(() => {
    supabase
      .from('modulos')
      .select('slug, nombre, descripcion, vertical')
      .then(({ data }) => {
        const mapa: Record<string, ModuloInfo> = {}
        for (const m of (data ?? []) as ModuloInfo[]) mapa[m.slug] = m
        setPorSlug(mapa)
      })
  }, [])

  const slugs = Object.keys(REGISTRO_MODULOS)
  const filtrados = slugs.filter((slug) => {
    const nombre = porSlug[slug]?.nombre ?? slug
    return nombre.toLowerCase().includes(busqueda.toLowerCase())
  })

  // Agrupar por vertical, 'core' primero, después el resto en el orden
  // en que aparecen, "Sin categoría" (módulo en código pero no en la
  // tabla) al final.
  const grupos = new Map<string, string[]>()
  for (const slug of filtrados) {
    const vertical = porSlug[slug]?.vertical ?? SIN_CATEGORIA
    const lista = grupos.get(vertical) ?? []
    lista.push(slug)
    grupos.set(vertical, lista)
  }
  const ordenGrupos = Array.from(grupos.keys()).sort((a, b) => {
    if (a === 'core') return -1
    if (b === 'core') return 1
    if (a === SIN_CATEGORIA) return 1
    if (b === SIN_CATEGORIA) return -1
    return a.localeCompare(b)
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium text-gray-900">Módulos</h1>
        <p className="text-sm text-gray-500">{slugs.length} módulos existentes en el código.</p>
        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          "Entrar" te lleva a <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">/m/&lt;slug&gt;</code>,
          la misma ruta que usa cualquier cliente -- como sos staff y no tenés un cliente
          asociado, se abre en modo vista previa: el módulo real, pero vacío (sirve para
          revisar qué pantallas y funciones tiene). Para probarlo con datos de un cliente
          de verdad, activalo desde{' '}
          <Link to="/panel/clientes" className="text-brand-500 hover:underline">Clientes</Link>{' '}
          y entrá con la sesión de ese cliente.
        </p>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      />

      <div className="space-y-8">
        {ordenGrupos.map((vertical) => {
          const esNucleo = vertical === 'core'
          const esSinCategoria = vertical === SIN_CATEGORIA
          const color = esNucleo || esSinCategoria ? null : colorDeKit(vertical)
          const titulo = esSinCategoria ? 'Sin categoría' : labelDeVertical(vertical)

          return (
            <div key={vertical}>
              <div className="mb-3 flex items-center gap-2">
                {color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
                <h2 className="text-sm font-semibold text-gray-700">{titulo}</h2>
              </div>
              <div
                className="grid grid-cols-1 gap-4 rounded-xl sm:grid-cols-2 lg:grid-cols-3"
                style={color ? { backgroundColor: `${color}0D`, padding: '1rem', boxShadow: `inset 0 0 0 1px ${color}33` } : undefined}
              >
                {(grupos.get(vertical) ?? []).map((slug) => {
                  const info = porSlug[slug]
                  const Icono = iconoDeModulo(slug)
                  return (
                    <Link key={slug} to={`/m/${slug}`}>
                      <Card className="flex h-full items-start gap-3 p-4 transition-shadow hover:shadow-md">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-brand-500/10 text-brand-500">
                          <Icono size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{info?.nombre ?? slug}</p>
                          <p className="mt-0.5 text-sm text-gray-500">
                            {info?.descripcion ?? 'Sin descripción todavía.'}
                          </p>
                        </div>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {filtrados.length === 0 && (
        <p className="text-sm text-gray-400">No hay módulos que coincidan con esa búsqueda.</p>
      )}
    </div>
  )
}
