import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { fetchExchangeRateSafe } from '@/lib/payments/exchangeRate';
import { tryAutoValidatePurchase } from '@/lib/payments/validatePurchase';
import { MAX_TICKETS_PER_PURCHASE, TICKET_PRICE_USD } from '@/lib/payments/constants';

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
    const { data: purchase, error: insertError } = await admin
      .from('ticket_purchases')
      .insert({
        player_id: user.id,
        quantity,
        amount_usd: amountUsd,
        amount_ves: amountVes,
        exchange_rate_used: rate?.rate ?? null,
        reference,
      })
      .select('id')
      .single();

    if (insertError || !purchase) {
      if (insertError?.code === '23505') {
        return NextResponse.json(
          { error: 'Esa referencia de pago ya fue registrada.' },
          { status: 409 }
        );
      }
      console.error('purchase insert error:', insertError);
      return NextResponse.json({ error: 'No se pudo registrar la compra' }, { status: 500 });
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
