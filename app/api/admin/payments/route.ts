import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };

  const { data: me } = await supabase.from('players').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    return { supabase, error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) };
  }
  return { supabase, error: null };
}

// Transacciones (admin): compras de tickets y retiros con los datos
// del jugador. Lecturas con las políticas RLS de admin.
export async function GET() {
  try {
    const { supabase, error } = await requireAdmin();
    if (error) return error;

    const [purchasesRes, withdrawalsRes] = await Promise.all([
      supabase
        .from('ticket_purchases')
        .select(
          'id, player_id, quantity, amount_usd, amount_ves, exchange_rate_used, reference, status, origin, status_note, created_at, validated_at, players(username)'
        )
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('withdrawals')
        .select(
          'id, player_id, amount_usd, status, reference, admin_note, created_at, paid_at, players(username, payout_name, payout_bank, payout_cedula, payout_phone)'
        )
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    type PlayerRel = {
      username: string | null;
      payout_name?: string | null;
      payout_bank?: string | null;
      payout_cedula?: string | null;
      payout_phone?: string | null;
    } | null;

    const purchases = (purchasesRes.data ?? []).map((row) => {
      const { players, ...rest } = row as typeof row & { players: PlayerRel };
      return { ...rest, username: players?.username ?? null };
    });

    const withdrawals = (withdrawalsRes.data ?? []).map((row) => {
      const { players, ...rest } = row as typeof row & { players: PlayerRel };
      return {
        ...rest,
        username: players?.username ?? null,
        payout_name: players?.payout_name ?? null,
        payout_bank: players?.payout_bank ?? null,
        payout_cedula: players?.payout_cedula ?? null,
        payout_phone: players?.payout_phone ?? null,
      };
    });

    return NextResponse.json({ purchases, withdrawals });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

interface ActionBody {
  action: 'approve_purchase' | 'reject_purchase' | 'pay_withdrawal' | 'cancel_withdrawal';
  id: string;
  note?: string;
  reference?: string;
}

// Acciones del admin sobre transacciones. Los RPCs son atómicos:
// aprobar suma tickets, rechazar los descuenta si ya estaban dados,
// cancelar un retiro devuelve el monto a la billetera.
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    if (!isAdminClientConfigured()) {
      return NextResponse.json(
        { error: 'Falta SUPABASE_SECRET_KEY en el servidor' },
        { status: 503 }
      );
    }

    const body: ActionBody = await req.json();
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

    const admin = createAdminClient();

    if (body.action === 'approve_purchase') {
      const { data, error: rpcError } = await admin.rpc('approve_purchase', {
        p_purchase: id,
        p_origin: 'manual',
        p_bank: null,
        p_note: body.note?.trim() || null,
      });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
      return NextResponse.json({ ok: true, result: data });
    }

    if (body.action === 'reject_purchase') {
      const note = body.note?.trim();
      if (!note) {
        return NextResponse.json({ error: 'Indica el motivo del rechazo' }, { status: 400 });
      }
      const { error: rpcError } = await admin.rpc('reject_purchase', {
        p_purchase: id,
        p_note: note,
      });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'pay_withdrawal') {
      const reference = body.reference?.trim();
      if (!reference) {
        return NextResponse.json(
          { error: 'Escribe la referencia del Pago Móvil que hiciste' },
          { status: 400 }
        );
      }
      const { error: rpcError } = await admin.rpc('pay_withdrawal', {
        p_withdrawal: id,
        p_reference: reference,
        p_note: body.note?.trim() || null,
      });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'cancel_withdrawal') {
      const { error: rpcError } = await admin.rpc('cancel_withdrawal', { p_withdrawal: id });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
