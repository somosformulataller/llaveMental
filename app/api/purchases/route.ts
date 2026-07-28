import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { fetchExchangeRateSafe } from '@/lib/payments/exchangeRate';
import { tryAutoValidatePurchase } from '@/lib/payments/validatePurchase';
import {
  DUPLICATE_MARKER,
  MAX_TICKETS_PER_PURCHASE,
  TICKET_PRICE_USD,
} from '@/lib/payments/constants';

// Historial de compras del jugador (RLS: solo las suyas)
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: purchases } = await supabase
      .from('ticket_purchases')
      .select(
        'id, player_id, quantity, amount_usd, amount_ves, exchange_rate_used, reference, status, origin, status_note, created_at, validated_at'
      )
      .order('created_at', { ascending: false })
      .limit(25);

    return NextResponse.json({ purchases: purchases ?? [] });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

interface CreatePurchaseBody {
  quantity: number;
  reference: string;
}

// Registrar una solicitud de compra de tickets (Pago Móvil) y
// validarla automáticamente contra la API del banco. El monto se
// calcula SIEMPRE en el servidor (no se confía en el navegador).
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    if (!isAdminClientConfigured()) {
      return NextResponse.json(
        { error: 'El sistema de pagos no está configurado todavía.' },
        { status: 503 }
      );
    }

    const body: CreatePurchaseBody = await req.json();
    const quantity = Math.trunc(Number(body.quantity));
    const reference = String(body.reference ?? '').trim();

    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_PURCHASE) {
      return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
    }
    if (reference.length < 4 || reference.length > 40) {
      return NextResponse.json(
        { error: 'Escribe el número de referencia del pago' },
        { status: 400 }
      );
    }

    const rate = await fetchExchangeRateSafe();
    const amountUsd = Math.round(quantity * TICKET_PRICE_USD * 100) / 100;
    const amountVes = rate ? Math.round(amountUsd * rate.rate * 100) / 100 : null;

    const admin = createAdminClient();

    // ¿Referencia repetida? Cada número es único por banco, pero
    // entre bancos distintos puede coincidir: la compra se registra
    // igual, queda pendiente con nota de anomalía para el admin, y
    // la validación automática no la toca (revisión 100% manual).
    const norm = reference.toLowerCase().replace(/\s/g, '');
    const { data: dups } = await admin
      .from('ticket_purchases')
      .select('id, status, created_at')
      .eq('reference_norm', norm)
      .neq('status', 'rechazado')
      .limit(5);

    const isDuplicate = (dups?.length ?? 0) > 0;
    const dupNote = isDuplicate
      ? `${DUPLICATE_MARKER}: ya aparece en ${dups!.length} compra(s) más (${dups!
          .map(
            (d) =>
              `${d.status} · ${new Date(d.created_at).toLocaleDateString('es-VE', {
                day: '2-digit',
                month: 'short',
              })}`
          )
          .join(', ')}). Si el pago vino de OTRO banco puede ser válida: verifícala contra el banco antes de aprobar.`
      : null;

    const { data: purchase, error: insertError } = await admin
      .from('ticket_purchases')
      .insert({
        player_id: user.id,
        quantity,
        amount_usd: amountUsd,
        amount_ves: amountVes,
        exchange_rate_used: rate?.rate ?? null,
        reference,
        ...(dupNote ? { status: 'pendiente', status_note: dupNote } : {}),
      })
      .select('id')
      .single();

    if (insertError || !purchase) {
      if (insertError?.code === '23505') {
        // Índice único todavía activo (migración 004 sin correr)
        return NextResponse.json(
          { error: 'Ese número de referencia ya fue usado en otra compra.' },
          { status: 409 }
        );
      }
      console.error('purchase insert error:', insertError);
      return NextResponse.json({ error: 'No se pudo registrar la compra' }, { status: 500 });
    }

    if (isDuplicate) {
      return NextResponse.json({
        purchase_id: purchase.id,
        status: 'pendiente',
        tickets: null,
        duplicate: true,
        reason:
          'Ese número de referencia ya se usó en otra compra. Tu solicitud quedó en revisión: si pagaste desde un banco distinto, un administrador la verificará y aprobará.',
        amount_usd: amountUsd,
        amount_ves: amountVes,
      });
    }

    const result = await tryAutoValidatePurchase(purchase.id);

    return NextResponse.json({
      purchase_id: purchase.id,
      status: result.status,
      tickets: result.tickets ?? null,
      reason: result.reason ?? null,
      amount_usd: amountUsd,
      amount_ves: amountVes,
    });
  } catch (err) {
    console.error('purchases POST error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
