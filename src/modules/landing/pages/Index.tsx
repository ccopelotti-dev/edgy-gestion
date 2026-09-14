// Módulo Landing -- panel básico (Fase 76, 14/09, a pedido de Carlos).
//
// Objetivo explícito: que un operador humano pueda cambiar la foto del
// hero, ajustarle el contraste, y prender/apagar una promo -- SIN tocar
// código ni hacer git push. La landing pública (repo aparte
// "la-charcuteria-landing", GitHub Pages) hace un fetch a
// edgy_gestion.landing_publica(slug) al cargar la página, así que
// cualquier cambio guardado acá se ve reflejado ahí en el momento.
//
// El preview de contraste que se ve en esta pantalla es el MISMO CSS
// filter que aplica la landing real (filter: contrast(N%)), para que lo
// que el operador ve acá sea representativo de lo que va a publicarse.

import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Loader2, UploadCloud, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useClienteActual } from '@/hooks/useClienteActual'
import { useLandingConfig } from '../data/useLandingConfig'
import { subirImagenLanding, ACCEPT_IMAGENES } from '../lib/imagenes'
import { HERO_CONTRASTE_MAX, HERO_CONTRASTE_MIN, type LandingConfig } from '../types'

export default function Index() {
  const { cliente } = useClienteActual()
  const { config, cargando, guardando, error, clienteId, guardar } = useLandingConfig()

  const [form, setForm] = useState<LandingConfig>(config)
  const [previewLocal, setPreviewLocal] = useState<string | null>(null)
  const [archivoNuevo, setArchivoNuevo] = useState<File | null>(null)
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const inputArchivoRef = useRef<HTMLInputElement>(null)

  // Sincroniza el formulario cuando termina de cargar la config real
  // (evita pisar lo que ya haya en la fila con los valores por defecto).
  useEffect(() => {
    if (!cargando) setForm(config)
  }, [cargando, config])

  function elegirArchivo(file: File | null) {
    setErrorLocal(null)
    setArchivoNuevo(file)
    if (previewLocal) URL.revokeObjectURL(previewLocal)
    setPreviewLocal(file ? URL.createObjectURL(file) : null)
  }

  async function handleGuardar() {
    setMensaje(null)
    setErrorLocal(null)

    let heroImagenUrl = form.heroImagenUrl
    if (archivoNuevo && clienteId) {
      setSubiendoImagen(true)
      try {
        const resultado = await subirImagenLanding(archivoNuevo, clienteId)
        heroImagenUrl = resultado.url
      } catch (e) {
        setErrorLocal(e instanceof Error ? e.message : 'No se pudo subir la foto.')
        setSubiendoImagen(false)
        return
      }
      setSubiendoImagen(false)
    }

    const ok = await guardar({ ...form, heroImagenUrl })
    if (ok) {
      setArchivoNuevo(null)
      if (previewLocal) URL.revokeObjectURL(previewLocal)
      setPreviewLocal(null)
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

  const imagenAMostrar = previewLocal ?? form.heroImagenUrl
  const publicUrl = cliente?.slug ? `https://ccopelotti-dev.github.io/la-charcuteria-landing/` : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Landing</h1>
          <p className="text-muted-foreground text-sm">
            Cambiá la foto de portada, ajustá el contraste y prendé o apagá una promo -- se ve
            reflejado al instante en la web pública, sin tocar nada de código.
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Foto + contraste ── */}
        <Card>
          <CardContent className="flex flex-col gap-4 py-6">
            <h2 className="font-medium">Foto de portada</h2>

            <div
              className="relative flex h-48 items-center justify-center overflow-hidden rounded-md border bg-gray-100 bg-cover bg-center"
              style={{
                backgroundImage: imagenAMostrar ? `url(${imagenAMostrar})` : undefined,
                filter: imagenAMostrar ? `contrast(${form.heroContraste}%)` : undefined,
              }}
            >
              {!imagenAMostrar && (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-xs">Todavía no hay foto cargada</span>
                </div>
              )}
            </div>

            <input
              ref={inputArchivoRef}
              type="file"
              accept={ACCEPT_IMAGENES}
              className="hidden"
              onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="outline"
              onClick={() => inputArchivoRef.current?.click()}
              disabled={subiendoImagen || guardando}
            >
              <UploadCloud className="mr-1.5 h-4 w-4" />
              {imagenAMostrar ? 'Cambiar foto' : 'Subir foto'}
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
                disabled={!imagenAMostrar}
              />
              <p className="mt-1 text-xs text-muted-foreground">100% es el contraste normal de la foto.</p>
            </div>
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
              Con la promo desactivada, el título y el texto quedan guardados pero no se muestran
              en la landing -- podés dejarlos armados de antemano y solo prender el interruptor
              cuando corresponda.
            </p>
          </CardContent>
        </Card>
      </div>

      {(error || errorLocal) && (
        <p className="text-sm font-medium text-red-600">{error ?? errorLocal}</p>
      )}
      {mensaje && <p className="text-sm font-medium text-emerald-600">{mensaje}</p>}

      <div>
        <Button onClick={handleGuardar} disabled={guardando || subiendoImagen}>
          {guardando || subiendoImagen ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            'Guardar cambios'
          )}
        </Button>
      </div>
    </div>
  )
}
