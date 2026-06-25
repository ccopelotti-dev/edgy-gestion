import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Modulo, NivelPermiso, TipoNegocio } from '@/types'
import { ROLES_SUGERIDOS } from '@/types'

const NIVELES: { value: NivelPermiso; label: string }[] = [
  { value: 'lectura', label: 'Solo ver' },
  { value: 'escritura', label: 'Editar' },
  { value: 'admin', label: 'Administrar' },
]

export interface RolDraft {
  nombre: string
  esAdmin: boolean
  permisos: Record<string, NivelPermiso> // moduloId -> nivel
}

export interface PersonaDraft {
  nombre: string
  cuil: string
  rolNombre: string
}

export interface ResultadoEquipo {
  roles: RolDraft[]
  personas: PersonaDraft[]
}

interface Paso4Props {
  tipoNegocio: TipoNegocio
  modulosActivos: Modulo[]
  onFinalizar: (resultado: ResultadoEquipo) => void
}

function rolesInicialesPara(tipoNegocio: TipoNegocio, modulosActivos: Modulo[]): RolDraft[] {
  const permisosLecturaDefault: Record<string, NivelPermiso> = {}
  modulosActivos.forEach((m) => {
    permisosLecturaDefault[m.id] = 'lectura'
  })

  return (ROLES_SUGERIDOS[tipoNegocio] ?? []).map((nombre) => ({
    nombre,
    esAdmin: false,
    permisos: { ...permisosLecturaDefault },
  }))
}

export function Paso4Permisos({ tipoNegocio, modulosActivos, onFinalizar }: Paso4Props) {
  const [roles, setRoles] = useState<RolDraft[]>(() => rolesInicialesPara(tipoNegocio, modulosActivos))
  const [nombreRolNuevo, setNombreRolNuevo] = useState('')
  const [personas, setPersonas] = useState<PersonaDraft[]>([])
  const [nombrePersona, setNombrePersona] = useState('')
  const [cuilPersona, setCuilPersona] = useState('')
  const [rolPersona, setRolPersona] = useState(roles[0]?.nombre ?? '')

  function cambiarNivel(nombreRol: string, moduloId: string, nivel: NivelPermiso) {
    setRoles((prev) =>
      prev.map((r) =>
        r.nombre === nombreRol ? { ...r, permisos: { ...r.permisos, [moduloId]: nivel } } : r,
      ),
    )
  }

  function agregarRol() {
    if (!nombreRolNuevo.trim()) return
    const permisosLecturaDefault: Record<string, NivelPermiso> = {}
    modulosActivos.forEach((m) => {
      permisosLecturaDefault[m.id] = 'lectura'
    })
    setRoles((prev) => [
      ...prev,
      { nombre: nombreRolNuevo.trim(), esAdmin: false, permisos: permisosLecturaDefault },
    ])
    setNombreRolNuevo('')
  }

  function agregarPersona() {
    if (!nombrePersona.trim() || cuilPersona.length !== 11 || !rolPersona) return
    setPersonas((prev) => [
      ...prev,
      { nombre: nombrePersona.trim(), cuil: cuilPersona, rolNombre: rolPersona },
    ])
    setNombrePersona('')
    setCuilPersona('')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h2 className="text-base font-medium text-gray-900">Roles y permisos</h2>
        <p className="mt-1 text-sm text-gray-500">
          El Dueño ya tiene acceso total — definido en el paso anterior. Estos son los roles
          operativos: ya te tildamos los sugeridos para este tipo de negocio. Ajustá el nivel de
          acceso de cada uno por módulo, o agregá los que falten.
        </p>
      </div>

      <div className="space-y-4">
        {roles.map((rol) => (
          <Card key={rol.nombre} className="space-y-3 p-4">
            <p className="text-sm font-medium text-gray-900">{rol.nombre}</p>
            <div className="space-y-2">
              {modulosActivos.map((modulo) => (
                <div key={modulo.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{modulo.nombre}</span>
                  <select
                    className="rounded-md border border-gray-200 px-2 py-1 text-sm"
                    value={rol.permisos[modulo.id] ?? 'lectura'}
                    onChange={(e) =>
                      cambiarNivel(rol.nombre, modulo.id, e.target.value as NivelPermiso)
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

        <div className="flex gap-3">
          <Input
            placeholder="Nombre de un rol nuevo (ej: Repositor)"
            value={nombreRolNuevo}
            onChange={(e) => setNombreRolNuevo(e.target.value)}
          />
          <Button variant="secondary" onClick={agregarRol}>
            Agregar rol
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-base font-medium text-gray-900">Equipo (opcional)</h2>
        <p className="mt-1 text-sm text-gray-500">
          Sumá a quienes ya sabés que van a operar el sistema. El resto lo puede cargar el Admin
          del cliente después, desde su propio panel.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Nombre y apellido"
          value={nombrePersona}
          onChange={(e) => setNombrePersona(e.target.value)}
          className="flex-1"
        />
        <Input
          placeholder="CUIL (11 dígitos)"
          value={cuilPersona}
          onChange={(e) => setCuilPersona(e.target.value.replace(/\D/g, ''))}
          maxLength={11}
          className="w-40"
        />
        <select
          className="rounded-lg border border-gray-200 px-3 text-sm"
          value={rolPersona}
          onChange={(e) => setRolPersona(e.target.value)}
        >
          {roles.map((r) => (
            <option key={r.nombre} value={r.nombre}>
              {r.nombre}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={agregarPersona}>
          Agregar
        </Button>
      </div>

      <div className="space-y-2">
        {personas.map((p) => (
          <Card key={p.cuil} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-gray-900">{p.nombre}</p>
              <p className="text-sm text-gray-500">CUIL {p.cuil}</p>
            </div>
            <span className="text-sm text-gray-500">{p.rolNombre}</span>
          </Card>
        ))}
      </div>

      <Button className="w-full" onClick={() => onFinalizar({ roles, personas })}>
        Empezar a operar el sistema
      </Button>
    </div>
  )
}
