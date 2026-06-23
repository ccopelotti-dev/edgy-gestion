-- 0002 — políticas de INSERT que faltaban.
-- El alta de un cliente nuevo (Paso 1 del wizard) sucede ANTES de loguearse,
-- así que necesita su propia regla, distinta de "ver el propio cliente".

-- Cualquiera puede crear un cliente nuevo (es el alta, todavía no hay dueño)
create policy "cualquiera puede crear un cliente nuevo"
  on edgy_gestion.clientes for insert
  with check (true);

-- Poder leer un cliente recién creado, mientras todavía no tiene ningún
-- usuario vinculado (la ventana entre el Paso 1 y el Paso 2 del wizard)
create policy "ver clientes recien creados sin dueño aun"
  on edgy_gestion.clientes for select
  using (
    not exists (
      select 1 from edgy_gestion.usuarios_cliente uc where uc.cliente_id = clientes.id
    )
  );

-- Un usuario logueado puede vincularse a sí mismo a un cliente (Paso 2),
-- o el dueño de un cliente puede agregar más usuarios a su propio equipo (Paso 4)
create policy "vincularse a un cliente o sumar gente al propio equipo"
  on edgy_gestion.usuarios_cliente for insert
  with check (
    user_id = auth.uid()
    or cliente_id = edgy_gestion.cliente_del_usuario_actual()
  );

-- El dueño de un cliente puede asignar permisos a su propio equipo (Paso 4)
create policy "asignar permisos al propio equipo"
  on edgy_gestion.permisos for insert
  with check (
    usuario_cliente_id in (
      select id from edgy_gestion.usuarios_cliente
      where cliente_id = edgy_gestion.cliente_del_usuario_actual()
    )
  );
