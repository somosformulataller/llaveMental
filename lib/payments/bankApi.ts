// Conexión con la Bank Automation API (valida pagos por Pago Móvil).
// Solo servidor: usa BANK_API_URL, BANK_API_TOKEN y BANK_API_ACCOUNT_NAME.
// El account_name aísla los pagos de esta app dentro del servicio
// compartido: solo vemos y reclamamos los pagos de nuestra cuenta.
//
// validatePayment trabaja en DOS pasos para no "quemar" un pago sin
// estar seguros:
//   1) leer sin reclamar (set_used=false) y comparar el monto
//   2) reclamar (set_used=true) para que la referencia no se reutilice
// Nunca lanza: ante cualquier duda devuelve un estado reintentable y
// la compra queda pendiente (jamás se rechaza automáticamente).

export type BankValidationStatus =
  | 'approved'
  | 'not_found'
  | 'amount_mismatch'
  | 'amount_unknown'
  | 'retryable'
  | 'error';

export interface BankValidationResult {
  status: BankValidationStatus;
  bankAmount?: number;
  detail?: string;
  raw?: unknown;
}

import { cleanEnv } from '@/lib/supabase/admin';

const TIMEOUT_MS = 12_000;

function getConfig() {
  const url = cleanEnv(process.env.BANK_API_URL);
  const token = cleanEnv(process.env.BANK_API_TOKEN);
  const accountName = cleanEnv(process.env.BANK_API_ACCOUNT_NAME);
  if (!url || !token || !accountName) return null;
  return { url: url.replace(/\/$/, ''), token, accountName };
}

export function isBankApiConfigured(): boolean {
  return getConfig() !== null;
}

// Fecha de hoy en America/Caracas (YYYY-MM-DD) para no fallar por husos
function caracasDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

type BankCall =
  | { kind: 'found'; amount: number | null; raw: unknown }
  | { kind: 'not_found'; raw: unknown }
  | { kind: 'cooldown' }
  | { kind: 'retryable'; detail: string };

async function callValidate(params: {
  reference: string;
  setUsed: boolean;
  monto?: number;
}): Promise<BankCall> {
  const config = getConfig();
  if (!config) return { kind: 'retryable', detail: 'API no configurada' };

  const qs = new URLSearchParams({
    account_name: config.accountName,
    reference: params.reference,
    date: caracasDate(),
    set_used: String(params.setUsed),
    get_used: 'false',
  });
  if (params.monto !== undefined) qs.set('monto', params.monto.toFixed(2));

  try {
    const res = await fetch(`${config.url}/transaction/validate?${qs}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 429) return { kind: 'cooldown' };
    if (res.status >= 500) return { kind: 'retryable', detail: `HTTP ${res.status}` };
    if (!res.ok) return { kind: 'retryable', detail: `HTTP ${res.status}` };

    const data = await res.json().catch(() => null);
    if (data?.success === true && data?.data) {
      const d = data.data as Record<string, unknown>;
      const amount = Number(d.monto ?? d.amount ?? d.amount_ves ?? NaN);
      return { kind: 'found', amount: Number.isFinite(amount) ? amount : null, raw: data };
    }
    return { kind: 'not_found', raw: data };
  } catch (err) {
    return {
      kind: 'retryable',
      detail: err instanceof Error ? err.message : 'error de red',
    };
  }
}

export async function validatePayment(opts: {
  reference: string;
  expectedVes: number | null;
}): Promise<BankValidationResult> {
  try {
    // Paso 1 — leer sin reclamar: ¿existe y por cuánto fue?
    const lookup = await callValidate({ reference: opts.reference, setUsed: false });

    if (lookup.kind === 'cooldown') {
      return { status: 'retryable', detail: 'Banco en pausa (429)' };
    }
    if (lookup.kind === 'retryable') {
      return { status: 'retryable', detail: lookup.detail };
    }
    if (lookup.kind === 'not_found') {
      return { status: 'not_found', raw: lookup.raw };
    }

    // Sin tasa al comprar no hay monto esperado: a revisión manual
    if (opts.expectedVes === null) {
      return { status: 'amount_unknown', bankAmount: lookup.amount ?? undefined, raw: lookup.raw };
    }

    // Comparar montos: tolerancia max(0.5 Bs, 0.5%). Pagar de más pasa.
    if (lookup.amount !== null) {
      const tolerance = Math.max(0.5, opts.expectedVes * 0.005);
      if (lookup.amount < opts.expectedVes - tolerance) {
        return {
          status: 'amount_mismatch',
          bankAmount: lookup.amount,
          detail: `Pagó Bs. ${lookup.amount.toFixed(2)} y se esperaban Bs. ${opts.expectedVes.toFixed(2)}`,
          raw: lookup.raw,
        };
      }
    }

    // Paso 2 — reclamar el movimiento para que no se reutilice
    const claim = await callValidate({
      reference: opts.reference,
      setUsed: true,
      monto: lookup.amount ?? opts.expectedVes,
    });

    if (claim.kind === 'found') {
      return { status: 'approved', bankAmount: claim.amount ?? lookup.amount ?? undefined, raw: claim.raw };
    }
    if (claim.kind === 'cooldown') {
      return { status: 'retryable', detail: 'Banco en pausa al reclamar (429)' };
    }
    return {
      status: 'retryable',
      detail: 'No se pudo reclamar el pago; se reintentará',
    };
  } catch (err) {
    return {
      status: 'error',
      detail: err instanceof Error ? err.message : 'error inesperado',
    };
  }
}
