import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Modulo, NivelPermiso, RolUsuario } from '@/types'

const ROLES: { value: RolUsuario; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'encargado', label: 'Encargado' },
  { value: 'mozo', label: 'Mozo' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'cajero', label: 'Cajero' },
]

const NIVELES: { value: NivelPermiso; label: string }[] = [
  { value: 'ver', label: 'Solo ver' },
  { value: 'editar', label: 'Editar' },
  { value: 'admin', label: 'Administrar' },
]

export interface UsuarioNuevo {
  email: string
  rol: RolUsuario
  permisos: Record<string, NivelPermiso>
}

interface Paso4Props {
  modulosActivos: Modulo[]
  onFinalizar: (usuarios: UsuarioNuevo[]) => void
}

export function Paso4Permisos({ modulosActivos, onFinalizar }: Paso4Props) {
  const [usuarios, setUsuarios] = useState<UsuarioNuevo[]>([])
  const [emailNuevo, setEmailNuevo] = useState('')
  const [rolNuevo, setRolNuevo] = useState<RolUsuario>('mozo')

  function agregarUsuario() {
    if (!emailNuevo.trim()) return
    const permisosDefault: Record<string, NivelPermiso> = {}
    modulosActivos.forEach((m) => {
      permisosDefault[m.id] = rolNuevo === 'admin' ? 'admin' : 'editar'
    })
    setUsuarios((prev) => [...prev, { email: emailNuevo, rol: rolNuevo, permisos: permisosDefault }])
    setEmailNuevo('')
  }

  function cambiarPermiso(emailUsuario: string, moduloId: string, nivel: NivelPermiso) {
    setUsuarios((prev) =>
      prev.map((u) =>
        u.email === emailUsuario ? { ...u, permisos: { ...u.permisos, [moduloId]: nivel } } : u,
      ),
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-medium text-gray-900">Sumá al equipo (opcional)</h2>
        <p className="mt-1 text-sm text-gray-500">
          Definí quién entra y a qué módulos llega. Lo podés ajustar después.
        </p>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="correo@empleado.com"
          value={emailNuevo}
          onChange={(e) => setEmailNuevo(e.target.value)}
        />
        <select
          className="rounded-lg border border-gray-200 px-3 text-sm"
          value={rolNuevo}
          onChange={(e) => setRolNuevo(e.target.value as RolUsuario)}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={agregarUsuario}>
          Agregar
        </Button>
      </div>

      <div className="space-y-3">
        {usuarios.map((usuario) => (
          <Card key={usuario.email} className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">{usuario.email}</p>
              <span className="text-sm text-gray-500">
                {ROLES.find((r) => r.value === usuario.rol)?.label}
              </span>
            </div>
            <div className="space-y-2">
              {modulosActivos.map((modulo) => (
                <div key={modulo.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{modulo.nombre}</span>
                  <select
                    className="rounded-md border border-gray-200 px-2 py-1 text-sm"
                    value={usuario.permisos[modulo.id] ?? 'ver'}
                    onChange={(e) =>
                      cambiarPermiso(usuario.email, modulo.id, e.target.value as NivelPermiso)
                    }
                  >
                    {NIVELES.map((n) => (
                      <option key={n.value} value={n.value}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Button className="w-full" onClick={() => onFinalizar(usuarios)}>
        Empezar a operar mi negocio
      </Button>
    </div>
  )
}
