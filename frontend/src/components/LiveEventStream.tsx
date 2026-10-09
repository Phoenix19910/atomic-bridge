import React, { useState } from 'react';
import { SSEEvent } from '../types';
import {
  Radio,
  Clock,
  ArrowRight,
  ShieldCheck,
  Lock,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Coins,
  Filter,
} from 'lucide-react';

interface LiveEventStreamProps {
  events: SSEEvent[];
  sseConnected: boolean;
  reconnectAttempts: number;
  onClear: () => void;
}

export const LiveEventStream: React.FC<LiveEventStreamProps> = ({
  events,
  sseConnected,
  reconnectAttempts,
  onClear,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');

  const filteredEvents = events.filter((e) => {
    if (filterType === 'ALL') return true;
    return e.type === filterType;
  });

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'TradeSettled':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'TradeLegLocked':
        return <Lock className="w-4 h-4 text-cyan-400" />;
      case 'TradeInitiated':
        return <ArrowRight className="w-4 h-4 text-indigo-400" />;
      case 'TradeRefunded':
      case 'WATCHER_REFUND_TRIGGERED':
        return <RotateCw className="w-4 h-4 text-purple-400" />;
      case 'TradeRefused':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case 'RTGS_DEPOSIT':
      case 'RTGS_MINT_HOLD':
      case 'RTGS_PAYOUT':
      case 'TokensMinted':
        return <Coins className="w-4 h-4 text-amber-400" />;
      default:
        return <Radio className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="glass-panel p-5 space-y-4">
      {/* Stream Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="relative">
            <Radio className="w-5 h-5 text-cyan-400" />
            <span
              className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${
                sseConnected ? 'bg-emerald-400' : 'bg-rose-400'
              } animate-ping`}
            />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-sm text-white">Live Consortium Event Timeline</h3>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  sseConnected
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/40'
                    : 'bg-rose-950/80 text-rose-300 border border-rose-800/40'
                }`}
              >
                {sseConnected ? 'STREAMING ACTIVE' : `RECONNECTING (#${reconnectAttempts})`}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Server-Sent Events (SSE) stream from <code>/api/events/stream</code>. Real-time ledger block updates.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {/* Filter dropdown */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input-field text-xs py-1.5 px-2.5 font-mono"
          >
            <option value="ALL">All Events ({events.length})</option>
            <option value="TradeInitiated">TradeInitiated</option>
            <option value="TradeLegLocked">TradeLegLocked</option>
            <option value="TradeSettled">TradeSettled</option>
            <option value="TradeRefunded">TradeRefunded</option>
            <option value="WATCHER_REFUND_TRIGGERED">WATCHER_REFUND_TRIGGERED</option>
            <option value="TradeRefused">TradeRefused</option>
            <option value="TokensMinted">TokensMinted</option>
            <option value="RTGS_MINT_HOLD">RTGS_MINT_HOLD</option>
          </select>

          <button
            onClick={onClear}
            className="btn-secondary text-[11px] py-1.5 px-3 shrink-0"
          >
            Clear Timeline
          </button>
        </div>
      </div>

      {/* Events List */}
      {filteredEvents.length === 0 ? (
        <div className="text-center py-14 text-slate-500 text-xs">
          No live events captured yet. Actions taken on the corridor will broadcast here in real-time.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
          {filteredEvents.map((event, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition space-y-1.5 font-mono text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-2">
                  {getEventIcon(event.type)}
                  <span>{event.type}</span>
                </span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>

              <div className="p-2 rounded bg-black/40 text-[11px] text-slate-300 overflow-x-auto border border-white/5">
                <pre>{JSON.stringify(event.payload, null, 2)}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
