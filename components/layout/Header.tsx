'use client';

import { motion } from 'framer-motion';
import { Player } from '@/types/game';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  player: Player | null;
  onBalanceUpdate?: () => void;
}

export default function Header({ player, onBalanceUpdate }: HeaderProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <header className="game-header">
      <motion.div
        className="header-brand"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <span className="brand-icon">🗝️</span>
        <span className="brand-name">La Llave Correcta</span>
      </motion.div>

      <motion.div
        className="header-right"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
      >
        {player ? (
          <>
            <div className="wallet-badge">
              <span className="wallet-icon">💰</span>
              <span className="wallet-amount">${player.balance.toFixed(2)}</span>
            </div>
            <div className="user-badge">
              <span>{player.username || 'Jugador'}</span>
              <button className="signout-btn" onClick={handleSignOut}>
                Salir
              </button>
            </div>
          </>
        ) : (
          <a href="/auth/login" className="btn-login">
            Iniciar sesión
          </a>
        )}
      </motion.div>
    </header>
  );
}
