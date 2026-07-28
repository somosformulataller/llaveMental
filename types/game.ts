export type GameStatus = 'IDLE' | 'ACTIVE' | 'COMPLETED_WIN' | 'COMPLETED_LOSE';
export type KeyStatus = 'IDLE' | 'FLYING' | 'BROKEN' | 'CORRECT' | 'DISABLED';
export type LockStatus = 'IDLE' | 'SHAKE' | 'OPEN';

export interface PayoutTier {
  payout: number;
  requiredErrors: number;
  weight: number;
}

export interface GameSession {
  id: string;
  player_id: string;
  target_payout: number;
  required_errors: number;
  errors_remaining: number;
  current_vault: number;
  keys_tried: number[];
  game_status: 'ACTIVE' | 'COMPLETED';
  created_at: string;
  completed_at: string | null;
}

export interface BuyTicketResponse {
  session_id: string;
  vault: number;
  error?: string;
}

export interface TryKeyResponse {
  success: boolean;
  vault: number;
  payout?: number;
  animation: 'KEY_BROKEN' | 'LOCK_OPENED';
  error?: string;
}

export type PlayerRole = 'player' | 'admin';

export interface Player {
  id: string;
  username: string | null;
  balance: number;
  total_wagered: number;
  total_won: number;
  role?: PlayerRole;
  created_at: string;
}

export interface AdminStats {
  total_players: number;
  total_tickets: number;
  total_wagered: number;
  total_paid: number;
  rtp_real: number | null;
  active_sessions: number;
}

export interface AdminPlayerRow {
  id: string;
  username: string | null;
  balance: number;
  total_wagered: number;
  total_won: number;
  role?: PlayerRole;
  created_at: string;
}

export interface AdminHistoryRow {
  id: string;
  player_id: string;
  payout: number;
  keys_tried_count: number;
  created_at: string;
  username?: string | null;
}

export interface AdminStatsResponse {
  stats: AdminStats;
  players: AdminPlayerRow[];
  recent_games: AdminHistoryRow[];
  error?: string;
}
