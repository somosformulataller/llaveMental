import { PAYOUT_TABLE, TOTAL_WEIGHT } from './constants';
import { PayoutTier } from '@/types/game';

/**
 * Weighted random draw following the RTP 98% probability matrix.
 * Returns the selected payout tier.
 */
export function drawPayoutTier(): PayoutTier {
  const roll = Math.random() * TOTAL_WEIGHT;
  let cumulative = 0;

  for (const tier of PAYOUT_TABLE) {
    cumulative += tier.weight;
    if (roll < cumulative) {
      return tier;
    }
  }

  // Fallback (should never reach here)
  return PAYOUT_TABLE[0];
}

/**
 * Simulate N draws and compute actual RTP for validation.
 */
export function simulateRTP(iterations: number = 100_000): number {
  let totalIn = 0;
  let totalOut = 0;

  for (let i = 0; i < iterations; i++) {
    const tier = drawPayoutTier();
    totalIn += 2; // ticket cost
    totalOut += tier.payout;
  }

  return totalOut / totalIn;
}
