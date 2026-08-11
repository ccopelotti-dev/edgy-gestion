import { useEffect, useRef, useState } from 'react'
import { ArrowRightCircle, Image as ImageIcon, Mic, Square, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useNotas } from '../data/useNotas'
import { obtenerUrlMediaNota } from '../lib/notasMedia'
import { formatFecha, todayISO } from '../lib/format'
import type { NotaAgenda } from '../types'

/**
 * Bandeja de entrada -- copia el patrón de "Mi Agenda / Notepad" de Edgy
 * Trading Hub (texto + fotos + audio grabado desde el navegador), pero
 * multi-tenant: cada nota queda scopeada por cliente_id con RLS real (en
 * ETH, uso personal de un solo usuario, la RLS está desactivada).
 *
 * Fase 31: por ahora la usa solo el staff de Edgy logueado como admin
 * del cliente piloto -- es la bandeja que va a leer la futura skill de
 * clasificación automática (corre en Cowork, 2-3 veces al día), todavía
 * sin construir. Cada nota nace con procesado=false.
 */
export default function Notas() {
  const { notas, cargando, error, subiendo, crearNota, eliminarNota, moverATarea } = useNotas()

  const [texto, setTexto] = useState('')
  const [imagenes, setImagenes] = useState<File[]>([])
  const [grabando, setGrabando] = useState(false)
  const [audios, setAudios] = useState<Blob[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  async function iniciarGrabacion() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setAudios((prev) => [...prev, blob])
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setGrabando(true)
    } catch {
      alert('No pudimos acceder al micrófono. Revisá los permisos del navegador.')
    }
  }

  function detenerGrabacion() {
    mediaRecorderRef.current?.stop()
    setGrabando(false)
  }

  function quitarImagen(i: number) {
    setImagenes((prev) => prev.filter((_, idx) => idx !== i))
  }

  function quitarAudio(i: number) {
    setAudios((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function enviarNota() {
    const ok = await crearNota(texto, imagenes, audios)
    if (ok) {
      setTexto('')
      setImagenes([])
      setAudios([])
    }
  }

  const puedeEnviar = texto.trim().length > 0 || imagenes.length > 0 || audios.length > 0

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <textarea
            className="min-h-[90px] w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Escribí una nota rápida -- se clasifica sola más tarde."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />

          {imagenes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {imagenes.map((img, i) => (
                <div key={i} className="relative">
                  <img
                    src={URL.createObjectURL(img)}
                    alt={img.name}
                    className="h-16 w-16 rounded-md border object-cover"
                  />
                  <button
                    onClick={() => quitarImagen(i)}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-white shadow"
                  >
                    <X className="h-4 w-4 text-red-600" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {audios.length > 0 && (
            <div className="flex flex-col gap-2">
              {audios.map((blob, i) => (
                <div key={i} className="flex items-center gap-2">
                  <audio controls src={URL.createObjectURL(blob)} className="h-8" />
                  <button onClick={() => quitarAudio(i)} className="text-muted-foreground hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) setImagenes((prev) => [...prev, ...Array.from(e.target.files!)])
                    e.target.value = ''
                  }}
                />
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-gray-50">
                  <ImageIcon className="h-4 w-4" />
                </span>
              </label>

              <Button
                type="button"
                variant={grabando ? 'destructive' : 'outline'}
                size="icon"
                onClick={grabando ? detenerGrabacion : iniciarGrabacion}
                title={grabando ? 'Detener grabación' : 'Grabar audio'}
              >
                {grabando ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </div>

            <Button onClick={enviarNota} disabled={!puedeEnviar || subiendo}>
              {subiendo ? 'Guardando...' : 'Agregar nota'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="text-muted-foreground text-sm">Cargando notas...</p>
      ) : notas.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay notas en la bandeja.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {notas.map((nota) => (
            <FilaNota key={nota.id} nota={nota} onEliminar={eliminarNota} onMoverATarea={moverATarea} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilaNota({
  nota,
  onEliminar,
  onMoverATarea,
}: {
  nota: NotaAgenda
  onEliminar: (n: NotaAgenda) => void
  onMoverATarea: (n: NotaAgenda, fecha: string) => void
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">{formatFecha(nota.createdAt.slice(0, 10))}</span>
            <span
              className={
                nota.procesado
                  ? 'rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800'
                  : 'rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800'
              }
            >
              {nota.procesado ? 'Procesada' : 'Pendiente'}
            </span>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => onMoverATarea(nota, todayISO())}>
              <ArrowRightCircle className="mr-1 h-3.5 w-3.5" />
              Mover a Tarea
            </Button>
            <button onClick={() => onEliminar(nota)} className="text-muted-foreground hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {nota.texto && <p className="text-sm whitespace-pre-wrap">{nota.texto}</p>}

        {nota.imagenes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {nota.imagenes.map((path) => (
              <ImagenNota key={path} path={path} />
            ))}
          </div>
        )}

        {nota.audios.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {nota.audios.map((path) => (
              <AudioNota key={path} path={path} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ImagenNota({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    obtenerUrlMediaNota(path).then((u) => {
      if (activo) setUrl(u)
    })
    return () => {
      activo = false
    }
  }, [path])

  if (!url) return <div className="h-20 w-20 animate-pulse rounded-md bg-gray-100" />
  return <img src={url} alt="" className="h-20 w-20 rounded-md border object-cover" />
}

function AudioNota({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    obtenerUrlMediaNota(path).then((u) => {
      if (activo) setUrl(u)
    })
    return () => {
      activo = false
    }
  }, [path])

  if (!url) return <p className="text-muted-foreground text-xs">Cargando audio...</p>
  return <audio controls src={url} className="h-8 w-full max-w-xs" />
}
