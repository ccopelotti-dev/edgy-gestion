// Fase 71 (05/09, motor de permisos por rol -- ver useClienteActual.ts):
// pantalla que se muestra cuando alguien entra a la URL de un módulo que
// no tiene activo, o que su rol tiene explícitamente en 'sin_acceso'
// (ej. el rol "Hijo" entrando a algo que no sea Home Keep). No distingue
// entre esos dos motivos -- para quien lo ve, el resultado es el mismo:
// no puede entrar, y si le parece raro tiene que hablarlo con el
// administrador de la cuenta, no reintentar solo.
export function AccesoRestringido({ slug }: { slug: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
      <p className="text-sm font-medium text-gray-900">No tenés acceso a "{slug}"</p>
      <p className="mt-1 text-sm text-gray-500">
        Tu usuario no tiene permiso para ver este módulo. Si te parece que debería, hablalo con el
        administrador de la cuenta.
      </p>
    </div>
  )
}
