'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Player } from '@/types/game';

interface PlayerContextValue {
  player: Player | null;
  /** true solo durante la primera carga del perfil */
  isLoading: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  updateBalance: (newBalance: number) => void;
  signOut: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const supabaseRef = useRef(createClient());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/player', { cache: 'no-store' });
      const data = await res.json();
      setPlayer(data.player ?? null);
    } catch {
      setPlayer(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial (INITIAL_SESSION) + sincronización con el estado
    // de auth, sin recargar la página (navegación SPA).
    const { data: sub } = supabaseRef.current.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        refresh();
      }
      if (event === 'SIGNED_OUT') setPlayer(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const updateBalance = useCallback((newBalance: number) => {
    setPlayer((prev) => (prev ? { ...prev, balance: newBalance } : prev));
  }, []);

  const signOut = useCallback(async () => {
    await supabaseRef.current.auth.signOut();
    setPlayer(null);
    router.push('/');
    router.refresh();
  }, [router]);

  return (
    <PlayerContext.Provider
      value={{
        player,
        isLoading,
        isAdmin: player?.role === 'admin',
        refresh,
        updateBalance,
        signOut,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer debe usarse dentro de <PlayerProvider>');
  return ctx;
}
