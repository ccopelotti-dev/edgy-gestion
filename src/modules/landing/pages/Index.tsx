// Módulo Landing -- panel de edición (Fase 76, 14/09 + Fase 78, 15/09).
//
// Objetivo explícito (Carlos, Fase 78): sumar "algo más de libertad" sin
// volverlo complejo -- se agregan, sección por sección, los mismos
// bloques que tiene la landing pública: Hero (foto/contraste + título/
// bajada + a dónde apunta el botón + WhatsApp del negocio), Nosotros
// (foto + texto), Nuestros productos (elegidos del catálogo real -- acá
// nunca se escribe nombre/precio a mano, siempre sale del catálogo) y
// Galería (título/bajada + fotos, generalización de "Tienda de
// Picadas" para que sirva a cualquier comercio gastronómico).
//
// La landing pública (repo aparte "la-charcuteria-landing", GitHub
// Pages) hace un fetch a edgy_gestion.landing_publica(slug) al cargar la
// página, así que cualquier cambio guardado acá se ve reflejado ahí en
// el momento -- ver script inline en ese repo (index.html).

import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Loader2, UploadCloud, ExternalLink, X, ArrowUp, ArrowDown, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useClienteActual } from '@/hooks/useClienteActual'
import { useLandingConfig } from '../data/useLandingConfig'
import { useCatalogoParaLanding } from '../data/useCatalogoParaLanding'
import { useContenidoCatalogo } from '../data/useContenidoCatalogo'
import { subirImagenLanding, ACCEPT_IMAGENES } from '../lib/imagenes'
import { GeneradorContenidoDialog } from '../components/GeneradorContenidoDialog'
import { GALERIA_MAX_FOTOS, HERO_CONTRASTE_MAX, HERO_CONTRASTE_MIN, type ItemContenido, type LandingConfig } from '../types'

export default function Index() {
  const { cliente } = useClienteActual()
  const { config, cargando, guardando, error, clienteId, guardar } = useLandingConfig()
  const { productos: catalogo, cargando: cargandoCatalogo } = useCatalogoParaLanding()
  const { items: itemsContenido, cargando: cargandoContenido } = useContenidoCatalogo()
  const [itemGenerador, setItemGenerador] = useState<ItemContenido | null>(null)

  const [form, setForm] = useState<LandingConfig>(config)

  // Hero
  const [previewHero, setPreviewHero] = useState<string | null>(null)
  const [archivoHero, setArchivoHero] = useState<File | null>(null)
  const inputHeroRef = useRef<HTMLInputElement>(null)

  // Nosotros
  const [previewNosotros, setPreviewNosotros] = useState<string | null>(null)
  const [archivoNosotros, setArchivoNosotros] = useState<File | null>(null)
  const inputNosotrosRef = useRef<HTMLInputElement>(null)

  // Galería
  const [galeriaNuevas, setGaleriaNuevas] = useState<File[]>([])
  const [previewsGaleriaNuevas, setPreviewsGaleriaNuevas] = useState<string[]>([])
  const inputGaleriaRef = useRef<HTMLInputElement>(null)

  const [subiendo, setSubiendo] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [errorLocal, setErrorLocal] = useState<string | null>(null)

  // Sincroniza el formulario cuando termina de cargar la config real
  // (evita pisar lo que ya haya en la fila con los valores por defecto).
  useEffect(() => {
    if (!cargando) setForm(config)
  }, [cargando, config])

  function elegirHero(file: File | null) {
    setErrorLocal(null)
    setArchivoHero(file)
    if (previewHero) URL.revokeObjectURL(previewHero)
    setPreviewHero(file ? URL.createObjectURL(file) : null)
  }

  function elegirNosotros(file: File | null) {
    setErrorLocal(null)
    setArchivoNosotros(file)
    if (previewNosotros) URL.revokeObjectURL(previewNosotros)
    setPreviewNosotros(file ? URL.createObjectURL(file) : null)
  }

  function agregarFotosGaleria(files: FileList | null) {
    if (!files || files.length === 0) return
    setErrorLocal(null)
    const totalActual = form.galeriaImagenes.length + galeriaNuevas.length
    const disponibles = GALERIA_MAX_FOTOS - totalActual
    if (disponibles <= 0) {
      setErrorLocal(`La galería admite hasta ${GALERIA_MAX_FOTOS} fotos. Sacá alguna antes de agregar más.`)
      return
    }
    const nuevos = Array.from(files).slice(0, disponibles)
    setGaleriaNuevas((prev) => [...prev, ...nuevos])
    setPreviewsGaleriaNuevas((prev) => [...prev, ...nuevos.map((f) => URL.createObjectURL(f))])
  }

  function quitarFotoGaleriaExistente(index: number) {
    setForm((f) => ({ ...f, galeriaImagenes: f.galeriaImagenes.filter((_, i) => i !== index) }))
  }

  function moverFotoGaleriaExistente(index: number, direccion: -1 | 1) {
    setForm((f) => {
      const destino = index + direccion
      if (destino < 0 || destino >= f.galeriaImagenes.length) return f
      const copia = [...f.galeriaImagenes]
      ;[copia[index], copia[destino]] = [copia[destino], copia[index]]
      return { ...f, galeriaImagenes: copia }
    })
  }

  function quitarFotoGaleriaNueva(index: number) {
    URL.revokeObjectURL(previewsGaleriaNuevas[index])
    setGaleriaNuevas((prev) => prev.filter((_, i) => i !== index))
    setPreviewsGaleriaNuevas((prev) => prev.filter((_, i) => i !== index))
  }

  function toggleProductoDestacado(id: string) {
    setForm((f) => {
      const yaEsta = f.productosDestacadosIds.includes(id)
      return {
        ...f,
        productosDestacadosIds: yaEsta
          ? f.productosDestacadosIds.filter((x) => x !== id)
          : [...f.productosDestacadosIds, id],
      }
    })
  }

  async function handleGuardar() {
    setMensaje(null)
    setErrorLocal(null)

    let heroImagenUrl = form.heroImagenUrl
    let nosotrosImagenUrl = form.nosotrosImagenUrl
    let galeriaImagenes = form.galeriaImagenes

    if (!clienteId) return

    setSubiendo(true)
    try {
      if (archivoHero) {
        const resultado = await subirImagenLanding(archivoHero, clienteId)
        heroImagenUrl = resultado.url
      }
      if (archivoNosotros) {
        const resultado = await subirImagenLanding(archivoNosotros, clienteId)
        nosotrosImagenUrl = resultado.url
      }
      if (galeriaNuevas.length > 0) {
        const subidas = await Promise.all(galeriaNuevas.map((file) => subirImagenLanding(file, clienteId)))
        galeriaImagenes = [...galeriaImagenes, ...subidas.map((s) => s.url)]
      }
    } catch (e) {
      setErrorLocal(e instanceof Error ? e.message : 'No se pudo subir alguna de las fotos.')
      setSubiendo(false)
      return
    }
    setSubiendo(false)

    const formFinal: LandingConfig = { ...form, heroImagenUrl, nosotrosImagenUrl, galeriaImagenes }
    const ok = await guardar(formFinal)
    if (ok) {
      setArchivoHero(null)
      setArchivoNosotros(null)
      if (previewHero) URL.revokeObjectURL(previewHero)
      if (previewNosotros) URL.revokeObjectURL(previewNosotros)
      previewsGaleriaNuevas.forEach((url) => URL.revokeObjectURL(url))
      setPreviewHero(null)
      setPreviewNosotros(null)
      setGaleriaNuevas([])
      setPreviewsGaleriaNuevas([])
      setMensaje('Guardado. El cambio ya se ve en la landing pública.')
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando...
      </div>
    )
  }

  const imagenHeroAMostrar = previewHero ?? form.heroImagenUrl
  const imagenNosotrosAMostrar = previewNosotros ?? form.nosotrosImagenUrl
  const publicUrl = cliente?.slug ? `https://ccopelotti-dev.github.io/la-charcuteria-landing/` : null
  const totalFotosGaleria = form.galeriaImagenes.length + galeriaNuevas.length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Landing</h1>
          <p className="text-muted-foreground text-sm">
            Editá foto, textos y contenido de cada sección de la landing pública -- se ve reflejado
            al instante en la web, sin tocar nada de código.
          </p>
        </div>
        {publicUrl && (
          <a href={publicUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Ver landing
            </Button>
          </a>
        )}
      </div>

      {/* ── Hero ── */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <h2 className="font-medium">Portada (hero)</h2>

          <div
            className="relative flex h-48 items-center justify-center overflow-hidden rounded-md border bg-gray-100 bg-cover bg-center"
            style={{
              backgroundImage: imagenHeroAMostrar ? `url(${imagenHeroAMostrar})` : undefined,
              filter: imagenHeroAMostrar ? `contrast(${form.heroContraste}%)` : undefined,
            }}
          >
            {!imagenHeroAMostrar && (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
                <span className="text-xs">Todavía no hay foto cargada</span>
              </div>
            )}
          </div>

          <input
            ref={inputHeroRef}
            type="file"
            accept={ACCEPT_IMAGENES}
            className="hidden"
            onChange={(e) => elegirHero(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="outline"
            className="self-start"
            onClick={() => inputHeroRef.current?.click()}
            disabled={subiendo || guardando}
          >
            <UploadCloud className="mr-1.5 h-4 w-4" />
            {imagenHeroAMostrar ? 'Cambiar foto' : 'Subir foto'}
          </Button>

          <div>
            <Label htmlFor="contraste">
              Contraste: <span className="font-semibold">{form.heroContraste}%</span>
            </Label>
            <input
              id="contraste"
              type="range"
              min={HERO_CONTRASTE_MIN}
              max={HERO_CONTRASTE_MAX}
              step={5}
              value={form.heroContraste}
              onChange={(e) => setForm((f) => ({ ...f, heroContraste: Number(e.target.value) }))}
              className="mt-2 w-full accent-brand-500"
              disabled={!imagenHeroAMostrar}
            />
            <p className="mt-1 text-xs text-muted-foreground">100% es el contraste normal de la foto.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="hero-titulo">Título</Label>
              <Input
                id="hero-titulo"
                value={form.heroTitulo}
                onChange={(e) => setForm((f) => ({ ...f, heroTitulo: e.target.value }))}
                placeholder="Ej: Fiambres curados con oficio, para compartir en mesa."
                maxLength={120}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="whatsapp">WhatsApp del negocio</Label>
              <Input
                id="whatsapp"
                value={form.whatsappNumero}
                onChange={(e) => setForm((f) => ({ ...f, whatsappNumero: e.target.value }))}
                placeholder="Ej: 5492954367009"
                maxLength={20}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Con código de país, sin espacios ni el signo +. Se usa en todos los botones de
                WhatsApp de la landing.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="hero-bajada">Bajada</Label>
            <textarea
              id="hero-bajada"
              value={form.heroBajada}
              onChange={(e) => setForm((f) => ({ ...f, heroBajada: e.target.value }))}
              placeholder="Párrafo corto debajo del título."
              maxLength={220}
              rows={2}
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div>
            <Label>Botón principal del hero</Label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <Select
                value={form.heroCtaTipo}
                onValueChange={(v) => setForm((f) => ({ ...f, heroCtaTipo: v as 'catalogo' | 'producto' }))}
              >
                <SelectTrigger className="sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="catalogo">Ir al catálogo QR</SelectItem>
                  <SelectItem value="producto">Pedir un producto puntual por WhatsApp</SelectItem>
                </SelectContent>
              </Select>

              {form.heroCtaTipo === 'producto' && (
                <Select
                  value={form.heroCtaProductoId ?? undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, heroCtaProductoId: v }))}
                >
                  <SelectTrigger className="sm:w-64">
                    <SelectValue placeholder={cargandoCatalogo ? 'Cargando...' : 'Elegir producto'} />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogo.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Nosotros ── */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <h2 className="font-medium">Nosotros</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div
                className="relative flex h-40 items-center justify-center overflow-hidden rounded-md border bg-gray-100 bg-cover bg-center"
                style={{ backgroundImage: imagenNosotrosAMostrar ? `url(${imagenNosotrosAMostrar})` : undefined }}
              >
                {!imagenNosotrosAMostrar && (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-xs">Todavía no hay foto cargada</span>
                  </div>
                )}
              </div>
              <input
                ref={inputNosotrosRef}
                type="file"
                accept={ACCEPT_IMAGENES}
                className="hidden"
                onChange={(e) => elegirNosotros(e.target.files?.[0] ?? null)}
              />
              <Button
                variant="outline"
                className="self-start"
                onClick={() => inputNosotrosRef.current?.click()}
                disabled={subiendo || guardando}
              >
                <UploadCloud className="mr-1.5 h-4 w-4" />
                {imagenNosotrosAMostrar ? 'Cambiar foto' : 'Subir foto'}
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="nosotros-titulo">Título</Label>
                <Input
                  id="nosotros-titulo"
                  value={form.nosotrosTitulo}
                  onChange={(e) => setForm((f) => ({ ...f, nosotrosTitulo: e.target.value }))}
                  placeholder="Ej: Productos artesanales, hechos con tiempo"
                  maxLength={120}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="nosotros-texto1">Primer párrafo</Label>
                <textarea
                  id="nosotros-texto1"
                  value={form.nosotrosTexto1}
                  onChange={(e) => setForm((f) => ({ ...f, nosotrosTexto1: e.target.value }))}
                  rows={3}
                  maxLength={400}
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div>
                <Label htmlFor="nosotros-texto2">Segundo párrafo</Label>
                <textarea
                  id="nosotros-texto2"
                  value={form.nosotrosTexto2}
                  onChange={(e) => setForm((f) => ({ ...f, nosotrosTexto2: e.target.value }))}
                  rows={3}
                  maxLength={400}
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Nuestros productos ── */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-6">
          <h2 className="font-medium">Nuestros productos</h2>
          <p className="text-xs text-muted-foreground">
            Elegí qué productos del catálogo se muestran en la landing. El nombre, precio y foto
            siempre salen del catálogo real -- no se editan acá, para que nunca queden
            desactualizados.
          </p>

          {cargandoCatalogo ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando catálogo...
            </div>
          ) : catalogo.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay productos activos cargados en el catálogo.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {catalogo.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={form.productosDestacadosIds.includes(p.id)}
                    onChange={() => toggleProductoDestacado(p.id)}
                    className="h-4 w-4 accent-brand-500"
                  />
                  <span className="flex-1 truncate">{p.nombre}</span>
                  {p.rubroNombre && (
                    <span className="text-xs text-muted-foreground">{p.rubroNombre}</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Galería ── */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <h2 className="font-medium">Galería</h2>
          <p className="text-xs text-muted-foreground">
            Título, bajada y fotos de la sección de galería (ej. "Tienda de Picadas", o lo que
            corresponda a tu negocio).
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="galeria-titulo">Título</Label>
              <Input
                id="galeria-titulo"
                value={form.galeriaTitulo}
                onChange={(e) => setForm((f) => ({ ...f, galeriaTitulo: e.target.value }))}
                placeholder="Ej: Tienda de Picadas"
                maxLength={80}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="galeria-bajada">Bajada</Label>
              <Input
                id="galeria-bajada"
                value={form.galeriaBajada}
                onChange={(e) => setForm((f) => ({ ...f, galeriaBajada: e.target.value }))}
                placeholder="Ej: Armamos tu picada a pedido..."
                maxLength={160}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {form.galeriaImagenes.map((url, i) => (
              <div key={url} className="group relative aspect-square overflow-hidden rounded-md border">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 top-0 flex justify-between p-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => moverFotoGaleriaExistente(i, -1)}
                      disabled={i === 0}
                      className="rounded bg-black/60 p-1 text-white disabled:opacity-30"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moverFotoGaleriaExistente(i, 1)}
                      disabled={i === form.galeriaImagenes.length - 1}
                      className="rounded bg-black/60 p-1 text-white disabled:opacity-30"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => quitarFotoGaleriaExistente(i)}
                    className="rounded bg-black/60 p-1 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            {previewsGaleriaNuevas.map((url, i) => (
              <div key={url} className="group relative aspect-square overflow-hidden rounded-md border border-dashed">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  nueva
                </span>
                <button
                  type="button"
                  onClick={() => quitarFotoGaleriaNueva(i)}
                  className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <input
            ref={inputGaleriaRef}
            type="file"
            accept={ACCEPT_IMAGENES}
            multiple
            className="hidden"
            onChange={(e) => agregarFotosGaleria(e.target.files)}
          />
          <Button
            variant="outline"
            className="self-start"
            onClick={() => inputGaleriaRef.current?.click()}
            disabled={subiendo || guardando || totalFotosGaleria >= GALERIA_MAX_FOTOS}
          >
            <UploadCloud className="mr-1.5 h-4 w-4" />
            Agregar fotos ({totalFotosGaleria}/{GALERIA_MAX_FOTOS})
          </Button>
        </CardContent>
      </Card>

      {/* ── Generador de contenido para redes (Fase 79, "Capa 1") ── */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-6">
          <h2 className="font-medium">Generador de contenido para redes</h2>
          <p className="text-xs text-muted-foreground">
            Elegí un producto o combo real del catálogo y generá una imagen JPG lista para
            compartir en Instagram, WhatsApp o donde prefieras. Solo genera la imagen -- dónde y
            cómo publicarla queda a tu criterio.
          </p>

          {cargandoContenido ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando catálogo...
            </div>
          ) : itemsContenido.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay productos ni combos activos cargados en el catálogo.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {itemsContenido.map((item) => (
                <button
                  key={`${item.tipo}-${item.id}`}
                  type="button"
                  onClick={() => setItemGenerador(item)}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  {item.imagenes[0] ? (
                    <img src={item.imagenes[0]} alt="" className="h-9 w-9 rounded object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded bg-muted">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <span className="flex-1 truncate">{item.nombre}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {item.tipo === 'combo' ? 'Combo' : 'Producto'}
                  </span>
                  <Sparkles className="h-4 w-4 shrink-0 text-brand-500" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Promo ── */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Promo</h2>
            <Switch
              checked={form.promoActiva}
              onChange={(checked) => setForm((f) => ({ ...f, promoActiva: checked }))}
              label="Activar promo"
            />
          </div>

          <div>
            <Label htmlFor="promo-titulo">Título</Label>
            <Input
              id="promo-titulo"
              value={form.promoTitulo}
              onChange={(e) => setForm((f) => ({ ...f, promoTitulo: e.target.value }))}
              placeholder="Ej: 2x1 en salame los viernes"
              maxLength={60}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="promo-texto">Texto corto</Label>
            <textarea
              id="promo-texto"
              value={form.promoTexto}
              onChange={(e) => setForm((f) => ({ ...f, promoTexto: e.target.value }))}
              placeholder="Ej: Válido este fin de semana, consultá por WhatsApp."
              maxLength={140}
              rows={3}
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Con la promo desactivada, el título y el texto quedan guardados pero no se muestran en
            la landing -- podés dejarlos armados de antemano y solo prender el interruptor cuando
            corresponda.
          </p>
        </CardContent>
      </Card>

      {(error || errorLocal) && <p className="text-sm font-medium text-red-600">{error ?? errorLocal}</p>}
      {mensaje && <p className="text-sm font-medium text-emerald-600">{mensaje}</p>}

      <div>
        <Button onClick={handleGuardar} disabled={guardando || subiendo}>
          {guardando || subiendo ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            'Guardar cambios'
          )}
        </Button>
      </div>

      <GeneradorContenidoDialog
        open={itemGenerador !== null}
        onOpenChange={(open) => {
          if (!open) setItemGenerador(null)
        }}
        item={itemGenerador ?? undefined}
      />
    </div>
  )
}
