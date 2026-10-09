/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Object, Property } from 'fabric-contract-api';

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

@Object()
export class BalanceRecord {
  @Property()
  public docType: string = 'balance_record';

  @Property()
  public ownerMSP: string = '';

  @Property()
  public currency: string = '';

  @Property()
  public balance: number = 0;

  @Property()
  public updatedAt: string = '';
}

@Object()
export class JurisdictionRule {
  @Property()
  public docType: string = 'jurisdiction_rule';

  @Property()
  public jurisdiction: string = '';

  @Property()
  public regulatorMSP: string = '';

  @Property()
  public currency: string = '';

  @Property()
  public maxTransactionLimit: number = 0;

  @Property()
  public dailyLimit: number = 0;

  @Property()
  public baseRate: number = 0;

  @Property()
  public rateTolerancePercent: number = 0;

  @Property()
  public cutOffHourUTC: number = 0;

  @Property()
  public updatedAt: string = '';
}

@Object()
export class TradeTerms {
  @Property()
  public docType: string = 'trade_terms';

  @Property()
  public tradeId: string = '';

  @Property()
  public initiatorMSP: string = '';

  @Property()
  public counterpartyMSP: string = '';

  @Property()
  public leg1AmountINR: number = 0;

  @Property()
  public leg2AmountUSD: number = 0;

  @Property()
  public exchangeRate: number = 0;

  @Property()
  public expiresAt: string = '';

  @Property()
  public createdAt: string = '';
}

@Object()
export class SettlementRecord {
  @Property()
  public docType: string = 'settlement';

  @Property()
  public tradeId: string = '';

  @Property()
  public status: 'PENDING' | 'SETTLED' = 'PENDING';

  @Property()
  public settledAt?: string;

  @Property()
  public settlementTxId?: string;
}

@Object()
export class EscrowRecord {
  @Property()
  public docType: string = 'escrow_record';

  @Property()
  public tradeId: string = '';

  @Property()
  public legId: 'LEG1' | 'LEG2' = 'LEG1';

  @Property()
  public payerMSP: string = '';

  @Property()
  public amount: number = 0;

  @Property()
  public currency: string = '';

  @Property()
  public status: 'LOCKED' | 'SETTLED' | 'REFUNDED' = 'LOCKED';

  @Property()
  public lockedAt: string = '';

  @Property()
  public lockTxId: string = '';
}

@Object()
export class RefundRecord {
  @Property()
  public docType: string = 'refund_record';

  @Property()
  public tradeId: string = '';

  @Property()
  public outcome: RefundOutcome = 'TIMED_OUT_NO_FUNDS';

  @Property()
  public leg1Refunded: boolean = false;

  @Property()
  public leg2Refunded: boolean = false;

  @Property()
  public refundedAt: string = '';

  @Property()
  public refundTxId: string = '';
}

@Object()
export class ComplianceAttempt {
  @Property()
  public docType: string = 'compliance_attempt';

  @Property()
  public attemptId: string = '';

  @Property()
  public tradeId: string = '';

  @Property()
  public initiatorMSP: string = '';

  @Property()
  public counterpartyMSP: string = '';

  @Property()
  public evaluatedAt: string = '';

  @Property()
  public result: 'PASSED' | 'REFUSED' = 'REFUSED';

  @Property()
  public reasonCode?: string;
}