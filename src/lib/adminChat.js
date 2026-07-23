import { adminStartConversationAction, adminReplyChatAction } from '@/actions/chat';
import { uploadChatAttachment } from '@/lib/chatUpload';

// Le envía al chat de un jugador (desde el panel admin) una combinación opcional
// de: nota escrita, nota de voz y/o foto/documento. Cada parte es un mensaje.
// Reutiliza el chat existente (crea la conversación si no había una, lo que a su
// vez le enciende la campana al jugador). Lanza si algo falla.
export async function sendComposeToPlayer(supabase, playerId, { text, audio, doc } = {}) {
  const { conversationId, error } = await adminStartConversationAction(playerId);
  if (error || !conversationId) throw new Error(error || 'No se pudo abrir el chat');

  const t = (text || '').trim();
  if (t) {
    const r = await adminReplyChatAction(conversationId, t);
    if (r?.error) throw new Error(r.error);
  }
  if (audio) {
    const att = await uploadChatAttachment(supabase, playerId, audio);
    const r = await adminReplyChatAction(conversationId, '', att);
    if (r?.error) throw new Error(r.error);
  }
  if (doc) {
    const att = await uploadChatAttachment(supabase, playerId, doc);
    const r = await adminReplyChatAction(conversationId, '', att);
    if (r?.error) throw new Error(r.error);
  }
  return conversationId;
}

// ¿Hay algo que enviar?
export function composeHasContent({ text, audio, doc } = {}) {
  return Boolean((text || '').trim() || audio || doc);
}
