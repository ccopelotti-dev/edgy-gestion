import {
  Home,
  Wallet,
  Package,
  ShoppingCart,
  ShoppingBag,
  Armchair,
  ChefHat,
  QrCode,
  Truck,
  Banknote,
  Soup,
  CircleDashed,
  Settings,
  BarChart3,
  Wrench,
  Briefcase,
  Calculator,
  type LucideIcon,
} from 'lucide-react'

/** Uno por cada slug del catálogo (ver migración 0001_init.sql). Si
 * agregan un módulo nuevo al catálogo y no está acá, cae en
 * CircleDashed en vez de romper. */
const ICONOS_POR_SLUG: Record<string, LucideIcon> = {
  tesoreria: Wallet,
  'productos-stock': Package,
  ventas: ShoppingCart,
  compras: ShoppingBag,
  'mesas-salon': Armchair,
  'comandas-cocina': ChefHat,
  'menu-qr': QrCode,
  'delivery-whatsapp': Truck,
  'caja-turno': Banknote,
  viandas: Soup,
  configuracion: Settings,
  reportes: BarChart3,
  utilidades: Wrench,
  servicios: Briefcase,
  contable: Calculator,
}

export function iconoDeModulo(slug: string): LucideIcon {
  return ICONOS_POR_SLUG[slug] ?? CircleDashed
}

export { Home as IconoInicio }
