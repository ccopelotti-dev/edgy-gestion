// Fichas de medida — Listado
//
// Búsqueda por cliente + filtro por estado, tarjetas (no tabla ancha
// de escritorio) porque esto se usa parado en la casa del cliente
// desde el celular -- mismo criterio mobile-first que Modo Mostrador.

import { useMemo, useState } from 'react';
import { Search, Plus, Ruler, Calendar, FileCheck2, Trash2, Download, Mail, MessageCircle, Loader2 } from 'lucide-react';
import { useFichasMedida } from '../data/useFichasMedida';
import { FichaDialog } from '../components/FichaDialog';
import { generarPresupuestoDesdeFicha } from '../lib/generarPresupuesto';
import { generarFichaMedidaPdf } from '../lib/generarFichaMedidaPdf';
import { ESTADO_FICHA_LABEL, MODALIDAD_ENTREGA_LABEL, TIPO_FICHA_LABEL, type EstadoFicha, type FichaMedida } from '../types';
import { formatARS } from '@/modules/ventas/lib/format';
import { useClienteActual } from '@/hooks/useClienteActual';
import { armarLinkWhatsapp } from '@/lib/whatsapp';
import type { EmpresaParaPdf } from '@/lib/comprobantes-pdf/pdfHelpers';

const ESTADO_BADGE: Record<EstadoFicha, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  lista: 'bg-amber-50 text-amber-700',
  convertida: 'bg-emerald-50 text-emerald-700',
};

export default function Listado() {
  const { clienteId, fichas, cargando, error, crear, actualizar, marcarConvertida, eliminar } = useFichasMedida();
  const { cliente: empresaActual } = useClienteActual();
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoFicha | ''>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fichaEditando, setFichaEditando] = useState<FichaMedida | undefined>(undefined);
  const [generandoId, setGenerandoId] = useState<string | null>(null);
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const fichasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return fichas.filter((f) => {
      if (filtroEstado && f.estado !== filtroEstado) return false;
      if (q && !f.clienteNombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [fichas, busqueda, filtroEstado]);

  function contarFichasDeCliente(clienteVentaId: string): number {
    return fichas.filter((f) => f.clienteVentaId === clienteVentaId).length;
  }

  function abrirNueva() {
    setFichaEditando(undefined);
    setDialogOpen(true);
  }

  function abrirEditar(f: FichaMedida) {
    setFichaEditando(f);
    setDialogOpen(true);
  }

  async function handleSave(data: Parameters<typeof crear>[0]) {
    if (fichaEditando) {
      const ok = await actualizar(fichaEditando.id, data);
      return ok ? true : null;
    }
    return crear(data);
  }

  async function handleEliminar(f: FichaMedida) {
    if (!window.confirm(`¿Eliminar la ficha de ${f.clienteNombre}?`)) return;
    await eliminar(f.id);
  }

  async function handleGenerarPresupuesto(f: FichaMedida) {
    if (!clienteId) return;
    setGenerandoId(f.id);
    setMensaje(null);
    const resultado = await generarPresupuestoDesdeFicha(clienteId, f);
    setGenerandoId(null);
    if (resultado.ok) {
      await marcarConvertida(f.id, resultado.presupuestoId);
      setMensaje({ tipo: 'ok', texto: 'Presupuesto generado en Ventas > Presupuestos.' });
    } else {
      setMensaje({ tipo: 'error', texto: resultado.error });
    }
  }

  // Envío por email / WhatsApp al cliente -- mismo criterio que
  // Cotizaciones (Compras): todavía no hay un motor de envío real, así
  // que se arma un link mailto:/wa.me con el texto ya redactado y se
  // abre el cliente de correo o WhatsApp del propio usuario. El PDF no
  // se puede adjuntar automáticamente (limitación de mailto:/wa.me) --
  // hay que descargarlo aparte y adjuntarlo a mano si hace falta.
  function armarTextoFicha(f: FichaMedida) {
    const numero = f.id.slice(0, 8).toUpperCase();
    return {
      asunto: `Ficha de medida · ${f.clienteNombre}`,
      cuerpo:
        `Hola${f.clienteNombre ? ` ${f.clienteNombre}` : ''},\n\n` +
        `Te enviamos el comprobante con el detalle de la medición (Ficha ${numero}).\n\n` +
        `Cualquier consulta quedamos a disposición.\nSaludos.`,
    };
  }

  async function handleDescargarPdf(f: FichaMedida) {
    if (!empresaActual) return;
    setGenerandoPdfId(f.id);
    try {
      const empresa: EmpresaParaPdf = {
        nombre: empresaActual.nombre,
        cuit: empresaActual.cuit,
        direccion: empresaActual.direccion,
        telefono: empresaActual.telefono,
        logoUrl: empresaActual.logo_url,
        colorMarca: empresaActual.color_marca,
      };
      await generarFichaMedidaPdf(empresa, f, `Ficha de medida - ${f.clienteNombre}`);
    } finally {
      setGenerandoPdfId(null);
    }
  }

  function handleEnviarEmail(f: FichaMedida) {
    if (!f.clienteEmail) return;
    const { asunto, cuerpo } = armarTextoFicha(f);
    const url = `mailto:${f.clienteEmail}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    window.open(url, '_blank');
  }

  function handleEnviarWhatsapp(f: FichaMedida) {
    if (!f.clienteTelefono) return;
    const { cuerpo } = armarTextoFicha(f);
    window.open(armarLinkWhatsapp(f.clienteTelefono, cuerpo), '_blank');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-gray-900">Fichas de medida</h1>
          <p className="text-sm text-gray-500">Toma de medidas a domicilio para presupuestar productos a medida.</p>
        </div>
        <button
          onClick={abrirNueva}
          className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" /> Nueva ficha
        </button>
      </div>

      {mensaje && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            mensaje.tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900"
          />
        </div>
        <div className="flex gap-1.5">
          {(['', 'borrador', 'lista', 'convertida'] as const).map((e) => (
            <button
              key={e || 'todas'}
              onClick={() => setFiltroEstado(e)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                filtroEstado === e ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {e === '' ? 'Todas' : ESTADO_FICHA_LABEL[e]}
            </button>
          ))}
        </div>
      </div>

      {cargando && <p className="py-8 text-center text-sm text-gray-400">Cargando fichas...</p>}
      {error && <p className="py-8 text-center text-sm text-red-500">{error}</p>}

      {!cargando && !error && fichasFiltradas.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 py-12 text-center">
          <Ruler className="h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-400">
            {fichas.length === 0 ? 'Todavía no cargaste ninguna ficha.' : 'Sin resultados para ese filtro.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {fichasFiltradas.map((f) => (
          <div key={f.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => abrirEditar(f)} className="flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{f.clienteNombre}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                    {TIPO_FICHA_LABEL[f.tipo]}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ESTADO_BADGE[f.estado]}`}>
                    {ESTADO_FICHA_LABEL[f.estado]}
                  </span>
                  {f.modalidadEntrega === 'obra_instalacion' && (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">
                      {MODALIDAD_ENTREGA_LABEL.obra_instalacion}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Pedido {f.fechaPedido}
                    {f.fechaReplanteo ? ` · Replanteo ${f.fechaReplanteo}${f.horaReplanteo ? ` ${f.horaReplanteo}` : ''}` : ''}
                    {f.fechaEntrega ? ` · Entrega ${f.fechaEntrega}` : ''}
                  </span>
                  <span>{f.items.length} ítem{f.items.length !== 1 ? 's' : ''}</span>
                  {f.total > 0 && <span>{formatARS(f.total)}</span>}
                </div>
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDescargarPdf(f)}
                  disabled={generandoPdfId === f.id}
                  title="Descargar PDF"
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                >
                  {generandoPdfId === f.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => handleEnviarEmail(f)}
                  disabled={!f.clienteEmail}
                  title={f.clienteEmail ? `Enviar por email a ${f.clienteEmail}` : 'El cliente no tiene email cargado'}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
                >
                  <Mail className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleEnviarWhatsapp(f)}
                  disabled={!f.clienteTelefono}
                  title={f.clienteTelefono ? `Enviar por WhatsApp a ${f.clienteTelefono}` : 'El cliente no tiene teléfono cargado'}
                  className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </button>
                {f.estado === 'lista' && (
                  <button
                    onClick={() => handleGenerarPresupuesto(f)}
                    disabled={generandoId === f.id}
                    title="Generar presupuesto en Ventas"
                    className="flex items-center gap-1 rounded-lg border border-teal-200 px-2 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60"
                  >
                    <FileCheck2 className="h-3.5 w-3.5" />
                    {generandoId === f.id ? 'Generando...' : 'Presupuesto'}
                  </button>
                )}
                <button onClick={() => handleEliminar(f)} className="p-1.5 text-gray-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <FichaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clienteTenantId={clienteId}
        ficha={fichaEditando}
        contarFichasDeCliente={contarFichasDeCliente}
        onSave={handleSave}
      />
    </div>
  );
}
