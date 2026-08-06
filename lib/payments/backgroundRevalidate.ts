import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { tryAutoValidatePurchase } from './validatePurchase';
import { DUPLICATE_MARKER } from './constants';

// Reintento en SEGUNDO PLANO de compras pendientes: corre solo, sin
// esperar a que el comprador toque «Verificar de nuevo» ni tenga la
// app abierta. Se dispara desde la campanita (cualquier usuario
// conectado, cada 60 s) y desde el cron de Vercel (aunque no haya
// nadie conectado). Throttle por instancia: máximo una pasada cada
// 2 minutos y 2 consultas al banco por pasada (≈1/min, su ritmo).
let lastRun = 0;

export async function revalidatePendingPurchases(force = false): Promise<number> {
  if (!isAdminClientConfigured()) return 0;
  const now = Date.now();
  if (!force && now - lastRun < 120_000) return 0;
  lastRun = now;

  const admin = createAdminClient();
  // Solo compras con al menos 45 s de vida: la recién creada ya fue
  // validada en línea por /api/purchases al registrarse.
  const cutoff = new Date(now - 45_000).toISOString();
  const { data: pending } = await admin
    .from('ticket_purchases')
    .select('id, status_note')
    .in('status', ['pendiente', 'validando'])
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(6);

  // Las de revisión 100% manual no se reintentan (no bloquean el turno
  // de las demás): referencias duplicadas y las que esperan al admin.
  const candidates = (pending ?? [])
    .filter(
      (p) =>
        !p.status_note?.startsWith(DUPLICATE_MARKER) &&
        !p.status_note?.includes('administrador')
    )
    .slice(0, 2);

  let approved = 0;
  for (const p of candidates) {
    try {
      const r = await tryAutoValidatePurchase(p.id);
      if (r.status === 'aprobado') approved++;
    } catch {}
  }
  return approved;
}
