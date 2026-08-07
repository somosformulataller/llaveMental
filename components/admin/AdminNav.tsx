'use client';

import { useRouter } from 'next/navigation';

export type AdminSection =
  | 'resumen'
  | 'usuarios'
  | 'transacciones'
  | 'interacciones'
  | 'partidas'
  | 'chat'
  | 'equipo';

const ITEMS: { key: AdminSection; label: string }[] = [
  { key: 'resumen', label: '📊 Resumen' },
  { key: 'usuarios', label: '👥 Usuarios' },
  { key: 'transacciones', label: '💳 Transacciones' },
  { key: 'interacciones', label: '📈 Interacciones' },
  { key: 'partidas', label: '🗝️ Partidas' },
  { key: 'chat', label: '💬 Chat' },
  { key: 'equipo', label: '🛡️ Equipo' },
];

interface AdminNavProps {
  active: AdminSection;
  /** En /admin cambia la sección sin navegar; el chat siempre navega */
  onSelect?: (key: Exclude<AdminSection, 'chat'>) => void;
  /** Áreas visibles para este miembro del staff (sin ella: todas) */
  allowed?: AdminSection[];
}

// Menú lateral del panel de administración (en móvil, fila de chips).
// Solo muestra las áreas permitidas para el usuario del panel.
export default function AdminNav({ active, onSelect, allowed }: AdminNavProps) {
  const router = useRouter();

  const go = (key: AdminSection) => {
    if (key === 'chat') {
      router.push('/admin/chat');
      return;
    }
    if (onSelect) onSelect(key);
    else router.push(`/admin?s=${key}`);
  };

  const items = allowed ? ITEMS.filter((i) => allowed.includes(i.key)) : ITEMS;

  return (
    <nav className="admin-side">
      {items.map((item) => (
        <button
          key={item.key}
          className={`admin-side-item ${active === item.key ? 'admin-side-active' : ''}`}
          onClick={() => go(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
