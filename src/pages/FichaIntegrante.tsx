// ============================================================
// Ficha de Integrante (Fase 75o, 11/09, a pedido de Carlos)
// ============================================================
// Reemplaza a EditarFamiliarDialog (el modal angosto que venía
// acumulando Ingresos/Tarjetas/Vehículos/Inmuebles apilados, cada uno
// con su propio "+Agregar" abriendo otro diálogo encima). Con
// Instituciones sumándose a la lista, un modal de max-w-md ya no
// alcanza -- esto es una página propia, con las mismas secciones que
// tenía el modal (migradas tal cual, mismos diálogos de alta de
// Home Keep) más la sección nueva de Instituciones.
//
// Ruta: /perfil-familiar/:usuarioClienteId (ver App.tsx). Vive fuera
// del árbol de HomeKeepProvider igual que antes -- el guardado de
// Ingresos/Tarjetas/Vehículos/Inmuebles sigue insertando directo en
// Supabase, no pasa por el store/reducer de Home Keep.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { UsuarioCliente } from '@/types'
import { IngresoDialog, TarjetaDialog, VehiculoDialog, InmuebleDialog } from '@/modules/home-keep/components/dialogs'
import { formatARS, formatDate } from '@/modules/home-keep/lib/format'
import { TIPO_INGRESO_LABEL, generarId, type Ingreso, type TarjetaCredito, type Vehiculo, type Inmueble } from '@/modules/home-keep/types'
import {
  useVinculosInstitucionales,
  useRegistrosInstitucion,
  TIPO_INSTITUCION_LABEL,
  TIPO_REGISTRO_LABEL,
  SECCIONES_POR_TIPO,
  type TipoInstitucion,
  type VinculoInstitucional,
  type TipoRegistroInstitucion,
  type RegistroInstitucion,
} from '@/hooks/useInstituciones'
import { useCuentasDigitales, TIPO_CUENTA_DIGITAL_LABEL, type TipoCuentaDigital } from '@/hooks/useCuentasDigitales'

// Misma paleta que ya usaba Perfil Familiar para el selector de color.
const COLORES_PERFIL = [
  '#4F46E5', '#DC2626', '#EA580C', '#CA8A04', '#16A34A',
  '#0D9488', '#2563EB', '#9333EA', '#DB2777', '#57534E',
]

function SelectorColor({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORES_PERFIL.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Elegir color ${c}`}
          className={`h-4 w-4 rounded-full transition-transform ${
            value === c ? 'ring-2 ring-offset-1 ring-gray-900 scale-110' : ''
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

// Fase 75p (11/09, a pedido de Carlos): un integrante menor de 18 no
// puede legalmente tener ingresos propios, vehículos ni inmuebles a su
// nombre -- se calcula acá para decidir qué mostrar en la tarjeta de
// abajo (Patrimonio vs. Cuentas). Sin fecha de nacimiento cargada se
// asume adulto (no ocultar de más por falta de un dato opcional).
function calcularEdad(fechaNacimiento: string | null | undefined): number | null {
  if (!fechaNacimiento) return null
  const hoy = new Date()
  const nacimiento = new Date(fechaNacimiento + 'T00:00:00')
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const noCumplioAunEsteAnio =
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate())
  if (noCumplioAunEsteAnio) edad -= 1
  return edad
}

function iniciales(nombre: string | null): string {
  if (!nombre) return '?'
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  return partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

// ─── Sección Instituciones (Fase 75o) ──────────────────────────────

function NuevoVinculoForm({
  clienteId,
  usuarioClienteId,
  crear,
  onCreado,
  onCancelar,
}: {
  clienteId: string
  usuarioClienteId: string
  crear: ReturnType<typeof useVinculosInstitucionales>['crear']
  onCreado: () => void
  onCancelar: () => void
}) {
  const [tipo, setTipo] = useState<TipoInstitucion>('colegio')
  const [nombre, setNombre] = useState('')
  const [curso, setCurso] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (!nombre.trim()) return
    setGuardando(true)
    // Alta manual siempre -- 'acadeu' se reserva para vínculos que arma
    // el sincronizador (o Edgy a pedido, si hace falta reconectar uno).
    const ok = await crear({ clienteId, usuarioClienteId, tipo, nombre: nombre.trim(), proveedor: 'manual', curso: curso.trim() || undefined })
    setGuardando(false)
    if (ok) onCreado()
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Tipo</label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoInstitucion)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TIPO_INSTITUCION_LABEL) as TipoInstitucion[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_INSTITUCION_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Nombre</label>
          <Input placeholder="Ej. Colegio San José" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
      </div>
      {tipo === 'colegio' && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Curso / división (opcional)</label>
          <Input placeholder="Ej. 4° B Prim" value={curso} onChange={(e) => setCurso(e.target.value)} />
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={guardar} disabled={guardando || !nombre.trim()}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </Card>
  )
}

// Fase 75p: cada tarjeta (Boletín, Convivencia, etc.) admite carga manual
// -- "+Cargar" abre un form chiquito (período opcional + un texto libre)
// que inserta en institucion_registros. Cuando el sincronizador de
// Acadeu llegue a automatizar esto (Fase 75o dejó la exploración de esas
// páginas como pendiente), va a insertar en la misma tabla -- esta
// tarjeta no necesita cambiar.
function TarjetaRegistro({
  vinculo,
  tipoRegistro,
  registros,
  cargando,
  crear,
}: {
  vinculo: VinculoInstitucional
  tipoRegistro: TipoRegistroInstitucion
  registros: RegistroInstitucion[]
  cargando: boolean
  crear: (data: { vinculoId: string; tipoRegistro: TipoRegistroInstitucion; periodo?: string; texto: string }) => Promise<boolean>
}) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [periodo, setPeriodo] = useState('')
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (!texto.trim()) return
    setGuardando(true)
    const ok = await crear({ vinculoId: vinculo.id, tipoRegistro, periodo: periodo.trim() || undefined, texto: texto.trim() })
    setGuardando(false)
    if (ok) {
      setMostrarForm(false)
      setPeriodo('')
      setTexto('')
    }
  }

  return (
    <div className="rounded-md border border-gray-100 p-2.5">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[11px] font-medium text-gray-600">{TIPO_REGISTRO_LABEL[tipoRegistro]}</p>
        {!mostrarForm && (
          <button type="button" onClick={() => setMostrarForm(true)} className="text-[11px] text-gray-400 hover:text-gray-700" title="Cargar a mano">
            + Cargar
          </button>
        )}
      </div>
      {cargando ? (
        <p className="mt-1 text-[11px] text-gray-400">Cargando...</p>
      ) : registros.length === 0 && !mostrarForm ? (
        <p className="mt-1 text-[11px] text-gray-400">
          {vinculo.proveedor === 'acadeu' ? 'Todavía no lo sincroniza Acadeu.' : 'Sin datos cargados.'}
        </p>
      ) : !mostrarForm ? (
        <p className="mt-1 text-[11px] text-gray-700">{registros.length} registro(s) · último {formatDate(registros[0].createdAt.slice(0, 10))}</p>
      ) : null}

      {mostrarForm && (
        <div className="mt-2 space-y-1.5">
          <Input placeholder="Período (opcional, ej. 2026 T2)" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="h-7 text-xs" />
          <Input placeholder="Detalle" value={texto} onChange={(e) => setTexto(e.target.value)} className="h-7 text-xs" />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-6 px-2 text-[11px]" onClick={guardar} disabled={guardando || !texto.trim()}>
              Guardar
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setMostrarForm(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function RegistrosDelVinculo({ vinculo }: { vinculo: VinculoInstitucional }) {
  const { registros, cargando, crear } = useRegistrosInstitucion(vinculo.id)
  const secciones = SECCIONES_POR_TIPO[vinculo.tipo]

  if (secciones.length === 0) {
    return <p className="text-xs text-gray-400">Todavía no hay secciones definidas para este tipo de institución.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {secciones.map((tipoRegistro) => (
        <TarjetaRegistro
          key={tipoRegistro}
          vinculo={vinculo}
          tipoRegistro={tipoRegistro}
          registros={registros.filter((r) => r.tipoRegistro === tipoRegistro)}
          cargando={cargando}
          crear={crear}
        />
      ))}
    </div>
  )
}

function SeccionInstituciones({ clienteId, usuarioClienteId }: { clienteId: string; usuarioClienteId: string }) {
  const { vinculos, cargando, crear, eliminar } = useVinculosInstitucionales(usuarioClienteId)
  const [mostrarForm, setMostrarForm] = useState(false)

  return (
    <div className="space-y-2 border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Instituciones</h2>
        {!mostrarForm && (
          <Button variant="outline" size="sm" onClick={() => setMostrarForm(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Agregar institución
          </Button>
        )}
      </div>
      <p className="text-xs text-gray-400">
        Colegio, club u otra institución a la que asista -- boletines, asistencias y demás historial se organiza acá, no en Home Keep.
      </p>

      {mostrarForm && (
        <NuevoVinculoForm
          clienteId={clienteId}
          usuarioClienteId={usuarioClienteId}
          crear={crear}
          onCreado={() => setMostrarForm(false)}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {cargando ? (
        <p className="text-xs text-gray-400">Cargando...</p>
      ) : vinculos.length === 0 ? (
        <p className="text-xs text-gray-400">Todavía no tiene ninguna institución vinculada.</p>
      ) : (
        <div className="space-y-3">
          {vinculos.map((v) => (
            <Card key={v.id} className="space-y-2 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {v.nombre}
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                      {TIPO_INSTITUCION_LABEL[v.tipo]}
                    </span>
                    {v.proveedor === 'acadeu' && (
                      <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                        Sincroniza solo (Acadeu)
                      </span>
                    )}
                  </p>
                  {v.curso && <p className="text-xs text-gray-500">{v.curso}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => eliminar(v.id)}
                  className="text-gray-400 hover:text-red-600"
                  title="Eliminar vínculo"
                >
                  ×
                </button>
              </div>
              <RegistrosDelVinculo vinculo={v} />
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Cuentas digitales (Fase 75p, solo para menores) ────────────────

function NuevaCuentaForm({
  clienteId,
  usuarioClienteId,
  puedeMercadopago,
  crear,
  onCreado,
  onCancelar,
}: {
  clienteId: string
  usuarioClienteId: string
  puedeMercadopago: boolean
  crear: ReturnType<typeof useCuentasDigitales>['crear']
  onCreado: () => void
  onCancelar: () => void
}) {
  const [tipo, setTipo] = useState<TipoCuentaDigital>('email')
  const [valor, setValor] = useState('')
  const [guardando, setGuardando] = useState(false)

  const tiposDisponibles = (Object.keys(TIPO_CUENTA_DIGITAL_LABEL) as TipoCuentaDigital[]).filter(
    (t) => t !== 'mercadopago' || puedeMercadopago,
  )

  async function guardar() {
    if (!valor.trim()) return
    setGuardando(true)
    const ok = await crear({ clienteId, usuarioClienteId, tipo, valor: valor.trim() })
    setGuardando(false)
    if (ok) onCreado()
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Tipo</label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoCuentaDigital)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tiposDisponibles.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_CUENTA_DIGITAL_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">{tipo === 'email' ? 'Dirección de mail' : 'Dato de la cuenta'}</label>
          <Input placeholder={tipo === 'email' ? 'nombre@mail.com' : 'Ej. alias o usuario'} value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={guardar} disabled={guardando || !valor.trim()}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </Card>
  )
}

function SeccionCuentasDigitales({ clienteId, usuarioClienteId, edad }: { clienteId: string; usuarioClienteId: string; edad: number | null }) {
  const { cuentas, cargando, crear, eliminar } = useCuentasDigitales(usuarioClienteId)
  const [mostrarForm, setMostrarForm] = useState(false)
  // Política de MercadoPago Argentina: cuenta propia a partir de los 13
  // (con autorización de un tutor) -- sin fecha de nacimiento cargada,
  // no se ofrece la opción (mejor pedir el dato que asumir de más).
  const puedeMercadopago = edad != null && edad >= 13

  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-500">Cuentas</label>
        {!mostrarForm && (
          <Button variant="outline" size="sm" onClick={() => setMostrarForm(true)}>
            + Agregar cuenta
          </Button>
        )}
      </div>

      {mostrarForm && (
        <NuevaCuentaForm
          clienteId={clienteId}
          usuarioClienteId={usuarioClienteId}
          puedeMercadopago={puedeMercadopago}
          crear={crear}
          onCreado={() => setMostrarForm(false)}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {cargando ? (
        <p className="text-xs text-gray-400">Cargando...</p>
      ) : cuentas.length === 0 ? (
        <p className="text-xs text-gray-400">Todavía no tiene ninguna cuenta cargada.</p>
      ) : (
        <ul className="space-y-1.5">
          {cuentas.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5 text-xs">
              <div>
                <span className="font-medium text-gray-900">{TIPO_CUENTA_DIGITAL_LABEL[c.tipo]}</span>
                <span className="text-gray-500"> · {c.valor}</span>
              </div>
              <button type="button" onClick={() => eliminar(c.id)} className="text-gray-400 hover:text-red-600" title="Eliminar">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Página ─────────────────────────────────────────────────────────

export default function FichaIntegrante() {
  const { usuarioClienteId } = useParams<{ usuarioClienteId: string }>()
  const navigate = useNavigate()

  const [usuario, setUsuario] = useState<UsuarioCliente | null>(null)
  const [cargando, setCargando] = useState(true)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [color, setColor] = useState<string>(COLORES_PERFIL[0])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [ingresosAsociados, setIngresosAsociados] = useState<Ingreso[]>([])
  const [cargandoIngresos, setCargandoIngresos] = useState(false)
  const [mostrarIngresoDialog, setMostrarIngresoDialog] = useState(false)

  const [tarjetasAsociadas, setTarjetasAsociadas] = useState<TarjetaCredito[]>([])
  const [cargandoTarjetas, setCargandoTarjetas] = useState(false)
  const [mostrarTarjetaDialog, setMostrarTarjetaDialog] = useState(false)

  const [vehiculosAsociados, setVehiculosAsociados] = useState<Vehiculo[]>([])
  const [cargandoVehiculos, setCargandoVehiculos] = useState(false)
  const [mostrarVehiculoDialog, setMostrarVehiculoDialog] = useState(false)

  const [inmueblesAsociados, setInmueblesAsociados] = useState<Inmueble[]>([])
  const [cargandoInmuebles, setCargandoInmuebles] = useState(false)
  const [mostrarInmuebleDialog, setMostrarInmuebleDialog] = useState(false)

  useEffect(() => {
    if (!usuarioClienteId) return
    let activo = true
    setCargando(true)
    supabase
      .from('usuarios_cliente')
      .select('*')
      .eq('id', usuarioClienteId)
      .single()
      .then(({ data, error: errFetch }) => {
        if (!activo) return
        if (errFetch || !data) {
          setError('No se encontró este integrante.')
          setCargando(false)
          return
        }
        const u = data as UsuarioCliente
        setUsuario(u)
        setNombre(u.nombre ?? '')
        setTelefono(u.telefono ?? '')
        setFechaNacimiento(u.fecha_nacimiento ?? '')
        setColor(u.color ?? COLORES_PERFIL[0])
        setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [usuarioClienteId])

  useEffect(() => {
    if (!usuario) return
    let activo = true
    setCargandoIngresos(true)
    supabase
      .from('ingresos_hogar')
      .select('*')
      .eq('usuario_cliente_id', usuario.id)
      .order('fecha', { ascending: false })
      .then(({ data }) => {
        if (!activo) return
        setIngresosAsociados(
          (data ?? []).map((r: any) => ({
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
          })),
        )
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
      console.error('FichaIntegrante: error insertando ingresos_hogar', errInsert)
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

  useEffect(() => {
    if (!usuario) return
    let activo = true
    setCargandoTarjetas(true)
    supabase
      .from('tarjetas_credito_hogar')
      .select('*')
      .eq('usuario_cliente_id', usuario.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!activo) return
        setTarjetasAsociadas(
          (data ?? []).map((r: any) => ({
            id: r.id,
            nombre: r.nombre,
            banco: r.banco ?? undefined,
            titular: r.titular ?? undefined,
            usuarioClienteId: r.usuario_cliente_id ?? undefined,
            ultimosDigitos: r.ultimos_digitos ?? undefined,
            diaCierre: r.dia_cierre ?? undefined,
            diaVencimiento: r.dia_vencimiento ?? undefined,
            limite: r.limite != null ? Number(r.limite) : undefined,
            activa: r.activa,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          })),
        )
        setCargandoTarjetas(false)
      })
    return () => {
      activo = false
    }
  }, [usuario])

  async function guardarTarjeta(data: Omit<TarjetaCredito, 'id' | 'activa' | 'createdAt' | 'updatedAt'>) {
    if (!usuario) return
    const { data: creado, error: errInsert } = await supabase
      .from('tarjetas_credito_hogar')
      .insert({
        id: generarId(),
        cliente_id: usuario.cliente_id,
        nombre: data.nombre,
        banco: data.banco ?? null,
        titular: data.titular ?? null,
        usuario_cliente_id: usuario.id,
        ultimos_digitos: data.ultimosDigitos ?? null,
        dia_cierre: data.diaCierre ?? null,
        dia_vencimiento: data.diaVencimiento ?? null,
        limite: data.limite ?? null,
        activa: true,
      })
      .select()
      .single()

    if (errInsert || !creado) {
      console.error('FichaIntegrante: error insertando tarjetas_credito_hogar', errInsert)
      return
    }

    setTarjetasAsociadas((prev) => [
      {
        id: creado.id,
        nombre: creado.nombre,
        banco: creado.banco ?? undefined,
        titular: creado.titular ?? undefined,
        usuarioClienteId: creado.usuario_cliente_id ?? undefined,
        ultimosDigitos: creado.ultimos_digitos ?? undefined,
        diaCierre: creado.dia_cierre ?? undefined,
        diaVencimiento: creado.dia_vencimiento ?? undefined,
        limite: creado.limite != null ? Number(creado.limite) : undefined,
        activa: creado.activa,
        createdAt: creado.created_at,
        updatedAt: creado.updated_at,
      },
      ...prev,
    ])
  }

  async function eliminarTarjeta(id: string) {
    await supabase.from('tarjetas_credito_hogar').delete().eq('id', id)
    setTarjetasAsociadas((prev) => prev.filter((t) => t.id !== id))
  }

  useEffect(() => {
    if (!usuario) return
    let activo = true
    setCargandoVehiculos(true)
    supabase
      .from('vehiculos_hogar')
      .select('*')
      .eq('usuario_cliente_id', usuario.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!activo) return
        setVehiculosAsociados(
          (data ?? []).map((r: any) => ({
            id: r.id,
            usuarioClienteId: r.usuario_cliente_id ?? undefined,
            patente: r.patente ?? undefined,
            marca: r.marca ?? undefined,
            modelo: r.modelo ?? undefined,
            anio: r.anio ?? undefined,
            notas: r.notas ?? undefined,
            activo: r.activo,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          })),
        )
        setCargandoVehiculos(false)
      })
    return () => {
      activo = false
    }
  }, [usuario])

  async function guardarVehiculo(data: Omit<Vehiculo, 'id' | 'usuarioClienteId' | 'activo' | 'createdAt' | 'updatedAt'>) {
    if (!usuario) return
    const { data: creado, error: errInsert } = await supabase
      .from('vehiculos_hogar')
      .insert({
        id: generarId(),
        cliente_id: usuario.cliente_id,
        usuario_cliente_id: usuario.id,
        patente: data.patente ?? null,
        marca: data.marca ?? null,
        modelo: data.modelo ?? null,
        anio: data.anio ?? null,
        notas: data.notas ?? null,
        activo: true,
      })
      .select()
      .single()

    if (errInsert || !creado) {
      console.error('FichaIntegrante: error insertando vehiculos_hogar', errInsert)
      return
    }

    setVehiculosAsociados((prev) => [
      {
        id: creado.id,
        usuarioClienteId: creado.usuario_cliente_id ?? undefined,
        patente: creado.patente ?? undefined,
        marca: creado.marca ?? undefined,
        modelo: creado.modelo ?? undefined,
        anio: creado.anio ?? undefined,
        notas: creado.notas ?? undefined,
        activo: creado.activo,
        createdAt: creado.created_at,
        updatedAt: creado.updated_at,
      },
      ...prev,
    ])
  }

  async function eliminarVehiculo(id: string) {
    await supabase.from('vehiculos_hogar').delete().eq('id', id)
    setVehiculosAsociados((prev) => prev.filter((v) => v.id !== id))
  }

  useEffect(() => {
    if (!usuario) return
    let activo = true
    setCargandoInmuebles(true)
    supabase
      .from('inmuebles_hogar')
      .select('*')
      .eq('usuario_cliente_id', usuario.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!activo) return
        setInmueblesAsociados(
          (data ?? []).map((r: any) => ({
            id: r.id,
            usuarioClienteId: r.usuario_cliente_id ?? undefined,
            nombre: r.nombre,
            direccion: r.direccion ?? undefined,
            partidaInmobiliaria: r.partida_inmobiliaria ?? undefined,
            notas: r.notas ?? undefined,
            activo: r.activo,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          })),
        )
        setCargandoInmuebles(false)
      })
    return () => {
      activo = false
    }
  }, [usuario])

  async function guardarInmueble(data: Omit<Inmueble, 'id' | 'usuarioClienteId' | 'activo' | 'createdAt' | 'updatedAt'>) {
    if (!usuario) return
    const { data: creado, error: errInsert } = await supabase
      .from('inmuebles_hogar')
      .insert({
        id: generarId(),
        cliente_id: usuario.cliente_id,
        usuario_cliente_id: usuario.id,
        nombre: data.nombre,
        direccion: data.direccion ?? null,
        partida_inmobiliaria: data.partidaInmobiliaria ?? null,
        notas: data.notas ?? null,
        activo: true,
      })
      .select()
      .single()

    if (errInsert || !creado) {
      console.error('FichaIntegrante: error insertando inmuebles_hogar', errInsert)
      return
    }

    setInmueblesAsociados((prev) => [
      {
        id: creado.id,
        usuarioClienteId: creado.usuario_cliente_id ?? undefined,
        nombre: creado.nombre,
        direccion: creado.direccion ?? undefined,
        partidaInmobiliaria: creado.partida_inmobiliaria ?? undefined,
        notas: creado.notas ?? undefined,
        activo: creado.activo,
        createdAt: creado.created_at,
        updatedAt: creado.updated_at,
      },
      ...prev,
    ])
  }

  async function eliminarInmueble(id: string) {
    await supabase.from('inmuebles_hogar').delete().eq('id', id)
    setInmueblesAsociados((prev) => prev.filter((i) => i.id !== id))
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
      console.error('FichaIntegrante: error actualizando usuarios_cliente', errUpdate)
      setError('No se pudo guardar. Probá de nuevo.')
      return
    }

    setUsuario(data as UsuarioCliente)
  }

  // Fase 75p: se calcula sobre el dato YA guardado (usuario.fecha_nacimiento),
  // no sobre el borrador del formulario de arriba -- evita que la tarjeta
  // de abajo cambie de forma mientras se está tipeando una fecha nueva.
  const edad = calcularEdad(usuario?.fecha_nacimiento)
  const esMenor = edad != null && edad < 18

  if (cargando) {
    return <p className="p-6 text-sm text-gray-400">Cargando...</p>
  }

  if (!usuario) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <p className="text-sm text-red-500">{error ?? 'No se encontró este integrante.'}</p>
        <Button variant="outline" onClick={() => navigate('/perfil-familiar')}>
          Volver a Perfil Familiar
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <button
        type="button"
        onClick={() => navigate('/perfil-familiar')}
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a Perfil Familiar
      </button>

      <div className="flex items-center gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {iniciales(usuario.nombre)}
        </span>
        <div>
          <h1 className="text-lg font-medium text-gray-900">{usuario.nombre ?? usuario.email ?? 'Sin nombre'}</h1>
          <p className="text-sm text-gray-500">
            {usuario.rol}
            {usuario.email ? ` · ${usuario.email}` : ''} -- el email y el rol no se editan desde acá.
          </p>
        </div>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Datos personales</h2>
          <Button size="sm" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Nombre y apellido</label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Teléfono</label>
            <Input placeholder="Ej. 2954 12-3456" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Fecha de nacimiento</label>
            <Input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Color identificatorio</label>
          <SelectorColor value={color} onChange={setColor} />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </Card>

      <Card className="p-4">
        <SeccionInstituciones clienteId={usuario.cliente_id} usuarioClienteId={usuario.id} />
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="text-sm font-semibold text-gray-900">{esMenor ? 'Cuentas' : 'Patrimonio'}</h2>

        {esMenor && <SeccionCuentasDigitales clienteId={usuario.cliente_id} usuarioClienteId={usuario.id} edad={edad} />}

        {!esMenor && (
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
                <li key={i.id} className="flex items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5 text-xs">
                  <div>
                    <span className="font-medium text-gray-900">{formatARS(i.monto)}</span>
                    <span className="text-gray-500">
                      {' '}· {i.concepto || TIPO_INGRESO_LABEL[i.tipo]} · {formatDate(i.fecha)}
                      {i.recurrente ? ` · fijo (día ${i.diaMesRecurrente ?? '—'})` : ''}
                    </span>
                  </div>
                  <button type="button" onClick={() => eliminarIngreso(i.id)} className="text-gray-400 hover:text-red-600" title="Eliminar">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}

        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Tarjetas de crédito</label>
            <Button variant="outline" size="sm" onClick={() => setMostrarTarjetaDialog(true)}>
              + Agregar tarjeta
            </Button>
          </div>
          {cargandoTarjetas ? (
            <p className="text-xs text-gray-400">Cargando...</p>
          ) : tarjetasAsociadas.length === 0 ? (
            <p className="text-xs text-gray-400">Todavía no tiene ninguna tarjeta cargada.</p>
          ) : (
            <ul className="space-y-1.5">
              {tarjetasAsociadas.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5 text-xs">
                  <div>
                    <span className="font-medium text-gray-900">{t.nombre}</span>
                    <span className="text-gray-500">
                      {t.banco ? ` · ${t.banco}` : ''}
                      {t.ultimosDigitos ? ` · **** ${t.ultimosDigitos}` : ''}
                      {!t.activa ? ' · inactiva' : ''}
                    </span>
                  </div>
                  <button type="button" onClick={() => eliminarTarjeta(t.id)} className="text-gray-400 hover:text-red-600" title="Eliminar">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!esMenor && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Vehículos</label>
            <Button variant="outline" size="sm" onClick={() => setMostrarVehiculoDialog(true)}>
              + Agregar vehículo
            </Button>
          </div>
          {cargandoVehiculos ? (
            <p className="text-xs text-gray-400">Cargando...</p>
          ) : vehiculosAsociados.length === 0 ? (
            <p className="text-xs text-gray-400">Todavía no tiene ningún vehículo cargado.</p>
          ) : (
            <ul className="space-y-1.5">
              {vehiculosAsociados.map((v) => (
                <li key={v.id} className="flex items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5 text-xs">
                  <div>
                    <span className="font-medium text-gray-900">
                      {[v.marca, v.modelo].filter(Boolean).join(' ') || v.patente || 'Vehículo'}
                    </span>
                    <span className="text-gray-500">
                      {v.patente ? ` · ${v.patente}` : ''}
                      {v.anio ? ` · ${v.anio}` : ''}
                    </span>
                  </div>
                  <button type="button" onClick={() => eliminarVehiculo(v.id)} className="text-gray-400 hover:text-red-600" title="Eliminar">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}

        {!esMenor && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Inmuebles</label>
            <Button variant="outline" size="sm" onClick={() => setMostrarInmuebleDialog(true)}>
              + Agregar inmueble
            </Button>
          </div>
          {cargandoInmuebles ? (
            <p className="text-xs text-gray-400">Cargando...</p>
          ) : inmueblesAsociados.length === 0 ? (
            <p className="text-xs text-gray-400">Todavía no tiene ningún inmueble cargado.</p>
          ) : (
            <ul className="space-y-1.5">
              {inmueblesAsociados.map((i) => (
                <li key={i.id} className="flex items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5 text-xs">
                  <div>
                    <span className="font-medium text-gray-900">{i.nombre}</span>
                    <span className="text-gray-500">
                      {i.direccion ? ` · ${i.direccion}` : ''}
                      {i.partidaInmobiliaria ? ` · ${i.partidaInmobiliaria}` : ''}
                    </span>
                  </div>
                  <button type="button" onClick={() => eliminarInmueble(i.id)} className="text-gray-400 hover:text-red-600" title="Eliminar">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}
      </Card>

      <IngresoDialog
        open={mostrarIngresoDialog}
        onOpenChange={setMostrarIngresoDialog}
        integranteFijo={{ id: usuario.id, nombre: usuario.nombre ?? usuario.email ?? 'Sin nombre' }}
        onSave={guardarIngreso}
      />
      <TarjetaDialog open={mostrarTarjetaDialog} onOpenChange={setMostrarTarjetaDialog} onSave={guardarTarjeta} />
      <VehiculoDialog open={mostrarVehiculoDialog} onOpenChange={setMostrarVehiculoDialog} onSave={guardarVehiculo} />
      <InmuebleDialog open={mostrarInmuebleDialog} onOpenChange={setMostrarInmuebleDialog} onSave={guardarInmueble} />
    </div>
  )
}
