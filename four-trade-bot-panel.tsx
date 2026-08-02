'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CircleDot, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  FOUR_TRADE_LEGS,
  type FourTradeLeg,
  type FourTradeStakes,
  type FourTradeRoundLog,
  type FourTradeStats,
} from '@/lib/types';

type BotTab = 'summary' | 'transactions' | 'journal';

interface FourTradeBotPanelProps {
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  stakes: FourTradeStakes;
  onStakeChange: (leg: FourTradeLeg, value: string) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  stats: FourTradeStats;
  log: FourTradeRoundLog[];
  onReset: () => void;
  isFiring: boolean;
  startError: string | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  symbolName?: string;
}

function StatCell({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="text-center">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${valueClassName ?? ''}`}>{value}</p>
    </div>
  );
}

export function FourTradeBotPanel({
  isRunning,
  onStart,
  onStop,
  stakes,
  onStakeChange,
  duration,
  onDurationChange,
  stats,
  log,
  onReset,
  isFiring,
  startError,
  isConnected,
  isAuthenticated,
  symbolName,
}: FourTradeBotPanelProps) {
  const [tab, setTab] = useState<BotTab>('summary');

  useEffect(() => {
    if (startError) toast.error('Bot not started', { description: startError });
  }, [startError]);

  const pnlPositive = stats.totalProfitLoss > 0;
  const pnlNegative = stats.totalProfitLoss < 0;

  // Flatten the round log into one row per leg attempt, most recent first — used by the Transactions tab.
  const transactions = log.flatMap(round =>
    round.results.map(r => ({ roundId: round.id, time: round.time, triggerDigit: round.triggerDigit, ...r }))
  );

  return (
    <Card className="shrink-0 border shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            Four-Leg Hedge Bot
          </CardTitle>
          <Badge
            className={
              isRunning
                ? 'bg-buy-background text-buy-foreground gap-1.5 animate-pulse'
                : 'bg-muted text-muted-foreground gap-1.5'
            }
          >
            <CircleDot className="h-3 w-3" />
            {isRunning ? (isFiring ? 'Firing…' : 'Running') : 'Not running'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Default: Digit Over 4, Digit Under 4, Digit Over 5 and Digit Under 5 — all four legs fired together on
          every tick{symbolName ? ` on ${symbolName}` : ''}.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            This places real trades automatically, one round every tick, for as long as it runs. Keep this
            tab open and watch your balance — stop the bot any time.
          </p>
        </div>

        {/* Run / Stop */}
        <Button
          className="w-full h-11 rounded-full text-base"
          variant={isRunning ? 'destructive' : 'buy'}
          disabled={!isRunning && (!isConnected || !isAuthenticated)}
          onClick={isRunning ? onStop : onStart}
        >
          {isRunning ? 'Stop Bot' : 'Run Bot'}
        </Button>
        {!isAuthenticated && (
          <p className="text-xs text-center text-muted-foreground -mt-2">Log in to start the bot.</p>
        )}

        {/* Leg cards */}
        <div className="grid grid-cols-2 gap-3">
          {FOUR_TRADE_LEGS.map(leg => (
            <div key={leg.key} className="rounded-lg border border-border p-2.5 space-y-2 bg-muted/10">
              <div className="space-y-0.5">
                <p className="text-[11px] text-muted-foreground">Type</p>
                <p className="text-xs font-semibold">
                  Digit {leg.contractType === 'DIGITOVER' ? 'Over' : 'Under'}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[11px] text-muted-foreground">Barrier</p>
                <p className="text-xs font-semibold">{leg.barrier}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`stake-${leg.key}`} className="text-[11px] text-muted-foreground">
                  Stake
                </Label>
                <Input
                  id={`stake-${leg.key}`}
                  type="number"
                  value={stakes[leg.key]}
                  onChange={e => onStakeChange(leg.key, e.target.value)}
                  onKeyDown={e => {
                    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                  }}
                  disabled={isRunning}
                  min={0}
                  step="0.01"
                  labelRight="USD"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bot-duration" className="text-xs text-muted-foreground">
            Contract duration
          </Label>
          <Input
            id="bot-duration"
            type="number"
            value={duration}
            onChange={e => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val > 0) onDurationChange(val);
            }}
            disabled={isRunning}
            min={1}
            step={1}
            labelRight="Ticks"
          />
        </div>

        {/* Tabs */}
        <ToggleGroup
          type="single"
          value={tab}
          onValueChange={value => {
            if (value) setTab(value as BotTab);
          }}
          className="w-full gap-0 rounded-full bg-muted p-1"
        >
          <ToggleGroupItem
            value="summary"
            className="flex-1 rounded-full text-xs font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:font-bold data-[state=on]:shadow-sm"
          >
            Summary
          </ToggleGroupItem>
          <ToggleGroupItem
            value="transactions"
            className="flex-1 rounded-full text-xs font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:font-bold data-[state=on]:shadow-sm"
          >
            Transactions
          </ToggleGroupItem>
          <ToggleGroupItem
            value="journal"
            className="flex-1 rounded-full text-xs font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:font-bold data-[state=on]:shadow-sm"
          >
            Journal
          </ToggleGroupItem>
        </ToggleGroup>

        {tab === 'summary' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3 grid grid-cols-3 gap-y-3">
              <StatCell label="Total stake" value={`${stats.totalStake.toFixed(2)} USD`} />
              <StatCell label="Total payout" value={`${stats.totalPayout.toFixed(2)} USD`} />
              <StatCell label="No. of runs" value={String(stats.noOfRuns)} />
              <StatCell label="Contracts lost" value={String(stats.contractsLost)} />
              <StatCell label="Contracts won" value={String(stats.contractsWon)} />
              <StatCell
                label="Total profit/loss"
                value={`${stats.totalProfitLoss >= 0 ? '+' : ''}${stats.totalProfitLoss.toFixed(2)} USD`}
                valueClassName={pnlPositive ? 'text-buy-background' : pnlNegative ? 'text-destructive' : ''}
              />
            </div>
            {stats.contractsPending > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {stats.contractsPending} contract{stats.contractsPending === 1 ? '' : 's'} still settling…
              </p>
            )}
            <Button variant="outline" className="w-full h-9 rounded-full text-xs" onClick={onReset}>
              Reset
            </Button>
          </div>
        )}

        {tab === 'transactions' && (
          <div className="space-y-1.5">
            {transactions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No trades yet.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {transactions.map((t, i) => {
                  const legMeta = FOUR_TRADE_LEGS.find(l => l.key === t.leg);
                  return (
                    <div key={`${t.roundId}-${t.leg}-${i}`} className="p-2 text-xs flex items-center justify-between">
                      <div>
                        <p className="font-medium">{legMeta?.label}</p>
                        <p className="text-muted-foreground">{new Date(t.time).toLocaleTimeString()}</p>
                      </div>
                      <div className="text-right">
                        {t.status === 'error' ? (
                          <span className="text-destructive font-medium">failed</span>
                        ) : t.settlement === 'won' ? (
                          <span className="text-buy-background font-medium">
                            +{(t.profit ?? 0).toFixed(2)} USD
                          </span>
                        ) : t.settlement === 'lost' ? (
                          <span className="text-destructive font-medium">
                            {(t.profit ?? 0).toFixed(2)} USD
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-medium">pending…</span>
                        )}
                        <p className="text-muted-foreground">#{t.contractId ?? '—'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'journal' && (
          <div className="space-y-1.5">
            {log.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No rounds fired yet.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {log.map(round => (
                  <div key={round.id} className="p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>{new Date(round.time).toLocaleTimeString()}</span>
                      <span>
                        digit{' '}
                        <span className="inline-flex w-4 h-4 rounded-full bg-primary text-primary-foreground items-center justify-center text-[10px] font-bold">
                          {round.triggerDigit}
                        </span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      {round.results.map(r => (
                        <div key={r.leg} className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            {FOUR_TRADE_LEGS.find(l => l.key === r.leg)?.label}
                          </span>
                          {r.status === 'success' ? (
                            <span
                              className={
                                r.settlement === 'won'
                                  ? 'text-buy-background font-medium'
                                  : r.settlement === 'lost'
                                    ? 'text-destructive font-medium'
                                    : 'text-muted-foreground font-medium'
                              }
                            >
                              #{r.contractId}
                            </span>
                          ) : (
                            <span
                              className="text-destructive font-medium truncate max-w-[100px]"
                              title={r.errorMessage}
                            >
                              failed
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
