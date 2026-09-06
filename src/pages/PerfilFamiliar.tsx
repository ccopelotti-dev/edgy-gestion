// ============================================================
// Perfil Familiar (Fase 71b, 05/09, a pedido de Carlos)
// ============================================================
// Pantalla para que el Admin/Dueño de la cuenta dé de alta a otros
// integrantes de la familia con login propio, y les asigne un rol
// restringido (ej. "Hijo" -- ve solo Home Keep, ver useClienteActual.ts
// y ModuloRoute.tsx, Fase 71). No es un módulo de negocio (no vive bajo
// /m/:slug ni en el registro de módulos) -- es una pantalla de cuenta,
// por eso se accede desde el dropdown "Cuenta" del header (Layout.tsx),
// el mismo círculo que Carlos marcó en su mockup.
//
// El alta en sí (insert en usuarios_cliente) se hace directo desde acá
// con el cliente de Supabase normal -- la política RLS
// `usuarios_cliente_insert_admin` ya permite que un admin cree filas
// para su propio cliente_id, no hace falta pasar por una función. Lo
// único que SÍ necesita la service_role key (y por eso pasa por
// invitar-familiar.js) es el paso de darle acceso real.
//
// Fase 71c (05/09, a pedido de Carlos): cargar a alguien y darle acceso
// son dos pasos separados a propósito -- un hijo chico se puede cargar
// hoy (nombre, rol) y activarle el acceso más adelante, cuando el admin
// lo decida. Por eso ya NO se manda la invitación automáticamente al
// guardar: cada fila "pendiente" ofrece dos caminos --
//   - "Enviar invitación por mail": la persona define su propia
//     contraseña (Supabase le manda el link). Pensado para alguien que
//     ya maneja su correo.
//   - "Definir contraseña yo": el admin la elige acá mismo, sin mandar
//     ningún mail. Pensado para un hijo chico -- el admin le da el
//     usuario y la contraseña de palabra cuando le parece.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useClienteActual } from '@/hooks/useClienteActual'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { AccesoRestringido } from '@/modules/AccesoRestringido'
import type { UsuarioCliente } from '@/types'
// Fase 71i (06/09, a pedido de Carlos): un Ingreso de tipo 'ingreso_familiar'
// (Home Keep) puede quedar vinculado a la persona real -- se reutiliza acá
// el mismo diálogo de alta de Home Keep en vez de duplicar el formulario,
// con la persona ya fijada (`integranteFijo`). Esta pantalla vive fuera del
// árbol de HomeKeepProvider, así que el guardado NO pasa por su store/reducer
// -- inserta directo en `ingresos_hogar` con el mismo mapeo de columnas.
import { IngresoDialog } from '@/modules/home-keep/components/dialogs'
import { formatARS, formatDate } from '@/modules/home-keep/lib/format'
import { TIPO_INGRESO_LABEL, generarId, type Ingreso } from '@/modules/home-keep/types'

interface RolLiviano {
  id: string
  nombre: string
}

// Fase 71g (06/09, a pedido de Carlos, inspirado en el selector de
// color de perfil de Chrome): paleta fija en vez de un color picker
// libre -- alcanza para diferenciar a un puñado de integrantes de la
// familia de un vistazo, y evita combinaciones ilegibles (texto blanco
// sobre un color pastel clarísimo, etc.).
const COLORES_PERFIL = [
  '#4F46E5', // índigo
  '#DC2626', // rojo
  '#EA580C', // naranja
  '#CA8A04', // ámbar
  '#16A34A', // verde
  '#0D9488', // verde azulado
  '#2563EB', // azul
  '#9333EA', // violeta
  '#DB2777', // rosa
  '#57534E', // gris piedra
]

function iniciales(nombre: string | null): string {
  if (!nombre) return '?'
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  return partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function AvatarFamiliar({ nombre, color }: { nombre: string | null; color: string | null }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: color ?? '#9CA3AF' }}
    >
      {iniciales(nombre)}
    </span>
  )
}

function SelectorColor({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORES_PERFIL.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Elegir color ${c}`}
          className={`h-7 w-7 rounded-full transition-transform ${
            value === c ? 'ring-2 ring-offset-2 ring-gray-900 scale-105' : ''
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

// Fase 71h (06/09, a pedido de Carlos, inspirado en la pantalla de
// "Información personal" de la cuenta de Google): al hacer click en
// cualquier integrante ya cargado (incluido el propio Dueño) se abre
// este dialog para ir completando sus datos administrativos con el
// tiempo. Email y rol quedan de solo lectura acá a propósito -- tocar
// el email de alguien que YA tiene login real requeriría además
// actualizar su cuenta de Supabase Auth (no solo la fila de la tabla),
// y cambiar el rol reabre todo el tema de permisos_rol (Fase 71) -- las
// dos cosas merecen su propio flujo más adelante, no colarse acá.
function EditarFamiliarDialog({
  usuario,
  onClose,
  onGuardado,
}: {
  usuario: UsuarioCliente | null
  onClose: () => void
  onGuardado: (actualizado: UsuarioCliente) => void
}) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [color, setColor] = useState<string>(COLORES_PERFIL[0])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fase 71i: ingresos de Home Keep (tipo 'ingreso_familiar') vinculados
  // a esta persona -- misma tabla que ve Home Keep > Ingresos, mostrada
  // acá como la otra puerta de entrada de la relación.
  const [ingresosAsociados, setIngresosAsociados] = useState<Ingreso[]>([])
  const [cargandoIngresos, setCargandoIngresos] = useState(false)
  const [mostrarIngresoDialog, setMostrarIngresoDialog] = useState(false)

  useEffect(() => {
    if (!usuario) return
    setNombre(usuario.nombre ?? '')
    setTelefono(usuario.telefono ?? '')
    setFechaNacimiento(usuario.fecha_nacimiento ?? '')
    setColor(usuario.color ?? COLORES_PERFIL[0])
    setError(null)
  }, [usuario])

  useEffect(() => {
    if (!usuario) {
      setIngresosAsociados([])
      return
    }
    let activo = true
    setCargandoIngresos(true)
    supabase
      .from('ingresos_hogar')
      .select('*')
      .eq('usuario_cliente_id', usuario.id)
      .order('fecha', { ascending: false })
      .then(({ data }) => {
        if (!activo) return
        const filas: Ingreso[] = (data ?? []).map((r: any) => ({
          id: r.id,
          fecha: r.fecha,
          tipo: r.tipo,
          origen: r.origen ?? undefined,
          usuarioClienteId: r.usuario_cliente_id ?? undefined,
          concepto: r.concepto ?? undefined,
          monto: Number(r.monto),
          medioPago: r.medio_pago ?? undefined,
          recurrente: r.recurrente,
          diaMesRecurrente: r.dia_mes_recurrente ?? undefined,
          notas: r.notas ?? undefined,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }))
        setIngresosAsociados(filas)
        setCargandoIngresos(false)
      })
    return () => {
      activo = false
    }
  }, [usuario])

  async function guardarIngreso(data: {
    fecha: string
    tipo: Ingreso['tipo']
    origen: string
    usuarioClienteId?: string
    concepto: string
    monto: number
    recurrente: boolean
    diaMesRecurrente?: number
    notas: string
  }) {
    if (!usuario) return
    const { data: creado, error: errInsert } = await supabase
      .from('ingresos_hogar')
      .insert({
        id: generarId(),
        cliente_id: usuario.cliente_id,
        fecha: data.fecha,
        tipo: data.tipo,
        origen: data.origen || null,
        usuario_cliente_id: data.usuarioClienteId ?? usuario.id,
        concepto: data.concepto || null,
        monto: data.monto,
        medio_pago: null,
        recurrente: data.recurrente,
        dia_mes_recurrente: data.diaMesRecurrente ?? null,
        notas: data.notas || null,
      })
      .select()
      .single()

    if (errInsert || !creado) {
      console.error('PerfilFamiliar: error insertando ingresos_hogar', errInsert)
      return
    }

    setIngresosAsociados((prev) => [
      {
        id: creado.id,
        fecha: creado.fecha,
        tipo: creado.tipo,
        origen: creado.origen ?? undefined,
        usuarioClienteId: creado.usuario_cliente_id ?? undefined,
        concepto: creado.concepto ?? undefined,
        monto: Number(creado.monto),
        recurrente: creado.recurrente,
        diaMesRecurrente: creado.dia_mes_recurrente ?? undefined,
        notas: creado.notas ?? undefined,
        createdAt: creado.created_at,
        updatedAt: creado.updated_at,
      },
      ...prev,
    ])
  }

  async function eliminarIngreso(id: string) {
    await supabase.from('ingresos_hogar').delete().eq('id', id)
    setIngresosAsociados((prev) => prev.filter((i) => i.id !== id))
  }

  async function guardar() {
    if (!usuario) return
    setGuardando(true)
    setError(null)
    const { data, error: errUpdate } = await supabase
      .from('usuarios_cliente')
      .update({
        nombre: nombre.trim() || null,
        telefono: telefono.trim() || null,
        fecha_nacimiento: fechaNacimiento || null,
        color,
      })
      .eq('id', usuario.id)
      .select()
      .single()

    setGuardando(false)

    if (errUpdate || !data) {
      console.error('PerfilFamiliar: error actualizando usuarios_cliente', errUpdate)
      setError('No se pudo guardar. Probá de nuevo.')
      return
    }

    onGuardado(data as UsuarioCliente)
  }

  return (
    <Dialog
      open={!!usuario}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{usuario?.nombre ?? 'Editar integrante'}</DialogTitle>
          <DialogDescription>
            {usuario?.rol}
            {usuario?.email ? ` · ${usuario.email}` : ''} -- el email y el rol no se editan desde acá.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Nombre y apellido</label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Teléfono</label>
              <Input
                placeholder="Ej. 2954 12-3456"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Fecha de nacimiento</label>
              <Input
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Color identificatorio</label>
            <SelectorColor value={color} onChange={setColor} />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Fase 71i: ingresos que aporta -- misma tabla que Home Keep >
              Ingresos (tipo 'ingreso_familiar'), vista desde la ficha. */}
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500">Ingresos que aporta</label>
              <Button variant="outline" size="sm" onClick={() => setMostrarIngresoDialog(true)}>
                + Agregar ingreso
              </Button>
            </div>
            {cargandoIngresos ? (
              <p className="text-xs text-gray-400">Cargando...</p>
            ) : ingresosAsociados.length === 0 ? (
              <p className="text-xs text-gray-400">Todavía no tiene ningún ingreso cargado.</p>
            ) : (
              <ul className="space-y-1.5">
                {ingresosAsociados.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5 text-xs"
                  >
                    <div>
                      <span className="font-medium text-gray-900">{formatARS(i.monto)}</span>
                      <span className="text-gray-500">
                        {' '}
                        · {i.concepto || TIPO_INGRESO_LABEL[i.tipo]} · {formatDate(i.fecha)}
                        {i.recurrente ? ` · fijo (día ${i.diaMesRecurrente ?? '—'})` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => eliminarIngreso(i.id)}
                      className="text-gray-400 hover:text-red-600"
                      title="Eliminar"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {usuario && (
        <IngresoDialog
          open={mostrarIngresoDialog}
          onOpenChange={setMostrarIngresoDialog}
          integranteFijo={{ id: usuario.id, nombre: usuario.nombre ?? usuario.email ?? 'Sin nombre' }}
          onSave={guardarIngreso}
        />
      )}
    </Dialog>
  )
}

export default function PerfilFamiliar() {
  const { cliente, rolActual, cargando: cargandoCliente } = useClienteActual()

  const [usuarios, setUsuarios] = useState<UsuarioCliente[]>([])
  const [rolesDisponibles, setRolesDisponibles] = useState<RolLiviano[]>([])
  const [cargando, setCargando] = useState(true)

  const [mostrarForm, setMostrarForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [rolId, setRolId] = useState('')
  // Fase 71g: campos opcionales del perfil -- se puede agregar a
  // alguien sin completar ninguno de los tres, no bloquean el alta.
  const [telefono, setTelefono] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [color, setColor] = useState<string>(COLORES_PERFIL[0])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [invitandoId, setInvitandoId] = useState<string | null>(null)
  const [asignandoId, setAsignandoId] = useState<string | null>(null)
  // Fase 71c: fila donde está abierto el campo para que el admin
  // escriba la contraseña, y su valor mientras se completa.
  const [passwordFormId, setPasswordFormId] = useState<string | null>(null)
  const [passwordValor, setPasswordValor] = useState('')
  // Fase 71h: integrante sobre el que está abierto el dialog de edición
  // de datos personales (null = cerrado).
  const [editando, setEditando] = useState<UsuarioCliente | null>(null)

  useEffect(() => {
    if (!cliente) return
    let activo = true

    async function cargar() {
      setCargando(true)
      const [{ data: usuariosData }, { data: rolesData }] = await Promise.all([
        supabase
          .from('usuarios_cliente')
          .select('*')
          .eq('cliente_id', cliente!.id)
          .order('created_at'),
        // Fase 71e (bug real: este selector mostraba también roles de
        // staff del negocio como "Cajero"/"Mozo", porque el filtro
        // original era "no admin" y esos roles tampoco son admin). Ahora
        // se filtra por `es_familiar` -- la marca explícita para roles
        // pensados para integrantes de la familia (Hijo, Cónyuge), no
        // para el equipo operativo del negocio.
        supabase
          .from('roles')
          .select('id, nombre')
          .eq('cliente_id', cliente!.id)
          .eq('es_familiar', true)
          .order('nombre'),
      ])

      if (!activo) return
      const usuariosOrdenados = (usuariosData as UsuarioCliente[]) ?? []
      const roles = (rolesData as RolLiviano[]) ?? []
      setUsuarios(usuariosOrdenados)
      setRolesDisponibles(roles)
      setRolId((prev) => prev || roles[0]?.id || '')
      setCargando(false)
    }

    cargar()
    return () => {
      activo = false
    }
  }, [cliente])

  // Fase 71c: un solo helper para los dos caminos -- si viene `password`
  // el admin la eligió él mismo (sin mail); si no, es el camino de
  // invitación por mail de siempre. `setCargandoUi` deja que cada botón
  // muestre su propio estado de "enviando" sin pisarse entre sí.
  async function activarAcceso(usuarioClienteId: string, password: string | null, setCargandoUi: (v: boolean) => void) {
    setCargandoUi(true)
    setError(null)
    try {
      const { data: sesion } = await supabase.auth.getSession()
      const token = sesion?.session?.access_token
      const resp = await fetch('/.netlify/functions/invitar-familiar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ usuarioClienteId, password }),
      })
      const json = await resp.json()
      if (json.ok) {
        setUsuarios((prev) =>
          prev.map((u) => (u.id === usuarioClienteId ? { ...u, user_id: json.userId ?? u.user_id ?? 'pendiente' } : u)),
        )
        setPasswordFormId(null)
        setPasswordValor('')
      } else {
        setError(json.error ?? 'No se pudo dar el acceso.')
      }
    } catch (e) {
      console.error('PerfilFamiliar: error activando acceso', e)
      setError('No se pudo dar el acceso. Probá de nuevo en un momento.')
    } finally {
      setCargandoUi(false)
    }
  }

  async function agregarFamiliar() {
    if (!cliente || !nombre.trim() || !email.trim() || !rolId) return
    setGuardando(true)
    setError(null)

    const rol = rolesDisponibles.find((r) => r.id === rolId)
    const { data: creado, error: errInsert } = await supabase
      .from('usuarios_cliente')
      .insert({
        cliente_id: cliente.id,
        rol_id: rolId,
        rol: rol?.nombre ?? '',
        nombre: nombre.trim(),
        email: email.trim(),
        auth_mode: 'full',
        cuil: null,
        telefono: telefono.trim() || null,
        fecha_nacimiento: fechaNacimiento || null,
        color,
      })
      .select()
      .single()

    setGuardando(false)

    if (errInsert || !creado) {
      console.error('PerfilFamiliar: error insertando usuarios_cliente', errInsert)
      setError('No se pudo guardar. Revisá los datos e intentá de nuevo.')
      return
    }

    setUsuarios((prev) => [...prev, creado as UsuarioCliente])
    setNombre('')
    setEmail('')
    setTelefono('')
    setFechaNacimiento('')
    setColor(COLORES_PERFIL[0])
    setMostrarForm(false)
    // Fase 71c: ya no se manda nada automáticamente -- queda "pendiente"
    // hasta que el admin elija cómo darle acceso (ver la fila del
    // listado, más abajo).
  }

  if (cargandoCliente || cargando) {
    return <p className="text-sm text-gray-400">Cargando...</p>
  }

  // Fase 71: solo el/la admin de la cuenta administra a la familia --
  // un integrante restringido (ej. "Hijo") no debería poder invitar a
  // nadie más, ni ver esta lista.
  if (rolActual && !rolActual.esAdmin) {
    return <AccesoRestringido slug="Perfil Familiar" />
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Fase 71f (06/09, a pedido de Carlos): atajo de vuelta -- Perfil
          Familiar es una pantalla de cuenta, no un módulo con tabs, así
          que a diferencia de Compras/Ventas/Home Keep no tenía ningún
          "Dashboard" al que volver con un clic. */}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver al Dashboard
      </Link>

      <div>
        <h1 className="text-lg font-medium text-gray-900">Perfil Familiar</h1>
        <p className="mt-1 text-sm text-gray-500">
          Dale acceso a otros integrantes de la familia. Cada uno entra con su propio usuario, y ve
          solo lo que su rol permite -- hoy, "Hijo" y "Cónyuge" ven únicamente Home Keep.
        </p>
      </div>

      <div className="space-y-3">
        {usuarios.map((u) => {
          const invitacionPendiente = u.auth_mode === 'full' && !u.user_id
          const formAbierto = passwordFormId === u.id
          return (
            <Card key={u.id} className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setEditando(u)}
                  className="flex items-center gap-3 rounded-md text-left hover:opacity-75"
                  title="Editar datos personales"
                >
                  <AvatarFamiliar nombre={u.nombre} color={u.color} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{u.nombre ?? u.email ?? 'Sin nombre'}</p>
                    <p className="text-sm text-gray-500">
                      {u.rol}
                      {u.email ? ` · ${u.email}` : ''}
                      {u.telefono ? ` · ${u.telefono}` : ''}
                    </p>
                  </div>
                </button>
                {invitacionPendiente ? (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={invitandoId === u.id}
                      onClick={() => activarAcceso(u.id, null, (v) => setInvitandoId(v ? u.id : null))}
                    >
                      {invitandoId === u.id ? 'Enviando...' : 'Enviar invitación por mail'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPasswordFormId(formAbierto ? null : u.id)
                        setPasswordValor('')
                        setError(null)
                      }}
                    >
                      Definir contraseña yo
                    </Button>
                  </div>
                ) : u.user_id ? (
                  <span className="text-xs text-gray-400">Activo</span>
                ) : null}
              </div>

              {formAbierto && (
                <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                  <Input
                    type="text"
                    placeholder="Contraseña (mínimo 6 caracteres)"
                    value={passwordValor}
                    onChange={(e) => setPasswordValor(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button
                    size="sm"
                    disabled={asignandoId === u.id || passwordValor.length < 6}
                    onClick={() => activarAcceso(u.id, passwordValor, (v) => setAsignandoId(v ? u.id : null))}
                  >
                    {asignandoId === u.id ? 'Guardando...' : 'Confirmar'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPasswordFormId(null)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </Card>
          )
        })}
        {usuarios.length === 0 && (
          <p className="text-sm text-gray-400">Todavía no hay nadie cargado.</p>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {mostrarForm ? (
        <Card className="space-y-3 p-4">
          <Input
            placeholder="Nombre y apellido"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <Input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {/* Fase 71g: opcionales -- no bloquean el alta si quedan vacíos. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Teléfono (opcional)</label>
              <Input
                placeholder="Ej. 2954 12-3456"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Fecha de nacimiento (opcional)</label>
              <Input
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500">Color identificatorio</label>
            <SelectorColor value={color} onChange={setColor} />
          </div>

          {rolesDisponibles.length === 0 ? (
            <p className="text-sm text-amber-600">
              Todavía no hay ningún rol familiar creado (ej. "Hijo"). Pedile a Edgy que lo cargue.
            </p>
          ) : (
            <select
              className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
              value={rolId}
              onChange={(e) => setRolId(e.target.value)}
            >
              {rolesDisponibles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <Button
              onClick={agregarFamiliar}
              disabled={guardando || !nombre.trim() || !email.trim() || !rolId}
            >
              {guardando ? 'Guardando...' : 'Agregar'}
            </Button>
            <Button variant="ghost" onClick={() => setMostrarForm(false)}>
              Cancelar
            </Button>
          </div>
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setMostrarForm(true)}>
          + Agregar familiar
        </Button>
      )}

      <EditarFamiliarDialog
        usuario={editando}
        onClose={() => setEditando(null)}
        onGuardado={(actualizado) => {
          setUsuarios((prev) => prev.map((u) => (u.id === actualizado.id ? actualizado : u)))
          setEditando(null)
        }}
      />
    </div>
  )
}
