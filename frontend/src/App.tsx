import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ConsortiumRole,
  BalanceRecord,
  RTGSAccount,
  RTGSTransaction,
  TradeTerms,
  TradeSummary,
  JurisdictionRule,
  AuditRecord,
  SystemHealth,
  SSEEvent,
} from './types';
import {
  api,
  getActiveRole,
  setActiveRole as saveActiveRole,
  getBackendBaseUrl,
} from './api';
import { Navbar } from './components/Navbar';
import { BankDashboard } from './components/BankDashboard';
import { RegulatorDashboard } from './components/RegulatorDashboard';
import { AuditorDashboard } from './components/AuditorDashboard';
import { RTGSDashboard } from './components/RTGSDashboard';
import { LiveEventStream } from './components/LiveEventStream';

export const App: React.FC = () => {
  const [activeRole, setActiveRoleState] = useState<ConsortiumRole>(getActiveRole());
  const [activeTab, setActiveTab] = useState<string>('bank');

  // Application Data States
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [balances, setBalances] = useState<BalanceRecord[]>([]);
  const [rtgsAccounts, setRtgsAccounts] = useState<RTGSAccount[]>([]);
  const [rtgsTransactions, setRtgsTransactions] = useState<RTGSTransaction[]>([]);
  const [trades, setTrades] = useState<TradeTerms[]>([]);
  const [activeTradeSummaries, setActiveTradeSummaries] = useState<Record<string, TradeSummary>>({});
  const [indiaRule, setIndiaRule] = useState<JurisdictionRule | null>(null);
  const [sgRule, setSgRule] = useState<JurisdictionRule | null>(null);
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);

  // SSE State
  const [sseEvents, setSseEvents] = useState<SSEEvent[]>([]);
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const sseRef = useRef<EventSource | null>(null);

  // Set Role with Session Persistence
  const handleSelectRole = (role: ConsortiumRole) => {
    saveActiveRole(role);
    setActiveRoleState(role);
    // Switch default tab based on role
    if (role === 'RBI-MSP' || role === 'MAS-MSP') {
      setActiveTab('regulator');
    } else if (role === 'Auditor-MSP') {
      setActiveTab('auditor');
    } else {
      setActiveTab('bank');
    }
  };

  // Fetch all ledger data
  const refreshData = useCallback(async () => {
    try {
      const [h, b, rAcc, rTx, t, aud] = await Promise.all([
        api.getHealth().catch(() => null),
        api.getBalances().catch(() => ({ balances: [] })),
        api.getRTGSAccounts().catch(() => ({ accounts: [] })),
        api.getRTGSTransactions().catch(() => ({ transactions: [] })),
        api.getAllTrades().catch(() => ({ trades: [] })),
        api.getAuditTrades().catch(() => ({ auditRecords: [] })),
      ]);

      if (h) setHealth(h);
      if (b?.balances) setBalances(b.balances);
      if (rAcc?.accounts) setRtgsAccounts(rAcc.accounts);
      if (rTx?.transactions) setRtgsTransactions(rTx.transactions);
      if (t?.trades) {
        setTrades(t.trades);
        // Fetch summaries for each trade in parallel
        const summaries: Record<string, TradeSummary> = {};
        await Promise.all(
          t.trades.map(async (trade) => {
            try {
              const s = await api.getTrade(trade.tradeId);
              summaries[trade.tradeId] = s;
            } catch {
              // ignore
            }
          })
        );
        setActiveTradeSummaries(summaries);
      }
      if (aud?.auditRecords) setAuditRecords(aud.auditRecords);

      // Fetch jurisdiction rules
      try {
        const inr = await api.getRule('INDIA');
        setIndiaRule(inr);
      } catch {}
      try {
        const sg = await api.getRule('SINGAPORE');
        setSgRule(sg);
      } catch {}
    } catch (err) {
      console.error('[App] Refresh data error:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 10000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Server-Sent Events setup with auto-reconnect
  useEffect(() => {
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      const sseUrl = `${getBackendBaseUrl()}/api/events/stream`;
      console.log(`[SSE] Connecting to ${sseUrl}...`);

      const eventSource = new EventSource(sseUrl);
      sseRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[SSE] Connection established');
        setSseConnected(true);
        setReconnectAttempts(0);
      };

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const newEvent: SSEEvent = {
            type: event.type || 'TRADE_UPDATE',
            payload: parsed,
            timestamp: new Date().toISOString(),
          };
          setSseEvents((prev) => [newEvent, ...prev.slice(0, 99)]);
          // Refresh ledger state when a trade or balance event arrives
          refreshData();
        } catch {
          // ignore heartbeats or raw string
        }
      };

      // Listen to specific contract event types emitted by backend
      const eventTypes = [
        'TradeInitiated',
        'TradeLegLocked',
        'TradeSettled',
        'TradeRefunded',
        'TradeTimedOut',
        'TradeRefused',
        'WATCHER_REFUND_TRIGGERED',
        'TokensMinted',
        'TokensBurned',
        'JurisdictionRuleSet',
        'RTGS_DEPOSIT',
        'RTGS_MINT_HOLD',
        'RTGS_PAYOUT',
      ];

      for (const eType of eventTypes) {
        eventSource.addEventListener(eType, (e: any) => {
          try {
            const data = JSON.parse(e.data);
            const evt: SSEEvent = {
              type: eType,
              payload: data,
              timestamp: new Date().toISOString(),
            };
            setSseEvents((prev) => [evt, ...prev.slice(0, 99)]);
            refreshData();
          } catch (err) {
            console.error('[SSE Event Parse Error]', err);
          }
        });
      }

      eventSource.onerror = () => {
        console.warn('[SSE] Connection error. Reconnecting...');
        setSseConnected(false);
        eventSource.close();
        setReconnectAttempts((prev) => prev + 1);
        reconnectTimeout = setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      if (sseRef.current) sseRef.current.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [refreshData]);

  return (
    <div className="min-h-screen flex flex-col bg-[#07090e] text-slate-100">
      <Navbar
        activeRole={activeRole}
        onSelectRole={handleSelectRole}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        sseConnected={sseConnected}
        health={health}
        onRefresh={refreshData}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'bank' && (
          <BankDashboard
            activeRole={activeRole}
            balances={balances}
            rtgsAccounts={rtgsAccounts}
            trades={trades}
            activeTradeSummaries={activeTradeSummaries}
            indiaRule={indiaRule}
            sgRule={sgRule}
            onRefresh={refreshData}
            onSelectTrade={(tId) => {
              setSelectedTradeId(tId);
              setActiveTab('auditor');
            }}
          />
        )}

        {activeTab === 'regulator' && (
          <RegulatorDashboard
            activeRole={activeRole}
            indiaRule={indiaRule}
            sgRule={sgRule}
            balances={balances}
            health={health}
            onRefresh={refreshData}
          />
        )}

        {activeTab === 'auditor' && (
          <AuditorDashboard
            auditRecords={auditRecords}
            selectedTradeId={selectedTradeId}
            onRefresh={refreshData}
          />
        )}

        {activeTab === 'rtgs' && (
          <RTGSDashboard
            accounts={rtgsAccounts}
            transactions={rtgsTransactions}
            onRefresh={refreshData}
          />
        )}

        {activeTab === 'events' && (
          <LiveEventStream
            events={sseEvents}
            sseConnected={sseConnected}
            reconnectAttempts={reconnectAttempts}
            onClear={() => setSseEvents([])}
          />
        )}
      </main>

      <footer className="border-t border-slate-900 bg-[#05070a] py-4 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>AtomicBridge Multi-Jurisdictional Consortium Network (India & Singapore)</span>
          <span>Hyperledger Fabric v2.5 • CCaaS External Chaincode • 4-Party Mutual SBE</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
