'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { AdminStatsResponse } from '@/types/game';

const fmt = (n: number) => `$${n.toFixed(2)}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function AdminPage() {
  const { player, isLoading, isAdmin } = usePlayer();
  const router = useRouter();
  const [data, setData] = useState<AdminStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Solo admins: los demás vuelven al inicio (la API y RLS también protegen)
  useEffect(() => {
    if (!isLoading && !isAdmin) router.replace(player ? '/game' : '/auth/login');
  }, [isLoading, isAdmin, player, router]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/admin/stats', { cache: 'no-store' });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(json.error || 'Error al cargar estadísticas');
        else setData(json);
      } catch {
        if (!cancelled) setError('Error de conexión');
      }
    };
    load();
    const interval = setInterval(load, 30_000); // refresco en vivo
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const stats = data?.stats;

  return (
    <main className="admin-main">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="admin-title">👑 Panel de Administración</h1>
        <p className="admin-subtitle">
          Métricas en tiempo real del juego · se actualiza cada 30s
        </p>
      </motion.div>

      {error && <div className="auth-error">⚠️ {error}</div>}

      {/* Métricas */}
      <div className="admin-stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats ? stats.total_players : '—'}</div>
          <div className="stat-label">Jugadores</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? stats.total_tickets : '—'}</div>
          <div className="stat-label">Tickets jugados</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? fmt(stats.total_wagered) : '—'}</div>
          <div className="stat-label">Total apostado</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? fmt(stats.total_paid) : '—'}</div>
          <div className="stat-label">Total pagado</div>
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
          <div className="stat-value">{stats ? stats.active_sessions : '—'}</div>
          <div className="stat-label">Sesiones activas</div>
        </div>
      </div>

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
                <th>Apostado</th>
                <th>Ganado</th>
                <th>Registro</th>
              </tr>
            </thead>
            <tbody>
              {(data?.players ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{p.username || p.id.slice(0, 8)}</td>
                  <td>{p.role === 'admin' ? '👑 admin' : 'jugador'}</td>
                  <td>{fmt(Number(p.balance))}</td>
                  <td>{fmt(Number(p.total_wagered))}</td>
                  <td>{fmt(Number(p.total_won))}</td>
                  <td>{fmtDate(p.created_at)}</td>
                </tr>
              ))}
              {data && data.players.length === 0 && (
                <tr>
                  <td colSpan={6}>Sin jugadores todavía</td>
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
