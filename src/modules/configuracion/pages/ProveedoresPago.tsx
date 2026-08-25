// ============================================================
// Módulo Configuración — Proveedores de Pago
// Edgy Gestión
//
// Extraído de Empresa.tsx (25/08, a pedido de Carlos): antes las tres
// tarjetas de cobro (Mercado Pago Checkout, Talo, Mercado Pago Point)
// vivían mezcladas con datos de marca/domicilio/ARCA en una sola
// pantalla larga. Acá quedan solas, con un resumen de estado arriba --
// pensado tanto para que el propio cliente vea de un vistazo qué tiene
// configurado, como para que un agente de Edgy que está dando de alta
// una cuenta nueva sepa qué falta sin tener que abrir cada tarjeta.
//
// Nada de la lógica de guardado cambió -- sigue siendo pagoConfig.ts
// (Netlify Functions + clientes_pago_config, factorizada por
// proveedor). Point usa la misma cuenta/access_token que Checkout Pro
// (ver 0096_fase12c_mp_point.sql), por eso su tarjeta depende de que
// la de Mercado Pago ya tenga access_token cargado.
// ============================================================

import { useEffect, useState } from 'react'
import { Loader2, Save, CreditCard, Wifi, CheckCircle2, Circle } from 'lucide-react'
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
import { useEmpresa } from '../data/useEmpresa'
import {
  obtenerEstadoPago,
  guardarConfigPago,
  listarTerminalesPoint,
  vincularTerminalPoint,
  type EstadoPago,
  type TerminalPoint,
} from '../lib/pagoConfig'

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

// Fase 12b: Talo (transferencias bancarias, docs.talo.com.ar) -- segundo
// proveedor sobre la misma clientes_pago_config. A diferencia de MP,
// Talo separa un identificador PÚBLICO de cuenta (merchantId, viaja en
// el body al crear un pago, sin auth) de un token PRIVADO (Bearer, solo
// hace falta para consultar/confirmar un pago). Todavía no tiene firma
// de webhook (ver talo-webhook.js), por eso no hay campo de secreto acá.
interface FormPagoTalo {
  modo: 'test' | 'produccion'
  habilitado: boolean
  merchantId: string
  accessToken: string
}

const FORM_PAGO_TALO_VACIO: FormPagoTalo = {
  modo: 'test',
  habilitado: false,
  merchantId: '',
  accessToken: '',
}

// Resumen de estado -- una fila por proveedor, para el vistazo rápido
// de arriba de la pantalla.
function FilaEstado({ nombre, estado }: { nombre: string; estado: 'no_configurado' | 'test' | 'produccion' }) {
  const info = {
    no_configurado: { icon: Circle, texto: 'No configurado', color: 'text-gray-400' },
    test: { icon: CheckCircle2, texto: 'Activo -- modo Test', color: 'text-amber-600' },
    produccion: { icon: CheckCircle2, texto: 'Activo -- Producción', color: 'text-green-600' },
  }[estado]
  const Icon = info.icon
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className={`h-4 w-4 shrink-0 ${info.color}`} />
      <span className="font-medium text-gray-900">{nombre}</span>
      <span className={info.color}>{info.texto}</span>
    </div>
  )
}

export default function ProveedoresPago() {
  const { empresa } = useEmpresa()

  const [pagoEstado, setPagoEstado] = useState<EstadoPago | null>(null)
  const [formPago, setFormPago] = useState<FormPago>(FORM_PAGO_VACIO)
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [mensajePago, setMensajePago] = useState<string | null>(null)
  const [errorPago, setErrorPago] = useState<string | null>(null)

  const [pagoTaloEstado, setPagoTaloEstado] = useState<EstadoPago | null>(null)
  const [formPagoTalo, setFormPagoTalo] = useState<FormPagoTalo>(FORM_PAGO_TALO_VACIO)
  const [guardandoPagoTalo, setGuardandoPagoTalo] = useState(false)
  const [mensajePagoTalo, setMensajePagoTalo] = useState<string | null>(null)
  const [errorPagoTalo, setErrorPagoTalo] = useState<string | null>(null)

  // Fase 12c: Mercado Pago Point (cobro presencial) -- vive sobre el
  // mismo pagoEstado de arriba (proveedor 'mercadopago'), no hace
  // falta un fetch de estado aparte.
  const [terminalesPoint, setTerminalesPoint] = useState<TerminalPoint[]>([])
  const [buscandoTerminales, setBuscandoTerminales] = useState(false)
  const [terminalSeleccionada, setTerminalSeleccionada] = useState('')
  const [vinculandoTerminal, setVinculandoTerminal] = useState(false)
  const [pointWebhookSecret, setPointWebhookSecret] = useState('')
  const [guardandoPointSecret, setGuardandoPointSecret] = useState(false)
  const [mensajePoint, setMensajePoint] = useState<string | null>(null)
  const [errorPoint, setErrorPoint] = useState<string | null>(null)

  // Carga el estado de Cobro Online (no sensible) apenas se conoce el
  // cliente.
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

  // Carga el estado de Talo (no sensible) -- mismo criterio que Mercado
  // Pago arriba, pidiendo el proveedor 'talo' aparte.
  useEffect(() => {
    if (!empresa) return
    let activo = true
    obtenerEstadoPago(empresa.id, 'talo')
      .then((estado) => {
        if (!activo) return
        setPagoTaloEstado(estado)
        setFormPagoTalo((prev) => ({
          ...prev,
          modo: estado.modo ?? 'test',
          habilitado: estado.habilitado ?? false,
          merchantId: estado.merchantId ?? '',
        }))
      })
      .catch((err) => {
        if (activo) setErrorPagoTalo(err instanceof Error ? err.message : 'No se pudo cargar el estado de Talo')
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
      // Las credenciales nunca vuelven del backend -- se limpian los
      // campos después de guardar.
      setFormPago((prev) => ({ ...prev, accessToken: '', webhookSecret: '' }))
      setMensajePago('Configuración de Cobro Online guardada.')
    } catch (err) {
      setErrorPago(err instanceof Error ? err.message : 'No se pudo guardar la configuración de Cobro Online')
    } finally {
      setGuardandoPago(false)
    }
  }

  // Fase 12b: mismo patrón que handleGuardarPago, para Talo. merchantId
  // no es secreto -- viene precargado del estado (a diferencia de
  // accessToken, que nunca vuelve del backend).
  async function handleGuardarPagoTalo() {
    if (!empresa) return
    setMensajePagoTalo(null)
    setErrorPagoTalo(null)

    setGuardandoPagoTalo(true)
    try {
      await guardarConfigPago({
        clienteId: empresa.id,
        proveedor: 'talo',
        modo: formPagoTalo.modo,
        habilitado: formPagoTalo.habilitado,
        merchantId: formPagoTalo.merchantId || undefined,
        accessToken: formPagoTalo.accessToken || undefined,
      })
      const estadoNuevo = await obtenerEstadoPago(empresa.id, 'talo')
      setPagoTaloEstado(estadoNuevo)
      setFormPagoTalo((prev) => ({ ...prev, accessToken: '' }))
      setMensajePagoTalo('Configuración de Talo guardada.')
    } catch (err) {
      setErrorPagoTalo(err instanceof Error ? err.message : 'No se pudo guardar la configuración de Talo')
    } finally {
      setGuardandoPagoTalo(false)
    }
  }

  // Fase 12c: Mercado Pago Point -- buscar terminales de la cuenta ya
  // conectada (mismo access_token que Checkout Pro).
  async function handleBuscarTerminales() {
    if (!empresa) return
    setMensajePoint(null)
    setErrorPoint(null)
    setBuscandoTerminales(true)
    try {
      const lista = await listarTerminalesPoint(empresa.id)
      setTerminalesPoint(lista)
      if (lista.length === 0) {
        setErrorPoint('No se encontró ninguna terminal en la cuenta -- activala primero desde la app de Mercado Pago.')
      } else {
        setTerminalSeleccionada(lista[0].id)
      }
    } catch (err) {
      setErrorPoint(err instanceof Error ? err.message : 'No se pudieron listar las terminales')
    } finally {
      setBuscandoTerminales(false)
    }
  }

  async function handleVincularTerminal() {
    if (!empresa || !terminalSeleccionada) return
    setMensajePoint(null)
    setErrorPoint(null)
    setVinculandoTerminal(true)
    try {
      const terminal = terminalesPoint.find((t) => t.id === terminalSeleccionada)
      await vincularTerminalPoint({
        clienteId: empresa.id,
        terminalId: terminalSeleccionada,
        // Etiqueta amigable -- últimos caracteres del id, que es donde
        // Mercado Pago pone el serial visible en la parte de atrás del
        // dispositivo (ver documentación de Point).
        terminalLabel: terminalSeleccionada.slice(-10),
        storeId: terminal?.storeId,
        posId: terminal?.posId,
      })
      const estadoNuevo = await obtenerEstadoPago(empresa.id)
      setPagoEstado(estadoNuevo)
      setMensajePoint('Terminal vinculada -- ya está en modo PDV, lista para recibir órdenes.')
    } catch (err) {
      setErrorPoint(err instanceof Error ? err.message : 'No se pudo vincular la terminal')
    } finally {
      setVinculandoTerminal(false)
    }
  }

  async function handleGuardarPointWebhookSecret() {
    if (!empresa || !pointWebhookSecret.trim()) return
    setMensajePoint(null)
    setErrorPoint(null)
    setGuardandoPointSecret(true)
    try {
      await guardarConfigPago({
        clienteId: empresa.id,
        proveedor: 'mercadopago',
        modo: pagoEstado?.modo ?? 'test',
        habilitado: pagoEstado?.habilitado ?? false,
        pointWebhookSecret,
      })
      const estadoNuevo = await obtenerEstadoPago(empresa.id)
      setPagoEstado(estadoNuevo)
      setPointWebhookSecret('')
      setMensajePoint('Secreto de webhook de Point guardado.')
    } catch (err) {
      setErrorPoint(err instanceof Error ? err.message : 'No se pudo guardar el secreto de webhook')
    } finally {
      setGuardandoPointSecret(false)
    }
  }

  const estadoResumenPago: 'no_configurado' | 'test' | 'produccion' = !pagoEstado?.habilitado
    ? 'no_configurado'
    : pagoEstado.modo === 'produccion'
      ? 'produccion'
      : 'test'
  const estadoResumenTalo: 'no_configurado' | 'test' | 'produccion' = !pagoTaloEstado?.habilitado
    ? 'no_configurado'
    : pagoTaloEstado.modo === 'produccion'
      ? 'produccion'
      : 'test'
  const estadoResumenPoint: 'no_configurado' | 'test' | 'produccion' = pagoEstado?.pointHabilitado
    ? pagoEstado.modo === 'produccion'
      ? 'produccion'
      : 'test'
    : 'no_configurado'

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="text-muted-foreground h-4 w-4" />
            Resumen
          </CardTitle>
          <CardDescription>
            Estado de cada proveedor -- útil para saber de un vistazo qué falta vincular al dar de
            alta una cuenta nueva.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <FilaEstado nombre="Mercado Pago (Checkout online)" estado={estadoResumenPago} />
          <FilaEstado nombre="Talo (transferencias)" estado={estadoResumenTalo} />
          <FilaEstado nombre="Mercado Pago Point (presencial)" estado={estadoResumenPoint} />
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="text-muted-foreground h-4 w-4" />
            Cobro online (Talo)
          </CardTitle>
          <CardDescription>
            Fase 12b — segundo proveedor de cobro online, por transferencia bancaria. Creá tu cuenta
            en talo.com.ar/signup (empezá en modo Test/sandbox) y copiá acá tu User ID (identificador
            de cuenta) y tu API Key/token. Si habilitás Talo y Mercado Pago al mismo tiempo, el Menú
            Público usa Mercado Pago.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Modo</Label>
            <Select
              value={formPagoTalo.modo}
              onValueChange={(v) => setFormPagoTalo({ ...formPagoTalo, modo: v as FormPagoTalo['modo'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test (sandbox de Talo)</SelectItem>
                <SelectItem value="produccion">Producción (cobros reales)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div />

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="taloMerchantId">User ID</Label>
            <Input
              id="taloMerchantId"
              placeholder="Identificador de cuenta que te da Talo al crearla"
              value={formPagoTalo.merchantId}
              onChange={(e) => setFormPagoTalo({ ...formPagoTalo, merchantId: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="taloAccessToken">API Key / Token</Label>
            <Input
              id="taloAccessToken"
              type="password"
              placeholder={
                pagoTaloEstado?.tieneAccessToken
                  ? 'Ya hay un token cargado — pegá uno nuevo solo si lo querés reemplazar'
                  : 'Token privado del panel de Talo'
              }
              value={formPagoTalo.accessToken}
              onChange={(e) => setFormPagoTalo({ ...formPagoTalo, accessToken: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">
              Nunca se vuelve a mostrar una vez guardado — solo se puede reemplazar.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="pagoTaloHabilitado"
              type="checkbox"
              checked={formPagoTalo.habilitado}
              onChange={(e) => setFormPagoTalo({ ...formPagoTalo, habilitado: e.target.checked })}
            />
            <Label htmlFor="pagoTaloHabilitado">Habilitar cobro con Talo para este negocio</Label>
          </div>
        </CardContent>
        <CardContent className="flex items-center gap-3 pt-0">
          <Button onClick={handleGuardarPagoTalo} disabled={guardandoPagoTalo} variant="outline">
            {guardandoPagoTalo ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Guardar configuración de Talo
          </Button>
          {mensajePagoTalo && <span className="text-sm text-green-600">{mensajePagoTalo}</span>}
          {errorPagoTalo && <span className="text-sm text-red-500">{errorPagoTalo}</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="text-muted-foreground h-4 w-4" />
            Cobro presencial (Mercado Pago Point)
          </CardTitle>
          <CardDescription>
            Fase 12c — cobrá con tarjeta desde el Mostrador (Ventas &gt; Punto de Venta) usando una
            terminal física Point. Usa la misma cuenta de arriba (Access Token de Mercado Pago), no
            hace falta cargarlo de nuevo. Primero comprá y activá el dispositivo desde la app oficial
            de Mercado Pago (ese primer emparejamiento no se puede hacer por acá) y recién después
            buscalo y vinculalo en esta pantalla.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!pagoEstado?.tieneAccessToken ? (
            <p className="text-sm text-amber-700">
              Primero cargá y guardá tu Access Token de Mercado Pago en la sección de arriba (Cobro
              online) para poder buscar terminales.
            </p>
          ) : (
            <>
              {pagoEstado?.pointHabilitado && pagoEstado?.pointTerminalLabel && (
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Terminal vinculada: <strong>{pagoEstado.pointTerminalLabel}</strong> (modo PDV)
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <Button onClick={handleBuscarTerminales} disabled={buscandoTerminales} variant="outline" type="button">
                  {buscandoTerminales ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
                  Buscar terminales
                </Button>

                {terminalesPoint.length > 0 && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label>Terminal encontrada</Label>
                      <Select value={terminalSeleccionada} onValueChange={setTerminalSeleccionada}>
                        <SelectTrigger className="w-72">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {terminalesPoint.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.id.slice(-10)} — modo actual: {t.operatingMode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleVincularTerminal} disabled={vinculandoTerminal || !terminalSeleccionada} type="button">
                      {vinculandoTerminal ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Vincular esta terminal
                    </Button>
                  </>
                )}
              </div>

              <div className="border-t pt-4">
                <Label className="mb-1.5 block">Notificaciones (Webhook de Point)</Label>
                <p className="text-muted-foreground text-xs mb-2">
                  En Mercado Pago: Tus integraciones &gt; la app que usás acá &gt; Webhooks &gt;
                  Configurar notificaciones. Pegá esta URL y activá el evento <strong>Order</strong>:
                </p>
                <code className="block rounded bg-gray-100 px-2 py-1.5 text-xs break-all mb-3">
                  {`${window.location.origin}/.netlify/functions/point-orden-webhook?cliente=${empresa?.id ?? ''}`}
                </code>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                    <Label htmlFor="pointWebhookSecret">Secreto generado por Mercado Pago</Label>
                    <Input
                      id="pointWebhookSecret"
                      type="password"
                      placeholder={
                        pagoEstado?.pointTieneWebhookSecret
                          ? 'Ya hay un secreto cargado — pegá uno nuevo solo si lo querés reemplazar'
                          : 'Se genera al guardar la configuración del Webhook'
                      }
                      value={pointWebhookSecret}
                      onChange={(e) => setPointWebhookSecret(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleGuardarPointWebhookSecret}
                    disabled={guardandoPointSecret || !pointWebhookSecret.trim()}
                    variant="outline"
                    type="button"
                  >
                    {guardandoPointSecret ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Guardar secreto
                  </Button>
                </div>
              </div>

              {mensajePoint && <span className="text-sm text-green-600">{mensajePoint}</span>}
              {errorPoint && <span className="text-sm text-red-500">{errorPoint}</span>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
