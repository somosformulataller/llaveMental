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

// Distribución "SIEMPRE gana" del 05/08/2026 (ver rtp-propuesta.md,
// actualización 10): NO existen llaves incorrectas. Cada partida son
// exactamente 5 llaves con monedas ocultas que suman el premio EXACTO:
// los toques 1-4 sueltan un adelanto cada uno (da igual qué llave
// toque el jugador) y el 5° abre la puerta con el monto final, el más
// grande. Nada de rojo, temblor ni sonido de error.
//
// El RTP/RNG NO cambia: el premio total por partida sale del MISMO
// sorteo (drawPayoutTier + corta-rachas de buy-ticket: nunca 3
// consolaciones seguidas) con los mismos pesos calibrados por
// simulación (5M de partidas): RTP 98.1%, consolación efectiva 34.7%,
// $2.50+ en 65.3% de las partidas. Solo cambia CÓMO se reparte el
// premio en pantalla. Montos en centavos exactos (balance es
// DECIMAL(10,2)), crecientes para que la emoción suba hasta la puerta.
// requiredErrors = 4 → la puerta abre SIEMPRE en el 5° toque.
export const PAYOUT_TABLE: PayoutTier[] = [
  { payout: 0.5, requiredErrors: 4, weight: 385,
    advances: [{ fail: 1, amount: 0.05 }, { fail: 2, amount: 0.05 }, { fail: 3, amount: 0.1 }, { fail: 4, amount: 0.1 }] },     // puerta: 0.20
  { payout: 2.5, requiredErrors: 4, weight: 499,
    advances: [{ fail: 1, amount: 0.25 }, { fail: 2, amount: 0.5 }, { fail: 3, amount: 0.5 }, { fail: 4, amount: 0.5 }] },      // puerta: 0.75
  { payout: 3,   requiredErrors: 4, weight: 76,
    advances: [{ fail: 1, amount: 0.5 }, { fail: 2, amount: 0.5 }, { fail: 3, amount: 0.5 }, { fail: 4, amount: 0.75 }] },      // puerta: 0.75
  { payout: 3.5, requiredErrors: 4, weight: 14,
    advances: [{ fail: 1, amount: 0.5 }, { fail: 2, amount: 0.5 }, { fail: 3, amount: 0.75 }, { fail: 4, amount: 0.75 }] },     // puerta: 1.00
  { payout: 4,   requiredErrors: 4, weight: 9,
    advances: [{ fail: 1, amount: 0.5 }, { fail: 2, amount: 0.75 }, { fail: 3, amount: 0.75 }, { fail: 4, amount: 0.75 }] },    // puerta: 1.25
  { payout: 5,   requiredErrors: 4, weight: 8,
    advances: [{ fail: 1, amount: 0.75 }, { fail: 2, amount: 0.75 }, { fail: 3, amount: 1 }, { fail: 4, amount: 1 }] },         // puerta: 1.50
  { payout: 6,   requiredErrors: 4, weight: 5,
    advances: [{ fail: 1, amount: 0.75 }, { fail: 2, amount: 1 }, { fail: 3, amount: 1.25 }, { fail: 4, amount: 1.25 }] },      // puerta: 1.75
  { payout: 8,   requiredErrors: 4, weight: 4,
    advances: [{ fail: 1, amount: 1 }, { fail: 2, amount: 1.5 }, { fail: 3, amount: 1.5 }, { fail: 4, amount: 1.75 }] },        // puerta: 2.25
  { payout: 10,  requiredErrors: 4, weight: 3,
    advances: [{ fail: 1, amount: 1.5 }, { fail: 2, amount: 1.75 }, { fail: 3, amount: 2 }, { fail: 4, amount: 2.25 }] },       // puerta: 2.50
];

export const TOTAL_WEIGHT = PAYOUT_TABLE.reduce((sum, t) => sum + t.weight, 0);

// Llaves con monedas ocultas que le QUEDAN a la partida: los adelantos
// aún no cobrados + la llave que abre la puerta (también paga). Es lo
// que ve el jugador en el header — la narrativa es "encuentra las
// llaves con monedas", no "el premio baja".
export function coinKeysRemaining(targetPayout: number, failsSoFar: number): number {
  const tier = PAYOUT_TABLE.find((t) => t.payout === targetPayout);
  // Sesiones selladas con tablas viejas: sin adelantos, solo la puerta
  if (!tier) return targetPayout > 0 ? 1 : 0;
  const pending = (tier.advances ?? []).filter((a) => a.fail > failsSoFar).length;
  return pending + 1;
}
