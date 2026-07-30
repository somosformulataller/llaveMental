import { PayoutTier } from '@/types/game';

export const TICKET_COST = 2;
export const INITIAL_VAULT = 10;
export const TOTAL_KEYS = 10;

export const PAYOUT_TABLE: PayoutTier[] = [
  { payout: 0,  requiredErrors: 5, weight: 34 },
  { payout: 2,  requiredErrors: 4, weight: 46 },
  { payout: 4,  requiredErrors: 3, weight: 12 },
  { payout: 6,  requiredErrors: 2, weight: 5  },
  { payout: 8,  requiredErrors: 1, weight: 2  },
  { payout: 10, requiredErrors: 0, weight: 1  },
];

export const TOTAL_WEIGHT = PAYOUT_TABLE.reduce((sum, t) => sum + t.weight, 0);
