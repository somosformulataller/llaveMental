// Tipos del chat de atención al cliente (jugador ↔ admin).
// Solo hay dos remitentes posibles: el jugador y soporte (admin).
export type ChatSender = 'player' | 'support';
export type ChatConversationStatus = 'pendiente' | 'prioridad' | 'resuelto';

export interface ChatAttachmentInfo {
  path: string;
  name: string;
  type: string; // MIME: image/…, application/pdf, audio/…
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender: ChatSender;
  body: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  player_id: string;
  status: ChatConversationStatus;
  last_message_at: string | null;
  player_read_at: string | null;
  admin_read_at: string | null;
  created_at: string;
}

export interface ChatQuickQuestion {
  id: string;
  question: string;
  active: boolean;
  position: number;
}

// Respuesta del GET /api/chat (lado jugador)
export interface PlayerChatResponse {
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  quickQuestions: ChatQuickQuestion[];
  unread: number;
  error?: string;
}

// Fila de la lista de conversaciones del admin
export interface AdminChatListItem {
  id: string;
  player_id: string;
  status: ChatConversationStatus;
  last_message_at: string | null;
  username: string | null;
  email: string | null;
  tickets: number;
  unread: number;
  /** Vista previa del último mensaje ("Tú: …", "📎 Adjunto", …) */
  preview: string;
}
