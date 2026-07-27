import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface TryKeyBody {
  session_id: string;
  key_id: number;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Verify auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2. Parse body
    const body: TryKeyBody = await req.json();
    const { session_id, key_id } = body;

    if (!session_id || key_id === undefined || key_id < 0 || key_id > 9) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    // 3. Fetch session — verify ownership and status
    const { data: session, error: sessionError } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('player_id', user.id)
      .eq('game_status', 'ACTIVE')
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Sesión no encontrada o ya completada' },
        { status: 404 }
      );
    }

    // 4. Verify key not already tried
    const keysTried: number[] = session.keys_tried || [];
    if (keysTried.includes(key_id)) {
      return NextResponse.json(
        { error: 'Ya intentaste esta llave' },
        { status: 400 }
      );
    }

    const updatedKeysTried = [...keysTried, key_id];

    // 5. Determine outcome based on pre-determined RNG result
    const errorsRemaining: number = session.errors_remaining;
    const currentVault: number = parseFloat(session.current_vault);

    // === CORE LOGIC: The fate was sealed when the ticket was bought ===
    if (errorsRemaining > 0) {
      // This key FAILS — decrement counter
      const newVault = currentVault - 2;
      const newErrorsRemaining = errorsRemaining - 1;

      await supabase
        .from('game_sessions')
        .update({
          errors_remaining: newErrorsRemaining,
          current_vault: newVault,
          keys_tried: updatedKeysTried,
        })
        .eq('id', session_id);

      return NextResponse.json({
        success: false,
        vault: newVault,
        animation: 'KEY_BROKEN',
      });
    } else {
      // errors_remaining === 0: This key SUCCEEDS — reveal pre-determined payout
      const finalPayout = parseFloat(session.target_payout);

      // Mark session as completed
      await supabase
        .from('game_sessions')
        .update({
          game_status: 'COMPLETED',
          current_vault: finalPayout,
          keys_tried: updatedKeysTried,
          completed_at: new Date().toISOString(),
        })
        .eq('id', session_id);

      // Credit player account
      const { data: player } = await supabase
        .from('players')
        .select('balance, total_won')
        .eq('id', user.id)
        .single();

      if (player) {
        await supabase
          .from('players')
          .update({
            balance: parseFloat(player.balance) + finalPayout,
            total_won: parseFloat(player.total_won) + finalPayout,
          })
          .eq('id', user.id);
      }

      // Log to game_history
      await supabase.from('game_history').insert({
        player_id: user.id,
        session_id: session_id,
        payout: finalPayout,
        keys_tried_count: updatedKeysTried.length,
      });

      return NextResponse.json({
        success: true,
        vault: finalPayout,
        payout: finalPayout,
        animation: 'LOCK_OPENED',
      });
    }
  } catch (err) {
    console.error('try-key error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
