// Tipos del módulo Fichas de medida.
//
// Origen: Punto Tex (Marina) toma medidas a domicilio para armar un
// presupuesto de productos hechos a medida -- hoy cortinas, mañana
// puede sumarse tapicería, fundas, etc. sin romper este modelo (ver
// comentario de la migración 0082_fichas_medida.sql). Dos tipos de
// ficha conviven en la misma tabla de ítems (columnas nullable según
// cuál no aplique), en vez de una tabla por rubro.

export type TipoFicha = 'generica' | 'cortinas'
export type EstadoFicha = 'borrador' | 'lista' | 'convertida'

export const TIPO_FICHA_LABEL: Record<TipoFicha, string> = {
  generica: 'Genérica',
  cortinas: 'Cortinas',
}

export const ESTADO_FICHA_LABEL: Record<EstadoFicha, string> = {
  borrador: 'Borrador',
  lista: 'Lista',
  convertida: 'Convertida a presupuesto',
}

// Retiro en local: el cliente se lleva el producto e instala por su cuenta.
// Obra con instalación: el comercio instala en el domicilio de trabajo --
// hoy agrega una línea de instalación en $0 (editable) al generar el
// presupuesto; a futuro se va a vincular a un Servicio real del catálogo
// (Fase 40, todavía no construida).
export type ModalidadEntrega = 'retiro_local' | 'obra_instalacion'

export const MODALIDAD_ENTREGA_LABEL: Record<ModalidadEntrega, string> = {
  retiro_local: 'Retiro en local',
  obra_instalacion: 'Obra con instalación',
}

// Opciones fijas de Tipo de barral / Tipo de cortina -- tomadas tal
// cual del papel de Punto Tex. Texto libre en la base de datos (no
// ameritan catálogo aparte), pero se centralizan acá para no repetir
// la lista en el dialog.
export const TIPOS_BARRAL = ['Fleje', 'Riel', 'Barral de madera o hierro'] as const
export const TIPOS_CORTINA = [
  'Presilla oculta',
  'Presilla alta',
  'Pasa barral',
  'Plizada',
  'Tabla escondida',
  'Pellizco doble',
  'Pellizco triple',
  'Tablón',
] as const

export interface PanoMedida {
  id: string
  ancho: number | null
  alto: number | null
}

export interface ItemFichaMedida {
  id: string
  producto: string
  /** Fase 41 (Producción a medida): vínculo opcional a un Producto real del
   * catálogo (con Fórmula propia) -- si está cargado, Producción puede
   * ejecutar esa fórmula para este ítem calculando las cantidades desde
   * los paños (m2/ml/unidad) en vez de tipearlas a mano. Si no está
   * cargado, el ítem sigue siendo solo texto libre, como hasta ahora. */
  productoId?: string
  tela?: string
  /** Fase 41.6: color de la tela, separado de `tela` (que hoy es
   * material/tipo de tela, ej. "Lanilla") -- a pedido de Carlos, para
   * que ambos datos queden distinguibles en el detalle relevado. */
  color?: string
  cantidad: number
  // Genérica
  medida?: string
  peso?: string
  // Cortinas
  incluyeBarral?: boolean
  tipoBarral?: string
  tipoCortina?: string
  /** Fase 43h (20/08, a pedido de Carlos): medida TOTAL del hueco/
   * ventana -- dato de referencia que da el cliente de entrada ("quiero
   * cubrir una ventana de 1.30 x 1.42"), distinto de las medidas de
   * corte por paño de `panos` (que pueden diferir por fruncido/
   * superposición de la tela). Solo aplica a fichas tipo 'cortinas'. */
  medidaTotalAncho?: number
  medidaTotalAlto?: number
  notas?: string
  /** Solo se usa si la ficha es tipo 'cortinas' -- varias ventanas/paños
   * con Ancho/Alto propios por ítem. */
  panos: PanoMedida[]
}

export interface FichaMedida {
  id: string
  /** Fase 43 (20/08, "Toma de Pedidos"): correlativo propio de esta
   * sección, asignado al crear (nunca se reasigna) -- junto con
   * `puntoVentaNumero` arma el "0005-00000001" que se imprime en el
   * nuevo encabezado del PDF. */
  numero: number
  /** El "0005" congelado en el momento de creación -- ver
   * resolverNumeroPuntoVenta() en src/lib/puntoVenta.ts. */
  puntoVentaNumero: string
  clienteVentaId: string
  /** Denormalizado en el join de lectura -- no se persiste acá, viene
   * siempre de clientes_venta (fuente de verdad real). */
  clienteNombre: string
  clienteTelefono?: string
  clienteEmail?: string
  clienteDireccion?: string
  tipo: TipoFicha
  estado: EstadoFicha
  fechaPedido: string
  /** Segunda visita a domicilio para confirmar medidas exactas antes de
   * fabricar -- genera automáticamente una tarea en Agenda (Fase 0083). */
  fechaReplanteo?: string
  /** Horario acordado de la visita -- a diferencia de Entrega (compromiso
   * de día), el Replanteo es una cita puntual (Fase 0085). Formato HH:MM. */
  horaReplanteo?: string
  fechaEntrega?: string
  /** Domicilio donde se hace el Replanteo y, si modalidadEntrega es
   * 'obra_instalacion', también donde se instala -- si no se carga, la UI
   * usa clienteDireccion como default (Fase 0084). */
  domicilioTrabajo?: string
  modalidadEntrega: ModalidadEntrega
  sena: number
  total: number
  notas?: string
  presupuestoId?: string
  items: ItemFichaMedida[]
  createdAt: string
  updatedAt: string
}
