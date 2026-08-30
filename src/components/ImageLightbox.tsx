// Fase 57b -- visor simple para ampliar una imagen (ej. la foto de
// WhatsApp de la que salió un comprobante cargado por el agente).
// Sin dependencias nuevas: overlay + <img>, cierra con click afuera,
// la X, o Escape.

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ImageLightboxProps {
  /** URL (ya firmada, si hace falta) de la imagen a mostrar. null/undefined = cerrado. */
  src: string | null | undefined;
  onClose: () => void;
  alt?: string;
}

export default function ImageLightbox({ src, onClose, alt }: ImageLightboxProps) {
  useEffect(() => {
    if (!src) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        title="Cerrar"
        className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt ?? 'Comprobante'}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
      />
    </div>
  );
}
