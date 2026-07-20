-- ============================================================
-- Backfill de datos (NO cambia el esquema) -- Fase Ventas, 8 hallazgos
-- ============================================================
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, DESPUÉS de haber
-- deployado el código con el fix de saldoCuentaCorriente (ver
-- ADD_COMPROBANTE/ANULAR_COMPROBANTE en src/modules/ventas/data/store.tsx
-- y src/modules/compras/data/store.tsx) y el fix de tolerancia de coma
-- flotante en cobrado/pagado.
--
-- Qué hace, en orden:
--  1) Reconcilia el cobro COB-00003 (Roberto García), que se guardó con
--     imputaciones en cero mientras la factura FAC-00012 seguía pendiente
--     por el mismo importe exacto -- ver bug de imputación bajo-cargada
--     en CobroDialog (ya corregido en el código para que no vuelva a pasar).
--  2) Despega comprobantes trabados en 'cobrado_parcial'/'pagado_parcial'
--     con saldo pendiente prácticamente cero (residuo de coma flotante,
--     confirmado en FAC-00008 / Laura Sánchez) y redondea saldo_pendiente
--     a 2 decimales en general.
--  3) Recalcula saldo_cuenta_corriente de cada cliente/proveedor desde
--     cero, a partir de la deuda real vigente (facturas activas menos
--     notas de crédito activas) -- esto corrige el arrastre histórico que
--     dejó a Roberto García, Ana Fernández y Laura Sánchez (y
--     potencialmente otros) con saldo negativo pese a no tener crédito
--     real a favor. Es la misma fórmula que el código ya mantiene "hacia
--     adelante" con el fix de esta sesión, así que correrla una vez
--     empareja los datos históricos con la lógica nueva.
--
-- Es seguro volver a correrlo: el paso 1 se salta solo si ya se aplicó,
-- y los pasos 2-3 son recálculos idempotentes (no acumulan).
-- ============================================================

-- 1) Reconciliar COB-00003 -> FAC-00012 (Roberto García)
DO $$
DECLARE
  v_cobro_id uuid;
  v_cobro_monto numeric;
  v_factura_id uuid;
  v_factura_saldo numeric;
  v_factura_total numeric;
  v_monto_cobrado numeric;
  v_imputar numeric;
  v_nuevo_saldo numeric;
BEGIN
  SELECT co.id, co.monto INTO v_cobro_id, v_cobro_monto
  FROM cobros co
  JOIN clientes_venta cl ON cl.id = co.cliente_venta_id
  WHERE co.numero = 3 AND cl.nombre ILIKE 'Roberto Garc%'
  LIMIT 1;

  SELECT cv.id, cv.saldo_pendiente, cv.total, cv.monto_cobrado
    INTO v_factura_id, v_factura_saldo, v_factura_total, v_monto_cobrado
  FROM comprobantes_venta cv
  JOIN clientes_venta cl ON cl.id = cv.cliente_venta_id
  WHERE cv.numero = 12 AND cv.tipo = 'factura' AND cl.nombre ILIKE 'Roberto Garc%'
  LIMIT 1;

  IF v_cobro_id IS NULL OR v_factura_id IS NULL THEN
    RAISE NOTICE 'Reconciliación COB-00003/FAC-00012: no se encontraron los registros esperados (¿ya se corrigió, o cambiaron los datos?). Sin cambios.';
  ELSIF EXISTS (SELECT 1 FROM cobro_imputaciones WHERE cobro_id = v_cobro_id) THEN
    RAISE NOTICE 'Reconciliación COB-00003: ya tiene imputaciones cargadas. Sin cambios.';
  ELSE
    v_imputar := LEAST(v_cobro_monto, v_factura_saldo);
    v_nuevo_saldo := GREATEST(0, ROUND((v_factura_total - (v_monto_cobrado + v_imputar))::numeric, 2));

    INSERT INTO cobro_imputaciones (id, cobro_id, comprobante_id, monto_imputado)
    VALUES (gen_random_uuid(), v_cobro_id, v_factura_id, v_imputar);

    UPDATE comprobantes_venta
    SET monto_cobrado = v_monto_cobrado + v_imputar,
        saldo_pendiente = v_nuevo_saldo,
        estado = CASE WHEN v_nuevo_saldo <= 0.01 THEN 'cobrado' ELSE 'cobrado_parcial' END
    WHERE id = v_factura_id;

    RAISE NOTICE 'Reconciliación aplicada: COB-00003 imputado % a FAC-00012.', v_imputar;
  END IF;
END $$;

-- 2) Despegar comprobantes con residuo de coma flotante y redondear
UPDATE comprobantes_venta
SET saldo_pendiente = 0,
    estado = 'cobrado'
WHERE estado = 'cobrado_parcial' AND saldo_pendiente > 0 AND saldo_pendiente <= 0.01;

UPDATE comprobantes_compra
SET saldo_pendiente = 0,
    estado = 'pagado'
WHERE estado = 'pagado_parcial' AND saldo_pendiente > 0 AND saldo_pendiente <= 0.01;

UPDATE comprobantes_venta SET saldo_pendiente = ROUND(saldo_pendiente::numeric, 2);
UPDATE comprobantes_compra SET saldo_pendiente = ROUND(saldo_pendiente::numeric, 2);

-- 3) Recomputar saldo_cuenta_corriente desde la deuda real vigente
UPDATE clientes_venta cl
SET saldo_cuenta_corriente = COALESCE((
  SELECT SUM(CASE
    WHEN cv.tipo = 'factura' THEN cv.saldo_pendiente
    WHEN cv.tipo = 'nota_credito' THEN -cv.total
    ELSE 0
  END)
  FROM comprobantes_venta cv
  WHERE cv.cliente_venta_id = cl.id AND cv.estado <> 'anulado'
), 0);

UPDATE proveedores pr
SET saldo_cuenta_corriente = COALESCE((
  SELECT SUM(CASE
    WHEN cc.tipo = 'factura' THEN cc.saldo_pendiente
    WHEN cc.tipo = 'nota_credito' THEN -cc.total
    ELSE 0
  END)
  FROM comprobantes_compra cc
  WHERE cc.proveedor_id = pr.id AND cc.estado <> 'anulado'
), 0);
