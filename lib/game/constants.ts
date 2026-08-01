import { PayoutTier } from '@/types/game';

export const TICKET_COST = 2;
export const INITIAL_VAULT = 10;
// Paso de respaldo SOLO para sesiones viejas que no calzan con la tabla
export const VAULT_STEP = 0.5;
export const TOTAL_KEYS = 20;

// Escalera del pozo: su valor tras k fallos. Baja suave al inicio
// (−$0.50), acelera en el medio (−$1) y vuelve a suave al final, y
// pasa EXACTO por todos los premios (la puerta abre con el pozo
// marcando el premio). Máximo 14 fallos → la consolación abre con la
// llave 15, no con la última: partidas más cortas y SIEMPRE quedan
// llaves sin voltear para la revelación final.
export const VAULT_SEQUENCE = [
  10, 9.5, 9, 8, 7, 6, 5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5,
];

// Distribución con premio de consolación, aprobada el 01/08/2026 (ver
// rtp-propuesta.md): la puerta SIEMPRE abre — no existe la derrota
// total. E[premio] = $1.96 exacto → RTP 98.0%.
// requiredErrors = posición del premio en VAULT_SEQUENCE: la puerta
// abre con el pozo marcando EXACTO el premio. El $10 abre con la
// PRIMERA llave: momento jackpot.
//
// `advances` reparte CADA premio en varias llaves ("monedas ocultas"):
// el fallo n° indicado suelta ese monto al saldo en el momento, y la
// puerta paga al final el premio MENOS lo adelantado. El total por
// partida no cambia ni un centavo → RTP intacto. Todos los montos en
// centavos exactos (la columna balance es DECIMAL(10,2)).
// Pesos rebalanceados el 01/08/2026 a pedido del jefe: ganar $2.50 o
// más pasa de 60% a 65.5% de las partidas (consolación 34.5%). El
// costo, con el mismo RTP, es que los premios altos son algo más
// raros. E = $1.962 → RTP 98.1%.
export const PAYOUT_TABLE: PayoutTier[] = [
  { payout: 0.5, requiredErrors: 14, weight: 345,
    advances: [{ fail: 5, amount: 0.15 }, { fail: 10, amount: 0.15 }] },          // puerta: 0.20
  { payout: 2.5, requiredErrors: 10, weight: 530,
    advances: [{ fail: 3, amount: 0.5 }, { fail: 6, amount: 0.5 }, { fail: 8, amount: 0.75 }] },  // puerta: 0.75
  { payout: 3,   requiredErrors: 9,  weight: 80,
    advances: [{ fail: 3, amount: 0.5 }, { fail: 5, amount: 0.75 }, { fail: 7, amount: 0.75 }] }, // puerta: 1.00
  { payout: 3.5, requiredErrors: 8,  weight: 15,
    advances: [{ fail: 2, amount: 0.5 }, { fail: 4, amount: 0.75 }, { fail: 6, amount: 1 }] },    // puerta: 1.25
  { payout: 4,   requiredErrors: 7,  weight: 10,
    advances: [{ fail: 2, amount: 0.75 }, { fail: 4, amount: 0.75 }, { fail: 6, amount: 1 }] },   // puerta: 1.50
  { payout: 5,   requiredErrors: 6,  weight: 8,
    advances: [{ fail: 2, amount: 1 }, { fail: 4, amount: 1.5 }] },               // puerta: 2.50
  { payout: 6,   requiredErrors: 5,  weight: 5,
    advances: [{ fail: 2, amount: 1.25 }, { fail: 4, amount: 1.75 }] },           // puerta: 3.00
  { payout: 8,   requiredErrors: 3,  weight: 4,
    advances: [{ fail: 2, amount: 2 }] },                                          // puerta: 6.00
  { payout: 10,  requiredErrors: 0,  weight: 3 },                                  // puerta: 10.00
];

export const TOTAL_WEIGHT = PAYOUT_TABLE.reduce((sum, t) => sum + t.weight, 0);
