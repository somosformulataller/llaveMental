import { createAdminClient } from '@/lib/supabase/admin';
import { isBankApiConfigured, validatePayment } from './bankApi';
import { DUPLICATE_MARKER } from './constants';

export interface AutoValidateResult {
  status: 'aprobado' | 'pendiente';
  tickets?: number;
  reason?: string;
}

// Textos que ve el jugador cuando la compra queda en revisión
const PENDING_REASONS: Record<string, string> = {
  not_found: 'El banco aún no refleja el pago (suele tardar 1–2 minutos).',
  amount_mismatch: 'El monto pagado no coincide con el esperado. Un administrador lo revisará.',
  amount_unknown: 'No había tasa BCV al registrar la compra. Un administrador la revisará.',
  retryable: 'El banco está tardando en responder — seguimos verificando tu pago en segundo plano.',
  error: 'Tu pago está en revisión — lo seguiremos verificando en segundo plano.',
  not_configured: 'La validación automática no está configurada. Un administrador la revisará.',
};

// Intenta validar una compra contra la API del banco. Si el pago
// existe y el monto cuadra, aprueba (RPC atómico que suma tickets).
// Cualquier otro resultado la regresa a 'pendiente' con su motivo:
// el sistema NUNCA rechaza solo (regla de oro).
export async function tryAutoValidatePurchase(purchaseId: string): Promise<AutoValidateResult> {
  const admin = createAdminClient();

  const { data: purchase, error } = await admin
    .from('ticket_purchases')
    .select('id, player_id, status, reference, amount_ves, status_note')
    .eq('id', purchaseId)
    .single();

  if (error || !purchase) return { status: 'pendiente', reason: 'Compra no encontrada' };
  if (purchase.status === 'aprobado') return { status: 'aprobado' };
  if (purchase.status === 'rechazado') return { status: 'pendiente', reason: 'Compra rechazada' };

  // Referencia repetida: revisión SOLO manual. Si la validáramos,
  // podría reclamar en el banco el pago que pertenece a otra compra.
  if (purchase.status_note?.startsWith(DUPLICATE_MARKER)) {
    return { status: 'pendiente', reason: purchase.status_note };
  }

  if (!isBankApiConfigured()) {
    await admin
      .from('ticket_purchases')
      .update({ status: 'pendiente', status_note: PENDING_REASONS.not_configured })
      .eq('id', purchaseId);
    return { status: 'pendiente', reason: PENDING_REASONS.not_configured };
  }

  await admin.from('ticket_purchases').update({ status: 'validando' }).eq('id', purchaseId);

  const result = await validatePayment({
    reference: purchase.reference,
    expectedVes: purchase.amount_ves === null ? null : Number(purchase.amount_ves),
  });

  if (result.status === 'approved') {
    const { data, error: rpcError } = await admin.rpc('approve_purchase', {
      p_purchase: purchaseId,
      p_origin: 'auto',
      p_bank: result.raw ?? null,
      p_note: null,
    });
    if (rpcError) {
      await admin
        .from('ticket_purchases')
        .update({ status: 'pendiente', status_note: PENDING_REASONS.error })
        .eq('id', purchaseId);
      return { status: 'pendiente', reason: PENDING_REASONS.error };
    }
    const tickets = (data as { tickets?: number } | null)?.tickets;
    return { status: 'aprobado', tickets };
  }

  const reason = PENDING_REASONS[result.status] ?? PENDING_REASONS.error;
  await admin
    .from('ticket_purchases')
    .update({
      status: 'pendiente',
      status_note: result.detail ? `${reason} (${result.detail})` : reason,
      ...(result.raw !== undefined && result.raw !== null ? { bank_response: result.raw } : {}),
    })
    .eq('id', purchaseId);

  return { status: 'pendiente', reason };
}
