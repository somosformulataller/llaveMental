import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { VAULT_STEP } from '@/lib/game/constants';

interface TryKeyBody {
  session_id: string;
  key_id: number;
}

// Intento de llave. La lógica RTP/RNG NO cambia: el destino quedó
// sellado al comprar el ticket (errors_remaining). Las escrituras
// pasan por el cliente privilegiado porque el navegador ya no puede
// tocar las tablas del juego; el premio se acredita con un RPC.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Verificar sesión
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2. Parámetros
    const body: TryKeyBody = await req.json();
    const { session_id, key_id } = body;

    if (!session_id || key_id === undefined || key_id < 0 || key_id > 9) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    // 3. Sesión: propiedad y estado (lectura con RLS)
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

    // 4. ¿Llave repetida?
    const keysTried: number[] = session.keys_tried || [];
    if (keysTried.includes(key_id)) {
      return NextResponse.json(
        { error: 'Ya intentaste esta llave' },
        { status: 400 }
      );
    }

    const updatedKeysTried = [...keysTried, key_id];
    const admin = createAdminClient();

    // 5. Resolver según el destino predeterminado por el RNG
    const errorsRemaining: number = session.errors_remaining;
    const currentVault: number = parseFloat(session.current_vault);

    // === LÓGICA CENTRAL: el destino se selló al comprar el ticket ===
    // Salvaguarda para sesiones selladas con tablas anteriores: si el
    // destino es perder ($0) pero los errores ya se agotaron sin que el
    // pozo llegara a 0, la partida termina como derrota (jamás debe
    // mostrarse la puerta abriéndose con premio $0).
    const targetPayout = parseFloat(session.target_payout);
    if (errorsRemaining > 0 || targetPayout <= 0) {
      // Esta llave FALLA — decrementar contador
      const newVault = Math.max(0, currentVault - VAULT_STEP);
      const newErrorsRemaining = Math.max(0, errorsRemaining - 1);
      // Derrota: el pozo llegó a 0 o ya no quedan llaves por probar
      // (lo segundo cubre sesiones viejas cuyo pozo no cierra en 0).
      const gameOver = newVault <= 0 || updatedKeysTried.length >= 10;

      await admin
        .from('game_sessions')
        .update({
          errors_remaining: newErrorsRemaining,
          current_vault: newVault,
          keys_tried: updatedKeysTried,
          // Pozo agotado = partida perdida: la sesión se CIERRA aquí
          // para que no quede una partida "activa" imposible de
          // reanudar (causaba "Sesión no encontrada o ya completada").
          ...(gameOver
            ? { game_status: 'COMPLETED', completed_at: new Date().toISOString() }
            : {}),
        })
        .eq('id', session_id);

      if (gameOver) {
        await admin.from('game_history').insert({
          player_id: user.id,
          session_id: session_id,
          payout: 0,
          keys_tried_count: updatedKeysTried.length,
        });
        await admin.from('app_events').insert({ player_id: user.id, event_type: 'game_lose' });
      }

      return NextResponse.json({
        success: false,
        vault: newVault,
        animation: 'KEY_BROKEN',
        game_over: gameOver,
      });
    } else {
      // errors_remaining === 0: esta llave ABRE — revelar el premio
      const finalPayout = parseFloat(session.target_payout);

      await admin
        .from('game_sessions')
        .update({
          game_status: 'COMPLETED',
          current_vault: finalPayout,
          keys_tried: updatedKeysTried,
          completed_at: new Date().toISOString(),
        })
        .eq('id', session_id);

      // Acreditar el premio al saldo retirable (RPC atómico)
      const { error: prizeError } = await admin.rpc('credit_prize', {
        p_player: user.id,
        p_payout: finalPayout,
      });
      if (prizeError) console.error('credit_prize error:', prizeError);

      await admin.from('game_history').insert({
        player_id: user.id,
        session_id: session_id,
        payout: finalPayout,
        keys_tried_count: updatedKeysTried.length,
      });
      await admin.from('app_events').insert({ player_id: user.id, event_type: 'game_win' });

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
