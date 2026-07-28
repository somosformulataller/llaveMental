import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface PayoutInfoBody {
  name?: string;
  bank?: string;
  cedula?: string;
  phone?: string;
}

// Datos de Pago Móvil donde el jugador recibe sus premios/retiros
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body: PayoutInfoBody = await req.json();
    const clamp = (v: unknown) => String(v ?? '').trim().slice(0, 80);

    const { error } = await supabase.rpc('save_payout_info', {
      p_name: clamp(body.name),
      p_bank: clamp(body.bank),
      p_cedula: clamp(body.cedula),
      p_phone: clamp(body.phone),
    });

    if (error) {
      return NextResponse.json({ error: 'No se pudieron guardar los datos' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
