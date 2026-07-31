import { PayoutTier } from '@/types/game';

export const TICKET_COST = 2;
export const INITIAL_VAULT = 10;
export const TOTAL_KEYS = 10;

// Distribución aprobada el 31/07/2026 (ver rtp-propuesta.md):
// se elimina el "empate" de $2 y el jugador gana neto el 68% de las
// partidas (mínimo +$0.50). E[premio] = $1.958 → RTP 97.9%.
// requiredErrors respeta que el premio revelado NUNCA sea menor que
// el pozo mostrado (el pozo baja $2 por fallo desde $10).
export const PAYOUT_TABLE: PayoutTier[] = [
  { payout: 0,   requiredErrors: 5, weight: 320 },
  { payout: 2.5, requiredErrors: 4, weight: 450 },
  { payout: 3,   requiredErrors: 4, weight: 150 },
  { payout: 3.5, requiredErrors: 4, weight: 30  },
  { payout: 4,   requiredErrors: 3, weight: 20  },
  { payout: 5,   requiredErrors: 3, weight: 12  },
  { payout: 6,   requiredErrors: 2, weight: 8   },
  { payout: 8,   requiredErrors: 1, weight: 5   },
  { payout: 10,  requiredErrors: 0, weight: 5   },
];

export const TOTAL_WEIGHT = PAYOUT_TABLE.reduce((sum, t) => sum + t.weight, 0);
