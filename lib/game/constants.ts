import { PayoutTier } from '@/types/game';

export const TICKET_COST = 2;
// El pozo baja VAULT_STEP por llave fallida. Con 20 llaves las cuentas
// cierran exactas: pozo inicial $10 y el peor caso ($0.50) llega tras
// 19 fallos con el pozo marcando justo $0.50 (10 − 0.5×19).
export const INITIAL_VAULT = 10;
export const VAULT_STEP = 0.5;
export const TOTAL_KEYS = 20;

// Distribución con premio de consolación, aprobada el 01/08/2026 (ver
// rtp-propuesta.md): la puerta SIEMPRE abre — no existe la derrota
// total. E[premio] = $1.96 exacto → RTP 98.0%.
// requiredErrors está calculado para que el pozo mostrado al abrir
// coincida EXACTO con el premio: fallos = (10 − premio) / 0.5.
// El $10 abre con la PRIMERA llave: momento jackpot.
export const PAYOUT_TABLE: PayoutTier[] = [
  { payout: 0.5, requiredErrors: 19, weight: 399 },
  { payout: 2.5, requiredErrors: 15, weight: 371 },
  { payout: 3,   requiredErrors: 14, weight: 150 },
  { payout: 3.5, requiredErrors: 13, weight: 30  },
  { payout: 4,   requiredErrors: 12, weight: 20  },
  { payout: 5,   requiredErrors: 10, weight: 12  },
  { payout: 6,   requiredErrors: 8,  weight: 8   },
  { payout: 8,   requiredErrors: 4,  weight: 5   },
  { payout: 10,  requiredErrors: 0,  weight: 5   },
];

export const TOTAL_WEIGHT = PAYOUT_TABLE.reduce((sum, t) => sum + t.weight, 0);

// Adelantos del premio en partidas largas: el fallo n° indicado suelta
// una parte del premio final, acreditada al saldo en el momento. El
// total pagado por partida NO cambia (al abrir se acredita el premio
// menos lo adelantado) → RTP intacto. Así la partida de consolación
// va sumando: +$0.15 al principio, +$0.15 al medio y $0.20 al abrir.
// Aplica a TODA partida que llegue a esos fallos (no solo la de $0.50)
// para que un adelanto no delate el resultado.
export const PRIZE_ADVANCES: { failNumber: number; amount: number }[] = [
  { failNumber: 6, amount: 0.15 },
  { failNumber: 13, amount: 0.15 },
];
