'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlayer } from '@/components/providers/PlayerProvider';
import {
  AdminPurchaseRow,
  AdminStatsResponse,
  AdminUserRow,
  AdminWithdrawalRow,
  AppEventRow,
  InteractionRow,
} from '@/types/game';
import { PURCHASE_STATUS_LABEL } from '@/lib/payments/constants';
import AdminNav, { AdminSection } from '@/components/admin/AdminNav';
import PlayerDetail from '@/components/admin/PlayerDetail';

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

const EVENT_LABEL: Record<AppEventRow['event_type'], string> = {
  login: '🔐 Inició sesión',
  app_open: '📲 Abrió la app',
  page_view: '🧭 Visitó',
  game_start: '🎟️ Empezó partida',
  game_win: '🏆 Ganó partida',
  game_lose: '💀 Perdió partida',
};

type Section = Exclude<AdminSection, 'chat'>;

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

export default function AdminPage() {
  const { player, isLoading, isAdmin } = usePlayer();
  const router = useRouter();
  const [section, setSection] = useState<Section>('resumen');
  const [data, setData] = useState<AdminStatsResponse | null>(null);
  const [purchases, setPurchases] = useState<AdminPurchaseRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalRow[]>([]);
  const [interaction, setInteraction] = useState<InteractionRow[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [flowPlayer, setFlowPlayer] = useState<string | null>(null);
  const [flowEvents, setFlowEvents] = useState<AppEventRow[]>([]);
  const [purchaseFilter, setPurchaseFilter] = useState<
    'pendientes' | 'aprobadas' | 'rechazadas' | 'todas'
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

  // Solo admins: los demás vuelven al inicio (la API y RLS también protegen)
  useEffect(() => {
    if (!isLoading && !isAdmin) router.replace(player ? '/game' : '/auth/login');
  }, [isLoading, isAdmin, player, router]);

  // Sección inicial desde la URL (/admin?s=usuarios) — permite que el
  // menú lateral del chat navegue directo a una sección.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('s');
    if (s && ['resumen', 'usuarios', 'transacciones', 'interacciones', 'partidas'].includes(s)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronización única con la URL
      setSection(s as Section);
    }
  }, []);

  const selectSection = (s: Section) => {
    setSection(s);
    window.history.replaceState(null, '', `/admin?s=${s}`);
  };

  const loadAll = useCallback(async () => {
    try {
      const [statsRes, paymentsRes, interactionRes, usersRes] = await Promise.all([
        fetch('/api/admin/stats', { cache: 'no-store' }),
        fetch('/api/admin/payments', { cache: 'no-store' }),
        fetch('/api/admin/interaction', { cache: 'no-store' }),
        fetch('/api/admin/users', { cache: 'no-store' }),
      ]);
      const stats = await statsRes.json();
      const payments = await paymentsRes.json();
      const inter = await interactionRes.json();
      const usersData = await usersRes.json();
      if (!statsRes.ok) setError(stats.error || 'Error al cargar estadísticas');
      else {
        setData(stats);
        setError(null);
      }
      if (paymentsRes.ok) {
        setPurchases(payments.purchases ?? []);
        setWithdrawals(payments.withdrawals ?? []);
      }
      if (interactionRes.ok) setInteraction(inter.players ?? []);
      if (usersRes.ok) setUsers(usersData.users ?? []);
    } catch {
      setError('Error de conexión');
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // La carga es asíncrona: el setState ocurre tras el fetch, no en
    // el cuerpo del efecto (falso positivo del compilador).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    const interval = setInterval(loadAll, 30_000); // refresco en vivo
    return () => clearInterval(interval);
  }, [isAdmin, loadAll]);

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

  if (!isAdmin) return null;

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
  // Cada compra vive en SU filtro: al aprobar o rechazar una pendiente
  // pasa de lista ("validando" cuenta como pendiente: es transitorio).
  const purchaseBuckets = {
    pendientes: purchases.filter((p) => p.status === 'pendiente' || p.status === 'validando'),
    aprobadas: purchases.filter((p) => p.status === 'aprobado'),
    rechazadas: purchases.filter((p) => p.status === 'rechazado'),
    todas: purchases,
  } as const;
  const visiblePurchases = purchaseBuckets[purchaseFilter];
  const pendingWithdrawals = withdrawals.filter((w) => w.status === 'pendiente');
  const otherWithdrawals = withdrawals.filter((w) => w.status !== 'pendiente');
  const withdrawalBuckets = {
    pendientes: pendingWithdrawals,
    pagados: withdrawals.filter((w) => w.status === 'pagado'),
    cancelados: withdrawals.filter((w) => w.status === 'cancelado'),
    todos: [...pendingWithdrawals, ...otherWithdrawals],
  } as const;
  const visibleWithdrawals = withdrawalBuckets[withdrawalFilter];

  const q = userSearch.trim().toLowerCase();
  const visibleUsers = q
    ? users.filter(
        (u) => u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
      )
    : users;

  return (
    <main className="admin-main">
      <h1 className="admin-title">👑 Panel de Administración</h1>
      <p className="admin-subtitle">Se actualiza cada 30s · toca el nombre de un jugador en cualquier tabla para ver sus acciones</p>

      {error && <div className="auth-error">⚠️ {error}</div>}

      <div className="admin-shell">
        <AdminNav active={section} onSelect={selectSection} />

        <div className="admin-content">
          {/* ── RESUMEN ── */}
          {section === 'resumen' && (
            <>
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
                placeholder="Buscar por nombre o correo…"
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
                <div className="admin-filter-row">
                  <button
                    className={`btn-mini ${purchaseFilter === 'pendientes' ? 'btn-mini-active' : ''}`}
                    onClick={() => setPurchaseFilter('pendientes')}
                  >
                    🕒 Pendientes ({purchaseBuckets.pendientes.length})
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
                    Todas ({purchases.length})
                  </button>
                  <span className="admin-hint">
                    La validación automática nunca rechaza: rechazar es siempre decisión tuya.
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
                            Sin compras{' '}
                            {purchaseFilter === 'todas' ? 'todavía' : purchaseFilter}
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
                    Todos ({withdrawals.length})
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
                            Sin retiros {withdrawalFilter === 'todos' ? 'todavía' : withdrawalFilter}
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
        </div>
      </div>
    </main>
  );
}
