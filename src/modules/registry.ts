import { lazy } from 'react'

export const REGISTRO_MODULOS: Record<string, ReturnType<typeof lazy>> = {
  tesoreria: lazy(() => import('@/modules/tesoreria')),
}
