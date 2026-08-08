'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlayer } from '@/components/providers/PlayerProvider';
import {
  AdminPurchaseRow,
  AdminStatsResponse,
  AdminUserRow,
  AdminWithdrawalRow,
  AppEventRow,
  InteractionRow,
  InteractionSummary,
  TopEntry,
} from '@/types/game';
import { PURCHASE_STATUS_LABEL } from '@/lib/payments/constants';
import { allowedAreas } from '@/lib/admin/areas';
import AdminNav, { AdminSection } from '@/components/admin/AdminNav';
import PlayerDetail from '@/components/admin/PlayerDetail';
import StaffPanel from '@/components/admin/StaffPanel';

const fmt = (n: number) => `$${Number(n).toFixed(2)}`;
const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

// "hace 3 min" — para la última consulta al banco de cada compra
const fmtAgo = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  return `hace ${Math.floor(mins / 60)} h`;
};

const EVENT_LABEL: Record<AppEventRow['event_type'], string> = {
  login: '🔐 Inició sesión',
  app_open: '📲 Abrió la app',
  page_view: '🧭 Visitó',
  game_start: '🎟️ Empezó partida',
  game_win: '🏆 Ganó partida',
  game_lose: '💀 Perdió partida',
};

type Section = Exclude<AdminSection, 'chat'>;

// ── Filtro por período del Resumen (día de Venezuela, UTC-4) ──
type StatsRange = 'hoy' | 'ayer' | '7d' | '30d';

const RANGE_LABEL: Record<StatsRange, string> = {
  hoy: '📅 Hoy',
  ayer: '↩️ Ayer',
  '7d': '🗓️ Últimos 7 días',
  '30d': '🗓️ Últimos 30 días',
};

const CARACAS_OFFSET_MS = 4 * 3_600_000;

/** Epoch (ms) de la medianoche de hace `daysAgo` días en Venezuela */
function caracasDayStart(daysAgo: number): number {
  const shifted = new Date(Date.now() - CARACAS_OFFSET_MS);
  return (
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - daysAgo) +
    CARACAS_OFFSET_MS
  );
}

function rangeBounds(range: StatsRange): { from: number; to: number } {
  switch (range) {
    case 'hoy':
      return { from: caracasDayStart(0), to: Infinity };
    case 'ayer':
      return { from: caracasDayStart(1), to: caracasDayStart(0) };
    case '7d':
      return { from: caracasDayStart(6), to: Infinity };
    case '30d':
      return { from: caracasDayStart(29), to: Infinity };
  }
}

// Tarjeta de estadística con ícono ℹ️: al tocarlo explica qué mide
// el bloque en relación con la lógica RTP/RNG del juego.
function StatCard({
  value,
  label,
  help,
}: {
  value: string | number;
  label: string;
  help: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="stat-card">
      <button
        className="stat-info"
        onClick={() => setShow((v) => !v)}
        aria-label={`Qué significa ${label}`}
        title={help}
      >
        ℹ️
      </button>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {show && <p className="stat-help">{help}</p>}
    </div>
  );
}

// Ranking corto (top 5) para la sección Interacciones
function TopList({
  title,
  entries,
  render,
}: {
  title: string;
  entries: TopEntry[];
  render: (value: number) => string;
}) {
  return (
    <div className="top-card">
      <p className="top-title">{title}</p>
      {entries.length === 0 ? (
        <p className="top-empty">Sin datos todavía</p>
      ) : (
        <ol className="top-list">
          {entries.map((e) => (
            <li key={e.id}>
              <span className="top-name">{e.username || e.id.slice(0, 8)}</span>
              <span className="top-value">{render(Number(e.value))}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { player, isLoading, isAdmin, isStaff } = usePlayer();
  const router = useRouter();
  const [section, setSection] = useState<Section>('resumen');
  const [data, setData] = useState<AdminStatsResponse | null>(null);
  const [purchases, setPurchases] = useState<AdminPurchaseRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalRow[]>([]);
  const [interaction, setInteraction] = useState<InteractionRow[]>([]);
  const [interSummary, setInterSummary] = useState<InteractionSummary | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const [statsRange, setStatsRange] = useState<StatsRange>('hoy');
  const [flowPlayer, setFlowPlayer] = useState<string | null>(null);
  const [flowEvents, setFlowEvents] = useState<AppEventRow[]>([]);
  const [purchaseFilter, setPurchaseFilter] = useState<
    'pendientes' | 'banco' | 'aprobadas' | 'rechazadas' | 'todas'
  >('pendientes');
  const [withdrawalFilter, setWithdrawalFilter] = useState<
    'pendientes' | 'pagados' | 'cancelados' | 'todos'
  >('pendientes');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openDetail, setOpenDetail] = useState<{
    key: string;
    playerId: string;
    username: string | null;
  } | null>(null);

  // Áreas del panel visibles para este miembro del staff (un admin
  // sin restricciones ve todo; atención al cliente, solo lo asignado)
  const allowed = useMemo(
    () => allowedAreas(player?.role, player?.panel_areas),
    [player]
  );

  // Solo staff: los demás vuelven al inicio (la API y RLS también protegen)
  useEffect(() => {
    if (!isLoading && !isStaff) router.replace(player ? '/game' : '/auth/login');
  }, [isLoading, isStaff, player, router]);

  // Sección inicial desde la URL (/admin?s=usuarios) — permite que el
  // menú lateral del chat navegue directo a una sección.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('s');
    if (
      s &&
      ['resumen', 'usuarios', 'transacciones', 'interacciones', 'partidas', 'equipo'].includes(s)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronización única con la URL
      setSection(s as Section);
    }
  }, []);

  // Si la sección actual no está permitida para esta cuenta, saltar
  // a la primera que sí lo esté (p. ej. atención sin Resumen).
  useEffect(() => {
    if (!player || allowed.length === 0) return;
    if (!allowed.includes(section)) {
      const first = allowed.find((a) => a !== 'chat') ?? 'chat';
      if (first === 'chat') {
        router.replace('/admin/chat');
        return;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- corrección única de la sección
      setSection(first as Section);
    }
  }, [player, allowed, section, router]);

  const selectSection = (s: Section) => {
    setSection(s);
    window.history.replaceState(null, '', `/admin?s=${s}`);
  };

  // Solo se piden las áreas permitidas (las demás responderían 403)
  const loadAll = useCallback(async () => {
    if (allowed.length === 0) return;
    const can = (a: string) => allowed.includes(a as (typeof allowed)[number]);
    try {
      const skip = Promise.resolve(null);
      const [statsRes, paymentsRes, interactionRes, usersRes] = await Promise.all([
        can('resumen') || can('partidas')
          ? fetch('/api/admin/stats', { cache: 'no-store' })
          : skip,
        can('transacciones') ? fetch('/api/admin/payments', { cache: 'no-store' }) : skip,
        can('interacciones') ? fetch('/api/admin/interaction', { cache: 'no-store' }) : skip,
        can('usuarios') ? fetch('/api/admin/users', { cache: 'no-store' }) : skip,
      ]);
      if (statsRes) {
        const stats = await statsRes.json();
        if (!statsRes.ok) setError(stats.error || 'Error al cargar estadísticas');
        else {
          setData(stats);
          setError(null);
        }
      } else {
        setError(null);
      }
      if (paymentsRes?.ok) {
        const payments = await paymentsRes.json();
        setPurchases(payments.purchases ?? []);
        setWithdrawals(payments.withdrawals ?? []);
      }
      if (interactionRes?.ok) {
        const inter = await interactionRes.json();
        setInteraction(inter.players ?? []);
        setInterSummary(inter.summary ?? null);
      }
      if (usersRes?.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.users ?? []);
      }
    } catch {
      setError('Error de conexión');
    }
  }, [allowed]);

  useEffect(() => {
    if (!isStaff) return;
    // La carga es asíncrona: el setState ocurre tras el fetch, no en
    // el cuerpo del efecto (falso positivo del compilador).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    const interval = setInterval(loadAll, 30_000); // refresco en vivo
    return () => clearInterval(interval);
  }, [isStaff, loadAll]);

  const doAction = async (body: Record<string, string>) => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) alert(json.error || 'No se pudo completar la acción');
      await loadAll();
    } catch {
      alert('Error de conexión');
    } finally {
      setBusy(false);
    }
  };

  const approvePurchase = (p: AdminPurchaseRow) => {
    if (!confirm(`¿Aprobar ${p.quantity} ticket(s) de ${p.username || p.player_id.slice(0, 8)}?`))
      return;
    doAction({ action: 'approve_purchase', id: p.id });
  };

  const rejectPurchase = (p: AdminPurchaseRow) => {
    const note = prompt(
      `Motivo del rechazo del pago con referencia ${p.reference}:` +
        (p.status === 'aprobado' ? '\n(Se le descontarán los tickets acreditados.)' : '')
    );
    if (!note?.trim()) return;
    doAction({ action: 'reject_purchase', id: p.id, note: note.trim() });
  };

  // Corregir la cantidad de tickets: cuando el pago real no cuadra
  // con lo que el jugador solicitó (el monto esperado se recalcula).
  const editQuantity = (p: AdminPurchaseRow) => {
    const input = prompt(
      `Cantidad de tickets a aprobar para ${p.username || p.player_id.slice(0, 8)}\n` +
        `(solicitó ${p.quantity} 🎟️ = ${fmt(Number(p.amount_usd))}). El monto esperado se recalcula:`,
      String(p.quantity)
    );
    if (input === null) return;
    const qty = Number(input.trim());
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      alert('Cantidad inválida (1 a 50).');
      return;
    }
    if (qty === p.quantity) return;
    doAction({ action: 'edit_purchase', id: p.id, quantity: String(qty) });
  };

  // Corregir la referencia: cuando el jugador la escribió mal. Tras
  // el cambio, el banco la verifica de nuevo enseguida.
  const editReference = (p: AdminPurchaseRow) => {
    const input = prompt(
      'Nuevo número de referencia del pago (se volverá a verificar con el banco):',
      p.reference
    );
    if (!input?.trim() || input.trim() === p.reference) return;
    doAction({ action: 'edit_purchase', id: p.id, reference: input.trim() });
  };

  const payWithdrawal = (w: AdminWithdrawalRow) => {
    const reference = prompt(
      `Retiro de ${fmt(Number(w.amount_usd))} a ${w.username || 'jugador'}.\n` +
        'Escribe el número de referencia del Pago Móvil que hiciste:'
    );
    if (!reference?.trim()) return;
    doAction({ action: 'pay_withdrawal', id: w.id, reference: reference.trim() });
  };

  const cancelWithdrawal = (w: AdminWithdrawalRow) => {
    if (
      !confirm(
        `¿Cancelar el retiro de ${fmt(Number(w.amount_usd))}? El monto vuelve a la billetera del jugador.`
      )
    )
      return;
    doAction({ action: 'cancel_withdrawal', id: w.id });
  };

  const toggleFlow = async (id: string) => {
    if (flowPlayer === id) {
      setFlowPlayer(null);
      setFlowEvents([]);
      return;
    }
    setFlowPlayer(id);
    setFlowEvents([]);
    try {
      const res = await fetch(`/api/admin/interaction?player=${id}`, { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) setFlowEvents(json.events ?? []);
    } catch {}
  };

  const copyPayoutData = (w: AdminWithdrawalRow) => {
    const text = `Nombre: ${w.payout_name ?? '—'}\nBanco: ${w.payout_bank ?? '—'}\nCédula: ${w.payout_cedula ?? '—'}\nTeléfono: ${w.payout_phone ?? '—'}`;
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  if (!isStaff || !player) return null;

  // Detalle del jugador expandido DEBAJO de su fila (tipo acordeón,
  // sin modal). La clave es única por fila para no abrir duplicados.
  const playerBtn = (key: string, playerId: string, username: string | null) => {
    const isOpen = openDetail?.key === key;
    return (
      <button
        className={`pchip ${isOpen ? 'pchip-open' : ''}`}
        onClick={() =>
          setOpenDetail(isOpen ? null : { key, playerId, username })
        }
      >
        {username || playerId.slice(0, 8)}{' '}
        <span className="pchip-caret">{isOpen ? '▴' : '▾'}</span>
      </button>
    );
  };

  const detailRow = (key: string, colSpan: number) =>
    openDetail?.key === key ? (
      <tr className="pdetail-tr">
        <td colSpan={colSpan}>
          <PlayerDetail
            playerId={openDetail.playerId}
            username={openDetail.username}
            onChanged={loadAll}
            onDeleted={() => {
              setOpenDetail(null);
              loadAll();
            }}
          />
        </td>
      </tr>
    ) : null;

  const stats = data?.stats;

  // ── Métricas del período elegido (Resumen): recargas y retiros ──
  const { from, to } = rangeBounds(statsRange);
  const inRange = (iso: string | null | undefined, fallback: string) => {
    const t = new Date(iso ?? fallback).getTime();
    return t >= from && t < to;
  };
  const periodPurchases = (data?.finance?.purchases ?? []).filter((p) =>
    inRange(p.validated_at, p.created_at)
  );
  const periodWithdrawals = (data?.finance?.withdrawals ?? []).filter((w) =>
    inRange(w.paid_at, w.created_at)
  );
  const periodCollected = periodPurchases.reduce((s, p) => s + Number(p.amount_usd), 0);
  const periodWithdrawn = periodWithdrawals.reduce((s, w) => s + Number(w.amount_usd), 0);

  // ── Buscador de Transacciones: referencia (completa o últimos
  // dígitos), nombre, teléfono o cédula ──
  const tq = txSearch.trim().toLowerCase().replace(/\s/g, '');
  const matchesTx = (row: {
    reference?: string | null;
    username: string | null;
    whatsapp?: string | null;
    cedula?: string | null;
    payout_phone?: string | null;
    payout_cedula?: string | null;
  }) => {
    if (!tq) return true;
    const haystacks = [
      row.reference,
      row.username,
      row.whatsapp,
      row.cedula,
      row.payout_phone,
      row.payout_cedula,
    ];
    return haystacks.some((h) => h?.toLowerCase().replace(/\s/g, '').includes(tq));
  };
  const searchedPurchases = purchases.filter(matchesTx);
  const searchedWithdrawals = withdrawals.filter(matchesTx);

  // Cada compra vive en SU filtro. Las no resueltas se separan en dos:
  // las que el banco sigue verificando solo (🏦 En proceso) y las que
  // esperan una decisión del equipo (🕒 Pendientes: referencias
  // repetidas, montos que no cuadran, etc.).
  const inBankQueue = (p: AdminPurchaseRow) =>
    p.bank_state === 'esperando_banco' || p.bank_state === 'consultando';
  const unresolvedPurchases = searchedPurchases.filter(
    (p) => p.status === 'pendiente' || p.status === 'validando'
  );
  const purchaseBuckets = {
    pendientes: unresolvedPurchases.filter((p) => !inBankQueue(p)),
    banco: unresolvedPurchases.filter(inBankQueue),
    aprobadas: searchedPurchases.filter((p) => p.status === 'aprobado'),
    rechazadas: searchedPurchases.filter((p) => p.status === 'rechazado'),
    todas: searchedPurchases,
  } as const;
  const visiblePurchases = purchaseBuckets[purchaseFilter];
  const pendingWithdrawals = searchedWithdrawals.filter((w) => w.status === 'pendiente');
  const otherWithdrawals = searchedWithdrawals.filter((w) => w.status !== 'pendiente');
  const withdrawalBuckets = {
    pendientes: pendingWithdrawals,
    pagados: searchedWithdrawals.filter((w) => w.status === 'pagado'),
    cancelados: searchedWithdrawals.filter((w) => w.status === 'cancelado'),
    todos: [...pendingWithdrawals, ...otherWithdrawals],
  } as const;
  const visibleWithdrawals = withdrawalBuckets[withdrawalFilter];

  const q = userSearch.trim().toLowerCase();
  const visibleUsers = q
    ? users.filter(
        (u) =>
          u.username?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.whatsapp?.toLowerCase().replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
          u.cedula?.toLowerCase().replace(/\s/g, '').includes(q.replace(/\s/g, ''))
      )
    : users;

  return (
    <main className="admin-main">
      <h1 className="admin-title">👑 Panel de Administración</h1>
      <p className="admin-subtitle">Se actualiza cada 30s · toca el nombre de un jugador en cualquier tabla para ver sus acciones</p>

      {error && <div className="auth-error">⚠️ {error}</div>}

      <div className="admin-shell">
        <AdminNav active={section} onSelect={selectSection} allowed={allowed} />

        <div className="admin-content">
          {/* ── RESUMEN ── */}
          {section === 'resumen' && (
            <>
              {/* Métricas del período: recargas, retiros y ganancia neta */}
              <div className="admin-filter-row">
                {(Object.keys(RANGE_LABEL) as StatsRange[]).map((r) => (
                  <button
                    key={r}
                    className={`btn-mini ${statsRange === r ? 'btn-mini-active' : ''}`}
                    onClick={() => setStatsRange(r)}
                  >
                    {RANGE_LABEL[r]}
                  </button>
                ))}
              </div>
              <div className="admin-stats-grid">
                <StatCard
                  value={data?.finance ? periodPurchases.length : '—'}
                  label="Cantidad de recargas"
                  help="Compras de tickets APROBADAS en el período elegido (pagos reales por Pago Móvil, automáticos o aprobados a mano)."
                />
                <StatCard
                  value={data?.finance ? fmt(periodCollected) : '—'}
                  label="💵 Total recargado"
                  help="Dinero real que entró en el período: la suma de las compras de tickets aprobadas."
                />
                <StatCard
                  value={data?.finance ? periodWithdrawals.length : '—'}
                  label="Cantidad de retiros"
                  help="Retiros PAGADOS a los jugadores en el período elegido."
                />
                <StatCard
                  value={data?.finance ? fmt(periodWithdrawn) : '—'}
                  label="💸 Total retirado"
                  help="Dinero real que salió en el período: la suma de los retiros ya pagados."
                />
                <StatCard
                  value={data?.finance ? fmt(periodCollected - periodWithdrawn) : '—'}
                  label="Ganancia neta"
                  help="Recargado menos retirado en el período: el flujo de caja real. No incluye lo que los jugadores aún tienen en sus billeteras (eso se debe)."
                />
              </div>

              <div className="admin-stats-grid">
                <StatCard
                  value={stats ? stats.total_players : '—'}
                  label="Jugadores"
                  help="Cuentas registradas en la app (incluye al administrador, que no juega)."
                />
                <StatCard
                  value={stats ? stats.total_tickets : '—'}
                  label="Partidas jugadas"
                  help="Partidas terminadas. Cada partida consume 1 ticket de $2.00 y su resultado lo decide el RNG del servidor al empezar."
                />
                <StatCard
                  value={stats ? fmt(stats.total_wagered) : '—'}
                  label="Total apostado"
                  help="Todo lo apostado por los jugadores: $2.00 por cada partida jugada. Es la base sobre la que se calcula el RTP."
                />
                <StatCard
                  value={stats ? fmt(stats.total_paid) : '—'}
                  label="Total en premios"
                  help="Suma de los premios que el RNG ha otorgado (de $0 a $10 por partida), acreditados al saldo de los jugadores."
                />
                <StatCard
                  value={
                    stats
                      ? stats.rtp_real !== null
                        ? `${(stats.rtp_real * 100).toFixed(1)}%`
                        : 'N/A'
                      : '—'
                  }
                  label="RTP real"
                  help="Porcentaje de lo apostado que se ha pagado en premios HASTA AHORA. El RTP teórico es 98%: con pocas partidas fluctúa mucho (puede superar 100%); con volumen converge al 98%."
                />
                <StatCard
                  value={stats ? fmt(stats.house_profit) : '—'}
                  label="Ganancia del juego"
                  help="Apostado menos premios: la ganancia de la LÓGICA del juego. A largo plazo tiende al 2% de lo apostado (≈$0.04 por partida); en rachas cortas puede ser negativa."
                />
              </div>
              <p className="admin-hint">
                📐 RTP teórico: <strong>98%</strong> — la casa retiene un <strong>2%</strong> de lo
                apostado (premio esperado $1.96 por ticket de $2.00 ≈ $0.04 de ganancia por
                partida en promedio). Toca el ℹ️ de cada bloque para ver qué mide.
              </p>

              <div className="admin-stats-grid">
                <StatCard
                  value={stats ? fmt(stats.total_collected) : '—'}
                  label="💵 Recaudado (compras)"
                  help="Dinero REAL que entró: compras de tickets aprobadas por Pago Móvil. (Los tickets recargados a mano por el admin no suman aquí.)"
                />
                <StatCard
                  value={stats ? fmt(stats.total_withdrawn) : '—'}
                  label="💸 Retiros pagados"
                  help="Dinero real que ya salió: retiros pagados a los jugadores por Pago Móvil."
                />
                <StatCard
                  value={stats ? fmt(stats.pending_withdrawals) : '—'}
                  label="⏳ Retiros por pagar"
                  help="Monto que los jugadores solicitaron retirar y aún no has pagado (ya está descontado de sus billeteras)."
                />
                <StatCard
                  value={stats ? fmt(stats.balance_owed) : '—'}
                  label="👛 Saldo en billeteras"
                  help="Premios acumulados que los jugadores todavía no canjean ni retiran: es dinero que se les debe."
                />
                <StatCard
                  value={stats ? stats.tickets_circulating : '—'}
                  label="🎟️ Tickets sin jugar"
                  help="Tickets comprados o recargados que aún no se han usado. Cada uno equivale a una partida de $2.00 pendiente de jugarse."
                />
                <StatCard
                  value={stats ? stats.active_sessions : '—'}
                  label="Partidas activas"
                  help="Partidas a medias en este momento: el jugador puede salir y volver a continuarlas cuando quiera."
                />
              </div>
            </>
          )}

          {/* ── USUARIOS ── */}
          {section === 'usuarios' && (
            <section className="admin-section">
              <h2 className="admin-section-title">👥 Usuarios</h2>
              <input
                className="chat-input users-search"
                placeholder="Buscar por nombre, correo, teléfono o cédula…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Correo</th>
                      <th>Estado</th>
                      <th>Saldo</th>
                      <th>Tickets</th>
                      <th>Apostado</th>
                      <th>Ganado</th>
                      <th>Ganancia nuestra</th>
                      <th>Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((u) => {
                      const houseTake = Number(u.total_wagered) - Number(u.total_won);
                      return (
                        <Fragment key={u.id}>
                          <tr>
                            <td>
                              {u.role === 'admin' ? (
                                <>👑 {u.username || u.id.slice(0, 8)}</>
                              ) : (
                                playerBtn(u.id, u.id, u.username)
                              )}
                            </td>
                            <td>{u.email ?? '—'}</td>
                            <td>
                              {u.role === 'admin' ? (
                                'admin'
                              ) : u.blocked ? (
                                <span className="badge-blocked">Bloqueado</span>
                              ) : (
                                'activo'
                              )}
                            </td>
                            <td>{fmt(u.balance)}</td>
                            <td>{u.tickets}</td>
                            <td>{fmt(u.total_wagered)}</td>
                            <td>{fmt(u.total_won)}</td>
                            <td className={houseTake >= 0 ? 'admin-win' : 'admin-lose'}>
                              {houseTake >= 0 ? '+' : '−'}
                              {fmt(Math.abs(houseTake))}
                            </td>
                            <td>{fmtDate(u.created_at)}</td>
                          </tr>
                          {detailRow(u.id, 9)}
                        </Fragment>
                      );
                    })}
                    {visibleUsers.length === 0 && (
                      <tr>
                        <td colSpan={9}>{q ? 'Sin resultados.' : 'Sin usuarios todavía'}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── TRANSACCIONES ── */}
          {section === 'transacciones' && (
            <>
              <section className="admin-section">
                <h2 className="admin-section-title">🎫 Compras de tickets</h2>
                <input
                  className="chat-input users-search"
                  placeholder="Buscar por referencia (completa o últimos 6 dígitos), nombre, teléfono o cédula…"
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                />
                <div className="admin-filter-row">
                  <button
                    className={`btn-mini ${purchaseFilter === 'pendientes' ? 'btn-mini-active' : ''}`}
                    onClick={() => setPurchaseFilter('pendientes')}
                  >
                    🕒 Pendientes ({purchaseBuckets.pendientes.length})
                  </button>
                  <button
                    className={`btn-mini ${purchaseFilter === 'banco' ? 'btn-mini-active' : ''}`}
                    onClick={() => setPurchaseFilter('banco')}
                  >
                    🏦 En proceso (banco) ({purchaseBuckets.banco.length})
                  </button>
                  <button
                    className={`btn-mini ${purchaseFilter === 'aprobadas' ? 'btn-mini-active' : ''}`}
                    onClick={() => setPurchaseFilter('aprobadas')}
                  >
                    ✅ Aprobadas ({purchaseBuckets.aprobadas.length})
                  </button>
                  <button
                    className={`btn-mini ${purchaseFilter === 'rechazadas' ? 'btn-mini-active' : ''}`}
                    onClick={() => setPurchaseFilter('rechazadas')}
                  >
                    ❌ Rechazadas ({purchaseBuckets.rechazadas.length})
                  </button>
                  <button
                    className={`btn-mini ${purchaseFilter === 'todas' ? 'btn-mini-active' : ''}`}
                    onClick={() => setPurchaseFilter('todas')}
                  >
                    Todas ({searchedPurchases.length})
                  </button>
                  <span className="admin-hint">
                    🏦 En proceso: el banco las sigue verificando solo y las aprueba al confirmar
                    el pago. 🕒 Pendientes: esperan una decisión del equipo. La validación
                    automática nunca rechaza: rechazar es siempre decisión tuya.
                  </span>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Usuario</th>
                        <th>Referencia</th>
                        <th>Monto</th>
                        <th>Estado</th>
                        <th>Origen</th>
                        <th className="admin-th-actions">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePurchases.map((p) => (
                        <Fragment key={p.id}>
                        <tr>
                          <td>{fmtDate(p.created_at)}</td>
                          <td>{playerBtn(p.id, p.player_id, p.username)}</td>
                          <td>
                            {p.reference}
                            {p.proof_url && (
                              <div>
                                <a
                                  className="proof-link"
                                  href={p.proof_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  📎 Ver comprobante
                                </a>
                              </div>
                            )}
                          </td>
                          <td>
                            {fmt(Number(p.amount_usd))}
                            {p.amount_ves !== null ? ` · Bs. ${Number(p.amount_ves).toFixed(2)}` : ''} ·{' '}
                            {p.quantity} 🎟️
                          </td>
                          <td>
                            <span className={`status-badge status-${p.status}`}>
                              {PURCHASE_STATUS_LABEL[p.status]}
                            </span>
                            {p.bank_state === 'esperando_banco' && (
                              <div className="admin-note bank-note">
                                🏦 Esperando validación del banco — próximo intento en ≤
                                {p.eta_minutes ?? 5} min
                                {p.queue_position && p.queue_position > 1
                                  ? ` (puesto ${p.queue_position} en la cola)`
                                  : ''}
                                {p.check_count
                                  ? ` · consultado ${p.check_count} ${p.check_count === 1 ? 'vez' : 'veces'}`
                                  : ''}
                                {p.last_checked_at ? ` · última ${fmtAgo(p.last_checked_at)}` : ''}
                              </div>
                            )}
                            {p.bank_state === 'consultando' && (
                              <div className="admin-note bank-note">
                                🏦 Consultando al banco en este momento…
                              </div>
                            )}
                            {p.bank_state === 'revision_manual' && (
                              <div className="admin-note">👤 Requiere revisión manual del equipo</div>
                            )}
                            {p.status_note && (
                              <div
                                className={`admin-note ${
                                  p.status_note.startsWith('⚠') ? 'admin-note-warn' : ''
                                }`}
                              >
                                {p.status_note}
                              </div>
                            )}
                          </td>
                          <td>{p.origin === 'auto' ? 'Automático' : p.origin === 'manual' ? 'Manual' : '—'}</td>
                          <td className="admin-actions">
                            {p.status !== 'aprobado' && (
                              <button className="btn-mini btn-ok" onClick={() => approvePurchase(p)} disabled={busy}>
                                ✓ Aprobar
                              </button>
                            )}
                            {(p.status === 'pendiente' || p.status === 'validando') && (
                              <>
                                <button className="btn-mini" onClick={() => editQuantity(p)} disabled={busy}>
                                  🎟️ Cantidad
                                </button>
                                <button className="btn-mini" onClick={() => editReference(p)} disabled={busy}>
                                  ✏️ Referencia
                                </button>
                              </>
                            )}
                            {p.status !== 'rechazado' && (
                              <button className="btn-mini btn-danger" onClick={() => rejectPurchase(p)} disabled={busy}>
                                ✕ Rechazar
                              </button>
                            )}
                          </td>
                        </tr>
                        {detailRow(p.id, 7)}
                        </Fragment>
                      ))}
                      {visiblePurchases.length === 0 && (
                        <tr>
                          <td colSpan={7}>
                            {tq
                              ? 'Sin resultados para esa búsqueda.'
                              : purchaseFilter === 'todas'
                              ? 'Sin compras todavía'
                              : purchaseFilter === 'banco'
                              ? 'Ninguna compra en proceso de validación del banco'
                              : `Sin compras ${purchaseFilter}`}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-section">
                <h2 className="admin-section-title">💸 Retiros</h2>
                <p className="admin-hint">
                  Paga por Pago Móvil a los datos del jugador y luego marca el retiro como pagado.
                </p>
                <div className="admin-filter-row">
                  <button
                    className={`btn-mini ${withdrawalFilter === 'pendientes' ? 'btn-mini-active' : ''}`}
                    onClick={() => setWithdrawalFilter('pendientes')}
                  >
                    🕒 Pendientes ({withdrawalBuckets.pendientes.length})
                  </button>
                  <button
                    className={`btn-mini ${withdrawalFilter === 'pagados' ? 'btn-mini-active' : ''}`}
                    onClick={() => setWithdrawalFilter('pagados')}
                  >
                    ✅ Pagados ({withdrawalBuckets.pagados.length})
                  </button>
                  <button
                    className={`btn-mini ${withdrawalFilter === 'cancelados' ? 'btn-mini-active' : ''}`}
                    onClick={() => setWithdrawalFilter('cancelados')}
                  >
                    ↩️ Cancelados ({withdrawalBuckets.cancelados.length})
                  </button>
                  <button
                    className={`btn-mini ${withdrawalFilter === 'todos' ? 'btn-mini-active' : ''}`}
                    onClick={() => setWithdrawalFilter('todos')}
                  >
                    Todos ({searchedWithdrawals.length})
                  </button>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Jugador</th>
                        <th>Monto</th>
                        <th>Datos de Pago Móvil</th>
                        <th>Estado</th>
                        <th className="admin-th-actions">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleWithdrawals.map((w) => (
                        <Fragment key={w.id}>
                        <tr>
                          <td>{fmtDate(w.created_at)}</td>
                          <td>{playerBtn(w.id, w.player_id, w.username)}</td>
                          <td>{fmt(Number(w.amount_usd))}</td>
                          <td>
                            {w.payout_name || w.payout_phone ? (
                              <>
                                {w.payout_name ?? '—'} · {w.payout_bank ?? '—'} · {w.payout_cedula ?? '—'} ·{' '}
                                {w.payout_phone ?? '—'}{' '}
                                <button className="btn-mini" onClick={() => copyPayoutData(w)}>
                                  📋 Copiar
                                </button>
                              </>
                            ) : (
                              <em>Sin datos cargados</em>
                            )}
                          </td>
                          <td>
                            <span
                              className={`status-badge status-${
                                w.status === 'pagado'
                                  ? 'aprobado'
                                  : w.status === 'cancelado'
                                  ? 'rechazado'
                                  : 'pendiente'
                              }`}
                            >
                              {w.status === 'pendiente' ? 'Quiere retirar' : w.status === 'pagado' ? 'Pagado' : 'Cancelado'}
                            </span>
                            {w.reference && <div className="admin-note">Ref: {w.reference}</div>}
                          </td>
                          <td className="admin-actions">
                            {w.status === 'pendiente' && (
                              <>
                                <button className="btn-mini btn-ok" onClick={() => payWithdrawal(w)} disabled={busy}>
                                  ✓ Pagar {fmt(Number(w.amount_usd))}
                                </button>
                                <button className="btn-mini btn-danger" onClick={() => cancelWithdrawal(w)} disabled={busy}>
                                  ✕ Cancelar
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                        {detailRow(w.id, 6)}
                        </Fragment>
                      ))}
                      {visibleWithdrawals.length === 0 && (
                        <tr>
                          <td colSpan={6}>
                            {tq
                              ? 'Sin resultados para esa búsqueda.'
                              : `Sin retiros ${withdrawalFilter === 'todos' ? 'todavía' : withdrawalFilter}`}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* ── INTERACCIONES ── */}
          {section === 'interacciones' && (
            <section className="admin-section">
              <h2 className="admin-section-title">📊 Interacción de los jugadores</h2>

              {/* Contadores globales */}
              {interSummary && (
                <>
                  <div className="admin-stats-grid">
                    <StatCard
                      value={interSummary.total_games}
                      label="Total de partidas"
                      help="Partidas terminadas por todos los jugadores desde el inicio."
                    />
                    <StatCard
                      value={interSummary.players_played}
                      label="Usuarios que jugaron"
                      help="Jugadores distintos que han terminado al menos una partida."
                    />
                    <StatCard
                      value={interSummary.manual_recharges}
                      label="Recargas manuales"
                      help="Compras de tickets aprobadas A MANO por el equipo del panel."
                    />
                    <StatCard
                      value={interSummary.auto_recharges}
                      label="Recargas automáticas"
                      help="Compras aprobadas por la validación automática contra la API del banco (sin intervención del equipo)."
                    />
                  </div>

                  {/* Tops de jugadores */}
                  <div className="top-grid">
                    <TopList
                      title="💰 Más saldo"
                      entries={interSummary.top_balance}
                      render={(v) => fmt(v)}
                    />
                    <TopList
                      title="🗝️ Más jugadas"
                      entries={interSummary.top_games}
                      render={(v) => `${v} partida${v === 1 ? '' : 's'}`}
                    />
                    <TopList
                      title="🎫 Más recargas"
                      entries={interSummary.top_purchases}
                      render={(v) => `${v} recarga${v === 1 ? '' : 's'}`}
                    />
                    <TopList
                      title="💸 Más retiros"
                      entries={interSummary.top_withdrawals}
                      render={(v) => `${v} retiro${v === 1 ? '' : 's'}`}
                    />
                  </div>
                </>
              )}

              <p className="admin-hint">
                Toca la flecha para ver el flujo del jugador en la app; toca su nombre para las acciones.
              </p>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Jugador</th>
                      <th>Sesiones</th>
                      <th>Vistas</th>
                      <th>Partidas</th>
                      <th>Ganadas</th>
                      <th>Perdidas</th>
                      <th>Gastado</th>
                      <th>Ganado</th>
                      <th>Última actividad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interaction.map((p) => (
                      <Fragment key={p.id}>
                        <tr>
                          <td>
                            <button
                              className="btn-mini"
                              onClick={() => toggleFlow(p.id)}
                              aria-label="Ver flujo"
                            >
                              {flowPlayer === p.id ? '▼' : '▶'}
                            </button>{' '}
                            {playerBtn(`i-${p.id}`, p.id, p.username)}
                          </td>
                          <td>{p.logins + p.app_opens}</td>
                          <td>{p.page_views}</td>
                          <td>{p.games}</td>
                          <td className="admin-win">{p.wins}</td>
                          <td className="admin-lose">{p.losses}</td>
                          <td>{fmt(Number(p.total_wagered))}</td>
                          <td>{fmt(Number(p.total_won))}</td>
                          <td>{fmtDate(p.last_seen)}</td>
                        </tr>
                        {detailRow(`i-${p.id}`, 9)}
                        {flowPlayer === p.id && (
                          <tr>
                            <td colSpan={9}>
                              {flowEvents.length === 0 ? (
                                <em>Sin eventos registrados todavía</em>
                              ) : (
                                <ul className="flow-list">
                                  {flowEvents.map((e) => (
                                    <li key={e.id}>
                                      <span className="flow-date">{fmtDate(e.created_at)}</span>{' '}
                                      {EVENT_LABEL[e.event_type]}
                                      {e.path ? ` ${e.path}` : ''}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {interaction.length === 0 && (
                      <tr>
                        <td colSpan={9}>Sin datos de interacción todavía</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── PARTIDAS ── */}
          {section === 'partidas' && (
            <section className="admin-section">
              <h2 className="admin-section-title">🗝️ Últimas partidas</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Jugador</th>
                      <th>Llaves usadas</th>
                      <th>Premio</th>
                      <th>Ganancia nuestra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recent_games ?? []).map((g) => {
                      // Cada partida cuesta 1 ticket ($2.00): lo que no se
                      // paga en premio queda para la casa (y al revés).
                      const houseTake = 2 - Number(g.payout);
                      return (
                        <Fragment key={g.id}>
                          <tr>
                            <td>{fmtDate(g.created_at)}</td>
                            <td>{playerBtn(g.id, g.player_id, g.username ?? null)}</td>
                            <td>{g.keys_tried_count}</td>
                            <td className={Number(g.payout) > 0 ? 'admin-win' : 'admin-lose'}>
                              {fmt(Number(g.payout))}
                            </td>
                            <td className={houseTake >= 0 ? 'admin-win' : 'admin-lose'}>
                              {houseTake >= 0 ? '+' : '−'}
                              {fmt(Math.abs(houseTake))}
                            </td>
                          </tr>
                          {detailRow(g.id, 5)}
                        </Fragment>
                      );
                    })}
                    {data && data.recent_games.length === 0 && (
                      <tr>
                        <td colSpan={5}>Sin partidas todavía</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── EQUIPO (solo rol admin) ── */}
          {section === 'equipo' && isAdmin && <StaffPanel myId={player.id} />}
        </div>
      </div>
    </main>
  );
}
