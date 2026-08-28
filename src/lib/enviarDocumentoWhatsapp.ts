import { supabase } from './supabase';

// Fase 50d (28/08) -- helper compartido para mandar un PDF ya armado
// como documento adjunto real por WhatsApp (agente como canal de
// salida), en vez del patrón viejo de `armarLinkWhatsapp` (wa.me +
// adjuntar a mano). Pensado para reusarse desde cualquier listado de
// Ventas (Presupuestos, Órdenes de venta, Comprobantes, Cobranzas) y
// Fichas de medida -- todos arman el PDF en base64 con su propio motor
// y le pasan acá el resultado.

export interface EnviarDocumentoWhatsappInput {
  clienteId: string;
  telefono: string;
  pdfBase64: string;
  nombreArchivo: string;
  caption?: string;
}

export async function enviarDocumentoWhatsapp(input: EnviarDocumentoWhatsappInput): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('No hay sesión activa');

  const res = await fetch('/.netlify/functions/enviar-documento-whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  const resultado = await res.json();
  if (!res.ok || !resultado.ok) {
    throw new Error(resultado.error || 'No se pudo enviar el documento por WhatsApp');
  }
}
