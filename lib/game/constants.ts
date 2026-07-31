import { PayoutTier } from '@/types/game';

export const TICKET_COST = 2;
// El pozo baja VAULT_STEP por llave fallida. Con 10 llaves las cuentas
// cierran exactas: pozo inicial $5 = 10 fallos × $0.50 → perder es
// fallar TODAS las llaves y ver el pozo llegar justo a $0.00.
export const INITIAL_VAULT = 5;
export const VAULT_STEP = 0.5;
export const TOTAL_KEYS = 10;

// Distribución aprobada el 31/07/2026 (ver rtp-propuesta.md):
// se elimina el "empate" de $2 y el jugador gana neto el 68% de las
// partidas (mínimo +$0.50). E[premio] = $1.958 → RTP 97.9%.
// requiredErrors está calculado para que el pozo mostrado al abrir
// coincida EXACTO con el premio (5 − 0.5×fallos = premio) o el premio
// sea mayor ($6/$8/$10 abren de primera: sorpresa hacia arriba).
export const PAYOUT_TABLE: PayoutTier[] = [
  { payout: 0,   requiredErrors: 10, weight: 320 },
  { payout: 2.5, requiredErrors: 5,  weight: 450 },
  { payout: 3,   requiredErrors: 4,  weight: 150 },
  { payout: 3.5, requiredErrors: 3,  weight: 30  },
  { payout: 4,   requiredErrors: 2,  weight: 20  },
  { payout: 5,   requiredErrors: 0,  weight: 12  },
  { payout: 6,   requiredErrors: 0,  weight: 8   },
  { payout: 8,   requiredErrors: 0,  weight: 5   },
  { payout: 10,  requiredErrors: 0,  weight: 5   },
];

export const TOTAL_WEIGHT = PAYOUT_TABLE.reduce((sum, t) => sum + t.weight, 0);
