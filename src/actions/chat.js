'use server';

import { createClient } from '@/lib/supabase/server';

// Escrituras del chat. Todas pasan por funciones SECURITY DEFINER en la base
// de datos (migración 022) que revalidan quién puede hacer qué y evitan que se
// falsee el remitente. Las lecturas (mensajes, no leídos, lista de
// conversaciones) las hace el cliente directo con RLS/RPC.

// Jugador envía un mensaje (crea su conversación la primera vez). Puede llevar
// un adjunto opcional { path, name, type } (ya subido al storage por el cliente).
export async function sendChatMessageAction(body, attachment = null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('chat_send_message', {
    p_body: body,
    p_attachment_path: attachment?.path ?? null,
    p_attachment_name: attachment?.name ?? null,
    p_attachment_type: attachment?.type ?? null,
  });
  if (error) return { error: error.message };
  return { messageId: data };
}

// Soporte (admin) responde en una conversación (con adjunto opcional).
export async function adminReplyChatAction(conversationId, body, attachment = null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('chat_admin_reply', {
    p_conversation_id: conversationId,
    p_body: body,
    p_attachment_path: attachment?.path ?? null,
    p_attachment_name: attachment?.name ?? null,
    p_attachment_type: attachment?.type ?? null,
  });
  if (error) return { error: error.message };
  return { messageId: data };
}

// El admin inicia (o recupera) la conversación con cualquier usuario para
// escribirle primero. Devuelve el id de la conversación; el mensaje que el
// admin envíe luego es el que le enciende la campana al jugador.
export async function adminStartConversationAction(userId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('chat_admin_start_conversation', {
    p_user_id: userId,
  });
  if (error) return { error: error.message };
  return { conversationId: data };
}

// El admin cambia la etiqueta/estado de una conversación
// ('pendiente' | 'prioridad' | 'resuelto').
export async function adminSetChatStatusAction(conversationId, status) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('chat_admin_set_status', {
    p_conversation_id: conversationId,
    p_status: status,
  });
  if (error) return { error: error.message };
  return { success: true };
}

// El admin suma (delta > 0) o resta (delta < 0) tickets a un usuario.
export async function adminAdjustTicketsAction(userId, delta) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_adjust_tickets', {
    p_user_id: userId,
    p_delta: delta,
  });
  if (error) return { error: error.message };
  return { profile: data };
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
