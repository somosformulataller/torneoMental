// Utilidades para adjuntar archivos en el chat. El archivo se sube directo
// desde el navegador al bucket privado 'chat-attachments'. Convención de ruta:
// <id_del_jugador>/<archivo>, para que las políticas RLS dejen ver el adjunto
// al jugador de esa conversación y a los admins (ver migración 023).

export const CHAT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Adjuntos del selector de archivos: imágenes o PDF (documentos/comprobantes).
export function validateChatFile(file) {
  if (!file) return 'Archivo inválido.';
  if (file.size > CHAT_MAX_BYTES) return 'El archivo supera los 5 MB.';
  const ok = (file.type || '').startsWith('image/') || file.type === 'application/pdf';
  if (!ok) return 'Solo se permiten imágenes o PDF.';
  return null;
}

// Notas de voz (grabadas en el navegador). Mismo límite de tamaño; ~2 min de
// audio opus pesan bastante menos que 5 MB.
export function validateChatAudio(file) {
  if (!file) return 'Audio inválido.';
  if (file.size > CHAT_MAX_BYTES) return 'La nota de voz es demasiado larga.';
  if (!(file.type || '').startsWith('audio/')) return 'Formato de audio no válido.';
  return null;
}

// Sube el archivo a la carpeta del jugador y devuelve los datos para el mensaje.
export async function uploadChatAttachment(supabase, folderUserId, file) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const path = `${folderUserId}/${Date.now()}_${safe}`;
  const { error } = await supabase.storage
    .from('chat-attachments')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return { path, name: file.name.slice(0, 200), type: file.type };
}

// URL firmada temporal para ver/descargar un adjunto (bucket privado).
export async function signedChatUrl(supabase, path) {
  const { data } = await supabase.storage
    .from('chat-attachments')
    .createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}
