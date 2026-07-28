import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Billetera del jugador: perfil (saldo + tickets), historial de
// compras y de retiros. Todo con RLS: solo lo propio.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const [playerRes, purchasesRes, withdrawalsRes] = await Promise.all([
      supabase.from('players').select('*').eq('id', user.id).single(),
      supabase
        .from('ticket_purchases')
        .select(
          'id, player_id, quantity, amount_usd, amount_ves, exchange_rate_used, reference, status, origin, status_note, created_at, validated_at'
        )
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('withdrawals')
        .select('id, player_id, amount_usd, status, reference, admin_note, created_at, paid_at')
        .order('created_at', { ascending: false })
        .limit(15),
    ]);

    return NextResponse.json({
      player: playerRes.data ?? null,
      purchases: purchasesRes.data ?? [],
      withdrawals: withdrawalsRes.data ?? [],
    });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
