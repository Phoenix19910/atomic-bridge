import {
  BalanceRecord,
  ComplianceAttempt,
  EscrowRecord,
  JurisdictionRule,
  RefundOutcome,
  RefundRecord,
  SettlementRecord,
  TradeLifecycleStatus,
  TradeTerms,
} from '../types';
import { eventService } from '../services/events';

export class MockLedger {
  private state: Map<string, string> = new Map();

  constructor() {
    this.initLedger();
  }

  public initLedger(): void {
    const now = new Date().toISOString();

    const indiaRule: JurisdictionRule = {
      docType: 'jurisdiction_rule',
      jurisdiction: 'INDIA',
      regulatorMSP: 'RBI-MSP',
      currency: 'INR',
      maxTransactionLimit: 1000000000,
      dailyLimit: 5000000000,
      baseRate: 84.0,
      rateTolerancePercent: 10.0,
      cutOffHourUTC: 18,
      updatedAt: now,
    };
    this.state.set('rule:INDIA', JSON.stringify(indiaRule));

    const sgRule: JurisdictionRule = {
      docType: 'jurisdiction_rule',
      jurisdiction: 'SINGAPORE',
      regulatorMSP: 'MAS-MSP',
      currency: 'USD',
      maxTransactionLimit: 50000000,
      dailyLimit: 250000000,
      baseRate: 84.0,
      rateTolerancePercent: 10.0,
      cutOffHourUTC: 18,
      updatedAt: now,
    };
    this.state.set('rule:SINGAPORE', JSON.stringify(sgRule));

    const initialBalances = [
      { ownerMSP: 'BankA-MSP', currency: 'INR', balance: 500000000 },
      { ownerMSP: 'BankC-MSP', currency: 'USD', balance: 10000000 },
      { ownerMSP: 'BankB-MSP', currency: 'INR', balance: 100000000 },
      { ownerMSP: 'BankD-MSP', currency: 'USD', balance: 5000000 },
    ];

    for (const b of initialBalances) {
      const rec: BalanceRecord = {
        docType: 'balance_record',
        ownerMSP: b.ownerMSP,
        currency: b.currency,
        balance: b.balance,
        updatedAt: now,
      };
      this.state.set(`balance:${b.ownerMSP}:${b.currency}`, JSON.stringify(rec));
    }
  }

  public async setJurisdictionRule(
    callerMSP: string,
    jurisdiction: string,
    maxLimit: number,
    dailyLimit: number,
    baseRate: number,
    rateTolerance: number,
    cutOffHour: number
  ): Promise<JurisdictionRule> {
    const norm = jurisdiction.toUpperCase().trim();
    let currency: string;
    let regMSP: string;

    if (norm === 'INDIA' || norm === 'INR') {
      if (callerMSP !== 'RBI-MSP') {
        throw new Error(`Unauthorized caller: ${callerMSP}. Only RBI-MSP can set rules for India`);
      }
      currency = 'INR';
      regMSP = 'RBI-MSP';
    } else if (norm === 'SINGAPORE' || norm === 'USD') {
      if (callerMSP !== 'MAS-MSP') {
        throw new Error(`Unauthorized caller: ${callerMSP}. Only MAS-MSP can set rules for Singapore`);
      }
      currency = 'USD';
      regMSP = 'MAS-MSP';
    } else {
      throw new Error(`Unsupported jurisdiction: ${jurisdiction}`);
    }

    const rule: JurisdictionRule = {
      docType: 'jurisdiction_rule',
      jurisdiction: norm,
      regulatorMSP: regMSP,
      currency,
      maxTransactionLimit: Number(maxLimit),
      dailyLimit: Number(dailyLimit),
      baseRate: Number(baseRate),
      rateTolerancePercent: Number(rateTolerance),
      cutOffHourUTC: Number(cutOffHour),
      updatedAt: new Date().toISOString(),
    };

    this.state.set(`rule:${norm}`, JSON.stringify(rule));
    eventService.broadcast('JurisdictionRuleSet', rule);
    return rule;
  }

  public async getJurisdictionRule(jurisdiction: string): Promise<JurisdictionRule> {
    const norm = jurisdiction.toUpperCase().trim();
    const raw = this.state.get(`rule:${norm}`);
    if (!raw) {
      throw new Error(`Jurisdiction rule for ${jurisdiction} not found`);
    }
    return JSON.parse(raw);
  }

  public async mintTokens(
    callerMSP: string,
    targetMSP: string,
    currency: string,
    amount: number
  ): Promise<BalanceRecord> {
    const normCurrency = currency.toUpperCase().trim();
    const numAmount = Number(amount);

    if (numAmount <= 0) {
      throw new Error('Mint amount must be positive');
    }
    if (normCurrency === 'INR' && callerMSP !== 'RBI-MSP') {
      throw new Error(`Unauthorized caller: ${callerMSP}. Only RBI-MSP can mint INR tokens`);
    }
    if (normCurrency === 'USD' && callerMSP !== 'MAS-MSP') {
      throw new Error(`Unauthorized caller: ${callerMSP}. Only MAS-MSP can mint USD tokens`);
    }

    const currentBal = await this.getBalance(targetMSP, normCurrency);
    const newBal = currentBal.balance + numAmount;
    const record: BalanceRecord = {
      docType: 'balance_record',
      ownerMSP: targetMSP,
      currency: normCurrency,
      balance: newBal,
      updatedAt: new Date().toISOString(),
    };

    this.state.set(`balance:${targetMSP}:${normCurrency}`, JSON.stringify(record));
    eventService.broadcast('TokensMinted', { targetMSP, currency: normCurrency, amount: numAmount, newBalance: newBal });
    return record;
  }

  public async burnTokens(callerMSP: string, currency: string, amount: number): Promise<BalanceRecord> {
    const normCurrency = currency.toUpperCase().trim();
    const numAmount = Number(amount);

    if (numAmount <= 0) {
      throw new Error('Burn amount must be positive');
    }
    const currentBal = await this.getBalance(callerMSP, normCurrency);
    if (currentBal.balance < numAmount) {
      throw new Error(`Insufficient balance: current ${currentBal.balance}, needed ${numAmount}`);
    }

    const newBal = currentBal.balance - numAmount;
    const record: BalanceRecord = {
      docType: 'balance_record',
      ownerMSP: callerMSP,
      currency: normCurrency,
      balance: newBal,
      updatedAt: new Date().toISOString(),
    };

    this.state.set(`balance:${callerMSP}:${normCurrency}`, JSON.stringify(record));
    eventService.broadcast('TokensBurned', { ownerMSP: callerMSP, currency: normCurrency, amount: numAmount, newBalance: newBal });
    return record;
  }

  public async getBalance(ownerMSP: string, currency: string): Promise<BalanceRecord> {
    const norm = currency.toUpperCase().trim();
    const raw = this.state.get(`balance:${ownerMSP}:${norm}`);
    if (!raw) {
      return {
        docType: 'balance_record',
        ownerMSP,
        currency: norm,
        balance: 0,
        updatedAt: '',
      };
    }
    return JSON.parse(raw);
  }

  public async initiateTrade(
    callerMSP: string,
    tradeId: string,
    counterpartyMSP: string,
    leg1AmountINR: number,
    leg2AmountUSD: number,
    timeoutSeconds: number
  ): Promise<{ status: 'VALIDATED' | 'REFUSED'; tradeId: string; expiresAt?: string; reason?: string }> {
    if (this.state.has(`trade:terms:${tradeId}`)) {
      throw new Error(`Trade ${tradeId} already exists`);
    }

    const now = new Date();
    const txTimestamp = now.toISOString();

    // Compliance Evaluation
    const inrRule = await this.getJurisdictionRule('INDIA');
    const sgRule = await this.getJurisdictionRule('SINGAPORE');

    if (leg1AmountINR > inrRule.maxTransactionLimit) {
      const refusal: ComplianceAttempt = {
        docType: 'compliance_attempt',
        attemptId: `COMP-${Date.now()}`,
        tradeId,
        initiatorMSP: callerMSP,
        counterpartyMSP,
        evaluatedAt: txTimestamp,
        result: 'REFUSED',
        reasonCode: 'LIMIT_EXCEEDED_INR',
      };
      this.state.set(`compliance:${tradeId}`, JSON.stringify(refusal));
      eventService.broadcast('TradeRefused', refusal);
      return { status: 'REFUSED', tradeId, reason: 'LIMIT_EXCEEDED_INR' };
    }

    if (leg2AmountUSD > sgRule.maxTransactionLimit) {
      const refusal: ComplianceAttempt = {
        docType: 'compliance_attempt',
        attemptId: `COMP-${Date.now()}`,
        tradeId,
        initiatorMSP: callerMSP,
        counterpartyMSP,
        evaluatedAt: txTimestamp,
        result: 'REFUSED',
        reasonCode: 'LIMIT_EXCEEDED_USD',
      };
      this.state.set(`compliance:${tradeId}`, JSON.stringify(refusal));
      eventService.broadcast('TradeRefused', refusal);
      return { status: 'REFUSED', tradeId, reason: 'LIMIT_EXCEEDED_USD' };
    }

    // Rate tolerance check
    const proposedRate = leg1AmountINR / leg2AmountUSD;
    const minRate = inrRule.baseRate * (1 - inrRule.rateTolerancePercent / 100);
    const maxRate = inrRule.baseRate * (1 + inrRule.rateTolerancePercent / 100);
    if (proposedRate < minRate || proposedRate > maxRate) {
      const refusal: ComplianceAttempt = {
        docType: 'compliance_attempt',
        attemptId: `COMP-${Date.now()}`,
        tradeId,
        initiatorMSP: callerMSP,
        counterpartyMSP,
        evaluatedAt: txTimestamp,
        result: 'REFUSED',
        reasonCode: 'RATE_TOLERANCE_BREACH',
      };
      this.state.set(`compliance:${tradeId}`, JSON.stringify(refusal));
      eventService.broadcast('TradeRefused', refusal);
      return { status: 'REFUSED', tradeId, reason: 'RATE_TOLERANCE_BREACH' };
    }

    const expiresAt = new Date(now.getTime() + timeoutSeconds * 1000).toISOString();
    const terms: TradeTerms = {
      docType: 'trade_terms',
      tradeId,
      initiatorMSP: callerMSP,
      counterpartyMSP,
      leg1AmountINR,
      leg2AmountUSD,
      exchangeRate: proposedRate,
      expiresAt,
      createdAt: txTimestamp,
    };
    this.state.set(`trade:terms:${tradeId}`, JSON.stringify(terms));

    const settlement: SettlementRecord = {
      docType: 'settlement',
      tradeId,
      status: 'PENDING',
    };
    this.state.set(`settlement:${tradeId}`, JSON.stringify(settlement));

    eventService.broadcast('TradeInitiated', { tradeId, terms, expiresAt });
    return { status: 'VALIDATED', tradeId, expiresAt };
  }

  public async lockTradeLeg(
    callerMSP: string,
    tradeId: string,
    legId: 'LEG1' | 'LEG2'
  ): Promise<{ status: TradeLifecycleStatus; tradeId: string; legId: string }> {
    const rawTerms = this.state.get(`trade:terms:${tradeId}`);
    if (!rawTerms) {
      throw new Error(`Trade terms for ${tradeId} not found`);
    }
    const terms = JSON.parse(rawTerms) as TradeTerms;

    const rawSettlement = this.state.get(`settlement:${tradeId}`);
    if (rawSettlement) {
      const setRec = JSON.parse(rawSettlement) as SettlementRecord;
      if (setRec.status === 'SETTLED') {
        throw new Error(`Trade ${tradeId} is already settled`);
      }
    }
    if (this.state.has(`refund:${tradeId}`)) {
      throw new Error(`Trade ${tradeId} has already timed out or refunded`);
    }
    if (Date.now() >= new Date(terms.expiresAt).getTime()) {
      throw new Error(`Trade ${tradeId} has reached cut-off time`);
    }

    const normLeg = legId.toUpperCase() as 'LEG1' | 'LEG2';
    const isLeg1 = normLeg === 'LEG1';
    const expectedMSP = isLeg1 ? terms.initiatorMSP : terms.counterpartyMSP;
    const currency = isLeg1 ? 'INR' : 'USD';
    const amount = isLeg1 ? terms.leg1AmountINR : terms.leg2AmountUSD;

    if (callerMSP !== expectedMSP) {
      throw new Error(`Unauthorized caller: ${callerMSP}. Only ${expectedMSP} can lock ${normLeg}`);
    }

    const escrowKey = `escrow:${normLeg.toLowerCase()}:${tradeId}`;
    if (this.state.has(escrowKey)) {
      const esc = JSON.parse(this.state.get(escrowKey)!) as EscrowRecord;
      if (esc.status === 'LOCKED') throw new Error(`Leg ${normLeg} already locked`);
      if (esc.status === 'REFUNDED') throw new Error(`Leg ${normLeg} already refunded`);
    }

    // Debit balance
    const currentBal = await this.getBalance(callerMSP, currency);
    if (currentBal.balance < amount) {
      throw new Error(`Insufficient balance for ${callerMSP} in ${currency}. Needed: ${amount}, Available: ${currentBal.balance}`);
    }
    currentBal.balance -= amount;
    currentBal.updatedAt = new Date().toISOString();
    this.state.set(`balance:${callerMSP}:${currency}`, JSON.stringify(currentBal));

    const escrow: EscrowRecord = {
      docType: 'escrow_record',
      tradeId,
      legId: normLeg,
      payerMSP: callerMSP,
      amount,
      currency,
      status: 'LOCKED',
      lockedAt: new Date().toISOString(),
      lockTxId: `LOCK-${Date.now()}`,
    };
    this.state.set(escrowKey, JSON.stringify(escrow));

    const otherLegKey = `escrow:${isLeg1 ? 'leg2' : 'leg1'}:${tradeId}`;
    const otherEsc = this.state.has(otherLegKey) ? (JSON.parse(this.state.get(otherLegKey)!) as EscrowRecord) : null;
    const bothLocked = otherEsc?.status === 'LOCKED';

    const currentStatus: TradeLifecycleStatus = bothLocked
      ? 'ESCROWED'
      : isLeg1
      ? 'LEG1_LOCKED'
      : 'LEG2_LOCKED';

    eventService.broadcast('TradeLegLocked', { tradeId, legId: normLeg, status: currentStatus });
    return { status: currentStatus, tradeId, legId: normLeg };
  }

  public async executePvPSwap(tradeId: string): Promise<SettlementRecord> {
    const rawSettlement = this.state.get(`settlement:${tradeId}`);
    if (!rawSettlement) throw new Error(`Settlement record for ${tradeId} not found`);
    const settlement = JSON.parse(rawSettlement) as SettlementRecord;

    if (settlement.status !== 'PENDING') throw new Error(`Trade ${tradeId} not in PENDING status`);
    if (this.state.has(`refund:${tradeId}`)) throw new Error(`Trade ${tradeId} already refunded`);

    const rawTerms = this.state.get(`trade:terms:${tradeId}`);
    if (!rawTerms) throw new Error(`Trade terms for ${tradeId} not found`);
    const terms = JSON.parse(rawTerms) as TradeTerms;

    const leg1Raw = this.state.get(`escrow:leg1:${tradeId}`);
    const leg2Raw = this.state.get(`escrow:leg2:${tradeId}`);
    const leg1 = leg1Raw ? (JSON.parse(leg1Raw) as EscrowRecord) : null;
    const leg2 = leg2Raw ? (JSON.parse(leg2Raw) as EscrowRecord) : null;

    if (leg1?.status !== 'LOCKED' || leg2?.status !== 'LOCKED') {
      throw new Error(`Cannot execute PvP swap: both legs must be LOCKED`);
    }

    // Atomic Swap balances
    const cpBal = await this.getBalance(terms.counterpartyMSP, 'INR');
    cpBal.balance += terms.leg1AmountINR;
    this.state.set(`balance:${terms.counterpartyMSP}:INR`, JSON.stringify(cpBal));

    const initBal = await this.getBalance(terms.initiatorMSP, 'USD');
    initBal.balance += terms.leg2AmountUSD;
    this.state.set(`balance:${terms.initiatorMSP}:USD`, JSON.stringify(initBal));

    leg1.status = 'SETTLED';
    leg2.status = 'SETTLED';
    this.state.set(`escrow:leg1:${tradeId}`, JSON.stringify(leg1));
    this.state.set(`escrow:leg2:${tradeId}`, JSON.stringify(leg2));

    settlement.status = 'SETTLED';
    settlement.settledAt = new Date().toISOString();
    settlement.settlementTxId = `TX-SETTLE-${Date.now()}`;
    this.state.set(`settlement:${tradeId}`, JSON.stringify(settlement));

    eventService.broadcast('TradeSettled', settlement);
    return settlement;
  }

  public async cancelOrRefundTrade(callerMSP: string, tradeId: string): Promise<RefundRecord> {
    const rawTerms = this.state.get(`trade:terms:${tradeId}`);
    if (!rawTerms) throw new Error(`Trade terms for ${tradeId} not found`);
    const terms = JSON.parse(rawTerms) as TradeTerms;

    const rawSettlement = this.state.get(`settlement:${tradeId}`);
    if (rawSettlement) {
      const settlement = JSON.parse(rawSettlement) as SettlementRecord;
      if (settlement.status === 'SETTLED') throw new Error(`Trade ${tradeId} is settled; refunds forbidden`);
    }

    if (Date.now() < new Date(terms.expiresAt).getTime()) {
      throw new Error(`Trade ${tradeId} has not reached cut-off time`);
    }

    const isLeg1Owner = callerMSP === terms.initiatorMSP;
    const isLeg2Owner = callerMSP === terms.counterpartyMSP;
    const isWatcher = callerMSP === 'RBI-MSP' || callerMSP === 'MAS-MSP';
    if (!isLeg1Owner && !isLeg2Owner && !isWatcher) {
      throw new Error(`Unauthorized caller: ${callerMSP}`);
    }

    const existingRefundRaw = this.state.get(`refund:${tradeId}`);
    const existingRefund = existingRefundRaw ? (JSON.parse(existingRefundRaw) as RefundRecord) : null;

    if (existingRefund) {
      if (
        existingRefund.outcome === 'TIMED_OUT_NO_FUNDS' ||
        existingRefund.outcome === 'TIMED_OUT_BOTH_REFUNDED' ||
        existingRefund.outcome === 'TIMED_OUT_LEG1_REFUNDED' ||
        existingRefund.outcome === 'TIMED_OUT_LEG2_REFUNDED'
      ) {
        throw new Error(`Trade refund is terminal (${existingRefund.outcome})`);
      }
      if (isLeg1Owner && existingRefund.leg1Refunded) throw new Error('Leg 1 is already refunded');
      if (isLeg2Owner && existingRefund.leg2Refunded) throw new Error('Leg 2 is already refunded');
    }

    const leg1Raw = this.state.get(`escrow:leg1:${tradeId}`);
    const leg2Raw = this.state.get(`escrow:leg2:${tradeId}`);
    const leg1 = leg1Raw ? (JSON.parse(leg1Raw) as EscrowRecord) : null;
    const leg2 = leg2Raw ? (JSON.parse(leg2Raw) as EscrowRecord) : null;

    const hasLocked = leg1?.status === 'LOCKED' || leg2?.status === 'LOCKED';
    const hadPriorRefund = existingRefund && (existingRefund.leg1Refunded || existingRefund.leg2Refunded);

    if (!hasLocked && !hadPriorRefund) {
      const refund: RefundRecord = {
        docType: 'refund_record',
        tradeId,
        outcome: 'TIMED_OUT_NO_FUNDS',
        leg1Refunded: false,
        leg2Refunded: false,
        refundedAt: new Date().toISOString(),
        refundTxId: `REF-${Date.now()}`,
      };
      this.state.set(`refund:${tradeId}`, JSON.stringify(refund));
      eventService.broadcast('TradeTimedOut', refund);
      return refund;
    }

    let leg1Refunded = existingRefund ? existingRefund.leg1Refunded : false;
    let leg2Refunded = existingRefund ? existingRefund.leg2Refunded : false;

    if ((isLeg1Owner || isWatcher) && leg1?.status === 'LOCKED') {
      leg1.status = 'REFUNDED';
      this.state.set(`escrow:leg1:${tradeId}`, JSON.stringify(leg1));
      const bal = await this.getBalance(leg1.payerMSP, leg1.currency);
      bal.balance += terms.leg1AmountINR;
      this.state.set(`balance:${leg1.payerMSP}:${leg1.currency}`, JSON.stringify(bal));
      leg1Refunded = true;
    }

    if ((isLeg2Owner || isWatcher) && leg2?.status === 'LOCKED') {
      leg2.status = 'REFUNDED';
      this.state.set(`escrow:leg2:${tradeId}`, JSON.stringify(leg2));
      const bal = await this.getBalance(leg2.payerMSP, leg2.currency);
      bal.balance += terms.leg2AmountUSD;
      this.state.set(`balance:${leg2.payerMSP}:${leg2.currency}`, JSON.stringify(bal));
      leg2Refunded = true;
    }

    let outcome: RefundOutcome = 'TIMED_OUT_NO_FUNDS';
    if (leg1Refunded && leg2Refunded) outcome = 'TIMED_OUT_BOTH_REFUNDED';
    else if (leg1Refunded && leg2?.status === 'LOCKED') outcome = 'TIMED_OUT_LEG1_REFUNDED_LEG2_LOCKED';
    else if (leg2Refunded && leg1?.status === 'LOCKED') outcome = 'TIMED_OUT_LEG2_REFUNDED_LEG1_LOCKED';
    else if (leg1Refunded) outcome = 'TIMED_OUT_LEG1_REFUNDED';
    else if (leg2Refunded) outcome = 'TIMED_OUT_LEG2_REFUNDED';

    const refund: RefundRecord = {
      docType: 'refund_record',
      tradeId,
      outcome,
      leg1Refunded,
      leg2Refunded,
      refundedAt: new Date().toISOString(),
      refundTxId: `REF-${Date.now()}`,
    };
    this.state.set(`refund:${tradeId}`, JSON.stringify(refund));
    eventService.broadcast('TradeRefunded', refund);
    return refund;
  }

  public async getTradeTerms(tradeId: string): Promise<TradeTerms> {
    const raw = this.state.get(`trade:terms:${tradeId}`);
    if (!raw) throw new Error(`Trade terms for ${tradeId} not found`);
    return JSON.parse(raw);
  }

  public async getSettlement(tradeId: string): Promise<SettlementRecord> {
    const raw = this.state.get(`settlement:${tradeId}`);
    if (!raw) throw new Error(`Settlement record for ${tradeId} not found`);
    return JSON.parse(raw);
  }

  public async getEscrow(tradeId: string, legId: string): Promise<EscrowRecord> {
    const norm = legId.toLowerCase();
    const raw = this.state.get(`escrow:${norm}:${tradeId}`);
    if (!raw) throw new Error(`Escrow record for ${tradeId} ${legId} not found`);
    return JSON.parse(raw);
  }

  public async getRefund(tradeId: string): Promise<RefundRecord> {
    const raw = this.state.get(`refund:${tradeId}`);
    if (!raw) throw new Error(`Refund record for ${tradeId} not found`);
    return JSON.parse(raw);
  }

  public async getComplianceRecord(tradeId: string): Promise<ComplianceAttempt> {
    const raw = this.state.get(`compliance:${tradeId}`);
    if (!raw) throw new Error(`Compliance record for ${tradeId} not found`);
    return JSON.parse(raw);
  }

  public async getTradeStatus(tradeId: string): Promise<{ status: TradeLifecycleStatus; tradeId: string; expiresAt?: string }> {
    const rawTerms = this.state.get(`trade:terms:${tradeId}`);
    if (!rawTerms) {
      if (this.state.has(`compliance:${tradeId}`)) {
        return { status: 'REFUSED', tradeId };
      }
      throw new Error(`Trade ${tradeId} not found`);
    }
    const terms = JSON.parse(rawTerms) as TradeTerms;

    const rawSettlement = this.state.get(`settlement:${tradeId}`);
    if (rawSettlement) {
      const setRec = JSON.parse(rawSettlement) as SettlementRecord;
      if (setRec.status === 'SETTLED') return { status: 'SETTLED', tradeId };
    }

    const rawRefund = this.state.get(`refund:${tradeId}`);
    if (rawRefund) {
      const refRec = JSON.parse(rawRefund) as RefundRecord;
      return { status: refRec.outcome, tradeId };
    }

    if (Date.now() >= new Date(terms.expiresAt).getTime()) {
      return { status: 'EXPIRED_AWAITING_REFUND', tradeId, expiresAt: terms.expiresAt };
    }

    const leg1Raw = this.state.get(`escrow:leg1:${tradeId}`);
    const leg2Raw = this.state.get(`escrow:leg2:${tradeId}`);
    const leg1 = leg1Raw ? (JSON.parse(leg1Raw) as EscrowRecord) : null;
    const leg2 = leg2Raw ? (JSON.parse(leg2Raw) as EscrowRecord) : null;

    if (leg1?.status === 'LOCKED' && leg2?.status === 'LOCKED') return { status: 'ESCROWED', tradeId, expiresAt: terms.expiresAt };
    if (leg1?.status === 'LOCKED') return { status: 'LEG1_LOCKED', tradeId, expiresAt: terms.expiresAt };
    if (leg2?.status === 'LOCKED') return { status: 'LEG2_LOCKED', tradeId, expiresAt: terms.expiresAt };

    return { status: 'VALIDATED', tradeId, expiresAt: terms.expiresAt };
  }

  public async getAllTrades(): Promise<TradeTerms[]> {
    const trades: TradeTerms[] = [];
    for (const [key, value] of this.state.entries()) {
      if (key.startsWith('trade:terms:')) {
        trades.push(JSON.parse(value));
      }
    }
    return trades;
  }
}

export const mockLedger = new MockLedger();
