-- Fase 69 -- Proveedor informal (préstamo de insumos de terceros)
--
-- Caso real (Carlos, Charcutería, 23/08): una producción se hizo con Sal
-- entrefina y Vino tinto en stock 0, prestados por un familiar. El parche
-- de esa vez fue un ajuste manual "conteo_fisico" al día siguiente que
-- sumó exactamente lo consumido -- funciona para las cuentas de stock,
-- pero miente sobre el origen (no fue un error de conteo, fue un
-- préstamo) y no deja ningún rastro de que hay que devolver o pagar algo.
--
-- Con este flag, un "proveedor informal" (sin CUIT real -- un familiar,
-- un préstamo puntual) se puede cargar en Proveedores como cualquier
-- otro, y lo prestado se registra como una factura normal de ese
-- proveedor con medio_pago='cuenta_corriente' (ControlRemision='no' para
-- que "Actualizar stock" corra al toque) -- reutiliza TODO el circuito ya
-- existente de Comprobantes -> Recepción -> stock, y de saldo de
-- proveedor -> Orden de Pago para saldarlo después (en plata, o con una
-- Nota de Crédito si se le devuelve la mercadería en vez de pagarle).
-- No hace falta ninguna tabla ni pantalla nueva.
alter table edgy_gestion.proveedores
  add column if not exists es_informal boolean not null default false;

comment on column edgy_gestion.proveedores.es_informal is
  'Fase 69: proveedor sin CUIT real (familiar, préstamo puntual de insumos) -- el CUIT queda opcional para estos.';
