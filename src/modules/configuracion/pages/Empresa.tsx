import { useEffect, useState } from 'react'
import { Loader2, Save, ShieldCheck, Zap, CreditCard, Clock } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useEmpresa } from '../data/useEmpresa'
import {
  CATEGORIAS_IMPOSITIVAS,
  PERSONERIAS,
  TIPOS_NEGOCIO_LABEL,
  type CategoriaImpositiva,
  type Personeria,
} from '../types'
import { obtenerEstadoArca, guardarConfigArca, type EstadoArca } from '../lib/arcaConfig'
import { obtenerEstadoPago, guardarConfigPago, type EstadoPago } from '../lib/pagoConfig'

// Color por defecto si el cliente todavía no tiene uno cargado (mismo
// valor default que Paso1Identidad.tsx en el onboarding).
const COLOR_MARCA_DEFAULT = '#D4537E'

// Mismo bucket y misma convención de nombre de archivo que el
// onboarding (NuevoProyecto.tsx) -- así un logo subido acá o en el
// alta inicial conviven sin chocar.
async function subirLogo(file: File): Promise<string | null> {
  const ruta = `${Date.now()}-${file.name}`
  const { data: subida, error } = await supabase.storage.from('logos-clientes').upload(ruta, file)
  if (error || !subida) return null
  return supabase.storage.from('logos-clientes').getPublicUrl(subida.path).data.publicUrl
}

interface FormEmpresa {
  nombre: string
  titular: string
  direccion: string
  telefono: string
  categoriaImpositiva: string
  personeria: string
  inicioActividades: string
  provincia: string
  localidad: string
  codigoPostal: string
  colorMarca: string
  horarioActivo: boolean
  horarioApertura: string
  horarioCierre: string
  horarioDias: number[]
}

const FORM_VACIO: FormEmpresa = {
  nombre: '',
  titular: '',
  direccion: '',
  telefono: '',
  categoriaImpositiva: '',
  personeria: '',
  inicioActividades: '',
  provincia: '',
  localidad: '',
  codigoPostal: '',
  colorMarca: COLOR_MARCA_DEFAULT,
  horarioActivo: false,
  horarioApertura: '09:00',
  horarioCierre: '23:00',
  horarioDias: [0, 1, 2, 3, 4, 5, 6],
}

// Fase 16: días de la semana, misma convención que JS Date.getDay().
const DIAS_SEMANA: { value: number; label: string }[] = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
]

// Fase 11: configuración de Facturación Electrónica ARCA -- vive en
// una tabla aparte (clientes_arca_config, protegida por RLS sin
// policies) y se administra vía Netlify Functions, nunca directo
// contra Supabase desde acá (ver src/modules/configuracion/lib/arcaConfig.ts).
interface FormArca {
  puntoVenta: string
  condicionIva: '' | 'responsable_inscripto' | 'monotributista' | 'exento'
  modo: 'homologacion' | 'produccion'
  habilitado: boolean
  certificadoPem: string
  clavePrivadaPem: string
}

const FORM_ARCA_VACIO: FormArca = {
  puntoVenta: '',
  condicionIva: '',
  modo: 'homologacion',
  habilitado: false,
  certificadoPem: '',
  clavePrivadaPem: '',
}

// Fase 12: Cobro online -- primer proveedor: Mercado Pago (Checkout
// Pro). El negocio pega su propio access_token (cuenta propia, sin
// OAuth) y el webhook_secret que Mercado Pago le genera en "Tus
// integraciones" > Webhooks. Vive en clientes_pago_config, factorizada
// por proveedor (ver 0043_fase12_pago_online.sql) para poder sumar
// otros proveedores más adelante sin tocar esta pantalla.
interface FormPago {
  modo: 'test' | 'produccion'
  habilitado: boolean
  accessToken: string
  webhookSecret: string
}

const FORM_PAGO_VACIO: FormPago = {
  modo: 'test',
  habilitado: false,
  accessToken: '',
  webhookSecret: '',
}

export default function Empresa() {
  const { empresa, cargando, guardando, error, guardar } = useEmpresa()
  const [form, setForm] = useState<FormEmpresa>(FORM_VACIO)
  const [mensaje, setMensaje] = useState<string | null>(null)
  // Logo nuevo elegido en esta sesión (todavía no subido). Si queda en
  // null, "Guardar cambios" no toca logo_url y se conserva el actual.
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)

  const [arcaEstado, setArcaEstado] = useState<EstadoArca | null>(null)
  const [formArca, setFormArca] = useState<FormArca>(FORM_ARCA_VACIO)
  const [guardandoArca, setGuardandoArca] = useState(false)
  const [mensajeArca, setMensajeArca] = useState<string | null>(null)
  const [errorArca, setErrorArca] = useState<string | null>(null)

  const [pagoEstado, setPagoEstado] = useState<EstadoPago | null>(null)
  const [formPago, setFormPago] = useState<FormPago>(FORM_PAGO_VACIO)
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [mensajePago, setMensajePago] = useState<string | null>(null)
  const [errorPago, setErrorPago] = useState<string | null>(null)

  // Precarga el formulario con los datos nativos de creación del
  // cliente (wizard) + lo que ya se haya completado en Configuración.
  useEffect(() => {
    if (!empresa) return
    setForm({
      nombre: empresa.nombre ?? '',
      titular: empresa.titular ?? '',
      direccion: empresa.direccion ?? '',
      telefono: empresa.telefono ?? '',
      categoriaImpositiva: empresa.categoriaImpositiva ?? '',
      personeria: empresa.personeria ?? '',
      inicioActividades: empresa.inicioActividades ?? '',
      provincia: empresa.provincia ?? '',
      localidad: empresa.localidad ?? '',
      codigoPostal: empresa.codigoPostal ?? '',
      colorMarca: empresa.colorMarca ?? COLOR_MARCA_DEFAULT,
      horarioActivo: empresa.horarioActivo,
      horarioApertura: (empresa.horarioApertura ?? '09:00').slice(0, 5),
      horarioCierre: (empresa.horarioCierre ?? '23:00').slice(0, 5),
      horarioDias: empresa.horarioDias.length > 0 ? empresa.horarioDias : [0, 1, 2, 3, 4, 5, 6],
    })
  }, [empresa])

  // Carga el estado ARCA (no sensible) apenas se conoce el cliente.
  useEffect(() => {
    if (!empresa) return
    let activo = true
    obtenerEstadoArca(empresa.id)
      .then((estado) => {
        if (!activo) return
        setArcaEstado(estado)
        setFormArca((prev) => ({
          ...prev,
          puntoVenta: estado.puntoVenta ? String(estado.puntoVenta) : '',
          condicionIva: estado.condicionIva ?? '',
          modo: estado.modo ?? 'homologacion',
          habilitado: estado.habilitado ?? false,
        }))
      })
      .catch((err) => {
        if (activo) setErrorArca(err instanceof Error ? err.message : 'No se pudo cargar el estado de ARCA')
      })
    return () => {
      activo = false
    }
  }, [empresa?.id])

  // Carga el estado de Cobro Online (no sensible) apenas se conoce el
  // cliente -- mismo criterio que ARCA arriba.
  useEffect(() => {
    if (!empresa) return
    let activo = true
    obtenerEstadoPago(empresa.id)
      .then((estado) => {
        if (!activo) return
        setPagoEstado(estado)
        setFormPago((prev) => ({
          ...prev,
          modo: estado.modo ?? 'test',
          habilitado: estado.habilitado ?? false,
        }))
      })
      .catch((err) => {
        if (activo) setErrorPago(err instanceof Error ? err.message : 'No se pudo cargar el estado de Cobro Online')
      })
    return () => {
      activo = false
    }
  }, [empresa?.id])

  async function handleGuardarPago() {
    if (!empresa) return
    setMensajePago(null)
    setErrorPago(null)

    setGuardandoPago(true)
    try {
      await guardarConfigPago({
        clienteId: empresa.id,
        proveedor: 'mercadopago',
        modo: formPago.modo,
        habilitado: formPago.habilitado,
        accessToken: formPago.accessToken || undefined,
        webhookSecret: formPago.webhookSecret || undefined,
      })
      const estadoNuevo = await obtenerEstadoPago(empresa.id)
      setPagoEstado(estadoNuevo)
      // Igual que ARCA -- las credenciales nunca vuelven del backend,
      // se limpian los campos después de guardar.
      setFormPago((prev) => ({ ...prev, accessToken: '', webhookSecret: '' }))
      setMensajePago('Configuración de Cobro Online guardada.')
    } catch (err) {
      setErrorPago(err instanceof Error ? err.message : 'No se pudo guardar la configuración de Cobro Online')
    } finally {
      setGuardandoPago(false)
    }
  }

  async function handleGuardarArca() {
    if (!empresa) return
    setMensajeArca(null)
    setErrorArca(null)

    const puntoVentaNum = Number(formArca.puntoVenta)
    if (!puntoVentaNum || puntoVentaNum <= 0) {
      setErrorArca('Ingresá un punto de venta válido.')
      return
    }
    if (!formArca.condicionIva) {
      setErrorArca('Seleccioná la condición de IVA del negocio.')
      return
    }

    setGuardandoArca(true)
    try {
      await guardarConfigArca({
        clienteId: empresa.id,
        puntoVenta: puntoVentaNum,
        condicionIva: formArca.condicionIva,
        modo: formArca.modo,
        habilitado: formArca.habilitado,
        certificadoPem: formArca.certificadoPem || undefined,
        clavePrivadaPem: formArca.clavePrivadaPem || undefined,
      })
      const estadoNuevo = await obtenerEstadoArca(empresa.id)
      setArcaEstado(estadoNuevo)
      // El certificado/clave nunca vuelven del backend -- se limpian los
      // textareas después de guardar para no dejarlos pegados en pantalla.
      setFormArca((prev) => ({ ...prev, certificadoPem: '', clavePrivadaPem: '' }))
      setMensajeArca('Configuración de ARCA guardada.')
    } catch (err) {
      setErrorArca(err instanceof Error ? err.message : 'No se pudo guardar la configuración de ARCA')
    } finally {
      setGuardandoArca(false)
    }
  }

  if (cargando) {
    return <p className="text-muted-foreground text-sm">Cargando datos de la empresa...</p>
  }

  if (!empresa) {
    return <p className="text-sm text-red-500">{error ?? 'No pudimos cargar la empresa.'}</p>
  }

  function toggleDiaHorario(dia: number) {
    setForm((prev) => ({
      ...prev,
      horarioDias: prev.horarioDias.includes(dia)
        ? prev.horarioDias.filter((d) => d !== dia)
        : [...prev.horarioDias, dia],
    }))
  }

  async function handleGuardar() {
    setMensaje(null)

    let logoUrl: string | null | undefined = undefined
    if (logoFile) {
      setSubiendoLogo(true)
      logoUrl = await subirLogo(logoFile)
      setSubiendoLogo(false)
      if (!logoUrl) {
        setMensaje(null)
        return
      }
    }

    const ok = await guardar({
      nombre: form.nombre,
      titular: form.titular || null,
      direccion: form.direccion || null,
      telefono: form.telefono || null,
      categoriaImpositiva: (form.categoriaImpositiva || null) as CategoriaImpositiva | null,
      personeria: (form.personeria || null) as Personeria | null,
      inicioActividades: form.inicioActividades || null,
      provincia: form.provincia || null,
      localidad: form.localidad || null,
      codigoPostal: form.codigoPostal || null,
      colorMarca: form.colorMarca || COLOR_MARCA_DEFAULT,
      horarioActivo: form.horarioActivo,
      horarioApertura: form.horarioApertura || null,
      horarioCierre: form.horarioCierre || null,
      horarioDias: form.horarioDias,
      // Solo se manda si se subió un logo nuevo en esta sesión -- si
      // no, `guardar` no incluye logoUrl en el payload y se conserva
      // el que ya estaba.
      ...(logoUrl !== undefined ? { logoUrl } : {}),
    })
    if (ok) setLogoFile(null)
    setMensaje(ok ? 'Cambios guardados.' : null)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
          <CardDescription>
            Estos datos se cargaron al crear la cuenta. Podés editarlos acá.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nombre">Nombre del negocio</Label>
            <Input
              id="nombre"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="titular">Titular</Label>
            <Input
              id="titular"
              value={form.titular}
              onChange={(e) => setForm({ ...form, titular: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="direccion">Dirección</Label>
            <Input
              id="direccion"
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marca</CardTitle>
          <CardDescription>
            Logo y color de identidad. Se usan en el menú, el sidebar y en los comprobantes en
            PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-dashed">
              {logoFile ? (
                <img
                  src={URL.createObjectURL(logoFile)}
                  alt="Logo nuevo"
                  className="h-full w-full object-cover"
                />
              ) : empresa.logoUrl ? (
                <img src={empresa.logoUrl} alt="Logo actual" className="h-full w-full object-cover" />
              ) : (
                <span className="text-muted-foreground text-xs">Sin logo</span>
              )}
            </div>
            <label className="hover:bg-muted cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium">
              {subiendoLogo ? 'Subiendo...' : 'Cambiar logo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={subiendoLogo}
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Label className="whitespace-nowrap">Color de marca</Label>
            <input
              type="color"
              value={form.colorMarca}
              onChange={(e) => setForm({ ...form, colorMarca: e.target.value })}
              className="h-10 w-10 cursor-pointer rounded-md border"
            />
            <Input
              value={form.colorMarca}
              onChange={(e) => setForm({ ...form, colorMarca: e.target.value })}
              className="w-32"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="text-muted-foreground h-4 w-4" />
            Horario de atención
          </CardTitle>
          <CardDescription>
            Fase 16 — si lo activás, el Catálogo público (Menú QR/Delivery) deja de aceptar
            pedidos fuera de estos días y horarios: se lo avisa al comensal y también se rechaza
            del lado del servidor. Desactivado, el Catálogo sigue aceptando pedidos las 24 hs,
            como hasta ahora.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <input
              id="horarioActivo"
              type="checkbox"
              checked={form.horarioActivo}
              onChange={(e) => setForm({ ...form, horarioActivo: e.target.checked })}
            />
            <Label htmlFor="horarioActivo">Restringir pedidos a este horario</Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="horarioApertura">Abre</Label>
              <Input
                id="horarioApertura"
                type="time"
                value={form.horarioApertura}
                onChange={(e) => setForm({ ...form, horarioApertura: e.target.value })}
                disabled={!form.horarioActivo}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="horarioCierre">Cierra</Label>
              <Input
                id="horarioCierre"
                type="time"
                value={form.horarioCierre}
                onChange={(e) => setForm({ ...form, horarioCierre: e.target.value })}
                disabled={!form.horarioActivo}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Días de atención</Label>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  disabled={!form.horarioActivo}
                  onClick={() => toggleDiaHorario(d.value)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    form.horarioDias.includes(d.value)
                      ? 'border-current bg-muted'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="text-muted-foreground h-4 w-4" />
            Datos protegidos
          </CardTitle>
          <CardDescription>
            Estos campos los administra Edgy — escribinos si necesitás cambiarlos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>CUIT</Label>
            <Input value={empresa.cuit ?? '—'} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tipo de negocio</Label>
            <Input value={TIPOS_NEGOCIO_LABEL[empresa.tipoNegocio] ?? empresa.tipoNegocio} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Subdominio</Label>
            <Input value={empresa.slug ?? '—'} disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos fiscales</CardTitle>
          <CardDescription>
            No se cargaron al crear la cuenta — completalos cuando los tengas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Categoría impositiva</Label>
            <Select
              value={form.categoriaImpositiva}
              onValueChange={(v) => setForm({ ...form, categoriaImpositiva: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná una categoría" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS_IMPOSITIVAS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Personería</Label>
            <Select
              value={form.personeria}
              onValueChange={(v) => setForm({ ...form, personeria: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná" />
              </SelectTrigger>
              <SelectContent>
                {PERSONERIAS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inicio">Inicio de actividades</Label>
            <Input
              id="inicio"
              type="date"
              value={form.inicioActividades}
              onChange={(e) => setForm({ ...form, inicioActividades: e.target.value })}
            />
          </div>
          <div />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provincia">Provincia</Label>
            <Input
              id="provincia"
              value={form.provincia}
              onChange={(e) => setForm({ ...form, provincia: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="localidad">Localidad</Label>
            <Input
              id="localidad"
              value={form.localidad}
              onChange={(e) => setForm({ ...form, localidad: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp">Código postal</Label>
            <Input
              id="cp"
              value={form.codigoPostal}
              onChange={(e) => setForm({ ...form, codigoPostal: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="text-muted-foreground h-4 w-4" />
            Facturación electrónica (ARCA)
          </CardTitle>
          <CardDescription>
            Fase 11 — conexión con ARCA (ex AFIP) para emitir comprobantes electrónicos con CAE
            real. Necesitás el CUIT ya cargado arriba, un punto de venta habilitado en ARCA, y un
            certificado digital (WSASS para homologación/pruebas, o el Administrador de
            Certificados Digitales de ARCA para producción).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>CUIT</Label>
            <Input value={arcaEstado?.cuit ?? empresa.cuit ?? '—'} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="puntoVenta">Punto de venta</Label>
            <Input
              id="puntoVenta"
              type="number"
              min={1}
              value={formArca.puntoVenta}
              onChange={(e) => setFormArca({ ...formArca, puntoVenta: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Condición de IVA del negocio</Label>
            <Select
              value={formArca.condicionIva}
              onValueChange={(v) => setFormArca({ ...formArca, condicionIva: v as FormArca['condicionIva'] })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="responsable_inscripto">Responsable Inscripto</SelectItem>
                <SelectItem value="monotributista">Monotributista</SelectItem>
                <SelectItem value="exento">Exento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Modo</Label>
            <Select
              value={formArca.modo}
              onValueChange={(v) => setFormArca({ ...formArca, modo: v as FormArca['modo'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="homologacion">Homologación (pruebas, sin facturar de verdad)</SelectItem>
                <SelectItem value="produccion">Producción (factura real)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="certificado">Certificado (.crt, formato PEM)</Label>
            <textarea
              id="certificado"
              className="min-h-[80px] rounded-md border px-3 py-2 font-mono text-xs"
              placeholder={
                arcaEstado?.tieneCertificado
                  ? 'Ya hay un certificado cargado — pegá uno nuevo solo si lo querés reemplazar'
                  : '-----BEGIN CERTIFICATE-----...'
              }
              value={formArca.certificadoPem}
              onChange={(e) => setFormArca({ ...formArca, certificadoPem: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="clavePrivada">Clave privada (.key, formato PEM)</Label>
            <textarea
              id="clavePrivada"
              className="min-h-[80px] rounded-md border px-3 py-2 font-mono text-xs"
              placeholder={
                arcaEstado?.tieneCertificado
                  ? 'Ya hay una clave cargada — pegá una nueva solo si la querés reemplazar'
                  : '-----BEGIN PRIVATE KEY-----...'
              }
              value={formArca.clavePrivadaPem}
              onChange={(e) => setFormArca({ ...formArca, clavePrivadaPem: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">
              Nunca se vuelve a mostrar una vez guardada — solo se puede reemplazar.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="habilitado"
              type="checkbox"
              checked={formArca.habilitado}
              onChange={(e) => setFormArca({ ...formArca, habilitado: e.target.checked })}
            />
            <Label htmlFor="habilitado">Habilitar facturación electrónica para este negocio</Label>
          </div>
        </CardContent>
        <CardContent className="flex items-center gap-3 pt-0">
          <Button onClick={handleGuardarArca} disabled={guardandoArca} variant="outline">
            {guardandoArca ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Guardar configuración ARCA
          </Button>
          {mensajeArca && <span className="text-sm text-green-600">{mensajeArca}</span>}
          {errorArca && <span className="text-sm text-red-500">{errorArca}</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="text-muted-foreground h-4 w-4" />
            Cobro online (Mercado Pago)
          </CardTitle>
          <CardDescription>
            Fase 12 — dejá que tus clientes paguen desde el Menú QR/Delivery con Mercado Pago
            Checkout Pro. Necesitás tu propio access_token (Credenciales, en Tus integraciones de
            Mercado Pago) y el secreto de webhook (Webhooks &gt; Configurar notificaciones, misma
            sección). Empezá en modo Test hasta confirmar que el link de pago funciona.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Modo</Label>
            <Select
              value={formPago.modo}
              onValueChange={(v) => setFormPago({ ...formPago, modo: v as FormPago['modo'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test (credenciales de prueba)</SelectItem>
                <SelectItem value="produccion">Producción (cobros reales)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div />

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="mpAccessToken">Access Token</Label>
            <Input
              id="mpAccessToken"
              type="password"
              placeholder={
                pagoEstado?.tieneAccessToken
                  ? 'Ya hay un access token cargado — pegá uno nuevo solo si lo querés reemplazar'
                  : 'APP_USR-...'
              }
              value={formPago.accessToken}
              onChange={(e) => setFormPago({ ...formPago, accessToken: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="mpWebhookSecret">Secreto de webhook</Label>
            <Input
              id="mpWebhookSecret"
              type="password"
              placeholder={
                pagoEstado?.tieneWebhookSecret
                  ? 'Ya hay un secreto cargado — pegá uno nuevo solo si lo querés reemplazar'
                  : 'Se genera en Tus integraciones > Webhooks'
              }
              value={formPago.webhookSecret}
              onChange={(e) => setFormPago({ ...formPago, webhookSecret: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">
              Nunca se vuelven a mostrar una vez guardados — solo se pueden reemplazar.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="pagoHabilitado"
              type="checkbox"
              checked={formPago.habilitado}
              onChange={(e) => setFormPago({ ...formPago, habilitado: e.target.checked })}
            />
            <Label htmlFor="pagoHabilitado">Habilitar cobro online para este negocio</Label>
          </div>
        </CardContent>
        <CardContent className="flex items-center gap-3 pt-0">
          <Button onClick={handleGuardarPago} disabled={guardandoPago} variant="outline">
            {guardandoPago ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Guardar configuración de Cobro Online
          </Button>
          {mensajePago && <span className="text-sm text-green-600">{mensajePago}</span>}
          {errorPago && <span className="text-sm text-red-500">{errorPago}</span>}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleGuardar} disabled={guardando || subiendoLogo}>
          {guardando || subiendoLogo ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Guardar cambios
        </Button>
        {mensaje && <span className="text-sm text-green-600">{mensaje}</span>}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  )
}
