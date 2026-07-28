'use client';

import GameBoard from '@/components/game/GameBoard';

// Página cliente: GameBoard toma el jugador del contexto compartido.
// La protección de la ruta la hace proxy.ts (redirige a /auth/login
// sin sesión).
export default function GamePage() {
  return (
    <main className="game-main">
      <GameBoard />
    </main>
  );
}
