import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Ranking de ganadores (top 50 por total ganado) + posición propia.
// El RPC get_ranking corre como SECURITY DEFINER y solo expone
// username y total ganado — nunca saldos ni datos personales.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data, error } = await supabase.rpc('get_ranking');
    if (error) {
      return NextResponse.json({ error: 'No se pudo cargar el ranking' }, { status: 500 });
    }

    const result = data as { top: unknown[]; me: unknown } | null;
    return NextResponse.json({
      top: result?.top ?? [],
      me: result?.me ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
