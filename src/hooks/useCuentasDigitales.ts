// ============================================================
// Cuentas digitales de un integrante MENOR de edad (Fase 75p)
// ============================================================
// Reemplaza a "Patrimonio" en la Ficha de un Hijo <18 -- ver
// comentario largo en la migración 0141_fase75p_cuentas_digitales.sql.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type TipoCuentaDigital = 'email' | 'mercadopago' | 'otro';

export interface CuentaDigital {
  id: string;
  usuarioClienteId: string;
  tipo: TipoCuentaDigital;
  valor: string;
  notas?: string;
  createdAt: string;
}

export const TIPO_CUENTA_DIGITAL_LABEL: Record<TipoCuentaDigital, string> = {
  email: 'Email',
  mercadopago: 'MercadoPago',
  otro: 'Otra cuenta',
};

function filaACuenta(r: any): CuentaDigital {
  return {
    id: r.id,
    usuarioClienteId: r.usuario_cliente_id,
    tipo: r.tipo,
    valor: r.valor,
    notas: r.notas ?? undefined,
    createdAt: r.created_at,
  };
}

export function useCuentasDigitales(usuarioClienteId?: string) {
  const [cuentas, setCuentas] = useState<CuentaDigital[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!usuarioClienteId) {
      setCuentas([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    const { data } = await supabase
      .from('cuentas_digitales')
      .select('*')
      .eq('usuario_cliente_id', usuarioClienteId)
      .order('created_at');
    setCuentas((data ?? []).map(filaACuenta));
    setCargando(false);
  }, [usuarioClienteId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = useCallback(
    async (data: { clienteId: string; usuarioClienteId: string; tipo: TipoCuentaDigital; valor: string }) => {
      const { error } = await supabase.from('cuentas_digitales').insert({
        cliente_id: data.clienteId,
        usuario_cliente_id: data.usuarioClienteId,
        tipo: data.tipo,
        valor: data.valor,
      });
      if (error) {
        console.error('useCuentasDigitales: error insertando', error);
        return false;
      }
      await cargar();
      return true;
    },
    [cargar],
  );

  const eliminar = useCallback(
    async (id: string) => {
      await supabase.from('cuentas_digitales').delete().eq('id', id);
      await cargar();
    },
    [cargar],
  );

  return { cuentas, cargando, crear, eliminar };
}
