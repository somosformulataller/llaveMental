'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { RankingEntry } from '@/types/game';

const fmt = (n: number) => `$${Number(n).toFixed(2)}`;
const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`);

// Ranking de ganadores: los jugadores que más premios han acumulado.
export default function RankingPage() {
  const { player } = usePlayer();
  const [top, setTop] = useState<RankingEntry[]>([]);
  const [me, setMe] = useState<{ total_won: number; rank: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/ranking', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setTop(d.top ?? []);
        setMe(d.me ?? null);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    <main className="ranking-main">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="wallet-title">🏆 Ranking de Ganadores</h1>
        <p className="ranking-subtitle">Los jugadores que más premios han ganado</p>
      </motion.div>

      {me && (
        <div className="ranking-me-card">
          <span className="ranking-me-pos">{medal(me.rank - 1)}</span>
          <div>
            <p className="ranking-me-label">Tu posición</p>
            <p className="ranking-me-won">🏆 Has ganado {fmt(me.total_won)}</p>
          </div>
        </div>
      )}

      <div className="ranking-list">
        <div className="ranking-row ranking-head">
          <span>Pos</span>
          <span>Jugador</span>
          <span>Ganado</span>
        </div>
        {top.map((entry, i) => (
          <div key={i} className={`ranking-row ${entry.is_me ? 'ranking-row-me' : ''}`}>
            <span className="ranking-pos">{medal(i)}</span>
            <span className="ranking-name">
              {entry.username || 'Jugador'}
              {entry.is_me ? ' (Tú)' : ''}
            </span>
            <span className="ranking-won">{fmt(entry.total_won)}</span>
          </div>
        ))}
        {loaded && top.length === 0 && (
          <p className="wallet-sub ranking-empty">
            Aún no hay ganadores{player ? '. ¡Sé el primero en abrir la puerta del tesoro!' : '.'}
          </p>
        )}
      </div>
    </main>
  );
}
