'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminUserRow, PlayerHistory } from '@/types/game';
import { PURCHASE_STATUS_LABEL } from '@/lib/payments/constants';

interface PlayerDetailProps {
  playerId: string;
  username?: string | null;
  /** Se llama tras una acción que cambió datos (tickets, bloqueo) */
  onChanged?: () => void;
  /** Se llama cuando la cuenta fue eliminada (para cerrar el detalle) */
  onDeleted?: () => void;
}

type HistoryTab = 'partidas' | 'recargas' | 'retiros' | 'canjes';

const fmt = (n: number) => `$${Number(n).toFixed(2)}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const WITHDRAWAL_LABEL: Record<string, string> = {
  pendiente: '🕒 Pendiente',
  pagado: '✅ Pagado',
  cancelado: '↩️ Cancelado',
};

// Ficha del jugador que se expande DEBAJO de su fila (tipo acordeón,
// sin modal): datos en grilla adaptable, HISTORIAL completo (premios,
// jugadas, recargas, retiros y canjes) y acciones que hacen wrap.
// Se usa en todas las tablas del panel.
export default function PlayerDetail({
  playerId,
  username,
  onChanged,
  onDeleted,
}: PlayerDetailProps) {
  const router = useRouter();
  const [info, setInfo] = useState<AdminUserRow | null>(null);
  const [history, setHistory] = useState<PlayerHistory | null>(null);
  const [tab, setTab] = useState<HistoryTab>('partidas');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/users?id=${playerId}&full=1`, { cache: 'no-store' });
        const data = await res.json();
        if (alive && res.ok) {
          setInfo(data.user ?? null);
          setHistory(data.history ?? null);
        }
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [playerId]);

  const name = info?.username || username || playerId.slice(0, 8);

  const action = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'No se pudo completar la acción');
        return null;
      }
      return data;
    } catch {
      alert('Error de conexión');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const adjustTickets = async (sign: 1 | -1) => {
    const raw = prompt(
      `¿Cuántos tickets quieres ${sign === 1 ? 'RECARGAR a' : 'RESTAR a'} ${name}?`
    );
    if (!raw) return;
    const qty = Math.trunc(Number(raw));
    if (!Number.isFinite(qty) || qty <= 0) {
      alert('Escribe una cantidad válida');
      return;
    }
    const data = await action({ action: 'add_tickets', delta: qty * sign });
    if (data) {
      setInfo((prev) => (prev ? { ...prev, tickets: data.tickets } : prev));
      onChanged?.();
    }
  };

  const toggleBlock = async () => {
    if (!info) return;
    const blocking = !info.blocked;
    if (
      !confirm(
        blocking
          ? `¿Bloquear a ${name}? No podrá jugar, comprar, canjear ni retirar (el chat le queda abierto).`
          : `¿Desbloquear a ${name}?`
      )
    )
      return;
    const data = await action({ action: blocking ? 'block' : 'unblock' });
    if (data) {
      setInfo((prev) => (prev ? { ...prev, blocked: data.blocked } : prev));
      onChanged?.();
    }
  };

  const removeUser = async () => {
    if (
      !confirm(
        `⚠️ ¿ELIMINAR la cuenta de ${name}?\n\nSe borra TODO: su acceso, saldo, tickets, historial, compras, retiros y chat. Esta acción no se puede deshacer.`
      )
    )
      return;
    if (!confirm(`Última confirmación: eliminar definitivamente a ${name}.`)) return;
    const data = await action({ action: 'delete' });
    if (data) onDeleted?.();
  };

  if (!info) return <div className="pdetail pdetail-loading">Cargando datos de {name}…</div>;

  const houseTake = Number(info.total_wagered) - Number(info.total_won);
  const games = history?.games ?? [];
  const purchases = history?.purchases ?? [];
  const withdrawals = history?.withdrawals ?? [];
  const redemptions = history?.redemptions ?? [];

  const TABS: { key: HistoryTab; label: string; count: number }[] = [
    { key: 'partidas', label: '🗝️ Jugadas', count: games.length },
    { key: 'recargas', label: '🎫 Recargas', count: purchases.length },
    { key: 'retiros', label: '💸 Retiros', count: withdrawals.length },
    { key: 'canjes', label: '🔄 Canjes', count: redemptions.length },
  ];

  return (
    <div className="pdetail">
      <div className="pdetail-grid">
        <div className="pdetail-item">
          <span>Correo</span>
          <strong>{info.email ?? '—'}</strong>
        </div>
        <div className="pdetail-item">
          <span>WhatsApp</span>
          <strong>{info.whatsapp ?? '—'}</strong>
        </div>
        <div className="pdetail-item">
          <span>Cédula</span>
          <strong>{info.cedula ?? '—'}</strong>
        </div>
        <div className="pdetail-item">
          <span>Estado</span>
          <strong>
            {info.blocked ? <span className="badge-blocked">Bloqueado</span> : 'Activo'}
          </strong>
        </div>
        <div className="pdetail-item">
          <span>Saldo</span>
          <strong>{fmt(info.balance)}</strong>
        </div>
        <div className="pdetail-item">
          <span>Tickets</span>
          <strong>🎟️ {info.tickets}</strong>
        </div>
        <div className="pdetail-item">
          <span>Apostado</span>
          <strong>{fmt(info.total_wagered)}</strong>
        </div>
        <div className="pdetail-item">
          <span>Premios ganados</span>
          <strong>{fmt(info.total_won)}</strong>
        </div>
        <div className="pdetail-item">
          <span>Ganancia nuestra</span>
          <strong className={houseTake >= 0 ? 'admin-win' : 'admin-lose'}>
            {houseTake >= 0 ? '+' : '−'}
            {fmt(Math.abs(houseTake))}
          </strong>
        </div>
        <div className="pdetail-item">
          <span>Registro</span>
          <strong>{fmtDate(info.created_at)}</strong>
        </div>
      </div>

      {/* ── Historial del jugador ── */}
      {history && (
        <div className="phistory">
          <div className="phistory-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`btn-mini ${tab === t.key ? 'btn-mini-active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          <div className="phistory-list">
            {tab === 'partidas' &&
              (games.length === 0 ? (
                <p className="phistory-empty">Sin jugadas todavía</p>
              ) : (
                games.map((g) => (
                  <div key={g.id} className="phistory-row">
                    <span className="phistory-date">{fmtDateTime(g.created_at)}</span>
                    <span>
                      🔑 {g.keys_tried_count} llave{g.keys_tried_count === 1 ? '' : 's'}
                    </span>
                    <strong className={Number(g.payout) > 0 ? 'admin-win' : 'admin-lose'}>
                      Premio {fmt(Number(g.payout))}
                    </strong>
                  </div>
                ))
              ))}

            {tab === 'recargas' &&
              (purchases.length === 0 ? (
                <p className="phistory-empty">Sin recargas todavía</p>
              ) : (
                purchases.map((p) => (
                  <div key={p.id} className="phistory-row">
                    <span className="phistory-date">{fmtDateTime(p.created_at)}</span>
                    <span>
                      {p.quantity} 🎟️ · {fmt(Number(p.amount_usd))} · Ref {p.reference}
                    </span>
                    <strong>
                      <span className={`status-badge status-${p.status}`}>
                        {PURCHASE_STATUS_LABEL[p.status] ?? p.status}
                      </span>
                      {p.origin ? (p.origin === 'auto' ? ' · Auto' : ' · Manual') : ''}
                    </strong>
                  </div>
                ))
              ))}

            {tab === 'retiros' &&
              (withdrawals.length === 0 ? (
                <p className="phistory-empty">Sin retiros todavía</p>
              ) : (
                withdrawals.map((w) => (
                  <div key={w.id} className="phistory-row">
                    <span className="phistory-date">{fmtDateTime(w.created_at)}</span>
                    <span>
                      {fmt(Number(w.amount_usd))}
                      {w.reference ? ` · Ref ${w.reference}` : ''}
                    </span>
                    <strong>{WITHDRAWAL_LABEL[w.status] ?? w.status}</strong>
                  </div>
                ))
              ))}

            {tab === 'canjes' &&
              (redemptions.length === 0 ? (
                <p className="phistory-empty">Sin canjes todavía</p>
              ) : (
                redemptions.map((r) => (
                  <div key={r.id} className="phistory-row">
                    <span className="phistory-date">{fmtDateTime(r.created_at)}</span>
                    <span>
                      {fmt(Number(r.amount_usd))} de saldo → {r.quantity} 🎟️
                    </span>
                    <strong>✅ Canjeado</strong>
                  </div>
                ))
              ))}
          </div>
        </div>
      )}

      <div className="pdetail-actions">
        <button className="btn-mini" disabled={busy} onClick={() => adjustTickets(1)}>
          ＋ Tickets
        </button>
        <button className="btn-mini" disabled={busy} onClick={() => adjustTickets(-1)}>
          − Tickets
        </button>
        <button
          className="btn-mini"
          disabled={busy}
          onClick={() => router.push(`/admin/chat?player=${playerId}`)}
        >
          💬 Chat
        </button>
        <button className="btn-mini" disabled={busy} onClick={toggleBlock}>
          {info.blocked ? '✓ Desbloquear' : '🚫 Bloquear'}
        </button>
        <button className="btn-mini btn-danger" disabled={busy} onClick={removeUser}>
          🗑 Eliminar
        </button>
      </div>
    </div>
  );
}
