import React, { useState } from 'react';
import { AuditRecord, TradeSummary } from '../types';
import { api } from '../api';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  KeyRound,
  ExternalLink,
  Code2,
} from 'lucide-react';

interface AuditorDashboardProps {
  auditRecords: AuditRecord[];
  selectedTradeId?: string | null;
  onRefresh: () => void;
}

export const AuditorDashboard: React.FC<AuditorDashboardProps> = ({
  auditRecords,
  selectedTradeId,
  onRefresh,
}) => {
  const [searchId, setSearchId] = useState(selectedTradeId || '');
  const [singleTrade, setSingleTrade] = useState<TradeSummary | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchId.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const summary = await api.getTrade(searchId.trim());
      setSingleTrade(summary);
    } catch (err: any) {
      setSearchError(err.message);
      setSingleTrade(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-panel p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-l-4 border-l-purple-500">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-base text-white">Consortium Regulatory & Auditor Explorer</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/60">
              Identity: Auditor-MSP
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Full audit visibility across public channel state (`corridor-channel`), compliance logs, 4-party mutual settlement proofs, and Approach B refund records.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono text-purple-400 bg-purple-950/30 px-3 py-1.5 rounded-lg border border-purple-800/40">
          <ShieldCheck className="w-4 h-4" />
          <span>Cryptographic Ledger Verification Active</span>
        </div>
      </div>

      {/* Trade Lookup Bar */}
      <div className="glass-panel p-4">
        <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="Search trade by ID (e.g. TRADE-DEMO-001)..."
              className="input-field pl-9 font-mono text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="btn-primary text-xs py-2 px-5 shrink-0 bg-gradient-to-r from-purple-600 to-indigo-600"
          >
            {searching ? 'Querying Fabric Ledger...' : 'Audit Trade Details'}
          </button>
        </form>

        {searchError && (
          <div className="mt-3 p-2.5 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
            {searchError}
          </div>
        )}

        {/* Selected Single Trade Detail */}
        {singleTrade && (
          <div className="mt-4 p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <span className="font-mono font-bold text-sm text-white">
                  {singleTrade.tradeId}
                </span>
                <span className="badge-status status-active text-[10px]">
                  {singleTrade.derivedStatus}
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Created: {singleTrade.terms?.createdAt || 'N/A'}
              </span>
            </div>

            {/* Audit Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* Compliance Attempt */}
              <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-500 font-semibold block uppercase">
                  1. Sovereign Compliance Check
                </span>
                <div className="text-white font-mono font-bold">
                  {singleTrade.compliance ? (
                    <span className={singleTrade.compliance.result === 'PASSED' ? 'text-emerald-400' : 'text-rose-400'}>
                      {singleTrade.compliance.result}
                      {singleTrade.compliance.reasonCode ? ` (${singleTrade.compliance.reasonCode})` : ''}
                    </span>
                  ) : (
                    <span className="text-emerald-400">PASSED (SBE INSTALLED)</span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-mono block">
                  Attempt Tx: {singleTrade.compliance?.attemptId || 'INIT-TX'}
                </span>
              </div>

              {/* Settlement State */}
              <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-500 font-semibold block uppercase">
                  2. 4-Party Mutual Settlement
                </span>
                <div className="text-white font-mono font-bold">
                  {singleTrade.settlement?.status === 'SETTLED' ? (
                    <span className="text-emerald-400">SETTLED (4-Party SBE)</span>
                  ) : (
                    <span className="text-amber-400">PENDING (SBE Active)</span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-mono block truncate">
                  TxId: {singleTrade.settlement?.settlementTxId || 'Awaiting endorsement'}
                </span>
              </div>

              {/* Refund State */}
              <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-500 font-semibold block uppercase">
                  3. Approach B Refund Record
                </span>
                <div className="text-white font-mono font-bold">
                  {singleTrade.refund ? (
                    <span className="text-purple-400">{singleTrade.refund.outcome}</span>
                  ) : (
                    <span className="text-slate-400">NO REFUND FILED</span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-mono block truncate">
                  TxId: {singleTrade.refund?.refundTxId || 'None'}
                </span>
              </div>
            </div>

            {/* Raw JSON viewer */}
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-200 font-mono flex items-center gap-1">
                <Code2 className="w-3.5 h-3.5" /> View Raw Ledger State JSON
              </summary>
              <pre className="mt-2 p-3 rounded bg-black/80 text-[11px] font-mono text-cyan-300 overflow-x-auto border border-white/5">
                {JSON.stringify(singleTrade, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>

      {/* Comprehensive Audit Table */}
      <div className="glass-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <h3 className="font-bold text-sm text-white">Consortium Corridor Audit Log</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Records: {auditRecords.length}
          </span>
        </div>

        {auditRecords.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs">
            No audit records found on the ledger.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3">Trade ID</th>
                  <th className="py-2.5 px-3">Parties</th>
                  <th className="py-2.5 px-3">Leg 1 (INR)</th>
                  <th className="py-2.5 px-3">Leg 2 (USD)</th>
                  <th className="py-2.5 px-3">Rate</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Settlement / Refund TxId</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {auditRecords.map((rec) => (
                  <tr key={rec.tradeId} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 px-3 font-bold text-white">
                      <button
                        onClick={() => {
                          setSearchId(rec.tradeId);
                          api.getTrade(rec.tradeId).then(setSingleTrade);
                        }}
                        className="text-cyan-400 hover:underline"
                      >
                        {rec.tradeId}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-400">
                      {rec.terms?.initiatorMSP} ⇄ {rec.terms?.counterpartyMSP}
                    </td>
                    <td className="py-2.5 px-3 text-amber-400">
                      ₹{rec.terms?.leg1AmountINR.toLocaleString('en-IN') || 0}
                    </td>
                    <td className="py-2.5 px-3 text-cyan-400">
                      ${rec.terms?.leg2AmountUSD.toLocaleString('en-US') || 0}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {rec.terms?.exchangeRate.toFixed(2) || 'N/A'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="badge-status status-active text-[10px]">
                        {rec.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[10px] text-slate-500 truncate max-w-[150px]">
                      {rec.settlement?.settlementTxId || rec.refund?.refundTxId || 'Pending'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
