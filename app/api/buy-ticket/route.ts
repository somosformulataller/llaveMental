import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { drawPayoutTier } from '@/lib/game/rng';
import { TICKET_COST, INITIAL_VAULT } from '@/lib/game/constants';

export async function POST() {
  try {
    const supabase = await createClient();

    // 1. Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2. Get player's current balance
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, balance, total_wagered')
      .eq('id', user.id)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });
    }

    // 3. Check sufficient balance
    if (Number(player.balance) < TICKET_COST) {
      return NextResponse.json(
        { error: 'Saldo insuficiente. Necesitas $2.00 para jugar.' },
        { status: 400 }
      );
    }

    // 4. Check if player has an active session already
    const { data: existingSession } = await supabase
      .from('game_sessions')
      .select('id')
      .eq('player_id', user.id)
      .eq('game_status', 'ACTIVE')
      .single();

    if (existingSession) {
      return NextResponse.json(
        { error: 'Ya tienes una sesión activa', session_id: existingSession.id, vault: INITIAL_VAULT },
        { status: 409 }
      );
    }

    // 5. RNG: Select payout tier (SERVER-SIDE — not manipulable by client)
    const payoutTier = drawPayoutTier();

    // 6. Create game session in DB
    const { data: session, error: sessionError } = await supabase
      .from('game_sessions')
      .insert({
        player_id: user.id,
        target_payout: payoutTier.payout,
        required_errors: payoutTier.requiredErrors,
        errors_remaining: payoutTier.requiredErrors,
        current_vault: INITIAL_VAULT,
        keys_tried: [],
        game_status: 'ACTIVE',
      })
      .select('id')
      .single();

    if (sessionError || !session) {
      console.error('Session creation error:', sessionError);
      return NextResponse.json({ error: 'Error al crear sesión' }, { status: 500 });
    }

    // 7. Deduct ticket cost from player balance
    const { error: balanceError } = await supabase
      .from('players')
      .update({
        balance: Number(player.balance) - TICKET_COST,
        total_wagered: Number(player.total_wagered) + TICKET_COST,
      })
      .eq('id', user.id);

    if (balanceError) {
      // Rollback: delete the created session
      await supabase.from('game_sessions').delete().eq('id', session.id);
      return NextResponse.json({ error: 'Error al procesar el pago' }, { status: 500 });
    }

    return NextResponse.json({
      session_id: session.id,
      vault: INITIAL_VAULT,
    });
  } catch (err) {
    console.error('buy-ticket error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
