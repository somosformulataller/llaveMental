import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface NotificationItem {
  id: string;
  icon: string;
  text: string;
  at: string;
}

// Notificaciones del jugador, derivadas del estado real de sus
// compras y retiros (sin tabla extra): pago aprobado / en revisión /
// rechazado, retiro en proceso / pagado / cancelado.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ notifications: [] });

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
