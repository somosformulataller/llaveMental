'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Player } from '@/types/game';

interface PlayerContextValue {
  player: Player | null;
  /** true solo durante la primera carga del perfil */
  isLoading: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  updateBalance: (newBalance: number) => void;
  /** Actualización optimista parcial (saldo, tickets, …) */
  updatePlayer: (patch: Partial<Player>) => void;
  signOut: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

// Registro de interacción para la analítica del admin (fire-and-forget)
function track(type: 'login' | 'app_open' | 'page_view', path?: string) {
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, path }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const supabaseRef = useRef(createClient());

  const refresh = useCallback(async () => {
    // Marcar la carga TAMBIÉN en los refrescos (p. ej. justo después
    // de iniciar sesión): si no, hay un instante con player=null y
    // isLoading=false y las pantallas creen que no hay sesión
    // (aparecía "Iniciar sesión para jugar" ya estando logueado).
    setIsLoading(true);
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
    const { data: sub } = supabaseRef.current.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        refresh();
      }
      if (event === 'SIGNED_IN') track('login');
      if (event === 'INITIAL_SESSION' && session) track('app_open');
      if (event === 'SIGNED_OUT') setPlayer(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  // Flujo del jugador en la app: una vista por cambio de pantalla
  const playerId = player?.id ?? null;
  useEffect(() => {
    if (playerId && pathname) track('page_view', pathname);
  }, [playerId, pathname]);

  const updateBalance = useCallback((newBalance: number) => {
    setPlayer((prev) => (prev ? { ...prev, balance: newBalance } : prev));
  }, []);

  const updatePlayer = useCallback((patch: Partial<Player>) => {
    setPlayer((prev) => (prev ? { ...prev, ...patch } : prev));
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
        updatePlayer,
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
