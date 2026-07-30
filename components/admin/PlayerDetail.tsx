'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminUserRow } from '@/types/game';

interface PlayerDetailProps {
  playerId: string;
  username?: string | null;
  /** Se llama tras una acción que cambió datos (tickets, bloqueo) */
  onChanged?: () => void;
  /** Se llama cuando la cuenta fue eliminada (para cerrar el detalle) */
  onDeleted?: () => void;
}

const fmt = (n: number) => `$${Number(n).toFixed(2)}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric' });

// Ficha del jugador que se expande DEBAJO de su fila (tipo acordeón,
// sin modal): datos en grilla adaptable y acciones que hacen wrap
// para no desbordar el ancho. Se usa en todas las tablas del panel.
export default function PlayerDetail({
  playerId,
  username,
  onChanged,
  onDeleted,
}: PlayerDetailProps) {
  const router = useRouter();
  const [info, setInfo] = useState<AdminUserRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/users?id=${playerId}`, { cache: 'no-store' });
        const data = await res.json();
        if (alive && res.ok) setInfo(data.user ?? null);
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
          <span>Ganado</span>
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
