import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminClientConfigured } from '@/lib/supabase/admin';
import { tryAutoValidatePurchase } from '@/lib/payments/validatePurchase';

// "Verificar ahora": reintenta validar las compras pendientes del
// jugador contra el banco. También lo dispara la app sola cada 60 s
// mientras haya pagos en revisión.
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    if (!isAdminClientConfigured()) {
      return NextResponse.json({ results: [], approved: 0 });
    }

    const { data: pending } = await supabase
      .from('ticket_purchases')
      .select('id')
      .in('status', ['pendiente', 'validando'])
      .order('created_at', { ascending: true })
      .limit(3);

    const results: { id: string; status: string; tickets: number | null }[] = [];
    // Secuencial a propósito: el banco permite ~1 consulta por minuto
    for (const p of pending ?? []) {
      const r = await tryAutoValidatePurchase(p.id);
      results.push({ id: p.id, status: r.status, tickets: r.tickets ?? null });
      if (r.status !== 'aprobado') break; // cooldown probable: no insistir
    }

    return NextResponse.json({
      results,
      approved: results.filter((r) => r.status === 'aprobado').length,
    });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
