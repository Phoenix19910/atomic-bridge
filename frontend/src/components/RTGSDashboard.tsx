import React, { useState } from 'react';
import { RTGSAccount, RTGSTransaction } from '../types';
import { api } from '../api';
import {
  Coins,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  Building2,
  Landmark,
  CheckCircle2,
  Clock,
  RefreshCw,
} from 'lucide-react';

interface RTGSDashboardProps {
  accounts: RTGSAccount[];
  transactions: RTGSTransaction[];
  onRefresh: () => void;
}

export const RTGSDashboard: React.FC<RTGSDashboardProps> = ({
  accounts,
  transactions,
  onRefresh,
}) => {
  const [selectedBank, setSelectedBank] = useState<string>('BankA-MSP');
  const [amount, setAmount] = useState<number>(50000000);
  const [actionType, setActionType] = useState<'DEPOSIT' | 'PAYOUT'>('DEPOSIT');
  const [loading, setLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const selectedAccount = accounts.find((a) => a.bankMSP === selectedBank);

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setLoading(true);
    setResultMsg(null);

    try {
      if (actionType === 'DEPOSIT') {
        const res = await api.depositRTGS(selectedBank, Number(amount));
        setResultMsg(`Successfully deposited ${amount.toLocaleString()} ${selectedAccount.currency} to ${selectedBank} reserve account.`);
      } else {
        const res = await api.payoutRTGS(selectedBank, selectedAccount.currency, Number(amount));
        setResultMsg(`Successfully burned tokens on-chain and released ${amount.toLocaleString()} ${selectedAccount.currency} RTGS payout.`);
      }
      onRefresh();
    } catch (err: any) {
      setResultMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Prominent Simulated Disclaimer Banner */}
      <div className="glass-panel p-4 border-l-4 border-l-cyan-500 bg-cyan-950/20">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-5 h-5 text-cyan-400" />
          <h2 className="font-extrabold text-sm uppercase tracking-wide text-cyan-300">
            SIMULATED CENTRAL BANK RTGS CASH LEG RAIL
          </h2>
        </div>
        <p className="text-xs text-slate-300 mt-1">
          This service models the sovereign fiat cash reserve rail (RBI NEFT/RTGS in India and MAS MEPS+ in Singapore).
          Commercial banks deposit fiat into Central Bank reserve accounts before minting on-chain tokenized reserves, and receive fiat payouts when tokens are redeemed post-settlement.
        </p>
      </div>

      {/* Reserve Accounts Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {accounts.map((acc) => (
          <div
            key={acc.accountNumber}
            className={`glass-panel p-4 space-y-2 border ${
              selectedBank === acc.bankMSP ? 'border-cyan-500 bg-slate-900/90' : 'border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                {acc.bankMSP}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                {acc.reserveBankMSP}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block font-semibold">Available Reserve Cash</span>
              <div className="text-xl font-extrabold font-mono text-white mt-0.5">
                {acc.currency === 'INR' ? '₹' : '$'}
                {acc.fiatBalance.toLocaleString()}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>Pledged (Escrowed):</span>
              <span className="text-amber-400">{acc.pledgedBalance.toLocaleString()}</span>
            </div>

            <div className="text-[10px] font-mono text-slate-500 truncate">
              Acct: {acc.accountNumber}
            </div>
          </div>
        ))}
      </div>

      {/* Simulated Deposit & Payout Action Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Coins className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-sm text-white">Simulate RTGS Cash Action</h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40">
              SIMULATED
            </span>
          </div>

          <form onSubmit={handleAction} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 font-semibold block mb-1">
                Select Commercial Bank Account
              </label>
              <select
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                className="input-field text-xs font-mono"
              >
                {accounts.map((acc) => (
                  <option key={acc.bankMSP} value={acc.bankMSP}>
                    {acc.bankMSP} ({acc.currency} at {acc.reserveBankMSP})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setActionType('DEPOSIT')}
                className={`text-xs py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition ${
                  actionType === 'DEPOSIT'
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                Deposit Cash
              </button>
              <button
                type="button"
                onClick={() => setActionType('PAYOUT')}
                className={`text-xs py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition ${
                  actionType === 'PAYOUT'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Payout Cash
              </button>
            </div>

            <div>
              <label className="text-xs text-slate-400 font-semibold block mb-1">
                Amount ({selectedAccount?.currency})
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
                min={1}
                className="input-field font-mono text-xs"
              />
            </div>

            {resultMsg && (
              <div className="p-2.5 rounded bg-slate-900 border border-slate-700 text-xs text-cyan-300">
                {resultMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary text-xs py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600"
            >
              {loading
                ? 'Processing Simulated RTGS Action...'
                : actionType === 'DEPOSIT'
                ? 'Execute Fiat Reserve Deposit'
                : 'Burn Tokens & Execute Fiat Cash Payout'}
            </button>
          </form>
        </div>

        {/* RTGS Transaction Ledger Table */}
        <div className="lg:col-span-7 glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-sm text-white">RTGS Central Bank Reserve Transactions</h3>
            </div>
            <button onClick={onRefresh} className="text-slate-400 hover:text-white text-xs">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {transactions.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs">
              No RTGS cash transactions recorded yet.
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[400px] space-y-2 pr-1">
              {transactions.map((tx) => (
                <div
                  key={tx.txId}
                  className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 text-xs font-mono space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      {tx.type === 'DEPOSIT' ? (
                        <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      {tx.type} — {tx.bankMSP}
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {tx.currency === 'INR' ? '₹' : '$'}
                      {tx.amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>{tx.note}</span>
                    <span className="text-slate-500">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-[10px] text-slate-600 truncate">
                    Ref: {tx.txId}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
