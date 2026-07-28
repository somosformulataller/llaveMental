'use client';

import GameBoard from '@/components/game/GameBoard';
import { usePlayer } from '@/components/providers/PlayerProvider';

// Página cliente: renderiza al instante con el jugador del contexto
// compartido — sin fetch bloqueante en el servidor. La protección de
// la ruta la hace proxy.ts (redirige a /auth/login sin sesión).
export default function GamePage() {
  const { player, isLoading, updateBalance } = usePlayer();

  return (
    <main className="game-main">
      <GameBoard
        player={player}
        playerLoading={isLoading}
        onBalanceChange={updateBalance}
      />
    </main>
  );
}
