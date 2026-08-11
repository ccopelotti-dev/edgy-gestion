import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useLibroIvaVentas } from '../data/useLibroIvaVentas'
import { useLibroIvaCompras } from '../data/useLibroIvaCompras'
import { useClienteId } from '../data/useClienteId'
import { formatARS, formatFecha, periodoActualISO, rangoPeriodo } from '../lib/format'
import { letraDeCodigoComprobante } from '../lib/arcaReferencia'
import {
  generarArchivoVentasCabecera,
  generarArchivoVentasAlicuotas,
  generarArchivoComprasCabecera,
  generarArchivoComprasAlicuotas,
  generarArchivoComprobantesAnulados,
  descargarTxt,
  type ComprobanteAnulado,
} from '../lib/exportLibroIvaDigital'
import type { ComprobanteLibroIva } from '../types'

type Tab = 'ventas' | 'compras'

function useAnulados(tab: Tab, periodo: string) {
  const { clienteId } = useClienteId()
  const [anulados, setAnulados] = useState<ComprobanteAnulado[]>([])

  const cargar = useCallback(async () => {
    if (!clienteId) return
    const { desde, hasta } = rangoPeriodo(periodo)
    const tabla = tab === 'ventas' ? 'comprobantes_venta' : 'comprobantes_compra'
    const { data } = await supabase
      .from(tabla)
      .select('fecha, numero, punto_venta_id, tipo_comprobante_codigo, afip, puntos_venta(numero), updated_at')
      .eq('cliente_id', clienteId)
      .eq('estado', 'anulado')
      .gte('fecha', desde)
      .lte('fecha', hasta)

    setAnulados(
      (data ?? []).map((row: any) => ({
        fecha: row.fecha,
        tipoComprobanteCodigo:
          tab === 'ventas'
            ? row.afip?.tipoComprobanteAfip
              ? String(row.afip.tipoComprobanteAfip).padStart(3, '0')
              : '000'
            : (row.tipo_comprobante_codigo ?? '000'),
        puntoVenta: row.puntos_venta?.numero ?? 0,
        numero: row.numero,
        fechaAnulacion: (row.updated_at ?? row.fecha).slice(0, 10),
      })),
    )
  }, [clienteId, tab, periodo])

  useEffect(() => {
    cargar()
  }, [cargar])

  return anulados
}

function TablaComprobantes({ comprobantes, esCompras }: { comprobantes: ComprobanteLibroIva[]; esCompras: boolean }) {
  if (comprobantes.length === 0) {
    return <p className="text-muted-foreground text-sm">No hay comprobantes en este período.</p>
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-gray-500">
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Tipo</th>
            <th className="px-3 py-2 font-medium">Número</th>
            <th className="px-3 py-2 font-medium">{esCompras ? 'Proveedor' : 'Cliente'}</th>
            <th className="px-3 py-2 text-right font-medium">Neto Gravado</th>
            <th className="px-3 py-2 text-right font-medium">Exento</th>
            <th className="px-3 py-2 text-right font-medium">IVA</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            {esCompras && <th className="px-3 py-2 text-right font-medium">Créd. Fiscal</th>}
          </tr>
        </thead>
        <tbody>
          {comprobantes.map((c) => {
            const letra = letraDeCodigoComprobante(c.tipoComprobanteCodigo)
            return (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                <td className="px-3 py-2 text-xs">{formatFecha(c.fecha)}</td>
                <td className="px-3 py-2 text-xs">{letra ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{String(c.puntoVenta ?? 0).padStart(4, '0')}-{String(c.numero).padStart(8, '0')}</td>
                <td className="px-3 py-2 text-xs">{c.sujetoNombre}</td>
                <td className="px-3 py-2 text-right text-xs">{formatARS(c.netoGravado)}</td>
                <td className="px-3 py-2 text-right text-xs">{formatARS(c.exento)}</td>
                <td className="px-3 py-2 text-right text-xs">{formatARS(c.totalIva)}</td>
                <td className="px-3 py-2 text-right text-xs font-semibold">{formatARS(c.total)}</td>
                {esCompras && (
                  <td className="px-3 py-2 text-right text-xs">
                    {c.creditoFiscalComputable ? formatARS(c.totalIva) : <span className="text-muted-foreground">—</span>}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function LibroIva() {
  const [tab, setTab] = useState<Tab>('ventas')
  const [periodo, setPeriodo] = useState(periodoActualISO())

  const ventas = useLibroIvaVentas(periodo)
  const compras = useLibroIvaCompras(periodo)
  const anulados = useAnulados(tab, periodo)

  const resumen = tab === 'ventas' ? ventas.resumen : compras.resumen
  const cargando = tab === 'ventas' ? ventas.cargando : compras.cargando
  const error = tab === 'ventas' ? ventas.error : compras.error

  function exportarCabecera() {
    if (!resumen) return
    const contenido =
      tab === 'ventas'
        ? generarArchivoVentasCabecera(resumen.comprobantes)
        : generarArchivoComprasCabecera(resumen.comprobantes)
    descargarTxt(contenido, `LIBRO_IVA_DIGITAL_${tab.toUpperCase()}_CBTE_${periodo}.txt`)
  }

  function exportarAlicuotas() {
    if (!resumen) return
    const contenido =
      tab === 'ventas'
        ? generarArchivoVentasAlicuotas(resumen.comprobantes)
        : generarArchivoComprasAlicuotas(resumen.comprobantes)
    descargarTxt(contenido, `LIBRO_IVA_DIGITAL_${tab.toUpperCase()}_ALICUOTAS_${periodo}.txt`)
  }

  function exportarAnulados() {
    const contenido = generarArchivoComprobantesAnulados(anulados)
    descargarTxt(contenido, `LIBRO_IVA_DIGITAL_CBTES_${tab.toUpperCase()}_ANULADOS_${periodo}.txt`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            onClick={() => setTab('ventas')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === 'ventas' ? 'bg-white shadow-sm' : 'text-muted-foreground'}`}
          >
            Ventas
          </button>
          <button
            onClick={() => setTab('compras')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === 'compras' ? 'bg-white shadow-sm' : 'text-muted-foreground'}`}
          >
            Compras
          </button>
        </div>
        <input
          type="month"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="text-muted-foreground text-sm">Cargando Libro IVA...</p>
      ) : resumen ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-muted-foreground text-xs">Neto Gravado</p>
              <p className="text-base font-semibold">{formatARS(resumen.totalNetoGravado)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-muted-foreground text-xs">Exento</p>
              <p className="text-base font-semibold">{formatARS(resumen.totalExento)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-muted-foreground text-xs">IVA</p>
              <p className="text-base font-semibold">{formatARS(resumen.totalIva)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-muted-foreground text-xs">{tab === 'compras' ? 'Crédito Fiscal Computable' : 'Total'}</p>
              <p className="text-base font-semibold">
                {formatARS(tab === 'compras' ? (resumen.totalCreditoFiscalComputable ?? 0) : resumen.totalGeneral)}
              </p>
            </div>
          </div>

          {resumen.porAlicuota.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {resumen.porAlicuota.map((a) => (
                <span key={a.alicuota} className="rounded-full bg-gray-100 px-2.5 py-1">
                  {a.alicuota}%: neto {formatARS(a.netoGravado)} · IVA {formatARS(a.iva)}
                </span>
              ))}
            </div>
          )}

          <TablaComprobantes comprobantes={resumen.comprobantes} esCompras={tab === 'compras'} />

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <span className="text-xs text-muted-foreground mr-1">Exportar Libro IVA Digital (ARCA):</span>
            <Button size="sm" variant="outline" onClick={exportarCabecera} disabled={resumen.comprobantes.length === 0}>
              <Download className="mr-1 h-3.5 w-3.5" />
              Cabecera
            </Button>
            <Button size="sm" variant="outline" onClick={exportarAlicuotas} disabled={resumen.comprobantes.length === 0}>
              <Download className="mr-1 h-3.5 w-3.5" />
              Alícuotas
            </Button>
            <Button size="sm" variant="outline" onClick={exportarAnulados} disabled={anulados.length === 0}>
              <Download className="mr-1 h-3.5 w-3.5" />
              Anulados ({anulados.length})
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}
