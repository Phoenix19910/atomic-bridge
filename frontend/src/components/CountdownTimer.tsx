import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface CountdownTimerProps {
  expiresAt?: string;
  isTerminal: boolean;
  onElapsed?: () => void;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  expiresAt,
  isTerminal,
  onElapsed,
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt || isTerminal) {
      setSecondsLeft(null);
      return;
    }

    const target = new Date(expiresAt).getTime();

    const updateTimer = () => {
      const diff = Math.floor((target - Date.now()) / 1000);
      if (diff <= 0) {
        setSecondsLeft(0);
        onElapsed?.();
      } else {
        setSecondsLeft(diff);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, isTerminal, onElapsed]);

  if (!expiresAt) {
    return null;
  }

  const isElapsed = secondsLeft !== null && secondsLeft <= 0;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center space-x-1.5 text-slate-300 font-semibold">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>Settlement Window Cut-Off</span>
        </div>
        <div>
          {isTerminal ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              TERMINAL
            </span>
          ) : isElapsed ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-800/60">
              CUT-OFF ELAPSED
            </span>
          ) : (
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50">
              {secondsLeft}s remaining
            </span>
          )}
        </div>
      </div>

      <div className="text-[11px] text-slate-400 font-mono">
        Cut-Off Time: {new Date(expiresAt).toLocaleTimeString()} ({new Date(expiresAt).toISOString()})
      </div>

      {/* Prominent Mandatory Local Clock Disclaimer */}
      {!isTerminal && (
        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-start space-x-1.5 text-[10px] text-slate-400 bg-amber-950/10 p-1.5 rounded">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p>
            <strong className="text-amber-300">ESTIMATED LOCAL CLOCK DISCLAIMER:</strong> Browser countdown
            is an estimate. Fabric chaincode only recognizes refunds after proposal timestamp validation and ledger commit.
          </p>
        </div>
      )}
    </div>
  );
};
