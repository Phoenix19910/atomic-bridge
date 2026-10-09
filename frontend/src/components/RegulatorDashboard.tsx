import React, { useState } from 'react';
import {
  ConsortiumRole,
  JurisdictionRule,
  BalanceRecord,
  SystemHealth,
} from '../types';
import { api } from '../api';
import {
  Landmark,
  ShieldCheck,
  Coins,
  Play,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Sparkles,
} from 'lucide-react';

interface RegulatorDashboardProps {
  activeRole: ConsortiumRole;
  indiaRule: JurisdictionRule | null;
  sgRule: JurisdictionRule | null;
  balances: BalanceRecord[];
  health: SystemHealth | null;
  onRefresh: () => void;
}

export const RegulatorDashboard: React.FC<RegulatorDashboardProps> = ({
  activeRole,
  indiaRule,
  sgRule,
  balances,
  health,
  onRefresh,
}) => {
  const isRBI = activeRole === 'RBI-MSP';
  const isMAS = activeRole === 'MAS-MSP';
  const isRegulator = isRBI || isMAS;

  // Rule Form State
  const targetJurisdiction = isMAS ? 'SINGAPORE' : 'INDIA';
  const currentRule = isMAS ? sgRule : indiaRule;

  const [maxTxLimit, setMaxTxLimit] = useState<number>(currentRule?.maxTransactionLimit || 1000000000);
  const [dailyLimit, setDailyLimit] = useState<number>(currentRule?.dailyLimit || 5000000000);
  const [baseRate, setBaseRate] = useState<number>(currentRule?.baseRate || 84.0);
  const [rateTolerance, setRateTolerance] = useState<number>(currentRule?.rateTolerancePercent || 10.0);
  const [cutOffHour, setCutOffHour] = useState<number>(currentRule?.cutOffHourUTC || 18);
  const [savingRule, setSavingRule] = useState(false);
  const [ruleMessage, setRuleMessage] = useState<string | null>(null);

  // Sovereign Minting State
  const [mintTargetMSP, setMintTargetMSP] = useState<string>(isMAS ? 'BankC-MSP' : 'BankA-MSP');
  const [mintCurrency, setMintCurrency] = useState<'INR' | 'USD'>(isMAS ? 'USD' : 'INR');
  const [mintAmount, setMintAmount] = useState<number>(isMAS ? 5000000 : 100000000);
  const [minting, setMinting] = useState(false);
  const [mintResult, setMintResult] = useState<any>(null);

  // Watcher State
  const [watcherTriggering, setWatcherTriggering] = useState(false);
  const [watcherResult, setWatcherResult] = useState<any>(null);

  // Update Jurisdiction Rule
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRule(true);
    setRuleMessage(null);
    try {
      await api.setRule({
        jurisdiction: targetJurisdiction,
        maxTransactionLimit: Number(maxTxLimit),
        dailyLimit: Number(dailyLimit),
        baseRate: Number(baseRate),
        rateTolerancePercent: Number(rateTolerance),
        cutOffHourUTC: Number(cutOffHour),
      });
      setRuleMessage(`Jurisdiction rule for ${targetJurisdiction} successfully committed to ledger!`);
      onRefresh();
    } catch (err: any) {
      setRuleMessage(`Error: ${err.message}`);
    } finally {
      setSavingRule(false);
    }
  };

  // Perform Sovereign Token Minting with RTGS confirmation
  const handleMintTokens = async (e: React.FormEvent) => {
    e.preventDefault();
    setMinting(true);
    setMintResult(null);
    try {
      const res = await api.confirmMintRTGS(mintTargetMSP, mintCurrency, Number(mintAmount));
      setMintResult(res);
      onRefresh();
    } catch (err: any) {
      setMintResult({ success: false, error: err.message });
    } finally {
      setMinting(false);
    }
  };

  // Trigger Watcher Scan
  const handleTriggerWatcher = async () => {
    setWatcherTriggering(true);
    try {
      const res = await api.triggerWatcher();
      setWatcherResult(res);
      onRefresh();
    } catch (err: any) {
      alert(`Watcher trigger error: ${err.message}`);
    } finally {
      setWatcherTriggering(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Regulator Header Banner */}
      <div className="glass-panel p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-l-4 border-l-amber-500">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-base text-white">Central Bank Regulatory Oversight Console</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">
              Authority: {activeRole}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {isRBI
              ? 'Reserve Bank of India (RBI) — Sovereign issuer of INR reserves, sets India corridor limits, mandates settlement endorsement.'
              : isMAS
              ? 'Monetary Authority of Singapore (MAS) — Sovereign issuer of USD reserves, sets Singapore corridor limits, mandates settlement endorsement.'
              : 'Consortium Regulatory Console. Viewing sovereign parameters.'}
          </p>
        </div>
        <div className="flex items-center space-x-2 text-[11px] font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-white/5">
          <span>Target Jurisdiction: </span>
          <span className="font-bold text-amber-400">{targetJurisdiction}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Jurisdiction Rule Management */}
        <div className="lg:col-span-6 glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-sm text-white">
                Corridor Jurisdiction Rules ({targetJurisdiction})
              </h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              rule:{targetJurisdiction}
            </span>
          </div>

          <form onSubmit={handleSaveRule} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  Max Single Tx Limit ({isMAS ? 'USD' : 'INR'})
                </label>
                <input
                  type="number"
                  value={maxTxLimit}
                  onChange={(e) => setMaxTxLimit(Number(e.target.value))}
                  required
                  className="input-field font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  Daily Corridor Limit ({isMAS ? 'USD' : 'INR'})
                </label>
                <input
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                  required
                  className="input-field font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  Base FX Rate (INR/USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={baseRate}
                  onChange={(e) => setBaseRate(Number(e.target.value))}
                  required
                  className="input-field font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  Rate Tolerance (±%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={rateTolerance}
                  onChange={(e) => setRateTolerance(Number(e.target.value))}
                  required
                  className="input-field font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  Cut-Off Hour (UTC)
                </label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={cutOffHour}
                  onChange={(e) => setCutOffHour(Number(e.target.value))}
                  required
                  className="input-field font-mono text-xs"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-1">
              <span className="text-slate-400 block font-semibold">Active Rule Details:</span>
              <div className="text-[11px] text-slate-300 font-mono flex justify-between">
                <span>Allowed Band:</span>
                <span>
                  {(baseRate * (1 - rateTolerance / 100)).toFixed(2)} to{' '}
                  {(baseRate * (1 + rateTolerance / 100)).toFixed(2)}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 font-mono flex justify-between">
                <span>Last Updated:</span>
                <span>{currentRule?.updatedAt || 'Default ledger state'}</span>
              </div>
            </div>

            {ruleMessage && (
              <div className="p-2.5 rounded bg-slate-900 border border-slate-700 text-xs text-amber-300">
                {ruleMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={savingRule}
              className="w-full btn-primary text-xs py-2 bg-gradient-to-r from-amber-600 to-amber-500"
            >
              {savingRule ? 'Committing Rule to Fabric...' : 'Update Jurisdiction Rules on Ledger'}
            </button>
          </form>
        </div>

        {/* Central Bank Sovereign Tokenization Console */}
        <div className="lg:col-span-6 glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Coins className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">Central Bank Reserve Tokenization</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40">
              RTGS Fiat ⇄ On-Chain Mint
            </span>
          </div>

          <form onSubmit={handleMintTokens} className="space-y-3.5">
            <div>
              <label className="text-xs text-slate-400 font-semibold block mb-1">
                Recipient Member Bank MSP
              </label>
              <select
                value={mintTargetMSP}
                onChange={(e) => setMintTargetMSP(e.target.value)}
                className="input-field text-xs font-mono"
              >
                <option value="BankA-MSP">BankA-MSP (Commercial Bank India)</option>
                <option value="BankC-MSP">BankC-MSP (Commercial Bank Singapore)</option>
                <option value="BankB-MSP">BankB-MSP (Client Bank India)</option>
                <option value="BankD-MSP">BankD-MSP (Client Bank Singapore)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  Token Currency
                </label>
                <select
                  value={mintCurrency}
                  onChange={(e) => setMintCurrency(e.target.value as 'INR' | 'USD')}
                  className="input-field text-xs font-mono"
                >
                  <option value="INR">INR (RBI Sovereign Token)</option>
                  <option value="USD">USD (MAS Sovereign Token)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  Amount to Mint
                </label>
                <input
                  type="number"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(Number(e.target.value))}
                  required
                  min={1}
                  className="input-field font-mono text-xs"
                />
              </div>
            </div>

            {/* Documented Confirmation Steps Explanation */}
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/30 text-xs space-y-1.5">
              <div className="flex items-center space-x-1.5 text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Documented Confirmation Steps:</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                1. <strong>RTGS Fiat Hold:</strong> Verifies fiat reserves pledged by commercial bank in Central Bank account.<br/>
                2. <strong>On-Chain Mint:</strong> Invokes <code>MintTokens</code> under <code>{activeRole}</code>, crediting tokenized reserve balance.
              </p>
            </div>

            {mintResult && (
              <div
                className={`p-2.5 rounded text-xs ${
                  mintResult.success
                    ? 'bg-emerald-950/50 border border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/50 border border-rose-800 text-rose-300'
                }`}
              >
                {mintResult.success ? mintResult.message : mintResult.error}
              </div>
            )}

            <button
              type="submit"
              disabled={minting}
              className="w-full btn-primary text-xs py-2 bg-gradient-to-r from-emerald-600 to-teal-500"
            >
              {minting ? 'Pledging Fiat & Minting On-Chain...' : 'Execute Sovereign Mint & Credit Ledger'}
            </button>
          </form>
        </div>

        {/* Automated Background Expiry Watcher Monitor */}
        <div className="lg:col-span-12 glass-panel p-5 border-purple-800/30">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-purple-400" />
              <div>
                <h3 className="font-bold text-sm text-white">Automated Background Expiry Watcher</h3>
                <p className="text-xs text-slate-400">
                  Consortium service identity operating under <code>RBI-MSP</code> / <code>MAS-MSP</code> with Approach B refund rules.
                </p>
              </div>
            </div>

            <button
              onClick={handleTriggerWatcher}
              disabled={watcherTriggering}
              className="btn-secondary text-xs py-1.5 px-3 text-purple-300 hover:text-white border-purple-800/60"
            >
              <RotateCw className={`w-3.5 h-3.5 ${watcherTriggering ? 'animate-spin' : ''}`} />
              {watcherTriggering ? 'Scanning...' : 'Trigger Immediate Watcher Scan'}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-black/40 border border-white/5">
              <span className="text-[10px] text-slate-500 block">Service Status</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1.5 mt-0.5">
                <span className="pulse-indicator bg-emerald-400" /> ACTIVE (Daemon)
              </span>
            </div>
            <div className="p-3 rounded-lg bg-black/40 border border-white/5">
              <span className="text-[10px] text-slate-500 block">Polling Interval</span>
              <span className="text-white font-bold mt-0.5 block">
                {health?.watcher.intervalMs || 5000}ms
              </span>
            </div>
            <div className="p-3 rounded-lg bg-black/40 border border-white/5">
              <span className="text-[10px] text-slate-500 block">Total Scans Executed</span>
              <span className="text-white font-bold mt-0.5 block">
                {health?.watcher.totalScans || 0}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-black/40 border border-white/5">
              <span className="text-[10px] text-slate-500 block">Automated Refunds Triggered</span>
              <span className="text-purple-400 font-bold mt-0.5 block">
                {health?.watcher.totalRefundsTriggered || 0}
              </span>
            </div>
          </div>

          {watcherResult && (
            <div className="mt-3 p-2.5 rounded bg-purple-950/40 border border-purple-800/40 text-xs text-purple-300">
              Watcher scan completed: {JSON.stringify(watcherResult.result)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
