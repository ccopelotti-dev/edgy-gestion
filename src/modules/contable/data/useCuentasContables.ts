import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useClienteId } from './useClienteId'
import type { CuentaContable, TipoCuenta } from '../types'

interface CuentaRow {
  id: string
  codigo: string
  nombre: string
  tipo: TipoCuenta
  cuenta_padre_id: string | null
  imputable: boolean
  activa: boolean
  created_at: string
}

function fromRow(row: CuentaRow): CuentaContable {
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    tipo: row.tipo,
    cuentaPadreId: row.cuenta_padre_id,
    imputable: row.imputable,
    activa: row.activa,
    createdAt: row.created_at,
  }
}

export interface CuentaInput {
  codigo: string
  nombre: string
  tipo: TipoCuenta
  cuentaPadreId?: string | null
  imputable: boolean
}

interface UseCuentasContablesResult {
  cuentas: CuentaContable[]
  cargando: boolean
  error: string | null
  crear: (input: CuentaInput) => Promise<{ error: string | null }>
  actualizar: (id: string, input: CuentaInput) => Promise<{ error: string | null }>
  inactivar: (id: string) => Promise<{ error: string | null }>
  reactivar: (id: string) => Promise<{ error: string | null }>
  eliminar: (id: string) => Promise<{ error: string | null }>
  recargar: () => Promise<void>
}

/**
 * Plan de cuentas -- Supabase-backed. El seed estándar argentino se aplica
 * en la base (0014_modulo_contable.sql, trigger al activar el módulo), acá
 * solo se lee y se administra.
 */
export function useCuentasContables(): UseCuentasContablesResult {
  const { clienteId, cargando: cargandoClienteId, error: errorClienteId } = useClienteId()
  const [cuentas, setCuentas] = useState<CuentaContable[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    if (!clienteId) {
      setCargando(false)
      return
    }
    setCargando(true)
    const { data, error: errFetch } = await supabase
      .from('cuentas_contables')
      .select('id, codigo, nombre, tipo, cuenta_padre_id, imputable, activa, created_at')
      .eq('cliente_id', clienteId)
      .order('codigo')

    if (errFetch) {
      setError('No pudimos cargar el plan de cuentas.')
      setCargando(false)
      return
    }
    setError(null)
    setCuentas((data ?? []).map(fromRow))
    setCargando(false)
  }, [clienteId])

  useEffect(() => {
    if (cargandoClienteId) return
    if (errorClienteId) {
      setError(errorClienteId)
      setCargando(false)
      return
    }
    recargar()
  }, [cargandoClienteId, errorClienteId, recargar])

  async function crear(input: CuentaInput) {
    if (!clienteId) return { error: 'No se pudo resolver el cliente.' }
    const { error: errIns } = await supabase.from('cuentas_contables').insert({
      cliente_id: clienteId,
      codigo: input.codigo,
      nombre: input.nombre,
      tipo: input.tipo,
      cuenta_padre_id: input.cuentaPadreId ?? null,
      imputable: input.imputable,
    })
    if (errIns) return { error: errIns.message.includes('duplicate') ? 'Ya existe una cuenta con ese código.' : 'No pudimos crear la cuenta.' }
    await recargar()
    return { error: null }
  }

  async function actualizar(id: string, input: CuentaInput) {
    const { error: errUpd } = await supabase
      .from('cuentas_contables')
      .update({
        codigo: input.codigo,
        nombre: input.nombre,
        tipo: input.tipo,
        cuenta_padre_id: input.cuentaPadreId ?? null,
        imputable: input.imputable,
      })
      .eq('id', id)
    if (errUpd) return { error: 'No pudimos actualizar la cuenta.' }
    await recargar()
    return { error: null }
  }

  async function inactivar(id: string) {
    const { error: errUpd } = await supabase.from('cuentas_contables').update({ activa: false }).eq('id', id)
    if (errUpd) return { error: 'No pudimos inactivar la cuenta.' }
    await recargar()
    return { error: null }
  }

  async function reactivar(id: string) {
    const { error: errUpd } = await supabase.from('cuentas_contables').update({ activa: true }).eq('id', id)
    if (errUpd) return { error: 'No pudimos reactivar la cuenta.' }
    await recargar()
    return { error: null }
  }

  async function eliminar(id: string) {
    const { error: errDel } = await supabase.from('cuentas_contables').delete().eq('id', id)
    if (errDel) {
      return {
        error: 'No pudimos eliminar la cuenta -- probablemente tenga movimientos o sub-cuentas. Podés inactivarla en su lugar.',
      }
    }
    await recargar()
    return { error: null }
  }

  return {
    cuentas,
    cargando: cargando || cargandoClienteId,
    error,
    crear,
    actualizar,
    inactivar,
    reactivar,
    eliminar,
    recargar,
  }
}
