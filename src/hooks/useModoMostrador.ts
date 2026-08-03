import { useEffect, useState } from 'react'

// Fase 26: "Modo Mostrador" -- pantalla de accesos grandes (Facturar,
// Cobrar, Consultar artículo, Cargar cliente, Cotización) pensada para
// el puesto de Caja/Mostrador, alternativa al dashboard operativo de
// módulos completo (DashboardOperativoGastronomico/Generico).
//
// Es una preferencia PERSONAL del usuario, no algo fijo por rol: por
// default arranca activada para Cajero/Vendedor y apagada para el
// resto, pero cualquiera puede prenderla o apagarla con el switch (por
// ejemplo un Encargado que en ese momento está cubriendo la caja). La
// elección se guarda en este navegador (localStorage) y se respeta a
// partir de ahí, sin importar qué rol tenga -- el default por rol solo
// aplica la primera vez, antes de que el usuario haya elegido nada.
const STORAGE_KEY = 'edgy_modo_mostrador'

const ROLES_MOSTRADOR_DEFAULT = new Set(['Cajero', 'Vendedor'])

export function useModoMostrador(rolNombre: string | undefined): [boolean, (valor: boolean) => void] {
  const [activo, setActivo] = useState(() => localStorage.getItem(STORAGE_KEY) === '1')
  const [decidido, setDecidido] = useState(() => localStorage.getItem(STORAGE_KEY) !== null)

  // rolNombre puede llegar undefined mientras useClienteActual todavía
  // está cargando -- recién cuando se resuelve (y no hay preferencia
  // guardada todavía) se aplica el default por rol, una única vez.
  useEffect(() => {
    if (decidido || rolNombre === undefined) return
    setActivo(ROLES_MOSTRADOR_DEFAULT.has(rolNombre))
    setDecidido(true)
  }, [rolNombre, decidido])

  function cambiar(valor: boolean) {
    localStorage.setItem(STORAGE_KEY, valor ? '1' : '0')
    setActivo(valor)
    setDecidido(true)
  }

  return [activo, cambiar]
}
