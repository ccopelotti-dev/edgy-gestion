import { useState } from 'react'
import { Plus, UserX, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useEmpleados, type NuevoEmpleado } from '../../data/useEmpleados'
import { formatARS, formatFecha } from '../../lib/format'
import type { Empleado } from '../../types'

const FORM_VACIO: NuevoEmpleado = { nombre: '', cuil: '', fechaIngreso: '', categoria: '', sueldoBasico: 0 }

export default function Empleados() {
  const { empleados, cargando, error, crear, actualizar, darDeBaja } = useEmpleados()
  const [dialogAbierto, setDialogAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<NuevoEmpleado>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  function abrirNuevo() {
    setEditandoId(null)
    setForm(FORM_VACIO)
    setDialogAbierto(true)
  }

  function abrirEdicion(e: Empleado) {
    setEditandoId(e.id)
    setForm({
      nombre: e.nombre,
      cuil: e.cuil ?? '',
      fechaIngreso: e.fechaIngreso,
      categoria: e.categoria ?? '',
      sueldoBasico: e.sueldoBasico,
    })
    setDialogAbierto(true)
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.fechaIngreso) return
    setGuardando(true)
    const ok = editandoId ? await actualizar(editandoId, form) : await crear(form)
    setGuardando(false)
    if (ok) setDialogAbierto(false)
  }

  async function baja(e: Empleado) {
    if (!confirm(`¿Dar de baja a ${e.nombre}? Deja de aparecer para generar nuevos recibos, pero sus recibos existentes no se tocan.`)) return
    await darDeBaja(e.id)
  }

  if (cargando) return <p className="text-muted-foreground text-sm">Cargando empleados...</p>

  const activos = empleados.filter((e) => e.activo)
  const inactivos = empleados.filter((e) => !e.activo)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Empleados</h3>
        <Button size="sm" onClick={abrirNuevo}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Nuevo empleado
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {activos.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay empleados cargados todavía.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {activos.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{e.nombre}</p>
                  <p className="text-muted-foreground text-xs">
                    {e.cuil ?? 'Sin CUIL cargado'} {e.categoria ? `· ${e.categoria}` : ''}
                  </p>
                  <p className="text-muted-foreground text-xs">Ingreso: {formatFecha(e.fechaIngreso)}</p>
                  <p className="mt-1 text-sm font-semibold">{formatARS(e.sueldoBasico)}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => abrirEdicion(e)} className="text-muted-foreground hover:text-foreground" title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => baja(e)} className="text-muted-foreground hover:text-red-600" title="Dar de baja">
                    <UserX className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {inactivos.length > 0 && (
        <details className="text-muted-foreground text-xs">
          <summary className="cursor-pointer">Empleados dados de baja ({inactivos.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {inactivos.map((e) => (
              <li key={e.id}>{e.nombre}</li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={dialogAbierto} onOpenChange={setDialogAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editandoId ? 'Editar empleado' : 'Nuevo empleado'}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="emp-nombre">Nombre completo</Label>
              <Input id="emp-nombre" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="emp-cuil">CUIL</Label>
                <Input id="emp-cuil" value={form.cuil} onChange={(e) => setForm((f) => ({ ...f, cuil: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="emp-categoria">Categoría</Label>
                <Input
                  id="emp-categoria"
                  placeholder="Ej. Vendedor A"
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="emp-ingreso">Fecha de ingreso</Label>
                <Input
                  id="emp-ingreso"
                  type="date"
                  value={form.fechaIngreso}
                  onChange={(e) => setForm((f) => ({ ...f, fechaIngreso: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="emp-basico">Sueldo básico</Label>
                <Input
                  id="emp-basico"
                  type="number"
                  min={0}
                  value={form.sueldoBasico || ''}
                  onChange={(e) => setForm((f) => ({ ...f, sueldoBasico: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={guardar} disabled={!form.nombre.trim() || !form.fechaIngreso || guardando}>
              {editandoId ? 'Guardar cambios' : 'Crear empleado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
