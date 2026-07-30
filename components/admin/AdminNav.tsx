'use client';

import { useRouter } from 'next/navigation';

export type AdminSection =
  | 'resumen'
  | 'usuarios'
  | 'transacciones'
  | 'interacciones'
  | 'partidas'
  | 'chat';

const ITEMS: { key: AdminSection; label: string }[] = [
  { key: 'resumen', label: '📊 Resumen' },
  { key: 'usuarios', label: '👥 Usuarios' },
  { key: 'transacciones', label: '💳 Transacciones' },
  { key: 'interacciones', label: '📈 Interacciones' },
  { key: 'partidas', label: '🗝️ Partidas' },
  { key: 'chat', label: '💬 Chat' },
];

interface AdminNavProps {
  active: AdminSection;
  /** En /admin cambia la sección sin navegar; el chat siempre navega */
  onSelect?: (key: Exclude<AdminSection, 'chat'>) => void;
}

// Menú lateral del panel de administración (en móvil, fila de chips).
export default function AdminNav({ active, onSelect }: AdminNavProps) {
  const router = useRouter();

  const go = (key: AdminSection) => {
    if (key === 'chat') {
      router.push('/admin/chat');
      return;
    }
    if (onSelect) onSelect(key);
    else router.push(`/admin?s=${key}`);
  };

  return (
    <nav className="admin-side">
      {ITEMS.map((item) => (
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
