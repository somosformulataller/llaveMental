import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { requireStaff } from '@/lib/admin/guard';
import { tryAutoValidatePurchase } from '@/lib/payments/validatePurchase';
import {
  DUPLICATE_MARKER,
  MAX_TICKETS_PER_PURCHASE,
  TICKET_PRICE_USD,
} from '@/lib/payments/constants';

// El cron externo revisa las pendientes cada 5 min, 2 por pasada y
// en orden de llegada: con eso se estima cuánto falta para que el
// banco vuelva a mirar cada compra.
const CRON_INTERVAL_MIN = 5;
const CHECKS_PER_PASS = 2;

/** ¿Esta compra la reintenta sola la validación automática? */
function isAutoRetryable(p: { status: string; status_note: string | null }): boolean {
  if (p.status !== 'pendiente' && p.status !== 'validando') return false;
  if (p.status_note?.startsWith(DUPLICATE_MARKER)) return false;
  if (p.status_note?.includes('administrador')) return false;
  return true;
}

// Transacciones (staff con área 'transacciones'): compras de tickets
// y retiros con los datos del jugador. Lecturas con la clave de
// servidor (igual que stats: no depende de que las políticas RLS de
// admin estén bien en la BD).
export async function GET() {
  try {
    const { error } = await requireStaff('transacciones');
    if (error) return error;

    const db = isAdminClientConfigured() ? createAdminClient() : await createClient();

    // last_checked_at / check_count llegan con la migración 012: si la
    // columna aún no existe, se repite la consulta sin ellas.
    const purchaseCols =
      'id, player_id, quantity, amount_usd, amount_ves, exchange_rate_used, reference, status, origin, status_note, created_at, validated_at, players(username, whatsapp, cedula, payout_cedula, payout_phone)';
    const fetchPurchases = async () => {
      const withTracking = await db
        .from('ticket_purchases')
        .select(purchaseCols.replace(', players(', ', last_checked_at, check_count, players('))
        .order('created_at', { ascending: false })
        .limit(100);
      if (!withTracking.error) return withTracking;
      return db
        .from('ticket_purchases')
        .select(purchaseCols)
        .order('created_at', { ascending: false })
        .limit(100);
    };

    const [purchasesRes, withdrawalsRes] = await Promise.all([
      fetchPurchases(),
      db
        .from('withdrawals')
        .select(
          'id, player_id, amount_usd, status, reference, admin_note, created_at, paid_at, players(username, whatsapp, cedula, payout_name, payout_bank, payout_cedula, payout_phone)'
        )
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    type PlayerRel = {
      username: string | null;
      whatsapp?: string | null;
      cedula?: string | null;
      payout_name?: string | null;
      payout_bank?: string | null;
      payout_cedula?: string | null;
      payout_phone?: string | null;
    } | null;

    type RawPurchase = {
      id: string;
      status: string;
      status_note: string | null;
      created_at: string;
      last_checked_at?: string | null;
      check_count?: number | null;
      players: PlayerRel;
      [key: string]: unknown;
    };

    const rawPurchases = (purchasesRes.data ?? []) as unknown as RawPurchase[];

    // Cola de validación automática: las pendientes que el banco va a
    // reintentar, en orden de llegada. El puesto en la cola da el
    // tiempo máximo estimado hasta el próximo intento.
    const queue = rawPurchases
      .filter(isAutoRetryable)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const queuePos = new Map(queue.map((p, i) => [p.id, i]));

    const purchases = rawPurchases.map((row) => {
      const { players, ...rest } = row;
      const pos = queuePos.get(row.id);
      const unresolved = row.status === 'pendiente' || row.status === 'validando';
      const bankState = !unresolved
        ? null
        : pos === undefined
        ? ('revision_manual' as const)
        : row.status === 'validando'
        ? ('consultando' as const)
        : ('esperando_banco' as const);
      return {
        ...rest,
        username: players?.username ?? null,
        whatsapp: players?.whatsapp ?? players?.payout_phone ?? null,
        cedula: players?.cedula ?? players?.payout_cedula ?? null,
        proof_url: null as string | null,
        bank_state: bankState,
        queue_position: pos === undefined ? null : pos + 1,
        eta_minutes:
          pos === undefined ? null : (Math.floor(pos / CHECKS_PER_PASS) + 1) * CRON_INTERVAL_MIN,
      };
    });

    // Comprobantes adjuntos (opcionales): el bucket privado guarda una
    // carpeta por compra; se firma una URL temporal para el panel.
    if (isAdminClientConfigured()) {
      try {
        const storage = createAdminClient().storage.from('payment-proofs');
        const { data: folders } = await storage.list('', { limit: 200 });
        const withProof = new Set((folders ?? []).map((f) => f.name));
        await Promise.all(
          purchases
            .filter((p) => withProof.has(p.id))
            .map(async (p) => {
              const { data: files } = await storage.list(p.id, { limit: 1 });
              const file = files?.[0];
              if (!file) return;
              const { data: signed } = await storage.createSignedUrl(
                `${p.id}/${file.name}`,
                60 * 60
              );
              p.proof_url = signed?.signedUrl ?? null;
            })
        );
      } catch {}
    }

    const withdrawals = (withdrawalsRes.data ?? []).map((row) => {
      const { players, ...rest } = row as typeof row & { players: PlayerRel };
      return {
        ...rest,
        username: players?.username ?? null,
        whatsapp: players?.whatsapp ?? players?.payout_phone ?? null,
        cedula: players?.cedula ?? players?.payout_cedula ?? null,
        payout_name: players?.payout_name ?? null,
        payout_bank: players?.payout_bank ?? null,
        payout_cedula: players?.payout_cedula ?? null,
        payout_phone: players?.payout_phone ?? null,
      };
    });

    return NextResponse.json({ purchases, withdrawals });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

interface ActionBody {
  action:
    | 'approve_purchase'
    | 'reject_purchase'
    | 'pay_withdrawal'
    | 'cancel_withdrawal'
    | 'edit_purchase';
  id: string;
  note?: string;
  reference?: string;
  quantity?: number | string;
}

// Acciones del admin sobre transacciones. Los RPCs son atómicos:
// aprobar suma tickets, rechazar los descuenta si ya estaban dados,
// cancelar un retiro devuelve el monto a la billetera.
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireStaff('transacciones');
    if (error) return error;

    if (!isAdminClientConfigured()) {
      return NextResponse.json(
        { error: 'Falta SUPABASE_SECRET_KEY en el servidor' },
        { status: 503 }
      );
    }

    const body: ActionBody = await req.json();
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

    const admin = createAdminClient();

    if (body.action === 'approve_purchase') {
      const { data, error: rpcError } = await admin.rpc('approve_purchase', {
        p_purchase: id,
        p_origin: 'manual',
        p_bank: null,
        p_note: body.note?.trim() || null,
      });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
      return NextResponse.json({ ok: true, result: data });
    }

    if (body.action === 'reject_purchase') {
      const note = body.note?.trim();
      if (!note) {
        return NextResponse.json({ error: 'Indica el motivo del rechazo' }, { status: 400 });
      }
      const { error: rpcError } = await admin.rpc('reject_purchase', {
        p_purchase: id,
        p_note: note,
      });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // Corregir una compra pendiente: la cantidad de tickets (si el
    // pago no cuadra con lo solicitado) o la referencia (si el
    // jugador la escribió mal). Tras el arreglo se reintenta la
    // validación automática de inmediato.
    if (body.action === 'edit_purchase') {
      const { data: purchase } = await admin
        .from('ticket_purchases')
        .select('id, status, quantity, reference, status_note, exchange_rate_used')
        .eq('id', id)
        .single();
      if (!purchase) {
        return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });
      }
      if (purchase.status === 'aprobado') {
        return NextResponse.json(
          {
            error:
              'La compra ya está aprobada: para corregirla, recházala (se descuentan los tickets) y apruébala de nuevo con los datos correctos.',
          },
          { status: 400 }
        );
      }
      if (purchase.status === 'rechazado') {
        return NextResponse.json(
          { error: 'La compra está rechazada: el jugador debe registrar el pago de nuevo.' },
          { status: 400 }
        );
      }

      const updates: Record<string, unknown> = {};
      const changed: string[] = [];

      if (body.quantity !== undefined) {
        const qty = Math.trunc(Number(body.quantity));
        if (!Number.isFinite(qty) || qty < 1 || qty > MAX_TICKETS_PER_PURCHASE) {
          return NextResponse.json(
            { error: `Cantidad inválida (1 a ${MAX_TICKETS_PER_PURCHASE})` },
            { status: 400 }
          );
        }
        if (qty !== purchase.quantity) {
          const amountUsd = Math.round(qty * TICKET_PRICE_USD * 100) / 100;
          const rate = purchase.exchange_rate_used;
          updates.quantity = qty;
          updates.amount_usd = amountUsd;
          updates.amount_ves = rate ? Math.round(amountUsd * Number(rate) * 100) / 100 : null;
          changed.push(`cantidad ajustada a ${qty} ticket(s)`);
        }
      }

      if (body.reference !== undefined) {
        const reference = String(body.reference).trim();
        if (reference.length < 4 || reference.length > 40) {
          return NextResponse.json({ error: 'Escribe una referencia válida' }, { status: 400 });
        }
        if (reference !== purchase.reference) {
          const norm = reference.toLowerCase().replace(/\s/g, '');
          const { data: dups } = await admin
            .from('ticket_purchases')
            .select('id')
            .eq('reference_norm', norm)
            .neq('status', 'rechazado')
            .neq('id', id)
            .limit(1);
          if ((dups?.length ?? 0) > 0) {
            return NextResponse.json(
              { error: 'Esa referencia ya está usada en otra compra.' },
              { status: 409 }
            );
          }
          updates.reference = reference;
          changed.push('referencia corregida');
        }
      }

      if (changed.length === 0) {
        return NextResponse.json({ ok: true, result: { status: purchase.status } });
      }

      // Si la referencia sigue siendo la repetida, la nota-marcador se
      // conserva (mantiene la compra en revisión 100% manual). Al
      // corregirla ya comprobamos que es única: la nota se reemplaza y
      // la validación automática vuelve a intentarlo.
      const keepDupNote =
        updates.reference === undefined && purchase.status_note?.startsWith(DUPLICATE_MARKER);
      if (!keepDupNote) {
        updates.status_note = `✏️ Editada por el equipo: ${changed.join(' y ')}.`;
      }
      updates.status = 'pendiente';

      const { error: updateError } = await admin
        .from('ticket_purchases')
        .update(updates)
        .eq('id', id);
      if (updateError) {
        const msg = updateError.code === '23505'
          ? 'Esa referencia ya está usada en otra compra.'
          : updateError.message;
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      if (!keepDupNote) {
        const result = await tryAutoValidatePurchase(id);
        return NextResponse.json({ ok: true, result });
      }
      return NextResponse.json({ ok: true, result: { status: 'pendiente' } });
    }

    if (body.action === 'pay_withdrawal') {
      const reference = body.reference?.trim();
      if (!reference) {
        return NextResponse.json(
          { error: 'Escribe la referencia del Pago Móvil que hiciste' },
          { status: 400 }
        );
      }
      const { error: rpcError } = await admin.rpc('pay_withdrawal', {
        p_withdrawal: id,
        p_reference: reference,
        p_note: body.note?.trim() || null,
      });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'cancel_withdrawal') {
      const { error: rpcError } = await admin.rpc('cancel_withdrawal', { p_withdrawal: id });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
