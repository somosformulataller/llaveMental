'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GameBoard from '@/components/game/GameBoard';
import { usePlayer } from '@/components/providers/PlayerProvider';

// Página cliente: GameBoard toma el jugador del contexto compartido.
// La protección de la ruta la hace proxy.ts (redirige a /auth/login
// sin sesión). El administrador NO juega: se le envía a su panel
// (la API de buy-ticket también lo bloquea del lado del servidor).
export default function GamePage() {
  const { isStaff: isAdmin, isLoading } = usePlayer();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAdmin) router.replace('/admin');
  }, [isAdmin, isLoading, router]);

  if (isAdmin) return null;

  return (
    <main className="game-main">
      <GameBoard />
    </main>
  );
}
