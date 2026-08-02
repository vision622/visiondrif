'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DerivWS, ActiveSymbol, Tick, BuyResponse } from '@deriv/core';
import { getLastDigit } from '@/lib/digit-stats';
import {
  FOUR_TRADE_LEGS,
  type FourTradeLeg,
  type FourTradeStakes,
  type FourTradeRoundLog,
  type FourTradeLegResult,
  type FourTradeStats,
} from '@/lib/types';

export interface UseFourTradeBotParams {
  ws: DerivWS | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  activeSymbol: ActiveSymbol | null;
  currentTick: Tick | null;
}

export interface UseFourTradeBotReturn {
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  stakes: FourTradeStakes;
  setStake: (leg: FourTradeLeg, value: string) => void;
  duration: number;
  setDuration: (value: number) => void;
  log: FourTradeRoundLog[];
  clearLog: () => void;
  isFiring: boolean;
  startError: string | null;
  stats: FourTradeStats;
  reset: () => void;
}

const MAX_LOG_ENTRIES = 30;

const DEFAULT_STAKES: FourTradeStakes = {
  over4: '0.35',
  under4: '0.20',
  over5: '0.50',
  under5: '0.10',
};

export function useFourTradeBot({
  ws,
  isConnected,
  isAuthenticated,
  activeSymbol,
  currentTick,
}: UseFourTradeBotParams): UseFourTradeBotReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [stakes, setStakes] = useState<FourTradeStakes>(DEFAULT_STAKES);
  const [duration, setDuration] = useState<number>(1);
  const [log, setLog] = useState<FourTradeRoundLog[]>([]);
  const [isFiring, setIsFiring] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [settlements, setSettlements] = useState<
    Record<number, { won: boolean; profit: number; payout: number }>
  >({});
  // Running totals — kept separate from `log` so trimming old log entries
  // (MAX_LOG_ENTRIES) never silently drops them from the summary stats.
  const [stats, setStats] = useState<FourTradeStats>({
    noOfRuns: 0,
    totalStake: 0,
    totalPayout: 0,
    totalProfitLoss: 0,
    contractsWon: 0,
    contractsLost: 0,
    contractsPending: 0,
  });

  // Refs mirror latest state/props so the tick-driven effect below never
  // fires with stale closures without needing to resubscribe every render.
  const isRunningRef = useRef(false);
  const firingRef = useRef(false);
  const lastEpochRef = useRef<number | null>(null);
  const stakesRef = useRef(stakes);
  const durationRef = useRef(duration);
  const roundIdRef = useRef(0);
  const trackedContractIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    stakesRef.current = stakes;
  }, [stakes]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const setStake = useCallback((leg: FourTradeLeg, value: string) => {
    setStakes(prev => ({ ...prev, [leg]: value }));
  }, []);

  const clearLog = useCallback(() => setLog([]), []);

  const start = useCallback(() => {
    const stakeValues = Object.values(stakesRef.current);
    const invalid = stakeValues.some(v => {
      const n = parseFloat(v);
      return !v || isNaN(n) || n <= 0;
    });
    if (invalid) {
      setStartError('Enter a valid stake greater than 0 for all four contracts.');
      return;
    }
    if (!isConnected || !isAuthenticated) {
      setStartError('Log in and wait for the connection before starting the bot.');
      return;
    }
    if (!activeSymbol) {
      setStartError('Select a market before starting the bot.');
      return;
    }
    setStartError(null);
    lastEpochRef.current = currentTick?.epoch ?? null;
    isRunningRef.current = true;
    setIsRunning(true);
  }, [isConnected, isAuthenticated, activeSymbol, currentTick]);

  const stop = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
  }, []);

  // Auto-stop if the connection drops or the user logs out mid-run.
  useEffect(() => {
    if (isRunningRef.current && (!isConnected || !isAuthenticated)) {
      stop();
      setStartError('Bot stopped — connection or session was lost.');
    }
  }, [isConnected, isAuthenticated, stop]);

  const fireRound = useCallback(
    async (symbol: string, triggerDigit: number) => {
      if (!ws) return;
      firingRef.current = true;
      setIsFiring(true);

      const currentStakes = stakesRef.current;
      const currentDuration = durationRef.current;

      const settled = await Promise.allSettled(
        FOUR_TRADE_LEGS.map(leg => {
          const amount = parseFloat(currentStakes[leg.key]);
          return ws.send<BuyResponse>({
            buy: 1,
            price: amount,
            parameters: {
              amount,
              basis: 'stake',
              contract_type: leg.contractType,
              currency: 'USD',
              symbol,
              duration: currentDuration,
              duration_unit: 't',
              barrier: leg.barrier,
            },
          });
        })
      );

      const results: FourTradeLegResult[] = settled.map((outcome, i) => {
        const leg = FOUR_TRADE_LEGS[i].key;
        if (outcome.status === 'fulfilled' && outcome.value.buy) {
          const buy = outcome.value.buy;
          trackedContractIds.current.add(buy.contract_id);
          return {
            leg,
            status: 'success',
            contractId: buy.contract_id,
            buyPrice: buy.buy_price,
            payout: buy.payout,
            settlement: 'pending',
          };
        }
        const message =
          outcome.status === 'rejected'
            ? outcome.reason instanceof Error
              ? outcome.reason.message
              : 'Purchase failed'
            : 'Purchase failed';
        return { leg, status: 'error', errorMessage: message };
      });

      roundIdRef.current += 1;
      setLog(prev => [
        { id: roundIdRef.current, time: Date.now(), triggerDigit, symbol, results },
        ...prev,
      ].slice(0, MAX_LOG_ENTRIES));

      const roundStake = results.reduce((sum, r) => sum + (r.status === 'success' ? (r.buyPrice ?? 0) : 0), 0);
      const roundPendingCount = results.filter(r => r.status === 'success').length;
      setStats(prev => ({
        ...prev,
        noOfRuns: prev.noOfRuns + 1,
        totalStake: prev.totalStake + roundStake,
        contractsPending: prev.contractsPending + roundPendingCount,
      }));

      firingRef.current = false;
      setIsFiring(false);
    },
    [ws]
  );

  // Fire a round every time a new tick arrives while the bot is running.
  useEffect(() => {
    if (!isRunning || !currentTick || !activeSymbol) return;
    if (currentTick.epoch === lastEpochRef.current) return;
    if (firingRef.current) return; // previous round still in flight — skip this tick rather than pile up

    lastEpochRef.current = currentTick.epoch;
    const triggerDigit = getLastDigit(currentTick.quote, currentTick.pip_size);
    void fireRound(activeSymbol.underlying_symbol, triggerDigit);
  }, [currentTick, isRunning, activeSymbol, fireRound]);

  // Listen for contract settlements. Piggybacks on the account-wide
  // proposal_open_contract stream that's already active elsewhere in the app
  // (useOpenPositions keeps it subscribed) — we just filter for our own
  // contract ids rather than opening a second subscription.
  useEffect(() => {
    if (!ws) return;
    return ws.onMessage(data => {
      if (data.msg_type !== 'proposal_open_contract') return;
      const contract = data.proposal_open_contract as Record<string, unknown> | undefined;
      if (!contract) return;
      const contractId = contract.contract_id as number | undefined;
      if (!contractId || !trackedContractIds.current.has(contractId)) return;
      if (!contract.is_sold && !contract.is_expired) return; // still open — wait for the final update
      trackedContractIds.current.delete(contractId); // guard against duplicate settlement messages

      const profit = parseFloat(String(contract.profit ?? '0'));
      const payout = parseFloat(String(contract.payout ?? '0'));
      const won = profit > 0;

      setSettlements(prev => ({ ...prev, [contractId]: { won, profit, payout } }));
      setStats(prev => ({
        ...prev,
        contractsPending: Math.max(0, prev.contractsPending - 1),
        contractsWon: prev.contractsWon + (won ? 1 : 0),
        contractsLost: prev.contractsLost + (won ? 0 : 1),
        totalPayout: prev.totalPayout + (won ? payout : 0),
        totalProfitLoss: prev.totalProfitLoss + profit,
      }));
    });
  }, [ws]);

  // Merge settlement results into the matching round-log entries as they arrive
  // (purely for display in the Journal/Transactions tabs — stats above are
  // already accumulated independently of this).
  useEffect(() => {
    setLog(prev =>
      prev.map(round => {
        let changed = false;
        const results = round.results.map(r => {
          if (r.contractId != null && r.settlement === 'pending' && settlements[r.contractId]) {
            changed = true;
            const s = settlements[r.contractId];
            return { ...r, settlement: s.won ? ('won' as const) : ('lost' as const), profit: s.profit };
          }
          return r;
        });
        return changed ? { ...round, results } : round;
      })
    );
  }, [settlements]);

  const reset = useCallback(() => {
    setLog([]);
    setSettlements({});
    trackedContractIds.current.clear();
    roundIdRef.current = 0;
    setStats({
      noOfRuns: 0,
      totalStake: 0,
      totalPayout: 0,
      totalProfitLoss: 0,
      contractsWon: 0,
      contractsLost: 0,
      contractsPending: 0,
    });
  }, []);

  return {
    isRunning,
    start,
    stop,
    stakes,
    setStake,
    duration,
    setDuration,
    log,
    clearLog,
    isFiring,
    startError,
    stats,
    reset,
  };
}
