import { NextRequest, NextResponse } from 'next/server';
import { revalidatePendingPurchases } from '@/lib/payments/backgroundRevalidate';

// Cron de Vercel (ver vercel.json): reintenta las compras pendientes
// contra el banco aunque NO haya ningún usuario conectado. Vercel
// manda el header Authorization con CRON_SECRET automáticamente.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const approved = await revalidatePendingPurchases(true);
  return NextResponse.json({ ok: true, approved });
}
