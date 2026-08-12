import { useState } from 'react'
import { Loader2, MapPin, Plus, Star, StarOff, Trash2, Link2, Copy, Check, Palette } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useClienteId } from '../data/useClienteId'
import { usePuntosVenta } from '../data/usePuntosVenta'
import { useClienteActual } from '@/hooks/useClienteActual'
import { generarSlug, slugValido } from '@/lib/slug'
import type { PuntoVenta } from '../types'

// Fase 36: mismo bucket y convención de nombre de archivo que
// Empresa.tsx (subirLogo) -- un logo de local y uno de cliente no
// chocan porque el nombre de archivo lleva timestamp.
async function subirLogoLocal(file: File): Promise<string | null> {
  const ruta = `${Date.now()}-${file.name}`
  const { data: subida, error } = await supabase.storage.from('logos-clientes').upload(ruta, file)
  if (error || !subida) return null
  return supabase.storage.from('logos-clientes').getPublicUrl(subida.path).data.publicUrl
}

const COLOR_MARCA_DEFAULT = '#D4537E'

export default function PuntosVenta() {
  const { clienteId, cargando: cargandoCliente } = useClienteId()
  const {
    puntosVenta,
    cargando,
    error,
    crear,
    marcarPorDefecto,
    darDeBaja,
    actualizarSlug,
    actualizarBranding,
  } = usePuntosVenta(clienteId)
  // Fase 27d-2: necesitamos el slug del CLIENTE para armar el link
  // completo de cada local (`/menu/<slug cliente>/<slug local>`).
  const { cliente } = useClienteActual()

  const [abierto, setAbierto] = useState(false)
  const [alias, setAlias] = useState('')
  const [numero, setNumero] = useState('')
  const [direccion, setDireccion] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTocado, setSlugTocado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  function limpiarFormulario() {
    setAlias('')
    setNumero('')
    setDireccion('')
    setSlug('')
    setSlugTocado(false)
    setErrorForm(null)
  }

  // Mismo patrón que Paso1Identidad.tsx (onboarding): el slug se
  // autogenera del alias hasta que el usuario lo edita a mano.
  function handleAliasChange(valor: string) {
    setAlias(valor)
    if (!slugTocado) setSlug(generarSlug(valor))
  }

  async function handleAgregar() {
    if (!alias.trim()) {
      setErrorForm('El alias es obligatorio.')
      return
    }
    const slugLimpio = slug.trim()
    if (slugLimpio && !slugValido(slugLimpio)) {
      setErrorForm('El identificador del link solo puede tener minúsculas, números y guiones.')
      return
    }
    setGuardando(true)
    setErrorForm(null)
    const ok = await crear({
      alias: alias.trim(),
      numero: numero.trim() || null,
      direccion: direccion.trim() || null,
      paraIntegraciones: false,
      slug: slugLimpio || null,
    })
    setGuardando(false)
    if (ok) {
      limpiarFormulario()
      setAbierto(false)
    } else {
      setErrorForm('No pudimos crear el punto de venta. Revisá que el número y el link no estén repetidos.')
    }
  }

  // Fase 27d-2: link público del Menú público de este local puntual --
  // solo tiene sentido si tanto el cliente como el local tienen slug.
  function linkLocal(pv: PuntoVenta): string | null {
    if (!cliente?.slug || !pv.slug) return null
    return `${window.location.origin}/menu/${cliente.slug}/${pv.slug}`
  }

  // Edición inline del identificador de link -- para locales que ya
  // existían antes de esta fase y todavía no tienen slug cargado.
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [slugEditando, setSlugEditando] = useState('')
  const [errorSlugEditando, setErrorSlugEditando] = useState('')
  const [copiadoId, setCopiadoId] = useState<string | null>(null)

  async function guardarSlugInline(pv: PuntoVenta) {
    const limpio = slugEditando.trim()
    if (limpio && !slugValido(limpio)) {
      setErrorSlugEditando('Solo minúsculas, números y guiones.')
      return
    }
    setErrorSlugEditando('')
    const ok = await actualizarSlug(pv.id, limpio || null)
    if (ok) setEditandoId(null)
  }

  async function copiarLink(pv: PuntoVenta) {
    const link = linkLocal(pv)
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopiadoId(pv.id)
    setTimeout(() => setCopiadoId(null), 2000)
  }

  // Fase 36: branding propio por local -- solo tiene sentido ofrecerlo
  // cuando ya hay más de un punto de venta (mismo criterio que el
  // selector de puntos_venta en ClienteDetalle.tsx). Un cliente de un
  // solo local sigue usando nada más el branding de Configuración >
  // Empresa, sin este botón de más.
  const [brandingAbiertoId, setBrandingAbiertoId] = useState<string | null>(null)
  const [nombreVisible, setNombreVisible] = useState('')
  const [colorMarcaLocal, setColorMarcaLocal] = useState(COLOR_MARCA_DEFAULT)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoUrlActual, setLogoUrlActual] = useState<string | null>(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [guardandoBranding, setGuardandoBranding] = useState(false)
  const [errorBranding, setErrorBranding] = useState<string | null>(null)

  function abrirBranding(pv: PuntoVenta) {
    setBrandingAbiertoId(pv.id)
    setNombreVisible(pv.nombreVisible ?? '')
    setColorMarcaLocal(pv.colorMarca ?? COLOR_MARCA_DEFAULT)
    setLogoUrlActual(pv.logoUrl)
    setLogoFile(null)
    setErrorBranding(null)
  }

  async function handleSubirLogo(file: File) {
    setSubiendoLogo(true)
    const url = await subirLogoLocal(file)
    setSubiendoLogo(false)
    if (url) {
      setLogoFile(file)
      setLogoUrlActual(url)
    }
  }

  async function guardarBranding() {
    if (!brandingAbiertoId) return
    setGuardandoBranding(true)
    setErrorBranding(null)
    const ok = await actualizarBranding(brandingAbiertoId, {
      nombreVisible: nombreVisible.trim() || null,
      colorMarca: colorMarcaLocal || null,
      logoUrl: logoUrlActual,
    })
    setGuardandoBranding(false)
    if (ok) {
      setBrandingAbiertoId(null)
    } else {
      setErrorBranding('No pudimos guardar. Probá de nuevo -- si sigue fallando, avisame.')
    }
  }

  async function quitarBrandingPropio() {
    if (!brandingAbiertoId) return
    setGuardandoBranding(true)
    setErrorBranding(null)
    const ok = await actualizarBranding(brandingAbiertoId, {
      nombreVisible: null,
      colorMarca: null,
      logoUrl: null,
    })
    setGuardandoBranding(false)
    if (ok) {
      setBrandingAbiertoId(null)
    } else {
      setErrorBranding('No pudimos guardar. Probá de nuevo -- si sigue fallando, avisame.')
    }
  }

  if (cargandoCliente || cargando) {
    return <p className="text-muted-foreground text-sm">Cargando puntos de venta...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Puntos de venta</CardTitle>
            <CardDescription>
              Cada local o punto de facturación de tu negocio. El número fiscal (AFIP) es
              opcional hasta que conectes facturación electrónica.
            </CardDescription>
          </div>
          <Dialog
            open={abierto}
            onOpenChange={(v) => {
              setAbierto(v)
              if (!v) limpiarFormulario()
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Agregar punto de venta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo punto de venta</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="alias">Alias</Label>
                  <Input
                    id="alias"
                    value={alias}
                    onChange={(e) => handleAliasChange(e.target.value)}
                    placeholder="Casa Central, Sucursal Norte..."
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="numero">Número fiscal (opcional)</Label>
                  <Input
                    id="numero"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="0001"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="direccion-pv">Dirección comercial (opcional)</Label>
                  <Input
                    id="direccion-pv"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Calle, número, localidad de este local"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="slug-pv">Link del Menú público (opcional)</Label>
                  <Input
                    id="slug-pv"
                    value={slug}
                    onChange={(e) => {
                      setSlugTocado(true)
                      setSlug(e.target.value)
                    }}
                    placeholder="sucursal-norte"
                  />
                  {cliente?.slug && (
                    <p className="text-muted-foreground text-xs">
                      {window.location.origin}/menu/{cliente.slug}/{slug || '...'}
                    </p>
                  )}
                </div>
                {errorForm && <p className="text-sm text-red-500">{errorForm}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAbierto(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAgregar} disabled={guardando}>
                  {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Agregar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alias</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Dirección comercial</TableHead>
                  <TableHead>Menú público</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Por defecto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {puntosVenta.map((pv) => (
                  <TableRow key={pv.id}>
                    <TableCell className="font-medium">{pv.alias}</TableCell>
                    <TableCell className="text-muted-foreground">{pv.numero ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {pv.direccion ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {pv.direccion}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {editandoId === pv.id ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={slugEditando}
                              onChange={(e) => setSlugEditando(e.target.value)}
                              placeholder="sucursal-norte"
                              className="h-8 w-40 text-sm"
                            />
                            <Button size="sm" className="h-8" onClick={() => guardarSlugInline(pv)}>
                              Guardar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={() => setEditandoId(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                          {errorSlugEditando && (
                            <p className="text-xs text-red-500">{errorSlugEditando}</p>
                          )}
                        </div>
                      ) : linkLocal(pv) ? (
                        <div className="flex items-center gap-1.5">
                          <Button variant="ghost" size="sm" onClick={() => copiarLink(pv)}>
                            {copiadoId === pv.id ? (
                              <Check className="mr-1.5 h-3.5 w-3.5" />
                            ) : (
                              <Copy className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Copiar link
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditandoId(pv.id)
                              setSlugEditando(pv.slug ?? '')
                              setErrorSlugEditando('')
                            }}
                          >
                            Editar
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditandoId(pv.id)
                            setSlugEditando(generarSlug(pv.alias))
                            setErrorSlugEditando('')
                          }}
                        >
                          <Link2 className="mr-1.5 h-3.5 w-3.5" />
                          Configurar link
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={pv.activo ? 'default' : 'secondary'}>
                        {pv.activo ? 'Activo' : 'Dado de baja'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => marcarPorDefecto(pv.id)}
                        disabled={pv.porDefecto || !pv.activo}
                        title={pv.porDefecto ? 'Punto de venta por defecto' : 'Marcar como por defecto'}
                      >
                        {pv.porDefecto ? (
                          <Star className="h-4 w-4 fill-current text-amber-500" />
                        ) : (
                          <StarOff className="text-muted-foreground h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {puntosVenta.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Logo, nombre y color propios de este local"
                            onClick={() => abrirBranding(pv)}
                          >
                            <Palette className="text-muted-foreground h-4 w-4" />
                          </Button>
                        )}
                        {pv.activo && !pv.porDefecto && (
                          <Button variant="ghost" size="sm" onClick={() => darDeBaja(pv.id)}>
                            <Trash2 className="text-muted-foreground h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Fase 36: branding propio del local (logo/nombre/color) -- para
          clientes multi-marca (ej. Punto Tex / Rúa) donde cada
          sucursal debe verse distinta al loguearse, sin tocar el
          branding general de Configuración > Empresa. */}
      <Dialog
        open={brandingAbiertoId !== null}
        onOpenChange={(v) => {
          if (!v) setBrandingAbiertoId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marca de este local</DialogTitle>
            <DialogDescription>
              Si lo cargás, esto es lo que ve quien esté logueado con acceso restringido a este
              local (header y sidebar) en vez del logo/nombre/color general del negocio.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white">
                {logoUrlActual ? (
                  <img src={logoUrlActual} alt="Logo del local" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-muted-foreground text-xs">Sin logo</span>
                )}
              </div>
              <label className="text-sm font-medium text-brand-500 cursor-pointer">
                {subiendoLogo ? 'Subiendo...' : 'Cambiar logo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={subiendoLogo}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleSubirLogo(file)
                  }}
                />
              </label>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nombre-visible-pv">Nombre visible (opcional)</Label>
              <Input
                id="nombre-visible-pv"
                value={nombreVisible}
                onChange={(e) => setNombreVisible(e.target.value)}
                placeholder="Se ve en el header en vez del nombre del negocio"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-marca-pv">Color de marca</Label>
              <div className="flex items-center gap-2">
                <input
                  id="color-marca-pv"
                  type="color"
                  value={colorMarcaLocal}
                  onChange={(e) => setColorMarcaLocal(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border"
                />
                <Input
                  value={colorMarcaLocal}
                  onChange={(e) => setColorMarcaLocal(e.target.value)}
                  className="max-w-32"
                />
              </div>
            </div>
            {errorBranding && <p className="text-sm text-red-500">{errorBranding}</p>}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={quitarBrandingPropio} disabled={guardandoBranding}>
              Usar branding del negocio
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setBrandingAbiertoId(null)}>
                Cancelar
              </Button>
              <Button onClick={guardarBranding} disabled={guardandoBranding || subiendoLogo}>
                {guardandoBranding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
