import { lazy } from 'react'

// Cada entrada es un import() dinámico — Vite genera un bundle separado por
// módulo, así un cliente que no tiene "tesoreria" activo ni descarga ese
// código. Para sumar un módulo nuevo: crear su carpeta en src/modules/<slug>
// con un index.tsx que exporte el componente como default, y agregar la
// entrada acá.
export const REGISTRO_MODULOS: Record<string, ReturnType<typeof lazy>> = {
  tesoreria: lazy(() => import('@/modules/tesoreria')),
}
