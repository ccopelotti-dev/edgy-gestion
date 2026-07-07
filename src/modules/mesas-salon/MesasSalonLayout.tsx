import { Outlet } from 'react-router-dom'

// Un solo módulo, una sola pantalla real (igual que en Frambuesa: todo
// vive en "Mesas y salón", sin sub-tabs). Se deja como Layout separado
// de la página en sí, mismo criterio que el resto de los módulos, por
// si el día de mañana se suma una segunda vista (ej. "Sectores").
export function MesasSalonLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mesas y Salón</h1>
        <p className="text-muted-foreground text-sm">
          Mapa de mesas y estado de ocupación del salón
        </p>
      </div>
      <Outlet />
    </div>
  )
}
