'use client';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.75;

// Reescala (si hace falta) y reencoda una imagen como JPEG en el navegador
// usando <canvas>, sin depender de ninguna librería — los comprobantes de
// pago son capturas de pantalla/fotos que llegan a pesar varios MB, y no
// hace falta conservar esa resolución para que se lean los datos del pago.
// Si algo falla (formato raro, canvas no soportado), devuelve el archivo
// original en vez de bloquear la compra por un problema de optimización.
export async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob) return file;

    const compressedName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    const compressed = new File([blob], compressedName, { type: 'image/jpeg' });

    // Si por alguna razón la "compresión" quedó más pesada que el original
    // (imágenes ya muy chicas/comprimidas), nos quedamos con el original.
    return compressed.size < file.size ? compressed : file;
  } catch {
    return file;
  }
}
