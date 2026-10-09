/**
 * AtomicBridge Data Models & Types
 * In alignment with chaincode models and docs/api-contract.md
 */

export type TradeLifecycleStatus =
  | 'INITIATED'
  | 'VALIDATED'
  | 'REFUSED'
  | 'LEG1_LOCKED'
  | 'LEG2_LOCKED'
  | 'ESCROWED'
  | 'SETTLED'
  | 'TIMED_OUT_NO_FUNDS'
  | 'TIMED_OUT_LEG1_REFUNDED'
  | 'TIMED_OUT_LEG2_REFUNDED'
  | 'TIMED_OUT_LEG1_REFUNDED_LEG2_LOCKED'
  | 'TIMED_OUT_LEG2_REFUNDED_LEG1_LOCKED'
  | 'TIMED_OUT_BOTH_REFUNDED'
  | 'EXPIRED_AWAITING_REFUND';

export type RefundOutcome =
  | 'TIMED_OUT_NO_FUNDS'
  | 'TIMED_OUT_LEG1_REFUNDED'
  | 'TIMED_OUT_LEG2_REFUNDED'
  | 'TIMED_OUT_LEG1_REFUNDED_LEG2_LOCKED'
  | 'TIMED_OUT_LEG2_REFUNDED_LEG1_LOCKED'
  | 'TIMED_OUT_BOTH_REFUNDED';

export interface BalanceRecord {
  docType: 'balance_record';
  ownerMSP: string;
  currency: string;
  balance: number;
  updatedAt: string;
}

export interface JurisdictionRule {
  docType: 'jurisdiction_rule';
  jurisdiction: string;
  regulatorMSP: string;
  currency: string;
  maxTransactionLimit: number;
  dailyLimit: number;
  baseRate: number;
  rateTolerancePercent: number;
  cutOffHourUTC: number;
  updatedAt: string;
}

export interface TradeTerms {
  docType: 'trade_terms';
  tradeId: string;
  initiatorMSP: string;
  counterpartyMSP: string;
  leg1AmountINR: number;
  leg2AmountUSD: number;
  exchangeRate: number;
  expiresAt: string;
  createdAt: string;
}

export interface SettlementRecord {
  docType: 'settlement';
  tradeId: string;
  status: 'PENDING' | 'SETTLED';
  settledAt?: string;
  settlementTxId?: string;
}

export interface EscrowRecord {
  docType: 'escrow_record';
  tradeId: string;
  legId: 'LEG1' | 'LEG2';
  payerMSP: string;
  amount: number;
  currency: string;
  status: 'LOCKED' | 'SETTLED' | 'REFUNDED';
  lockedAt: string;
  lockTxId: string;
}

export interface RefundRecord {
  docType: 'refund_record';
  tradeId: string;
  outcome: RefundOutcome;
  leg1Refunded: boolean;
  leg2Refunded: boolean;
  refundedAt: string;
  refundTxId: string;
}

export interface ComplianceAttempt {
  docType: 'compliance_attempt';
  attemptId: string;
  tradeId: string;
  initiatorMSP: string;
  counterpartyMSP: string;
  evaluatedAt: string;
  result: 'PASSED' | 'REFUSED';
  reasonCode?: string;
}

export interface TradeSummary {
  tradeId: string;
  derivedStatus: TradeLifecycleStatus;
  terms?: TradeTerms;
  escrowLeg1?: EscrowRecord;
  escrowLeg2?: EscrowRecord;
  settlement?: SettlementRecord;
  refund?: RefundRecord;
  compliance?: ComplianceAttempt;
}

// RTGS Simulated Types
export interface RTGSAccount {
  accountNumber: string;
  bankMSP: string;
  currency: 'INR' | 'USD';
  reserveBankMSP: 'RBI-MSP' | 'MAS-MSP';
  fiatBalance: number;
  pledgedBalance: number;
  lastUpdated: string;
}

export interface RTGSTransaction {
  txId: string;
  type: 'DEPOSIT' | 'MINT_HOLD' | 'PAYOUT' | 'RELEASE';
  bankMSP: string;
  currency: 'INR' | 'USD';
  amount: number;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  referenceId: string;
  timestamp: string;
  note: string;
}

// SSE Event Format
export interface SSEEvent {
  type: string;
  payload: any;
  timestamp: string;
}
