import { useState } from 'react'
import { Loader2, MapPin, Plus, Star, StarOff, Trash2 } from 'lucide-react'
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

export default function PuntosVenta() {
  const { clienteId, cargando: cargandoCliente } = useClienteId()
  const { puntosVenta, cargando, error, crear, marcarPorDefecto, darDeBaja } =
    usePuntosVenta(clienteId)

  const [abierto, setAbierto] = useState(false)
  const [alias, setAlias] = useState('')
  const [numero, setNumero] = useState('')
  const [direccion, setDireccion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  function limpiarFormulario() {
    setAlias('')
    setNumero('')
    setDireccion('')
    setErrorForm(null)
  }

  async function handleAgregar() {
    if (!alias.trim()) {
      setErrorForm('El alias es obligatorio.')
      return
    }
    setGuardando(true)
    setErrorForm(null)
    const ok = await crear({
      alias: alias.trim(),
      numero: numero.trim() || null,
      direccion: direccion.trim() || null,
      paraIntegraciones: false,
    })
    setGuardando(false)
    if (ok) {
      limpiarFormulario()
      setAbierto(false)
    } else {
      setErrorForm('No pudimos crear el punto de venta. Revisá que el número no esté repetido.')
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
                    onChange={(e) => setAlias(e.target.value)}
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
                  <Label htmlFor="direccion-pv">Dirección (opcional)</Label>
                  <Input
                    id="direccion-pv"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                  />
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
                  <TableHead>Dirección</TableHead>
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
                      {pv.activo && !pv.porDefecto && (
                        <Button variant="ghost" size="sm" onClick={() => darDeBaja(pv.id)}>
                          <Trash2 className="text-muted-foreground h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
