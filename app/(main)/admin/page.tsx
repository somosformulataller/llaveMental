'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { usePlayer } from '@/components/providers/PlayerProvider';
import {
  AdminPurchaseRow,
  AdminStatsResponse,
  AdminWithdrawalRow,
  AppEventRow,
  InteractionRow,
} from '@/types/game';
import { PURCHASE_STATUS_LABEL } from '@/lib/payments/constants';

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

export default function AdminPage() {
  const { player, isLoading, isAdmin } = usePlayer();
  const router = useRouter();
  const [data, setData] = useState<AdminStatsResponse | null>(null);
  const [purchases, setPurchases] = useState<AdminPurchaseRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalRow[]>([]);
  const [interaction, setInteraction] = useState<InteractionRow[]>([]);
  const [flowPlayer, setFlowPlayer] = useState<string | null>(null);
  const [flowEvents, setFlowEvents] = useState<AppEventRow[]>([]);
  const [purchaseFilter, setPurchaseFilter] = useState<'pendientes' | 'todas'>('pendientes');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Solo admins: los demás vuelven al inicio (la API y RLS también protegen)
  useEffect(() => {
    if (!isLoading && !isAdmin) router.replace(player ? '/game' : '/auth/login');
  }, [isLoading, isAdmin, player, router]);

  const loadAll = useCallback(async () => {
    try {
      const [statsRes, paymentsRes, interactionRes] = await Promise.all([
        fetch('/api/admin/stats', { cache: 'no-store' }),
        fetch('/api/admin/payments', { cache: 'no-store' }),
        fetch('/api/admin/interaction', { cache: 'no-store' }),
      ]);
      const stats = await statsRes.json();
      const payments = await paymentsRes.json();
      const inter = await interactionRes.json();
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

  // Recarga manual de tickets (positivo suma, negativo resta)
  const adjustTickets = async (playerId: string, username: string | null, sign: 1 | -1) => {
    const raw = prompt(
      `¿Cuántos tickets quieres ${sign === 1 ? 'RECARGAR a' : 'RESTAR a'} ${username || playerId.slice(0, 8)}?`
    );
    if (!raw) return;
    const qty = Math.trunc(Number(raw));
    if (!Number.isFinite(qty) || qty <= 0) {
      alert('Escribe una cantidad válida');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId, delta: qty * sign }),
      });
      const json = await res.json();
      if (!res.ok) alert(json.error || 'No se pudo actualizar');
      else alert(`Listo: ${username || 'el jugador'} ahora tiene ${json.tickets} ticket(s).`);
      await loadAll();
    } catch {
      alert('Error de conexión');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) return null;

  const stats = data?.stats;
  const visiblePurchases =
    purchaseFilter === 'pendientes'
      ? purchases.filter((p) => p.status !== 'aprobado')
      : purchases;
  const pendingWithdrawals = withdrawals.filter((w) => w.status === 'pendiente');
  const otherWithdrawals = withdrawals.filter((w) => w.status !== 'pendiente');

  return (
    <main className="admin-main">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="admin-title">👑 Panel de Administración</h1>
        <p className="admin-subtitle">
          Métricas en tiempo real del juego · se actualiza cada 30s ·{' '}
          <a href="/admin/chat" className="admin-link">💬 Chat de atención al cliente</a>
        </p>
      </motion.div>

      {error && <div className="auth-error">⚠️ {error}</div>}

      {/* Métricas del juego */}
      <div className="admin-stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats ? stats.total_players : '—'}</div>
          <div className="stat-label">Jugadores</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? stats.total_tickets : '—'}</div>
          <div className="stat-label">Partidas jugadas</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? fmt(stats.total_wagered) : '—'}</div>
          <div className="stat-label">Total apostado</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? fmt(stats.total_paid) : '—'}</div>
          <div className="stat-label">Total en premios</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats
              ? stats.rtp_real !== null
                ? `${(stats.rtp_real * 100).toFixed(1)}%`
                : 'N/A'
              : '—'}
          </div>
          <div className="stat-label">RTP real</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? fmt(stats.house_profit) : '—'}</div>
          <div className="stat-label">Ganancia del juego</div>
        </div>
      </div>

      {/* Finanzas reales */}
      <div className="admin-stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats ? fmt(stats.total_collected) : '—'}</div>
          <div className="stat-label">💵 Recaudado (compras)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? fmt(stats.total_withdrawn) : '—'}</div>
          <div className="stat-label">💸 Retiros pagados</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? fmt(stats.pending_withdrawals) : '—'}</div>
          <div className="stat-label">⏳ Retiros por pagar</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? fmt(stats.balance_owed) : '—'}</div>
          <div className="stat-label">👛 Saldo en billeteras</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? stats.tickets_circulating : '—'}</div>
          <div className="stat-label">🎟️ Tickets sin jugar</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? stats.active_sessions : '—'}</div>
          <div className="stat-label">Partidas activas</div>
        </div>
      </div>

      {/* Compras de tickets */}
      <section className="admin-section">
        <h2 className="admin-section-title">🎫 Compras de tickets</h2>
        <div className="admin-filter-row">
          <button
            className={`btn-mini ${purchaseFilter === 'pendientes' ? 'btn-mini-active' : ''}`}
            onClick={() => setPurchaseFilter('pendientes')}
          >
            Pendientes
          </button>
          <button
            className={`btn-mini ${purchaseFilter === 'todas' ? 'btn-mini-active' : ''}`}
            onClick={() => setPurchaseFilter('todas')}
          >
            Todas
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
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visiblePurchases.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.created_at)}</td>
                  <td>{p.username || p.player_id.slice(0, 8)}</td>
                  <td>{p.reference}</td>
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
              ))}
              {visiblePurchases.length === 0 && (
                <tr>
                  <td colSpan={7}>Sin compras {purchaseFilter === 'pendientes' ? 'pendientes' : ''}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Retiros */}
      <section className="admin-section">
        <h2 className="admin-section-title">💸 Retiros</h2>
        <p className="admin-hint">
          Paga por Pago Móvil a los datos del jugador y luego marca el retiro como pagado.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Jugador</th>
                <th>Monto</th>
                <th>Datos de Pago Móvil</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {[...pendingWithdrawals, ...otherWithdrawals].map((w) => (
                <tr key={w.id}>
                  <td>{fmtDate(w.created_at)}</td>
                  <td>{w.username || w.player_id.slice(0, 8)}</td>
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
              ))}
              {withdrawals.length === 0 && (
                <tr>
                  <td colSpan={6}>Sin retiros todavía</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interacción */}
      <section className="admin-section">
        <h2 className="admin-section-title">📊 Interacción de los jugadores</h2>
        <p className="admin-hint">
          Toca un jugador para ver su flujo en la app (últimos eventos).
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
                  <tr
                    className="admin-row-click"
                    onClick={() => toggleFlow(p.id)}
                  >
                    <td>{flowPlayer === p.id ? '▼ ' : '▶ '}{p.username || p.id.slice(0, 8)}</td>
                    <td>{p.logins + p.app_opens}</td>
                    <td>{p.page_views}</td>
                    <td>{p.games}</td>
                    <td className="admin-win">{p.wins}</td>
                    <td className="admin-lose">{p.losses}</td>
                    <td>{fmt(Number(p.total_wagered))}</td>
                    <td>{fmt(Number(p.total_won))}</td>
                    <td>{fmtDate(p.last_seen)}</td>
                  </tr>
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

      {/* Jugadores */}
      <section className="admin-section">
        <h2 className="admin-section-title">Jugadores</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Saldo</th>
                <th>Tickets</th>
                <th>Apostado</th>
                <th>Ganado</th>
                <th>Registro</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(data?.players ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{p.username || p.id.slice(0, 8)}</td>
                  <td>{p.role === 'admin' ? '👑 admin' : 'jugador'}</td>
                  <td>{fmt(Number(p.balance))}</td>
                  <td>{Number(p.tickets ?? 0)}</td>
                  <td>{fmt(Number(p.total_wagered))}</td>
                  <td>{fmt(Number(p.total_won))}</td>
                  <td>{fmtDate(p.created_at)}</td>
                  <td>
                    {p.role !== 'admin' && (
                      <span className="admin-actions">
                        <button
                          className="btn-mini"
                          disabled={busy}
                          onClick={() => adjustTickets(p.id, p.username, 1)}
                        >
                          ＋🎟️
                        </button>
                        <button
                          className="btn-mini"
                          disabled={busy}
                          onClick={() => adjustTickets(p.id, p.username, -1)}
                        >
                          −🎟️
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.players.length === 0 && (
                <tr>
                  <td colSpan={8}>Sin jugadores todavía</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Últimas partidas */}
      <section className="admin-section">
        <h2 className="admin-section-title">Últimas partidas</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Jugador</th>
                <th>Llaves usadas</th>
                <th>Premio</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent_games ?? []).map((g) => (
                <tr key={g.id}>
                  <td>{fmtDate(g.created_at)}</td>
                  <td>{g.username || g.player_id.slice(0, 8)}</td>
                  <td>{g.keys_tried_count}</td>
                  <td className={Number(g.payout) > 0 ? 'admin-win' : 'admin-lose'}>
                    {fmt(Number(g.payout))}
                  </td>
                </tr>
              ))}
              {data && data.recent_games.length === 0 && (
                <tr>
                  <td colSpan={4}>Sin partidas todavía</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
