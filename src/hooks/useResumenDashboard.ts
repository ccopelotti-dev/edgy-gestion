import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { PaymentMethod } from '@/modules/tesoreria/types'

// Resumen ejecutivo para la pantalla de Inicio (/dashboard).
//
// A diferencia de los datos de cada módulo (que viven en el Context de ese
// módulo, montado solo cuando estás DENTRO de /m/<modulo>), acá se consulta
// Supabase directo -- mismo criterio que useReportesInventario -- porque
// Inicio es una ruta hermana, no anidada dentro de ningún módulo, así que
// no hay ningún <TreasuryProvider>/<VentasProvider> ancestro del que leer.
//
// "Saldo de caja" y "flujo de fondos" replican exactamente la misma lógica
// que useSaldoCaja/Dashboard de Tesorería (medio_pago === 'efectivo',
// signado por tipo). "Ventas hoy" replica useDashboardStats de Ventas
// (tipo factura, no anulada, fecha = hoy). "Stock crítico" agrega un
// filtro estado='activo' que Reportes > Inventario no tenía, para no
// alertar sobre productos dados de baja.

interface FlujoMedio {
  medio: PaymentMethod
  ingreso: number
  egreso: number
}

interface ResumenDashboard {
  cargando: boolean
  error: string | null
  saldoCaja: number
  totalBancos: number
  chequesEnCarteraValor: number
  chequesEnCarteraCount: number
  ventasHoy: number
  stockCritico: number
  flujoPorMedio: FlujoMedio[]
}

const DIAS_FLUJO = 30

// OJO: no usar `Date.toISOString()` para calcular "hoy" -- eso da la fecha
// en UTC, y Argentina es UTC-3. Pasadas las 21 hs (hora local) el reloj
// UTC ya cambió de día, así que "ventas hoy" quedaba comparando contra el
// día siguiente y no encontraba nada aunque hubiera ventas cargadas esa
// misma tarde/noche. Esta función arma la fecha a partir de los
// componentes locales del Date (getFullYear/getMonth/getDate), que sí
// respetan la zona horaria del navegador.
function fechaLocalISO(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const VACIO: Omit<ResumenDashboard, 'cargando' | 'error'> = {
  saldoCaja: 0,
  totalBancos: 0,
  chequesEnCarteraValor: 0,
  chequesEnCarteraCount: 0,
  ventasHoy: 0,
  stockCritico: 0,
  flujoPorMedio: [],
}

export function useResumenDashboard(clienteId: string | undefined): ResumenDashboard {
  const [data, setData] = useState(VACIO)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)

    const hoy = new Date()
    const hoyStr = fechaLocalISO(hoy)
    const desdeFlujo = new Date(hoy)
    desdeFlujo.setDate(desdeFlujo.getDate() - DIAS_FLUJO)
    const desdeFlujoStr = fechaLocalISO(desdeFlujo)

    Promise.all([
      supabase.from('movimientos_caja').select('tipo, medio_pago, monto, fecha').eq('cliente_id', clienteId),
      supabase.from('cuentas_bancarias').select('id, saldo_inicial').eq('cliente_id', clienteId),
      supabase.from('movimientos_bancarios').select('cuenta_id, tipo, monto').eq('cliente_id', clienteId),
      supabase.from('cheques').select('tipo, estado, monto').eq('cliente_id', clienteId),
      supabase
        .from('comprobantes_venta')
        .select('tipo, estado, fecha, total')
        .eq('cliente_id', clienteId)
        .eq('fecha', hoyStr),
      supabase.from('productos').select('stock, stock_minimo, estado').eq('cliente_id', clienteId).eq('estado', 'activo'),
    ]).then(([caja, cuentas, bancarios, cheques, comprobantes, productos]) => {
      if (!activo) return

      const conError = [caja, cuentas, bancarios, cheques, comprobantes, productos].find((r) => r.error)
      if (conError) {
        setError('No pudimos cargar el resumen del panel.')
        setCargando(false)
        return
      }

      const cajaRows = caja.data ?? []
      const saldoCaja = cajaRows
        .filter((m) => m.medio_pago === 'efectivo')
        .reduce((acc, m) => acc + (m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)), 0)

      const cuentasRows = cuentas.data ?? []
      const bancariosRows = bancarios.data ?? []
      const totalBancos = cuentasRows.reduce((acc, c) => {
        const movs = bancariosRows.filter((m) => m.cuenta_id === c.id)
        const saldo = movs.reduce(
          (a, m) => a + (m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)),
          Number(c.saldo_inicial),
        )
        return acc + saldo
      }, 0)

      const chequesEnCartera = (cheques.data ?? []).filter((c) => c.tipo === 'recibido' && c.estado === 'en_cartera')
      const chequesEnCarteraValor = chequesEnCartera.reduce((a, c) => a + Number(c.monto), 0)

      const ventasHoy = (comprobantes.data ?? [])
        .filter((c) => c.tipo === 'factura' && c.estado !== 'anulado')
        .reduce((a, c) => a + Number(c.total), 0)

      const stockCritico = (productos.data ?? []).filter((p) => Number(p.stock) <= Number(p.stock_minimo)).length

      const flujoRows = cajaRows.filter((m) => m.fecha >= desdeFlujoStr)
      const porMedio = new Map<string, { ingreso: number; egreso: number }>()
      for (const m of flujoRows) {
        const prev = porMedio.get(m.medio_pago) ?? { ingreso: 0, egreso: 0 }
        if (m.tipo === 'ingreso') prev.ingreso += Number(m.monto)
        else prev.egreso += Number(m.monto)
        porMedio.set(m.medio_pago, prev)
      }
      const flujoPorMedio: FlujoMedio[] = Array.from(porMedio.entries())
        .map(([medio, v]) => ({ medio: medio as PaymentMethod, ...v }))
        .filter((x) => x.ingreso + x.egreso > 0)
        .sort((a, b) => b.ingreso + b.egreso - (a.ingreso + a.egreso))

      setData({
        saldoCaja,
        totalBancos,
        chequesEnCarteraValor,
        chequesEnCarteraCount: chequesEnCartera.length,
        ventasHoy,
        stockCritico,
        flujoPorMedio,
      })
      setCargando(false)
    })

    return () => {
      activo = false
    }
  }, [clienteId])

  return { ...data, cargando, error }
}
