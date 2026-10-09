import React, { useState } from 'react';
import {
  ConsortiumRole,
  TradeTerms,
  TradeSummary,
  BalanceRecord,
  RTGSAccount,
  JurisdictionRule,
} from '../types';
import { api } from '../api';
import { CountdownTimer } from './CountdownTimer';
import {
  ArrowLeftRight,
  Lock,
  CheckCircle2,
  AlertOctagon,
  Clock,
  Coins,
  Send,
  ShieldAlert,
  Info,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

interface BankDashboardProps {
  activeRole: ConsortiumRole;
  balances: BalanceRecord[];
  rtgsAccounts: RTGSAccount[];
  trades: TradeTerms[];
  activeTradeSummaries: Record<string, TradeSummary>;
  indiaRule: JurisdictionRule | null;
  sgRule: JurisdictionRule | null;
  onRefresh: () => void;
  onSelectTrade: (tradeId: string) => void;
}

export const BankDashboard: React.FC<BankDashboardProps> = ({
  activeRole,
  balances,
  rtgsAccounts,
  trades,
  activeTradeSummaries,
  indiaRule,
  sgRule,
  onRefresh,
  onSelectTrade,
}) => {
  const isBankA = activeRole === 'BankA-MSP';
  const isBankC = activeRole === 'BankC-MSP';
  const isBank = isBankA || isBankC;

  // New Trade Form State
  const [tradeId, setTradeId] = useState(`TRADE-${Date.now().toString().slice(-6)}`);
  const [counterpartyMSP, setCounterpartyMSP] = useState(isBankA ? 'BankC-MSP' : 'BankA-MSP');
  const [leg1AmountINR, setLeg1AmountINR] = useState(84000000); // 84M INR (~$1M USD)
  const [leg2AmountUSD, setLeg2AmountUSD] = useState(1000000);   // $1M USD
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [submittingTrade, setSubmittingTrade] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Quick Action Loading States
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // RTGS Deposit Form State
  const [depositAmount, setDepositAmount] = useState(10000000);
  const [depositing, setDepositing] = useState(false);

  // Filter balances for current bank
  const myBalances = balances.filter((b) => b.ownerMSP === activeRole);
  const inrBalance = myBalances.find((b) => b.currency === 'INR')?.balance || 0;
  const usdBalance = myBalances.find((b) => b.currency === 'USD')?.balance || 0;

  // Filter RTGS account for current bank
  const myRTGS = rtgsAccounts.find((a) => a.bankMSP === activeRole);

  // Proposed FX rate calculation
  const proposedRate = leg2AmountUSD > 0 ? leg1AmountINR / leg2AmountUSD : 0;
  const baseRate = indiaRule?.baseRate || 84.0;
  const tolerance = indiaRule?.rateTolerancePercent || 10.0;
  const minRate = baseRate * (1 - tolerance / 100);
  const maxRate = baseRate * (1 + tolerance / 100);
  const rateCompliancePass = proposedRate >= minRate && proposedRate <= maxRate;
  const inrLimitPass = !indiaRule || leg1AmountINR <= indiaRule.maxTransactionLimit;
  const usdLimitPass = !sgRule || leg2AmountUSD <= sgRule.maxTransactionLimit;
  const compliancePreflightPass = rateCompliancePass && inrLimitPass && usdLimitPass;

  // Handle Trade Initiation
  const handleInitiateTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setSubmittingTrade(true);

    try {
      const res = await api.initiateTrade({
        tradeId,
        counterpartyMSP,
        leg1AmountINR: Number(leg1AmountINR),
        leg2AmountUSD: Number(leg2AmountUSD),
        timeoutSeconds: Number(timeoutSeconds),
      });

      if (res.status === 'REFUSED') {
        setFormError(`Trade Refused by Sovereign Compliance Rules: ${res.reason}`);
      } else {
        setFormSuccess(`Trade ${tradeId} initiated & 4-party SBE installed on corridor channel!`);
        // generate next trade ID
        setTradeId(`TRADE-${Date.now().toString().slice(-6)}`);
      }
      onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmittingTrade(false);
    }
  };

  // Handle Leg Lock
  const handleLockLeg = async (tId: string, legId: 'LEG1' | 'LEG2') => {
    const key = `${tId}-lock-${legId}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await api.lockTradeLeg(tId, legId);
      onRefresh();
    } catch (err: any) {
      alert(`Lock failed: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Handle Settlement
  const handleSettle = async (tId: string) => {
    const key = `${tId}-settle`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await api.settleTrade(tId);
      onRefresh();
    } catch (err: any) {
      alert(`Settlement failed: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Handle Refund
  const handleRefund = async (tId: string) => {
    const key = `${tId}-refund`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await api.refundTrade(tId);
      onRefresh();
    } catch (err: any) {
      alert(`Refund proposal failed: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Handle Simulated RTGS Deposit
  const handleRTGSDeposit = async () => {
    if (!myRTGS) return;
    setDepositing(true);
    try {
      await api.depositRTGS(activeRole, depositAmount);
      onRefresh();
    } catch (err: any) {
      alert(`RTGS Deposit failed: ${err.message}`);
    } finally {
      setDepositing(false);
    }
  };

  // Helper status color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SETTLED':
        return <span className="badge-status status-settled"><CheckCircle2 className="w-3 h-3" /> Settled</span>;
      case 'ESCROWED':
        return <span className="badge-status status-escrowed"><Lock className="w-3 h-3" /> Both Escrowed</span>;
      case 'LEG1_LOCKED':
        return <span className="badge-status status-locked"><Lock className="w-3 h-3" /> Leg 1 Locked</span>;
      case 'LEG2_LOCKED':
        return <span className="badge-status status-locked"><Lock className="w-3 h-3" /> Leg 2 Locked</span>;
      case 'VALIDATED':
        return <span className="badge-status status-active"><Clock className="w-3 h-3" /> Validated</span>;
      case 'REFUSED':
        return <span className="badge-status status-refused"><AlertOctagon className="w-3 h-3" /> Compliance Refused</span>;
      default:
        if (status.startsWith('TIMED_OUT')) {
          return <span className="badge-status status-refunded"><Clock className="w-3 h-3" /> {status}</span>;
        }
        return <span className="badge-status status-active">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Role Banner / Context */}
      <div className="glass-panel p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-l-4 border-l-indigo-500">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-base text-white">Commercial Bank Trading Portal</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
              Identity: {activeRole}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {isBankA
              ? 'Bank A (India Jurisdiction) — Pledges Leg 1 (INR), swaps for Leg 2 (USD) atomically via 4-Party Endorsement.'
              : isBankC
              ? 'Bank C (Singapore Jurisdiction) — Pledges Leg 2 (USD), swaps for Leg 1 (INR) atomically via 4-Party Endorsement.'
              : `Operating as observer/regulator ${activeRole}. Viewing commercial bank perspective.`}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-white/5">
            Corridor: India (INR) ⇄ Singapore (USD)
          </span>
        </div>
      </div>

      {/* Balance Cards & RTGS Cash Rail */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* On-Chain INR Token Balance */}
        <div className="glass-panel p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>On-Chain Tokenized Reserves (INR)</span>
            <Coins className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-white">
            ₹{inrBalance.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Fabric Ledger Key:</span>
            <span className="font-mono text-slate-300">balance:{activeRole}:INR</span>
          </div>
        </div>

        {/* On-Chain USD Token Balance */}
        <div className="glass-panel p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>On-Chain Tokenized Reserves (USD)</span>
            <DollarSign className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-white">
            ${usdBalance.toLocaleString('en-US')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Fabric Ledger Key:</span>
            <span className="font-mono text-slate-300">balance:{activeRole}:USD</span>
          </div>
        </div>

        {/* Simulated RTGS Cash Reserve Account */}
        <div className="glass-panel p-4 relative overflow-hidden border-cyan-800/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-1">
            <span className="text-cyan-400">RTGS Central Bank Reserve</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40">
              SIMULATED RAIL
            </span>
          </div>
          <div className="text-xl font-extrabold font-mono text-white">
            {myRTGS
              ? `${myRTGS.currency === 'INR' ? '₹' : '$'}${myRTGS.fiatBalance.toLocaleString()}`
              : 'N/A'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Acct: {myRTGS?.accountNumber || 'None'}</span>
            <span className="text-[10px] text-slate-500">Pledged: {myRTGS?.pledgedBalance || 0}</span>
          </div>
          {myRTGS && (
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center gap-2">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value))}
                className="input-field text-xs py-1 px-2"
                placeholder="Amount"
              />
              <button
                onClick={handleRTGSDeposit}
                disabled={depositing}
                className="btn-secondary text-[11px] py-1 px-2 shrink-0"
              >
                {depositing ? 'Crediting...' : '+ Deposit Cash'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Trade Creation & Active Trades Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Initiate New PvP Swap Form */}
        <div className="lg:col-span-5 glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <ArrowLeftRight className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-sm text-white">Initiate Cross-Border PvP Trade</h3>
            </div>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
              4-Party SBE
            </span>
          </div>

          <form onSubmit={handleInitiateTrade} className="space-y-3.5">
            <div>
              <label className="text-xs text-slate-400 font-semibold block mb-1">Trade ID (Immutable)</label>
              <input
                type="text"
                value={tradeId}
                onChange={(e) => setTradeId(e.target.value)}
                required
                className="input-field font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">Initiator (You)</label>
                <input
                  type="text"
                  value={activeRole}
                  disabled
                  className="input-field font-mono text-xs opacity-75"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">Counterparty MSP</label>
                <select
                  value={counterpartyMSP}
                  onChange={(e) => setCounterpartyMSP(e.target.value)}
                  className="input-field text-xs font-mono"
                >
                  <option value="BankC-MSP">BankC-MSP (Singapore)</option>
                  <option value="BankA-MSP">BankA-MSP (India)</option>
                  <option value="BankB-MSP">BankB-MSP (India Client)</option>
                  <option value="BankD-MSP">BankD-MSP (SG Client)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">Leg 1 Amount (INR)</label>
                <input
                  type="number"
                  value={leg1AmountINR}
                  onChange={(e) => setLeg1AmountINR(Number(e.target.value))}
                  required
                  min={1}
                  className="input-field font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">Leg 2 Amount (USD)</label>
                <input
                  type="number"
                  value={leg2AmountUSD}
                  onChange={(e) => setLeg2AmountUSD(Number(e.target.value))}
                  required
                  min={1}
                  className="input-field font-mono text-xs"
                />
              </div>
            </div>

            {/* Live Exchange Rate & Compliance Pre-Flight */}
            <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Proposed FX Rate (INR/USD):</span>
                <span className="font-mono font-bold text-white">{proposedRate.toFixed(4)}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-400">
                <span>Corridor Base Rate & Tolerance:</span>
                <span className="font-mono">
                  {baseRate} ±{tolerance}% ({minRate.toFixed(1)} – {maxRate.toFixed(1)})
                </span>
              </div>
              <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Regulatory Pre-Flight:</span>
                {compliancePreflightPass ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Compliance Pass
                  </span>
                ) : (
                  <span className="text-rose-400 font-semibold flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    {!rateCompliancePass ? 'Rate Tolerance Breach' : 'Exceeds Limits'}
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 font-semibold block mb-1">
                Settlement Cut-Off Window (Seconds)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                  required
                  min={5}
                  max={3600}
                  className="input-field font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setTimeoutSeconds(15)}
                  className="btn-secondary text-[11px] py-1.5 px-2.5 shrink-0"
                  title="Set quick 15s timeout to test automated watcher refund"
                >
                  ⚡ Demo 15s
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Use 15s to test the automated background Expiry Watcher.
              </p>
            </div>

            {formError && (
              <div className="p-2.5 rounded bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs">
                {formSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={submittingTrade}
              className="w-full btn-primary text-xs py-2.5"
            >
              {submittingTrade ? (
                'Submitting Proposal to Corridor Channel...'
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Initiate Trade & Install 4-Party SBE
                </>
              )}
            </button>
          </form>
        </div>

        {/* Active Trades & Corridor Lifecycle Actions */}
        <div className="lg:col-span-7 glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <h3 className="font-bold text-sm text-white">Active Corridor Trades</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Total: {trades.length}
            </span>
          </div>

          {trades.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No trades initiated yet. Use the form on the left to initiate the first trade.
            </div>
          ) : (
            <div className="space-y-4 max-h-[620px] overflow-y-auto pr-1">
              {trades.map((trade) => {
                const summary = activeTradeSummaries[trade.tradeId];
                const derivedStatus = summary?.derivedStatus || 'VALIDATED';
                const isTerminal = [
                  'SETTLED',
                  'REFUSED',
                  'TIMED_OUT_NO_FUNDS',
                  'TIMED_OUT_BOTH_REFUNDED',
                  'TIMED_OUT_LEG1_REFUNDED',
                  'TIMED_OUT_LEG2_REFUNDED',
                ].includes(derivedStatus);

                const leg1Locked = summary?.escrowLeg1?.status === 'LOCKED';
                const leg2Locked = summary?.escrowLeg2?.status === 'LOCKED';

                return (
                  <div
                    key={trade.tradeId}
                    className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 transition space-y-3"
                  >
                    {/* Header: Trade ID & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-xs text-white">
                            {trade.tradeId}
                          </span>
                          {getStatusBadge(derivedStatus)}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {trade.initiatorMSP} ⇄ {trade.counterpartyMSP}
                        </div>
                      </div>

                      <button
                        onClick={() => onSelectTrade(trade.tradeId)}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium underline"
                      >
                        Audit Details →
                      </button>
                    </div>

                    {/* Financial Leg Amounts */}
                    <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-black/30 font-mono text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Leg 1 (INR)</span>
                        <span className="text-amber-400 font-semibold">
                          ₹{trade.leg1AmountINR.toLocaleString('en-IN')}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-1">
                          ({leg1Locked ? '🔒 LOCKED' : '⏳ PENDING'})
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Leg 2 (USD)</span>
                        <span className="text-cyan-400 font-semibold">
                          ${trade.leg2AmountUSD.toLocaleString('en-US')}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-1">
                          ({leg2Locked ? '🔒 LOCKED' : '⏳ PENDING'})
                        </span>
                      </div>
                    </div>

                    {/* Settlement Cut-off countdown */}
                    <CountdownTimer
                      expiresAt={trade.expiresAt}
                      isTerminal={isTerminal}
                      onElapsed={() => onRefresh()}
                    />

                    {/* Lifecycle Action Buttons */}
                    {!isTerminal && (
                      <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-2">
                        {/* Bank A Lock Leg 1 Button */}
                        {!leg1Locked && (
                          <button
                            onClick={() => handleLockLeg(trade.tradeId, 'LEG1')}
                            disabled={actionLoading[`${trade.tradeId}-lock-LEG1`]}
                            className="btn-primary text-xs py-1.5 px-3 bg-gradient-to-r from-amber-600 to-amber-500"
                          >
                            <Lock className="w-3 h-3" />
                            Lock Leg 1 (INR)
                          </button>
                        )}

                        {/* Bank C Lock Leg 2 Button */}
                        {!leg2Locked && (
                          <button
                            onClick={() => handleLockLeg(trade.tradeId, 'LEG2')}
                            disabled={actionLoading[`${trade.tradeId}-lock-LEG2`]}
                            className="btn-primary text-xs py-1.5 px-3 bg-gradient-to-r from-cyan-600 to-cyan-500"
                          >
                            <Lock className="w-3 h-3" />
                            Lock Leg 2 (USD)
                          </button>
                        )}

                        {/* 4-Party Mutual SBE PvP Swap Button */}
                        {derivedStatus === 'ESCROWED' && (
                          <button
                            onClick={() => handleSettle(trade.tradeId)}
                            disabled={actionLoading[`${trade.tradeId}-settle`]}
                            className="btn-primary text-xs py-1.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-500 shadow-lg shadow-emerald-500/20"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Execute 4-Party PvP Swap
                          </button>
                        )}

                        {/* Timeout Refund Button */}
                        <button
                          onClick={() => handleRefund(trade.tradeId)}
                          disabled={actionLoading[`${trade.tradeId}-refund`]}
                          className="btn-secondary text-xs py-1.5 px-3 text-purple-300 hover:text-white hover:border-purple-500"
                          title="Propose Approach B timeout refund post-deadline"
                        >
                          <Clock className="w-3 h-3 text-purple-400" />
                          Propose Refund (Approach B)
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
