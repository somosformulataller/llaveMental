import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';

interface NotificationItem {
  id: string;
  icon: string;
  text: string;
  at: string;
}

type NameRel = { username: string | null } | null;

// ── Campana del ADMINISTRADOR: TODO lo que pasa en la app ──
// mensajes del chat, compras (pendientes/aprobadas/rechazadas),
// retiros solicitados/pagados y jugadores nuevos.
async function adminFeed(): Promise<NotificationItem[]> {
  const admin = createAdminClient();
  const [msgsRes, purchasesRes, withdrawalsRes, playersRes] = await Promise.all([
    admin
      .from('chat_messages')
      .select('id, body, attachment_name, created_at, chat_conversations(players(username))')
      .eq('sender', 'player')
      .order('created_at', { ascending: false })
      .limit(15),
    admin
      .from('ticket_purchases')
      .select('id, quantity, reference, status, origin, created_at, validated_at, players(username)')
      .order('created_at', { ascending: false })
      .limit(15),
    admin
      .from('withdrawals')
      .select('id, amount_usd, status, created_at, paid_at, players(username)')
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('players')
      .select('id, username, created_at, role')
      .neq('role', 'admin')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const items: NotificationItem[] = [];
  const nameOf = (rel: NameRel) => rel?.username || 'jugador';

  for (const m of msgsRes.data ?? []) {
    const conv = (m as unknown as { chat_conversations?: { players: NameRel } | null })
      .chat_conversations;
    const body = m.body?.trim();
    items.push({
      id: `m-${m.id}`,
      icon: '💬',
      text: `${nameOf(conv?.players ?? null)} escribió en el chat: ${
        body ? `«${body.slice(0, 70)}${body.length > 70 ? '…' : ''}»` : `📎 ${m.attachment_name ?? 'Adjunto'}`
      }`,
      at: m.created_at,
    });
  }

  for (const p of purchasesRes.data ?? []) {
    const name = nameOf((p as unknown as { players?: NameRel }).players ?? null);
    const qty = `${p.quantity} 🎟️`;
    if (p.status === 'aprobado') {
      items.push({
        id: `p-${p.id}`,
        icon: '✅',
        text: `Compra aprobada${p.origin === 'auto' ? ' (automática)' : ''}: ${name} · ${qty} · Ref ${p.reference}`,
        at: p.validated_at ?? p.created_at,
      });
    } else if (p.status === 'rechazado') {
      items.push({
        id: `p-${p.id}`,
        icon: '❌',
        text: `Compra rechazada: ${name} · Ref ${p.reference}`,
        at: p.validated_at ?? p.created_at,
      });
    } else {
      items.push({
        id: `p-${p.id}`,
        icon: '🕒',
        text: `Compra PENDIENTE por revisar: ${name} · ${qty} · Ref ${p.reference}`,
        at: p.created_at,
      });
    }
  }

  for (const w of withdrawalsRes.data ?? []) {
    const name = nameOf((w as unknown as { players?: NameRel }).players ?? null);
    const amount = `$${Number(w.amount_usd).toFixed(2)}`;
    if (w.status === 'pagado') {
      items.push({
        id: `w-${w.id}`,
        icon: '💸',
        text: `Retiro pagado a ${name}: ${amount}`,
        at: w.paid_at ?? w.created_at,
      });
    } else if (w.status === 'cancelado') {
      items.push({
        id: `w-${w.id}`,
        icon: '↩️',
        text: `Retiro de ${name} cancelado (${amount} devueltos a su saldo)`,
        at: w.created_at,
      });
    } else {
      items.push({
        id: `w-${w.id}`,
        icon: '⏳',
        text: `${name} solicitó RETIRAR ${amount} — pendiente de pagar`,
        at: w.created_at,
      });
    }
  }

  for (const p of playersRes.data ?? []) {
    items.push({
      id: `u-${p.id}`,
      icon: '🆕',
      text: `Nuevo jugador registrado: ${p.username || p.id.slice(0, 8)}`,
      at: p.created_at,
    });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return items.slice(0, 25);
}

// Notificaciones derivadas del estado real (sin tabla extra).
// Jugador: sus compras y retiros. Admin: TODO (chat, compras,
// retiros y registros de toda la app).
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ notifications: [] });

    const { data: me } = await supabase
      .from('players')
      .select('role')
      .eq('id', user.id)
      .single();

    if (me?.role === 'admin' && isAdminClientConfigured()) {
      return NextResponse.json({ notifications: await adminFeed() });
    }

    const [purchasesRes, withdrawalsRes] = await Promise.all([
      supabase
        .from('ticket_purchases')
        .select('id, quantity, reference, status, status_note, created_at, validated_at')
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('withdrawals')
        .select('id, amount_usd, status, reference, created_at, paid_at')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const items: NotificationItem[] = [];

    for (const p of purchasesRes.data ?? []) {
      const refTail = `Ref: ${p.reference}`;
      if (p.status === 'aprobado') {
        items.push({
          id: `p-${p.id}`,
          icon: '✅',
          text: `Pago aprobado: se sumaron ${p.quantity} ticket${p.quantity > 1 ? 's' : ''} a tu cuenta (${refTail}).`,
          at: p.validated_at ?? p.created_at,
        });
      } else if (p.status === 'rechazado') {
        items.push({
          id: `p-${p.id}`,
          icon: '❌',
          text: `Pago rechazado (${refTail})${p.status_note ? `: ${p.status_note}` : '.'}`,
          at: p.validated_at ?? p.created_at,
        });
      } else {
        items.push({
          id: `p-${p.id}`,
          icon: '🕒',
          text: `Tu pago está en revisión (${refTail}). Te sumaremos los tickets apenas el banco lo confirme.`,
          at: p.created_at,
        });
      }
    }

    for (const w of withdrawalsRes.data ?? []) {
      const amount = `$${Number(w.amount_usd).toFixed(2)}`;
      if (w.status === 'pagado') {
        items.push({
          id: `w-${w.id}`,
          icon: '💸',
          text: `¡Retiro pagado! Te enviamos ${amount} por Pago Móvil${w.reference ? ` (Ref: ${w.reference})` : ''}.`,
          at: w.paid_at ?? w.created_at,
        });
      } else if (w.status === 'cancelado') {
        items.push({
          id: `w-${w.id}`,
          icon: '↩️',
          text: `Retiro cancelado: ${amount} volvieron a tu saldo.`,
          at: w.created_at,
        });
      } else {
        items.push({
          id: `w-${w.id}`,
          icon: '⏳',
          text: `Retiro solicitado: ${amount} en proceso (se paga en 15–30 minutos).`,
          at: w.created_at,
        });
      }
    }

    items.sort((a, b) => (a.at < b.at ? 1 : -1));

    return NextResponse.json({ notifications: items.slice(0, 20) });
  } catch {
    return NextResponse.json({ notifications: [] });
  }
}
