import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BLOCKED_MESSAGE, isBlocked } from '@/lib/supabase/blocked';
import { MIN_WITHDRAWAL_USD } from '@/lib/payments/constants';

interface WithdrawBody {
  amount: number;
}

// Solicitar retiro del saldo de premios. El RPC request_withdrawal
// es atómico: descuenta el saldo, valida que no haya otro retiro en
// proceso y crea la solicitud (el admin la paga por Pago Móvil).
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    if (await isBlocked(supabase, user.id)) {
      return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 403 });
    }

    const body: WithdrawBody = await req.json();
    const amount = Math.round(Number(body.amount) * 100) / 100;

    if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL_USD) {
      return NextResponse.json(
        { error: `El monto mínimo de retiro es $${MIN_WITHDRAWAL_USD.toFixed(2)}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc('request_withdrawal', { p_amount: amount });
    if (error) {
      return NextResponse.json(
        { error: error.message || 'No se pudo solicitar el retiro' },
        { status: 400 }
      );
    }

    const result = data as { id: string; balance: number };
    return NextResponse.json({
      withdrawal_id: result.id,
      balance: Number(result.balance),
    });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
