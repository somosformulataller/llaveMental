import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { AdminChatListItem, ChatConversationStatus, ChatMessage } from '@/types/chat';

const STATUSES: ChatConversationStatus[] = ['pendiente', 'prioridad', 'resuelto'];

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };

  const { data: me } = await supabase.from('players').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    return { user: null, error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  }
  return { user, error: null };
}

// Mapa id → email de auth (players no guarda el correo)
async function loadEmailMap(admin: ReturnType<typeof createAdminClient>) {
  const map = new Map<string, string>();
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (u.email) map.set(u.id, u.email);
    }
  } catch {}
  return map;
}

function preview(m: Pick<ChatMessage, 'sender' | 'body' | 'attachment_path'> | undefined): string {
  if (!m) return 'Conversación nueva';
  const text = m.body?.trim() || (m.attachment_path ? '📎 Adjunto' : '');
  return m.sender === 'support' ? `Tú: ${text}` : text;
}

// Chat de atención al cliente (ADMIN).
// GET               → lista de conversaciones + preguntas rápidas
// GET ?conversation → hilo completo (y lo marca como leído)
// GET ?q=texto      → buscador de jugadores para iniciar un chat
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    if (!isAdminClientConfigured()) {
      return NextResponse.json({ error: 'Falta SUPABASE_SECRET_KEY en el servidor' }, { status: 503 });
    }
    const admin = createAdminClient();
    const params = req.nextUrl.searchParams;

    // ── Buscador de jugadores (nombre, correo o cédula) ──
    const q = params.get('q')?.trim();
    if (q !== null && q !== undefined) {
      if (q.length < 2) return NextResponse.json({ results: [] });
      const [playersRes, emails] = await Promise.all([
        admin
          .from('players')
          .select('id, username, payout_cedula, role')
          .neq('role', 'admin')
          .limit(500),
        loadEmailMap(admin),
      ]);
      const needle = q.toLowerCase();
      const results = (playersRes.data ?? [])
        .map((p) => ({ ...p, email: emails.get(p.id) ?? null }))
        .filter(
          (p) =>
            p.username?.toLowerCase().includes(needle) ||
            p.email?.toLowerCase().includes(needle) ||
            p.payout_cedula?.toLowerCase().includes(needle)
        )
        .slice(0, 15)
        .map((p) => ({ id: p.id, username: p.username, email: p.email }));
      return NextResponse.json({ results });
    }

    // ── Hilo de una conversación ──
    const conversationId = params.get('conversation');
    if (conversationId) {
      const { data: conv } = await admin
        .from('chat_conversations')
        .select('*, players(username, tickets)')
        .eq('id', conversationId)
        .maybeSingle();
      if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });

      const [msgsRes, emails] = await Promise.all([
        admin
          .from('chat_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(300),
        loadEmailMap(admin),
      ]);

      // Abrir el hilo lo marca como leído para el admin
      await admin
        .from('chat_conversations')
        .update({ admin_read_at: new Date().toISOString() })
        .eq('id', conversationId);

      const players = (conv as { players?: { username: string | null; tickets: number } | null })
        .players;
      return NextResponse.json({
        conversation: {
          id: conv.id,
          player_id: conv.player_id,
          status: conv.status,
          username: players?.username ?? null,
          email: emails.get(conv.player_id) ?? null,
          tickets: players?.tickets ?? 0,
        },
        messages: msgsRes.data ?? [],
      });
    }

    // ── Lista de conversaciones + preguntas rápidas ──
    const [convsRes, questionsRes, emails] = await Promise.all([
      admin
        .from('chat_conversations')
        .select('*, players(username, tickets)')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(100),
      admin
        .from('chat_quick_questions')
        .select('id, question, active, position')
        .order('position', { ascending: true }),
      loadEmailMap(admin),
    ]);

    const convs = convsRes.data ?? [];
    const ids = convs.map((c) => c.id);

    // Último mensaje y no leídos de cada conversación en una sola consulta
    const lastByConv = new Map<string, Pick<ChatMessage, 'sender' | 'body' | 'attachment_path'>>();
    const unreadByConv = new Map<string, number>();
    if (ids.length > 0) {
      const { data: msgs } = await admin
        .from('chat_messages')
        .select('conversation_id, sender, body, attachment_path, created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
        .limit(600);
      const readAt = new Map(convs.map((c) => [c.id, c.admin_read_at as string | null]));
      for (const m of msgs ?? []) {
        if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
        if (m.sender === 'player') {
          const seen = readAt.get(m.conversation_id);
          if (!seen || m.created_at > seen) {
            unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
          }
        }
      }
    }

    const conversations: AdminChatListItem[] = convs.map((c) => {
      const players = (c as { players?: { username: string | null; tickets: number } | null })
        .players;
      return {
        id: c.id,
        player_id: c.player_id,
        status: c.status,
        last_message_at: c.last_message_at,
        username: players?.username ?? null,
        email: emails.get(c.player_id) ?? null,
        tickets: players?.tickets ?? 0,
        unread: unreadByConv.get(c.id) ?? 0,
        preview: preview(lastByConv.get(c.id)),
      };
    });

    return NextResponse.json({ conversations, questions: questionsRes.data ?? [] });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

interface ActionBody {
  action:
    | 'send'
    | 'set_status'
    | 'mark_read'
    | 'start'
    | 'question_add'
    | 'question_toggle'
    | 'question_delete';
  conversation_id?: string;
  player_id?: string;
  text?: string;
  attachment?: { path: string; name: string; type: string };
  status?: ChatConversationStatus;
  id?: string;
  question?: string;
  active?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    if (!isAdminClientConfigured()) {
      return NextResponse.json({ error: 'Falta SUPABASE_SECRET_KEY en el servidor' }, { status: 503 });
    }
    const admin = createAdminClient();
    const body: ActionBody = await req.json();

    if (body.action === 'send') {
      const text = body.text?.trim().slice(0, 2000) || null;
      const attachment = body.attachment ?? null;
      if (!body.conversation_id) {
        return NextResponse.json({ error: 'Falta la conversación' }, { status: 400 });
      }
      if (!text && !attachment) {
        return NextResponse.json({ error: 'Escribe un mensaje' }, { status: 400 });
      }
      const { data: message, error: msgError } = await admin
        .from('chat_messages')
        .insert({
          conversation_id: body.conversation_id,
          sender: 'support',
          body: text,
          attachment_path: attachment?.path ?? null,
          attachment_name: attachment?.name ?? null,
          attachment_type: attachment?.type ?? null,
        })
        .select('*')
        .single();
      if (msgError || !message) {
        return NextResponse.json({ error: 'No se pudo enviar el mensaje' }, { status: 500 });
      }
      const now = new Date().toISOString();
      await admin
        .from('chat_conversations')
        .update({ last_message_at: now, admin_read_at: now })
        .eq('id', body.conversation_id);
      return NextResponse.json({ message });
    }

    if (body.action === 'set_status') {
      if (!body.conversation_id || !body.status || !STATUSES.includes(body.status)) {
        return NextResponse.json({ error: 'Etiqueta inválida' }, { status: 400 });
      }
      await admin
        .from('chat_conversations')
        .update({ status: body.status })
        .eq('id', body.conversation_id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'mark_read') {
      if (!body.conversation_id) {
        return NextResponse.json({ error: 'Falta la conversación' }, { status: 400 });
      }
      await admin
        .from('chat_conversations')
        .update({ admin_read_at: new Date().toISOString() })
        .eq('id', body.conversation_id);
      return NextResponse.json({ ok: true });
    }

    // Iniciar (o reabrir) una conversación con un jugador.
    // NO envía ningún mensaje: la campana del jugador se enciende
    // recién cuando el admin escribe el primero.
    if (body.action === 'start') {
      if (!body.player_id) {
        return NextResponse.json({ error: 'Falta el jugador' }, { status: 400 });
      }
      const { data: target } = await admin
        .from('players')
        .select('id, role')
        .eq('id', body.player_id)
        .maybeSingle();
      if (!target || target.role === 'admin') {
        return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });
      }
      const { data: conv, error: convError } = await admin
        .from('chat_conversations')
        .upsert({ player_id: body.player_id }, { onConflict: 'player_id' })
        .select('id')
        .single();
      if (convError || !conv) {
        return NextResponse.json({ error: 'No se pudo crear la conversación' }, { status: 500 });
      }
      return NextResponse.json({ conversation_id: conv.id });
    }

    if (body.action === 'question_add') {
      const question = body.question?.trim().slice(0, 200);
      if (!question) return NextResponse.json({ error: 'Escribe la pregunta' }, { status: 400 });
      const { data: maxRow } = await admin
        .from('chat_quick_questions')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error: qError } = await admin
        .from('chat_quick_questions')
        .insert({ question, position: (maxRow?.position ?? 0) + 1 });
      if (qError) return NextResponse.json({ error: 'No se pudo agregar' }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'question_toggle') {
      if (!body.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });
      await admin
        .from('chat_quick_questions')
        .update({ active: body.active === true })
        .eq('id', body.id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'question_delete') {
      if (!body.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });
      await admin.from('chat_quick_questions').delete().eq('id', body.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
