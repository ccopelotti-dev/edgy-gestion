export function ModuloPendiente({ slug }: { slug: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
      <p className="text-sm font-medium text-gray-900">Módulo "{slug}" activado</p>
      <p className="mt-1 text-sm text-gray-500">
        Todavía no tiene pantalla propia cargada en <code>src/modules/{slug}</code>.
      </p>
    </div>
  )
}
