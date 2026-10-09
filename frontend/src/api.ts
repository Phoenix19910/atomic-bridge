import {
  AuditRecord,
  BalanceRecord,
  ConsortiumRole,
  JurisdictionRule,
  RTGSAccount,
  RTGSTransaction,
  SystemHealth,
  TradeSummary,
  TradeTerms,
} from './types';

export function getBackendBaseUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_BACKEND_URL;
  if (envUrl) {
    return envUrl;
  }
  const hostname = window.location.hostname || 'localhost';
  const protocol = window.location.protocol || 'http:';
  return `${protocol}//${hostname}:4000`;
}

export function getActiveRole(): ConsortiumRole {
  // Check URL param first (?role=BankC-MSP)
  const urlParams = new URLSearchParams(window.location.search);
  const roleFromUrl = urlParams.get('role') as ConsortiumRole;
  if (roleFromUrl && isValidRole(roleFromUrl)) {
    sessionStorage.setItem('atomicbridge_role', roleFromUrl);
    return roleFromUrl;
  }

  const stored = sessionStorage.getItem('atomicbridge_role') as ConsortiumRole;
  if (stored && isValidRole(stored)) {
    return stored;
  }
  return 'BankA-MSP';
}

export function setActiveRole(role: ConsortiumRole): void {
  sessionStorage.setItem('atomicbridge_role', role);
}

function isValidRole(role: string): boolean {
  return ['BankA-MSP', 'BankC-MSP', 'RBI-MSP', 'MAS-MSP', 'Auditor-MSP'].includes(role);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getBackendBaseUrl();
  const role = getActiveRole();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-org': role,
    'x-identity': role,
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// API Endpoints
// ============================================================================

export const api = {
  getHealth: () => request<SystemHealth>('/api/health'),

  // Balances
  getBalances: () => request<{ balances: BalanceRecord[] }>('/api/balances'),
  getBalance: (ownerMSP: string, currency: string) =>
    request<BalanceRecord>(`/api/balances/${ownerMSP}/${currency}`),

  // Rules
  getRule: (jurisdiction: string) =>
    request<JurisdictionRule>(`/api/rules/${jurisdiction}`),
  setRule: (rule: {
    jurisdiction: string;
    maxTransactionLimit: number;
    dailyLimit: number;
    baseRate: number;
    rateTolerancePercent: number;
    cutOffHourUTC: number;
  }) => request<{ success: boolean; rule: JurisdictionRule }>('/api/rules', {
    method: 'POST',
    body: JSON.stringify(rule),
  }),

  // Tokens
  mintTokens: (targetMSP: string, currency: string, amount: number) =>
    request<{ success: boolean; balance: BalanceRecord }>('/api/tokens/mint', {
      method: 'POST',
      body: JSON.stringify({ targetMSP, currency, amount }),
    }),
  burnTokens: (currency: string, amount: number) =>
    request<{ success: boolean; balance: BalanceRecord }>('/api/tokens/burn', {
      method: 'POST',
      body: JSON.stringify({ currency, amount }),
    }),

  // Trades
  initiateTrade: (params: {
    tradeId: string;
    counterpartyMSP: string;
    leg1AmountINR: number;
    leg2AmountUSD: number;
    timeoutSeconds: number;
  }) => request<{ success: boolean; status: string; tradeId: string; expiresAt?: string; reason?: string }>(
    '/api/trades/initiate',
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  ),
  lockTradeLeg: (tradeId: string, legId: 'LEG1' | 'LEG2') =>
    request<{ success: boolean; status: string; tradeId: string; legId: string }>(
      `/api/trades/${tradeId}/lock`,
      {
        method: 'POST',
        body: JSON.stringify({ legId }),
      }
    ),
  settleTrade: (tradeId: string) =>
    request<{ success: boolean; status: string; tradeId: string; settledAt?: string; settlementTxId?: string }>(
      `/api/trades/${tradeId}/settle`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
  refundTrade: (tradeId: string) =>
    request<{ success: boolean; refund: any }>(`/api/trades/${tradeId}/refund`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  getTrade: (tradeId: string) => request<TradeSummary>(`/api/trades/${tradeId}`),
  getTradeStatus: (tradeId: string) =>
    request<{ status: string; tradeId: string; expiresAt?: string }>(`/api/trades/${tradeId}/status`),
  getAllTrades: () => request<{ trades: TradeTerms[] }>('/api/trades'),

  // Simulated RTGS
  getRTGSAccounts: () =>
    request<{ simulated: true; disclaimer: string; accounts: RTGSAccount[] }>('/api/rtgs/accounts'),
  getRTGSTransactions: () =>
    request<{ simulated: true; disclaimer: string; transactions: RTGSTransaction[] }>('/api/rtgs/transactions'),
  depositRTGS: (bankMSP: string, amount: number, referenceId?: string) =>
    request<{ simulated: true; transaction: RTGSTransaction; account: RTGSAccount }>(
      '/api/rtgs/deposit',
      {
        method: 'POST',
        body: JSON.stringify({ bankMSP, amount, referenceId }),
      }
    ),
  confirmMintRTGS: (bankMSP: string, currency: string, amount: number) =>
    request<{
      simulated: true;
      success: boolean;
      message: string;
      rtgsHold: any;
      ledgerMint: any;
    }>('/api/rtgs/confirm-mint', {
      method: 'POST',
      body: JSON.stringify({ bankMSP, currency, amount }),
    }),
  payoutRTGS: (bankMSP: string, currency: string, amount: number, referenceId?: string) =>
    request<{
      simulated: true;
      success: boolean;
      message: string;
      ledgerBurn: any;
      rtgsPayout: any;
    }>('/api/rtgs/payout', {
      method: 'POST',
      body: JSON.stringify({ bankMSP, currency, amount, referenceId }),
    }),

  // Audit
  getAuditTrades: () => request<{ auditRecords: AuditRecord[] }>('/api/audit/trades'),
  getComplianceAudit: (tradeId: string) =>
    request<any>(`/api/audit/compliance/${tradeId}`),
  getSettlementAudit: (tradeId: string) =>
    request<any>(`/api/audit/settlement/${tradeId}`),
  getRefundAudit: (tradeId: string) =>
    request<any>(`/api/audit/refund/${tradeId}`),

  // Expiry Watcher
  getWatcherStatus: () => request<any>('/api/watcher/status'),
  triggerWatcher: () => request<any>('/api/watcher/trigger', { method: 'POST' }),
};
