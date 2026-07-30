'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminUserRow } from '@/types/game';

interface PlayerChipProps {
  playerId: string;
  username?: string | null;
  /** Se llama tras una acción que cambió datos (tickets, bloqueo, borrado) */
  onChanged?: () => void;
}

const fmt = (n: number) => `$${Number(n).toFixed(2)}`;

// Nombre de jugador con menú de acciones del ADMIN. Se usa en TODAS
// las tablas del panel (transacciones, interacciones, partidas, chat,
// usuarios): al tocar el nombre se abre la ficha con sus datos y las
// acciones de tickets, bloqueo, chat y eliminación.
export default function PlayerChip({ playerId, username, onChanged }: PlayerChipProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<AdminUserRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/admin/users?id=${playerId}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setInfo(data.user ?? null);
    } catch {}
  };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.min(rect.left, window.innerWidth - 268);
      setPos({ top: rect.bottom + 6, left: Math.max(8, left) });
    }
    setInfo(null);
    setOpen(true);
    load();
  };

  // Cerrar al tocar fuera, con Escape o al hacer scroll
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

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
    if (data) {
      setOpen(false);
      onChanged?.();
    }
  };

  return (
    <>
      <button ref={btnRef} className="pchip" onClick={toggle} title="Acciones del jugador">
        {name} <span className="pchip-caret">▾</span>
      </button>
      {open && pos && (
        <div
          ref={popRef}
          className="pchip-pop"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {!info ? (
            <p className="pchip-loading">Cargando…</p>
          ) : (
            <>
              <div className="pchip-head">
                <strong>{name}</strong>
                {info.blocked && <span className="badge-blocked">Bloqueado</span>}
              </div>
              {info.email && <p className="pchip-line">{info.email}</p>}
              <p className="pchip-line">
                💰 {fmt(info.balance)} · 🎟️ {info.tickets} · Apostado {fmt(info.total_wagered)} ·
                Ganado {fmt(info.total_won)}
              </p>
              <div className="pchip-actions">
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
            </>
          )}
        </div>
      )}
    </>
  );
}
