import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PAYOUT_TABLE, TOTAL_KEYS, VAULT_SEQUENCE, VAULT_STEP, coinKeysRemaining } from '@/lib/game/constants';

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

    if (!session_id || key_id === undefined || key_id < 0 || key_id >= TOTAL_KEYS) {
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
    // Tier de esta partida (las sesiones selladas con tablas viejas no
    // calzan: sin adelantos y con el paso fijo de respaldo).
    const tier = PAYOUT_TABLE.find((t) => t.payout === targetPayout);
    const tierAdvances = tier?.advances ?? [];
    if (errorsRemaining > 0 || targetPayout <= 0) {
      // Esta llave FALLA — el pozo baja siguiendo la escalera
      const newVault = tier
        ? VAULT_SEQUENCE[Math.min(updatedKeysTried.length, VAULT_SEQUENCE.length - 1)]
        : Math.max(0, currentVault - VAULT_STEP);
      const newErrorsRemaining = Math.max(0, errorsRemaining - 1);
      // Derrota: el pozo llegó a 0 o ya no quedan llaves por probar
      // (lo segundo cubre sesiones viejas cuyo pozo no cierra en 0).
      const gameOver = newVault <= 0 || updatedKeysTried.length >= TOTAL_KEYS;

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

      // Adelanto del premio: este fallo suelta unas monedas (parte del
      // premio final, que al abrir se paga MENOS lo ya adelantado).
      let bonus = 0;
      if (!gameOver && targetPayout > 0) {
        const adv = tierAdvances.find((a) => a.fail === updatedKeysTried.length);
        if (adv) {
          const { error: advError } = await admin.rpc('credit_prize', {
            p_player: user.id,
            p_payout: adv.amount,
          });
          if (advError) console.error('credit_prize (adelanto) error:', advError);
          else bonus = adv.amount;
        }
      }

      return NextResponse.json({
        success: false,
        vault: newVault,
        animation: 'KEY_BROKEN',
        game_over: gameOver,
        // Llaves con monedas que le quedan a la partida (header)
        coin_keys: gameOver ? 0 : coinKeysRemaining(targetPayout, updatedKeysTried.length),
        ...(bonus > 0 ? { bonus } : {}),
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

      // Acreditar el premio al saldo retirable (RPC atómico), MENOS
      // los adelantos ya pagados durante los fallos de esta partida.
      // Con la tabla vigente las monedas suman el premio COMPLETO,
      // así que aquí queda $0: la puerta solo muestra el total. El
      // resto cubre sesiones selladas con tablas viejas.
      const failCount = updatedKeysTried.length - 1;
      const advancesPaid = tierAdvances
        .filter((a) => a.fail <= failCount)
        .reduce((s, a) => s + a.amount, 0);
      // Redondeo a centavos: evita residuos binarios de sumar decimales
      const remainder = Math.max(0, Math.round((finalPayout - advancesPaid) * 100) / 100);
      if (remainder > 0) {
        const { error: prizeError } = await admin.rpc('credit_prize', {
          p_player: user.id,
          p_payout: remainder,
        });
        if (prizeError) console.error('credit_prize error:', prizeError);
      }

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
        // Lo que se sumó al saldo AHORA (el resto ya se adelantó en
        // los fallos): el cliente suma esto, no el premio completo.
        credited: remainder,
        animation: 'LOCK_OPENED',
        coin_keys: 0,
      });
    }
  } catch (err) {
    console.error('try-key error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
