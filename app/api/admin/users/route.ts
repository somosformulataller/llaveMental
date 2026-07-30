import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: me } = await supabase.from('players').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  return null;
}

interface PlayerRow {
  id: string;
  username: string | null;
  role: string | null;
  balance: number;
  tickets: number;
  total_wagered: number;
  total_won: number;
  payout_cedula: string | null;
  created_at: string;
  blocked?: boolean;
}

// Mapa id → email de auth (players no guarda el correo)
async function loadEmailMap(admin: ReturnType<typeof createAdminClient>) {
  const map = new Map<string, string>();
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (u.email) map.set(u.id, u.email);
    }
  } catch {}
  return map;
}

function toUserRow(p: PlayerRow, email: string | null) {
  return {
    id: p.id,
    username: p.username,
    email,
    role: p.role,
    blocked: p.blocked === true,
    balance: Number(p.balance),
    tickets: Number(p.tickets ?? 0),
    total_wagered: Number(p.total_wagered),
    total_won: Number(p.total_won),
    created_at: p.created_at,
  };
}

// Gestión de usuarios (ADMIN).
// GET        → lista completa (con email y estado de bloqueo)
// GET ?id=   → ficha de un usuario (para el menú de acciones)
// GET ?q=    → buscador por nombre, correo o cédula
export async function GET(req: NextRequest) {
  try {
    const error = await requireAdmin();
    if (error) return error;
    if (!isAdminClientConfigured()) {
      return NextResponse.json({ error: 'Falta SUPABASE_SECRET_KEY en el servidor' }, { status: 503 });
    }
    const admin = createAdminClient();
    const params = req.nextUrl.searchParams;

    const id = params.get('id');
    if (id) {
      const { data } = await admin.from('players').select('*').eq('id', id).maybeSingle();
      if (!data) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
      let email: string | null = null;
      try {
        const { data: u } = await admin.auth.admin.getUserById(id);
        email = u?.user?.email ?? null;
      } catch {}
      return NextResponse.json({ user: toUserRow(data as PlayerRow, email) });
    }

    const [playersRes, emails] = await Promise.all([
      admin.from('players').select('*').order('created_at', { ascending: false }).limit(300),
      loadEmailMap(admin),
    ]);
    let rows = (playersRes.data ?? []).map((p) =>
      toUserRow(p as PlayerRow, emails.get(p.id) ?? null)
    );

    const q = params.get('q')?.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.username?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          (playersRes.data ?? [])
            .find((p) => p.id === r.id)
            ?.payout_cedula?.toLowerCase()
            .includes(q)
      );
    }

    return NextResponse.json({ users: rows });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

interface ActionBody {
  action: 'block' | 'unblock' | 'delete' | 'add_tickets';
  player_id: string;
  /** Para add_tickets: positivo suma, negativo resta */
  delta?: number;
}

export async function POST(req: NextRequest) {
  try {
    const error = await requireAdmin();
    if (error) return error;
    if (!isAdminClientConfigured()) {
      return NextResponse.json({ error: 'Falta SUPABASE_SECRET_KEY en el servidor' }, { status: 503 });
    }

    const body: ActionBody = await req.json();
    if (!body.player_id) return NextResponse.json({ error: 'Falta el jugador' }, { status: 400 });

    const admin = createAdminClient();
    const { data: target } = await admin
      .from('players')
      .select('id, username, role, tickets')
      .eq('id', body.player_id)
      .maybeSingle();
    if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    if (target.role === 'admin') {
      return NextResponse.json(
        { error: 'No puedes aplicar esta acción a un administrador' },
        { status: 400 }
      );
    }

    if (body.action === 'block' || body.action === 'unblock') {
      const { error: upError } = await admin
        .from('players')
        .update({ blocked: body.action === 'block' })
        .eq('id', body.player_id);
      if (upError) {
        return NextResponse.json(
          { error: 'No se pudo actualizar. ¿Ya corriste la migración 006_admin_users.sql?' },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, blocked: body.action === 'block' });
    }

    // Eliminar la cuenta completa: borra el usuario de auth y TODO
    // cae en cascada (players → partidas, compras, retiros, eventos,
    // chat y sus mensajes).
    if (body.action === 'delete') {
      const { error: delError } = await admin.auth.admin.deleteUser(body.player_id);
      if (delError) {
        return NextResponse.json({ error: 'No se pudo eliminar la cuenta' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'add_tickets') {
      const delta = Math.trunc(Number(body.delta));
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 500) {
        return NextResponse.json({ error: 'Cantidad inválida (entre -500 y 500)' }, { status: 400 });
      }
      const tickets = Math.max(0, (target.tickets ?? 0) + delta);
      const { error: upError } = await admin
        .from('players')
        .update({ tickets })
        .eq('id', body.player_id);
      if (upError) return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
      return NextResponse.json({ ok: true, tickets });
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
