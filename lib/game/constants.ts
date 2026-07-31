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
//
// `advances` reparte CADA premio en varias llaves ("monedas ocultas"):
// el fallo n° indicado suelta ese monto al saldo en el momento, y la
// puerta paga al final el premio MENOS lo adelantado. El total por
// partida no cambia ni un centavo → RTP intacto. Todos los montos en
// centavos exactos (la columna balance es DECIMAL(10,2)).
export const PAYOUT_TABLE: PayoutTier[] = [
  { payout: 0.5, requiredErrors: 19, weight: 399,
    advances: [{ fail: 6, amount: 0.15 }, { fail: 13, amount: 0.15 }] },          // puerta: 0.20
  { payout: 2.5, requiredErrors: 15, weight: 371,
    advances: [{ fail: 4, amount: 0.5 }, { fail: 8, amount: 0.5 }, { fail: 12, amount: 0.75 }] },  // puerta: 0.75
  { payout: 3,   requiredErrors: 14, weight: 150,
    advances: [{ fail: 4, amount: 0.5 }, { fail: 8, amount: 0.75 }, { fail: 12, amount: 0.75 }] }, // puerta: 1.00
  { payout: 3.5, requiredErrors: 13, weight: 30,
    advances: [{ fail: 3, amount: 0.5 }, { fail: 7, amount: 0.75 }, { fail: 10, amount: 1 }] },    // puerta: 1.25
  { payout: 4,   requiredErrors: 12, weight: 20,
    advances: [{ fail: 3, amount: 0.75 }, { fail: 6, amount: 0.75 }, { fail: 9, amount: 1 }] },    // puerta: 1.50
  { payout: 5,   requiredErrors: 10, weight: 12,
    advances: [{ fail: 3, amount: 1 }, { fail: 7, amount: 1.5 }] },               // puerta: 2.50
  { payout: 6,   requiredErrors: 8,  weight: 8,
    advances: [{ fail: 3, amount: 1.25 }, { fail: 6, amount: 1.75 }] },           // puerta: 3.00
  { payout: 8,   requiredErrors: 4,  weight: 5,
    advances: [{ fail: 2, amount: 2 }] },                                          // puerta: 6.00
  { payout: 10,  requiredErrors: 0,  weight: 5 },                                  // puerta: 10.00
];

export const TOTAL_WEIGHT = PAYOUT_TABLE.reduce((sum, t) => sum + t.weight, 0);
