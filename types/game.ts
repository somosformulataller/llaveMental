export type GameStatus = 'IDLE' | 'ACTIVE' | 'COMPLETED_WIN' | 'COMPLETED_LOSE';
export type KeyStatus = 'IDLE' | 'FLYING' | 'BROKEN' | 'CORRECT' | 'DISABLED';
export type LockStatus = 'IDLE' | 'SHAKE' | 'OPEN';

export interface PayoutTier {
  payout: number;
  requiredErrors: number;
  weight: number;
  /** Adelantos del premio: el fallo n° `fail` suelta `amount` al saldo.
      La puerta paga al final el premio MENOS lo adelantado. */
  advances?: { fail: number; amount: number }[];
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
  /** Lo acreditado al saldo al abrir (premio menos adelantos) */
  credited?: number;
  /** Adelanto del premio soltado por este fallo (monedas ocultas) */
  bonus?: number;
  animation: 'KEY_BROKEN' | 'LOCK_OPENED';
  game_over?: boolean;
  error?: string;
}

export type PlayerRole = 'player' | 'admin';

export interface Player {
  id: string;
  username: string | null;
  balance: number;
  tickets: number;
  total_wagered: number;
  total_won: number;
  role?: PlayerRole;
  payout_name?: string | null;
  payout_bank?: string | null;
  payout_cedula?: string | null;
  payout_phone?: string | null;
  created_at: string;
}

// ── Pagos y billetera ──

export type PurchaseStatus = 'pendiente' | 'validando' | 'aprobado' | 'rechazado';
export type WithdrawalStatus = 'pendiente' | 'pagado' | 'cancelado';

export interface TicketPurchase {
  id: string;
  player_id: string;
  quantity: number;
  amount_usd: number;
  amount_ves: number | null;
  exchange_rate_used: number | null;
  reference: string;
  status: PurchaseStatus;
  origin: 'auto' | 'manual' | null;
  status_note: string | null;
  created_at: string;
  validated_at: string | null;
}

export interface Withdrawal {
  id: string;
  player_id: string;
  amount_usd: number;
  status: WithdrawalStatus;
  reference: string | null;
  admin_note: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface WalletResponse {
  player: Player | null;
  purchases: TicketPurchase[];
  withdrawals: Withdrawal[];
  error?: string;
}

export interface RankingEntry {
  username: string | null;
  total_won: number;
  is_me: boolean;
}

export interface RankingResponse {
  top: RankingEntry[];
  me: { total_won: number; rank: number } | null;
  error?: string;
}

export interface ActiveSessionState {
  session_id: string;
  vault: number;
  keys_tried: number[];
}

export interface InteractionRow {
  id: string;
  username: string | null;
  tickets: number;
  balance: number;
  total_wagered: number;
  total_won: number;
  logins: number;
  app_opens: number;
  page_views: number;
  games: number;
  wins: number;
  losses: number;
  last_seen: string | null;
  created_at: string;
}

export interface AdminPurchaseRow extends TicketPurchase {
  username: string | null;
}

export interface AdminWithdrawalRow extends Withdrawal {
  username: string | null;
  payout_name: string | null;
  payout_bank: string | null;
  payout_cedula: string | null;
  payout_phone: string | null;
}

export interface AppEventRow {
  id: number;
  player_id: string;
  event_type: 'login' | 'app_open' | 'page_view' | 'game_start' | 'game_win' | 'game_lose';
  path: string | null;
  created_at: string;
}

export interface AdminStats {
  total_players: number;
  total_tickets: number;
  total_wagered: number;
  total_paid: number;
  rtp_real: number | null;
  active_sessions: number;
  total_collected: number;
  total_withdrawn: number;
  pending_withdrawals: number;
  balance_owed: number;
  tickets_circulating: number;
  house_profit: number;
}

export interface AdminPlayerRow {
  id: string;
  username: string | null;
  balance: number;
  tickets?: number;
  total_wagered: number;
  total_won: number;
  role?: PlayerRole;
  created_at: string;
}

// Fila de la sección Usuarios del panel admin (con email y bloqueo)
export interface AdminUserRow {
  id: string;
  username: string | null;
  email: string | null;
  role: PlayerRole | null;
  blocked: boolean;
  balance: number;
  tickets: number;
  total_wagered: number;
  total_won: number;
  created_at: string;
  whatsapp?: string | null;
  cedula?: string | null;
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
