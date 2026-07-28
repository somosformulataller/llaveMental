import { TICKET_COST } from '@/lib/game/constants';
import { PurchaseStatus, WithdrawalStatus } from '@/types/game';

// 1 ticket = 1 partida = TICKET_COST de la lógica RTP/RNG ($2.00).
export const TICKET_PRICE_USD = TICKET_COST;

export const MAX_TICKETS_PER_PURCHASE = 50;
export const MIN_WITHDRAWAL_USD = 1;

// Marca en status_note de las compras con referencia repetida:
// esas compras son SIEMPRE de revisión manual (la validación
// automática las salta para no reclamar el pago de otra compra).
export const DUPLICATE_MARKER = '⚠ Referencia repetida';

// Datos de Pago Móvil a donde paga el jugador (se muestran en el
// modal de compra). Si cambian, se editan aquí.
export const PAYMENT_DESTINATION = {
  banco: 'Banco de Venezuela',
  telefono: '04220165513',
  cedula: '26725053',
  concepto: 'Pago',
} as const;

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  pendiente: 'Pendiente',
  validando: 'Validando',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

export const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalStatus, string> = {
  pendiente: 'En proceso',
  pagado: 'Pagado',
  cancelado: 'Cancelado',
};

// Bancos para el formulario "Datos para recibir tus premios"
export const VE_BANKS = [
  'Banco de Venezuela',
  'Banesco',
  'Banco Mercantil',
  'BBVA Provincial',
  'Banco Nacional de Crédito (BNC)',
  'Banco del Tesoro',
  'Banco Bicentenario',
  'Bancamiga',
  'Banco Exterior',
  'BanCaribe',
  'Banco Activo',
  'Banplus',
  'Mi Banco',
  'Banco Plaza',
  '100% Banco',
  'Bancrecer',
  'Banfanb',
  'Banco Caroní',
  'Banco Sofitasa',
  'Venezolano de Crédito',
] as const;
