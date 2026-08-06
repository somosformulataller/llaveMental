import { NextRequest, NextResponse, after } from 'next/server';
import { revalidatePendingPurchases } from '@/lib/payments/backgroundRevalidate';

// Cron EXTERNO (p. ej. cron-job.org cada 5 min): reintenta las compras
// pendientes contra el banco aunque NO haya ningún usuario conectado.
// Autenticación: header "Authorization: Bearer CRON_SECRET" (crons de
// Vercel) o "?key=CRON_SECRET" (servicios externos). La URL con el
// secreto está en credenciales.md.
//
// Responde AL INSTANTE y valida después (after()): el banco puede
// tardar >30 s con varias pendientes y cron-job.org corta a los 30 s —
// marcaría fallo aunque el trabajo se hiciera igual.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized =
    !secret ||
    req.headers.get('authorization') === `Bearer ${secret}` ||
    req.nextUrl.searchParams.get('key') === secret;
  if (!authorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  after(() => revalidatePendingPurchases(true).catch(() => {}));
  return NextResponse.json({ ok: true, scheduled: true });
}
