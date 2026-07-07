import { Outlet } from 'react-router-dom'

export function CajaTurnoLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Caja por turno</h1>
        <p className="text-muted-foreground text-sm">
          Apertura, cierre y arqueo de caja por turno
        </p>
      </div>
      <Outlet />
    </div>
  )
}
