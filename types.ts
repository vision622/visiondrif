// Re-export shared trading types from @deriv/core
export type {
  ActiveSymbol,
  Tick,
  TicksHistoryResponse,
  ContractsForResponse,
  ContractInfo,
  DurationLimits,
  ProposalResponse,
  ProposalInfo,
  BuyResponse,
  BuyResult,
} from '@deriv/core';

// Re-export shared position types from shared hooks
export type { OpenPosition } from '@/hooks/use-open-positions';
export type { ClosedPosition } from '@/hooks/use-closed-positions';
export type { PositionFilter } from '@/components/custom/positions-table';

// Digit-specific types

export type ContractMode =
  | 'DIGITMATCH'
  | 'DIGITDIFF'
  | 'DIGITOVER'
  | 'DIGITUNDER'
  | 'DIGITEVEN'
  | 'DIGITODD';

export type TradeType = 'matches-differs' | 'over-under' | 'even-odd';

export interface DigitStats {
  /** Count of each digit 0-9 from tick history */
  counts: number[];
  /** Percentage of each digit 0-9 */
  percentages: number[];
  /** Total number of ticks analyzed */
  totalTicks: number;
}

// Four-Trade Bot types (Over 4 / Under 4 / Over 5 / Under 5 fired together on every tick)

export type FourTradeLeg = 'over4' | 'under4' | 'over5' | 'under5';

export const FOUR_TRADE_LEGS: { key: FourTradeLeg; label: string; contractType: 'DIGITOVER' | 'DIGITUNDER'; barrier: number }[] = [
  { key: 'over4', label: 'Over 4', contractType: 'DIGITOVER', barrier: 4 },
  { key: 'under4', label: 'Under 4', contractType: 'DIGITUNDER', barrier: 4 },
  { key: 'over5', label: 'Over 5', contractType: 'DIGITOVER', barrier: 5 },
  { key: 'under5', label: 'Under 5', contractType: 'DIGITUNDER', barrier: 5 },
];

export type FourTradeStakes = Record<FourTradeLeg, string>;

export interface FourTradeLegResult {
  leg: FourTradeLeg;
  status: 'success' | 'error';
  contractId?: number;
  buyPrice?: number;
  payout?: number;
  errorMessage?: string;
  /** Populated once the contract resolves via the proposal_open_contract stream. */
  settlement?: 'pending' | 'won' | 'lost';
  profit?: number;
}

export interface FourTradeRoundLog {
  id: number;
  time: number;
  triggerDigit: number;
  symbol: string;
  results: FourTradeLegResult[];
}

export interface FourTradeStats {
  noOfRuns: number;
  totalStake: number;
  totalPayout: number;
  totalProfitLoss: number;
  contractsWon: number;
  contractsLost: number;
  contractsPending: number;
}

