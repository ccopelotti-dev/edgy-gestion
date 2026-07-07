import { useEffect, useState } from 'react'
import { ChefHat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { useComandasCocina, useItemsCocina } from '../data/store'

// KDS (Kitchen Display System): items pendientes/en preparacion de
// todas las comandas abiertas, agrupados por estado_cocina. Una vez
// marcado "listo" el item sale de esta vista (useItemsCocina solo trae
// pendiente/en_preparacion, ver data/store.tsx) -- el mozo lo ve
// resuelto desde la Mesa. El numero de mesa se resuelve con una
// consulta directa a `mesas` (mismo criterio cross-modulo que el resto
// de las paginas de este modulo).
export default function Cocina() {
  const { cliente } = useClienteActual()
  const { dispatch } = useComandasCocina()
  const items = useItemsCocina()
  const [numeroPorMesa, setNumeroPorMesa] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!cliente?.id) return
    supabase
      .from('mesas')
      .select('id, numero')
      .then(({ data }) => {
        const mapa: Record<string, number> = {}
        for (const m of data ?? []) mapa[m.id] = m.numero
        setNumeroPorMesa(mapa)
      })
  }, [cliente?.id])

  const pendientes = items.filter((i) => i.estadoCocina === 'pendiente')
  const enPreparacion = items.filter((i) => i.estadoCocina === 'en_preparacion')

  function avanzar(item: (typeof items)[number], siguiente: 'en_preparacion' | 'listo') {
    dispatch({
      type: 'ACTUALIZAR_ESTADO_ITEM',
      payload: { comandaId: item.comandaId, itemId: item.id, estadoCocina: siguiente },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cocina</h1>
        <p className="text-muted-foreground text-sm">Pedidos pendientes y en preparación en este momento.</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <ChefHat className="text-muted-foreground h-8 w-8" />
          <p className="text-muted-foreground text-sm">No hay pedidos pendientes. Todo al día.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
              Pendiente · {pendientes.length}
            </h2>
            {pendientes.length === 0 && <p className="text-muted-foreground text-sm">Sin pedidos pendientes.</p>}
            {pendientes.map((item) => (
              <Card key={item.id} className="border-red-200">
                <CardContent className="flex flex-col gap-2 py-3">
                  <span className="text-muted-foreground text-xs font-medium">
                    Mesa {numeroPorMesa[item.mesaId] ?? '—'}
                  </span>
                  <div className="font-medium">
                    {item.cantidad}× {item.descripcion}
                  </div>
                  {item.nota && <p className="text-muted-foreground text-xs">{item.nota}</p>}
                  <Button size="sm" onClick={() => avanzar(item, 'en_preparacion')}>
                    Empezar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
              En preparación · {enPreparacion.length}
            </h2>
            {enPreparacion.length === 0 && <p className="text-muted-foreground text-sm">Nada en preparación.</p>}
            {enPreparacion.map((item) => (
              <Card key={item.id} className="border-amber-200">
                <CardContent className="flex flex-col gap-2 py-3">
                  <span className="text-muted-foreground text-xs font-medium">
                    Mesa {numeroPorMesa[item.mesaId] ?? '—'}
                  </span>
                  <div className="font-medium">
                    {item.cantidad}× {item.descripcion}
                  </div>
                  {item.nota && <p className="text-muted-foreground text-xs">{item.nota}</p>}
                  <Button size="sm" variant="outline" onClick={() => avanzar(item, 'listo')}>
                    Marcar listo
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
