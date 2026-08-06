import { NextRequest, NextResponse } from 'next/server';
import { revalidatePendingPurchases } from '@/lib/payments/backgroundRevalidate';

// Cron EXTERNO (p. ej. cron-job.org cada 5 min): reintenta las compras
// pendientes contra el banco aunque NO haya ningún usuario conectado.
// Autenticación: header "Authorization: Bearer CRON_SECRET" (crons de
// Vercel) o "?key=CRON_SECRET" (servicios externos). La URL con el
// secreto está en credenciales.md.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized =
    !secret ||
    req.headers.get('authorization') === `Bearer ${secret}` ||
    req.nextUrl.searchParams.get('key') === secret;
  if (!authorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const approved = await revalidatePendingPurchases(true);
  return NextResponse.json({ ok: true, approved });
}
