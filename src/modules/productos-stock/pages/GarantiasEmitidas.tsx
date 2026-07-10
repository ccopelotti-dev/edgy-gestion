'use client'

import { useEffect, useState } from 'react'
import { History, Phone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { EmptyState } from '../components/productos/display'
import { formatDate } from '../lib/format'

// ─── Page ─────────────────────────────────────────────────────────────────────
//
// Fase 6b del refactor de Productos: listado de solo lectura de las
// garantías que se activaron automáticamente al facturar en Ventas
// (cuando un producto vendido tenía una plantilla de garantía asignada,
// propia o heredada de su rubro). No se edita ni se borra nada acá --
// el registro se crea solo, desde PuntoDeVenta.tsx al emitir la
// factura. Esta página hace una consulta directa a Supabase (mismo
// criterio que Mesa.tsx en comandas-cocina): garantias_emitidas no es
// parte del state de ProductosStockProvider.

interface GarantiaEmitidaRow {
  id: string
  comprobante_numero: number
  producto_nombre: string
  cantidad: number
  nombre_plantilla: string
  duracion_meses: number
  cobertura: string | null
  cliente_final_nombre: string
  cliente_final_telefono: string
  fecha_inicio: string
  fecha_vencimiento: string
}

function vigente(fechaVencimiento: string): boolean {
  return fechaVencimiento >= new Date().toISOString().slice(0, 10)
}

export default function GarantiasEmitidas() {
  const { cliente } = useClienteActual()
  const [garantias, setGarantias] = useState<GarantiaEmitidaRow[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!cliente?.id) return
    let activo = true
    setCargando(true)
    supabase
      .from('garantias_emitidas')
      .select(
        'id, comprobante_numero, producto_nombre, cantidad, nombre_plantilla, duracion_meses, cobertura, cliente_final_nombre, cliente_final_telefono, fecha_inicio, fecha_vencimiento',
      )
      .eq('cliente_id', cliente.id)
      .order('fecha_inicio', { ascending: false })
      .then(({ data }) => {
        if (!activo) return
        setGarantias((data ?? []) as GarantiaEmitidaRow[])
        setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [cliente?.id])

  return (
    <div className="max-w-4xl space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Garantías emitidas</h2>
        <p className="text-muted-foreground text-sm">
          Se activan solas al facturar en Ventas un producto con garantía asignada. Solo
          lectura -- para cambiar el catálogo de plantillas o a qué rubro/producto aplican, andá
          a la pestaña "Garantías".
        </p>
      </div>

      {cargando ? (
        <p className="text-muted-foreground py-8 text-center text-sm">Cargando…</p>
      ) : garantias.length === 0 ? (
        <EmptyState
          icon={History}
          title="Todavía no se emitió ninguna garantía"
          description="Cuando factures en Ventas un producto con plantilla de garantía asignada, va a aparecer acá automáticamente."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Cliente final</th>
                <th className="px-4 py-3 font-medium">Factura</th>
                <th className="px-4 py-3 font-medium">Plantilla</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {garantias.map((g) => {
                const activa = vigente(g.fecha_vencimiento)
                return (
                  <tr key={g.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <p className="font-medium">{g.producto_nombre}</p>
                      {g.cantidad !== 1 && (
                        <p className="text-muted-foreground text-xs">Cant. {g.cantidad}</p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <p>{g.cliente_final_nombre}</p>
                      {g.cliente_final_telefono && (
                        <p className="text-muted-foreground flex items-center gap-1 text-xs">
                          <Phone className="h-3 w-3" />
                          {g.cliente_final_telefono}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">N.º {g.comprobante_numero}</td>
                    <td className="px-4 py-2">
                      <p>{g.nombre_plantilla}</p>
                      <p className="text-muted-foreground text-xs">
                        {g.duracion_meses} {g.duracion_meses === 1 ? 'mes' : 'meses'}
                        {g.cobertura ? ` · ${g.cobertura}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-2">{formatDate(g.fecha_vencimiento)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          activa
                            ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700'
                            : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500'
                        }
                      >
                        {activa ? 'Vigente' : 'Vencida'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
