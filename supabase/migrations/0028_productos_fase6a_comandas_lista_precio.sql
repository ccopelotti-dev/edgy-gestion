-- ============================================================
-- Migración 0028: Productos · Fase 6a (Comandas usa listas de precio)
-- Edgy Gestión · schema edgy_gestion
--
-- Primera sub-fase de la Fase 6 del refactor de Productos (que quedó
-- dividida en 6a Comandas, 6b Garantía al facturar, 6c Ventas con
-- catálogo, 6d Delivery con catálogo -- cada una se construye y shipea
-- por separado).
--
-- Se agrega clientes.lista_precio_comandas_id: qué lista de precio
-- (edgy_gestion.listas_precio, ver 0025) usa Comandas/mostrador para
-- cotizar sus líneas. Si es null (default), Comandas sigue usando
-- productos.precio_venta exactamente como antes -- cero riesgo para
-- quien no toca esta configuración. Se administra desde Productos →
-- Listas de precio → "Uso por canal".
--
-- IMPORTANTE -- fix de RLS encontrado al construir esta fase: la tabla
-- `clientes` solo tenía policy de UPDATE para personal de Edgy
-- ("clientes_update_staff", migración 0003) -- ningún admin del negocio
-- cliente podía guardar cambios ahí, ni en Configuración → Empresa (bug
-- preexistente) ni en la nueva config de esta fase. Se agrega una policy
-- adicional (no reemplaza la de staff, las políticas permisivas del
-- mismo comando se combinan con OR) que permite al admin de su propio
-- cliente actualizar su fila.
-- ============================================================

-- ─── RLS: admin del cliente puede editar su propia fila en clientes ───

create policy "clientes_update_propio_admin" on edgy_gestion.clientes
  for update using (
    id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.es_admin_cliente()
  )
  with check (
    id = edgy_gestion.cliente_del_usuario_actual()
    and edgy_gestion.es_admin_cliente()
  );

-- ─── Lista de precio por canal: Comandas / mostrador ─────────

alter table edgy_gestion.clientes
  add column if not exists lista_precio_comandas_id uuid
  references edgy_gestion.listas_precio(id) on delete set null;
