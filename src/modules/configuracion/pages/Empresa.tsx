import { useEffect, useState } from 'react'
import { Loader2, Save, ShieldCheck } from 'lucide-react'
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
  CATEGORIAS_IMPOSITIVAS,
  PERSONERIAS,
  TIPOS_NEGOCIO_LABEL,
  type CategoriaImpositiva,
  type Personeria,
} from '../types'

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
}

export default function Empresa() {
  const { empresa, cargando, guardando, error, guardar } = useEmpresa()
  const [form, setForm] = useState<FormEmpresa>(FORM_VACIO)
  const [mensaje, setMensaje] = useState<string | null>(null)

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
    })
  }, [empresa])

  if (cargando) {
    return <p className="text-muted-foreground text-sm">Cargando datos de la empresa...</p>
  }

  if (!empresa) {
    return <p className="text-sm text-red-500">{error ?? 'No pudimos cargar la empresa.'}</p>
  }

  async function handleGuardar() {
    setMensaje(null)
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
    })
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

      <div className="flex items-center gap-3">
        <Button onClick={handleGuardar} disabled={guardando}>
          {guardando ? (
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
