// Fase 26: switch "Mostrador / Vista completa" compartido entre
// ModoMostrador.tsx y los dos dashboards operativos (Gastronómico y
// Genérico) -- así se puede cambiar de modo desde cualquiera de los
// dos lados, no solo entrar, también salir.
interface Props {
  activo: boolean
  onChange: (activo: boolean) => void
}

export function ModoMostradorToggle({ activo, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-0.5 text-sm">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={
          activo
            ? 'rounded-full bg-indigo-600 px-3 py-1 font-medium text-white'
            : 'rounded-full px-3 py-1 text-gray-500 hover:text-gray-700'
        }
      >
        Mostrador
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={
          !activo
            ? 'rounded-full bg-indigo-600 px-3 py-1 font-medium text-white'
            : 'rounded-full px-3 py-1 text-gray-500 hover:text-gray-700'
        }
      >
        Vista completa
      </button>
    </div>
  )
}
