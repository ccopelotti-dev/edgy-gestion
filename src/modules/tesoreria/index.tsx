// PLACEHOLDER — reemplazar este archivo (y esta carpeta entera) con el código
// real del módulo Tesorería que ya está corriendo en el VPS (puerto 5174).
//
// Pasos para migrarlo:
// 1. En el VPS, copiá el contenido de /root/edgy-gestion (el Tesorería actual)
//    a esta carpeta: src/modules/tesoreria/
// 2. Ajustá los imports internos para que usen @/lib/supabase en vez de un
//    cliente de Supabase propio, así todo el dashboard comparte una sola
//    sesión y un solo tenant activo.
// 3. Exportá el componente principal del módulo como default acá abajo,
//    para que el router lo pueda cargar con lazy().
//
// Mientras tanto, este componente solo confirma que el slug "tesoreria"
// ya está conectado al router del dashboard.

export default function TesoreriaPlaceholder() {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
      <p className="text-sm font-medium text-gray-900">Tesorería</p>
      <p className="mt-1 text-sm text-gray-500">
        Esperando el código real del módulo — ver instrucciones en este archivo.
      </p>
    </div>
  )
}
