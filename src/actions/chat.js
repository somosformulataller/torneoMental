'use server';

import { createClient } from '@/lib/supabase/server';

// Escrituras del chat. Todas pasan por funciones SECURITY DEFINER en la base
// de datos (migración 022) que revalidan quién puede hacer qué y evitan que se
// falsee el remitente. Las lecturas (mensajes, no leídos, lista de
// conversaciones) las hace el cliente directo con RLS/RPC.

// Jugador envía un mensaje (crea su conversación la primera vez).
export async function sendChatMessageAction(body) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('chat_send_message', { p_body: body });
  if (error) return { error: error.message };
  return { messageId: data };
}

// Soporte (admin) responde en una conversación.
export async function adminReplyChatAction(conversationId, body) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('chat_admin_reply', {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) return { error: error.message };
  return { messageId: data };
}

// El jugador marca su conversación como leída (limpia la campana).
export async function markChatReadPlayerAction() {
  const supabase = await createClient();
  const { error } = await supabase.rpc('chat_player_mark_read');
  if (error) return { error: error.message };
  return { success: true };
}

// El admin marca una conversación como leída.
export async function markChatReadAdminAction(conversationId) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('chat_admin_mark_read', {
    p_conversation_id: conversationId,
  });
  if (error) return { error: error.message };
  return { success: true };
}
