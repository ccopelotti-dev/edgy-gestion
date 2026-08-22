// ============================================================
// 22/08 -- Estandarizar imágenes subidas por el cliente a PNG
// ============================================================
//
// Origen: un logo de Punto Tex subido desde una foto de WhatsApp
// (jpeg con espacio de color CMYK) hacía que el decoder de imágenes
// que trae jsPDF de fábrica -- que solo entiende JPEG baseline sRGB --
// dibujara píxeles basura (casi siempre negro sólido) al armar el PDF
// de la factura. Se parcheó el consumo (comprobantes-pdf/pdfHelpers.ts
// y generarComprobantePdfClasico.ts) para reencodear el logo antes de
// pasárselo a jsPDF, pero eso es un parche por cada lugar que consuma
// la imagen. Mejor sanear una sola vez, en el punto de entrada: todo
// lo que un cliente sube (logo de marca, isotipo, íconos de contacto)
// pasa por acá antes de subirse a Storage, así lo que vive en el
// bucket ya es siempre un PNG plano de 8 bits -- ningún consumidor
// futuro (PDF, miniatura, lo que sea) tiene que volver a lidiar con
// jpegs raros.
//
// Igual que en pdfHelpers.ts: se usa el decoder nativo del navegador
// (vía <img>), que sí entiende CMYK/progresivo/orientación EXIF, y se
// reexporta como PNG vía <canvas>.

/** Convierte cualquier imagen a PNG estándar. Si la conversión falla
 * (navegador sin soporte, archivo corrupto), devuelve el archivo
 * original tal cual -- mejor un logo potencialmente problemático que
 * bloquear el alta o la edición del cliente. */
export async function convertirImagenAPng(file: File): Promise<File> {
  let objectUrl: string | null = null
  try {
    objectUrl = URL.createObjectURL(file)
    const urlParaImg = objectUrl
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('No se pudo obtener contexto 2D para reencodear la imagen'))
            return
          }
          ctx.drawImage(img, 0, 0)
          resolve(canvas.toDataURL('image/png'))
        } catch (e) {
          reject(e instanceof Error ? e : new Error('No se pudo redibujar la imagen'))
        }
      }
      img.onerror = () => reject(new Error('No se pudo decodificar la imagen'))
      img.src = urlParaImg
    })
    const blob = await (await fetch(dataUrl)).blob()
    const nombrePng = file.name.replace(/\.[^.]+$/, '') + '.png'
    return new File([blob], nombrePng, { type: 'image/png' })
  } catch {
    return file
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}
