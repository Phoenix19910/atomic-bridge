/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';
import { KeyEndorsementPolicy } from 'fabric-shim';
import stringify from 'json-stringify-deterministic';
import sortKeysRecursive from 'sort-keys-recursive';
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
} from './models';

@Info({
  title: 'AtomicBridge',
  description: 'Cross-Border DvP/PvP Atomic Settlement Chaincode with Approach B Timeout Refund',
})
export class AtomicBridgeContract extends Contract {
  // =========================================================================
  // Initialization & Ledger Setup
  // =========================================================================

  @Transaction()
  public async InitLedger(ctx: Context): Promise<void> {
    const txTime = ctx.stub.getDateTimestamp();
    const txTimestamp = txTime.toISOString();

    // Default jurisdiction rules for India & Singapore
    const indiaRule: JurisdictionRule = {
      docType: 'jurisdiction_rule',
      jurisdiction: 'INDIA',
      regulatorMSP: 'RBI-MSP',
      currency: 'INR',
      maxTransactionLimit: 1000000000, // 1 Billion INR (~$12M USD)
      dailyLimit: 5000000000,
      baseRate: 84.0,
      rateTolerancePercent: 10.0,
      cutOffHourUTC: 18,
      updatedAt: txTimestamp,
    };
    await this.putDeterministicState(ctx, 'rule:INDIA', indiaRule);

    const sgRule: JurisdictionRule = {
      docType: 'jurisdiction_rule',
      jurisdiction: 'SINGAPORE',
      regulatorMSP: 'MAS-MSP',
      currency: 'USD',
      maxTransactionLimit: 50000000, // 50 Million USD
      dailyLimit: 250000000,
      baseRate: 84.0,
      rateTolerancePercent: 10.0,
      cutOffHourUTC: 18,
      updatedAt: txTimestamp,
    };
    await this.putDeterministicState(ctx, 'rule:SINGAPORE', sgRule);

    // Initial demo token balances for member banks
    const initialBalances: Array<{ ownerMSP: string; currency: string; balance: number }> = [
      { ownerMSP: 'BankA-MSP', currency: 'INR', balance: 500000000 }, // 500M INR (~$6M)
      { ownerMSP: 'BankC-MSP', currency: 'USD', balance: 10000000 },  // 10M USD
      { ownerMSP: 'BankB-MSP', currency: 'INR', balance: 100000000 }, // 100M INR
      { ownerMSP: 'BankD-MSP', currency: 'USD', balance: 5000000 },   // 5M USD
    ];

    for (const item of initialBalances) {
      const balanceRecord: BalanceRecord = {
        docType: 'balance_record',
        ownerMSP: item.ownerMSP,
        currency: item.currency,
        balance: item.balance,
        updatedAt: txTimestamp,
      };
      await this.putDeterministicState(ctx, `balance:${item.ownerMSP}:${item.currency}`, balanceRecord);
    }
  }

  // =========================================================================
  // Jurisdiction & Regulatory Rules
  // =========================================================================

  @Transaction()
  public async SetJurisdictionRule(
    ctx: Context,
    jurisdiction: string,
    maxTransactionLimit: string,
    dailyLimit: string,
    baseRate: string,
    rateTolerancePercent: string,
    cutOffHourUTC: string
  ): Promise<string> {
    const callerMSP = ctx.clientIdentity.getMSPID();
    const normJurisdiction = jurisdiction.toUpperCase().trim();

    let currency: string;
    let regMSP: string;

    // Client-Identity Authorization
    if (normJurisdiction === 'INDIA' || normJurisdiction === 'INR') {
      if (callerMSP !== 'RBI-MSP') {
        throw new Error(`Unauthorized caller: ${callerMSP}. Only RBI-MSP can set rules for India`);
      }
      currency = 'INR';
      regMSP = 'RBI-MSP';
    } else if (normJurisdiction === 'SINGAPORE' || normJurisdiction === 'USD') {
      if (callerMSP !== 'MAS-MSP') {
        throw new Error(`Unauthorized caller: ${callerMSP}. Only MAS-MSP can set rules for Singapore`);
      }
      currency = 'USD';
      regMSP = 'MAS-MSP';
    } else {
      throw new Error(`Unsupported jurisdiction: ${jurisdiction}`);
    }

    const txTime = ctx.stub.getDateTimestamp();

    const rule: JurisdictionRule = {
      docType: 'jurisdiction_rule',
      jurisdiction: normJurisdiction,
      regulatorMSP: regMSP,
      currency,
      maxTransactionLimit: Number(maxTransactionLimit),
      dailyLimit: Number(dailyLimit),
      baseRate: Number(baseRate),
      rateTolerancePercent: Number(rateTolerancePercent),
      cutOffHourUTC: Number(cutOffHourUTC),
      updatedAt: txTime.toISOString(),
    };

    const key = `rule:${normJurisdiction}`;
    await this.putDeterministicState(ctx, key, rule);
    this.emitEvent(ctx, 'JurisdictionRuleSet', rule);

    return JSON.stringify(rule);
  }

  @Transaction(false)
  @Returns('string')
  public async GetJurisdictionRule(ctx: Context, jurisdiction: string): Promise<string> {
    const normJurisdiction = jurisdiction.toUpperCase().trim();
    const key = `rule:${normJurisdiction}`;
    const ruleBytes = await ctx.stub.getState(key);
    if (ruleBytes.length === 0) {
      throw new Error(`Jurisdiction rule for ${jurisdiction} not found`);
    }
    return ruleBytes.toString();
  }

  // =========================================================================
  // Token Operations (Mint, Burn, Balance)
  // =========================================================================

  @Transaction()
  public async MintTokens(
    ctx: Context,
    targetMSP: string,
    currency: string,
    amount: string
  ): Promise<string> {
    const callerMSP = ctx.clientIdentity.getMSPID();
    const normCurrency = currency.toUpperCase().trim();
    const numAmount = Number(amount);

    if (numAmount <= 0 || Number.isNaN(numAmount)) {
      throw new Error('Mint amount must be a positive number');
    }

    // Client-Identity Authorization
    if (normCurrency === 'INR' && callerMSP !== 'RBI-MSP') {
      throw new Error(`Unauthorized caller: ${callerMSP}. Only RBI-MSP can mint INR tokens`);
    } else if (normCurrency === 'USD' && callerMSP !== 'MAS-MSP') {
      throw new Error(`Unauthorized caller: ${callerMSP}. Only MAS-MSP can mint USD tokens`);
    } else if (normCurrency !== 'INR' && normCurrency !== 'USD') {
      throw new Error(`Unsupported currency: ${currency}`);
    }

    const txTime = ctx.stub.getDateTimestamp();
    const balanceKey = `balance:${targetMSP}:${normCurrency}`;
    const currentBalance = await this.readBalance(ctx, targetMSP, normCurrency);
    const newBalance = currentBalance + numAmount;

    const record: BalanceRecord = {
      docType: 'balance_record',
      ownerMSP: targetMSP,
      currency: normCurrency,
      balance: newBalance,
      updatedAt: txTime.toISOString(),
    };

    await this.putDeterministicState(ctx, balanceKey, record);
    this.emitEvent(ctx, 'TokensMinted', {
      targetMSP,
      currency: normCurrency,
      amount: numAmount,
      newBalance,
      mintedBy: callerMSP,
    });

    return JSON.stringify(record);
  }

  @Transaction()
  public async BurnTokens(
    ctx: Context,
    currency: string,
    amount: string
  ): Promise<string> {
    const callerMSP = ctx.clientIdentity.getMSPID();
    const normCurrency = currency.toUpperCase().trim();
    const numAmount = Number(amount);

    if (numAmount <= 0 || Number.isNaN(numAmount)) {
      throw new Error('Burn amount must be a positive number');
    }

    const currentBalance = await this.readBalance(ctx, callerMSP, normCurrency);
    if (currentBalance < numAmount) {
      throw new Error(
        `Insufficient balance to burn ${String(numAmount)} ${normCurrency}. Current balance: ${String(currentBalance)}`
      );
    }

    const txTime = ctx.stub.getDateTimestamp();
    const newBalance = currentBalance - numAmount;
    const balanceKey = `balance:${callerMSP}:${normCurrency}`;

    const record: BalanceRecord = {
      docType: 'balance_record',
      ownerMSP: callerMSP,
      currency: normCurrency,
      balance: newBalance,
      updatedAt: txTime.toISOString(),
    };

    await this.putDeterministicState(ctx, balanceKey, record);
    this.emitEvent(ctx, 'TokensBurned', {
      ownerMSP: callerMSP,
      currency: normCurrency,
      amount: numAmount,
      newBalance,
    });

    return JSON.stringify(record);
  }

  @Transaction(false)
  @Returns('string')
  public async GetBalance(ctx: Context, ownerMSP: string, currency: string): Promise<string> {
    const normCurrency = currency.toUpperCase().trim();
    const balanceKey = `balance:${ownerMSP}:${normCurrency}`;
    const balanceBytes = await ctx.stub.getState(balanceKey);

    if (balanceBytes.length === 0) {
      const emptyRecord: BalanceRecord = {
        docType: 'balance_record',
        ownerMSP,
        currency: normCurrency,
        balance: 0,
        updatedAt: '',
      };
      return JSON.stringify(emptyRecord);
    }

    return balanceBytes.toString();
  }

  // =========================================================================
  // Phase 1: Initiate Trade (Terms, Compliance & 4-Party SBE Installation)
  // =========================================================================

  @Transaction()
  public async InitiateTrade(
    ctx: Context,
    tradeId: string,
    counterpartyMSP: string,
    leg1AmountINR: string,
    leg2AmountUSD: string,
    timeoutSeconds: string
  ): Promise<string> {
    const callerMSP = ctx.clientIdentity.getMSPID();
    const txTime = ctx.stub.getDateTimestamp();
    const txTimestamp = txTime.toISOString();

    const numLeg1 = Number(leg1AmountINR);
    const numLeg2 = Number(leg2AmountUSD);
    const numTimeout = Number(timeoutSeconds);

    if (numLeg1 <= 0 || Number.isNaN(numLeg1)) {
      throw new Error('Leg 1 amount (INR) must be a positive number');
    }
    if (numLeg2 <= 0 || Number.isNaN(numLeg2)) {
      throw new Error('Leg 2 amount (USD) must be a positive number');
    }
    if (numTimeout <= 0 || Number.isNaN(numTimeout)) {
      throw new Error('Timeout seconds must be a positive number');
    }

    // Check if trade already exists
    const existingTermsBytes = await ctx.stub.getState(`trade:terms:${tradeId}`);
    if (existingTermsBytes.length > 0) {
      throw new Error(`Trade ${tradeId} already exists`);
    }

    // Evaluate compliance rules
    const compliancePass = await this.evaluateRules(ctx, numLeg1, numLeg2);
    if (!compliancePass.valid) {
      const refusalRecord: ComplianceAttempt = {
        docType: 'compliance_attempt',
        attemptId: ctx.stub.getTxID(),
        tradeId,
        initiatorMSP: callerMSP,
        counterpartyMSP,
        evaluatedAt: txTimestamp,
        result: 'REFUSED',
        reasonCode: compliancePass.reasonCode,
      };
      await this.putDeterministicState(ctx, `compliance:${tradeId}`, refusalRecord);
      this.emitEvent(ctx, 'TradeRefused', refusalRecord);
      return JSON.stringify({ status: 'REFUSED', reason: compliancePass.reasonCode, tradeId });
    }

    // Commit immutable trade terms
    const expiresAt = new Date(txTime.getTime() + numTimeout * 1000).toISOString();
    const terms: TradeTerms = {
      docType: 'trade_terms',
      tradeId,
      initiatorMSP: callerMSP,
      counterpartyMSP,
      leg1AmountINR: numLeg1,
      leg2AmountUSD: numLeg2,
      exchangeRate: numLeg1 / numLeg2,
      expiresAt,
      createdAt: txTimestamp,
    };
    await this.putDeterministicState(ctx, `trade:terms:${tradeId}`, terms);

    // Create settlement key with PENDING status and install 4-party SBE
    const settlementKey = `settlement:${tradeId}`;
    const initialSettlement: SettlementRecord = {
      docType: 'settlement',
      tradeId,
      status: 'PENDING',
    };
    await this.putDeterministicState(ctx, settlementKey, initialSettlement);

    // Mandatory 4-Party Mutual Endorsement Policy (SBE) on settlement key
    const ep = new KeyEndorsementPolicy();
    ep.addOrgs('PEER', 'BankA-MSP', 'BankC-MSP', 'RBI-MSP', 'MAS-MSP');
    await ctx.stub.setStateValidationParameter(settlementKey, Buffer.from(ep.getPolicy()));

    this.emitEvent(ctx, 'TradeInitiated', {
      tradeId,
      initiatorMSP: callerMSP,
      counterpartyMSP,
      leg1AmountINR: numLeg1,
      leg2AmountUSD: numLeg2,
      expiresAt,
    });

    return JSON.stringify({ status: 'VALIDATED', tradeId, expiresAt });
  }

  // =========================================================================
  // Phase 1.5: Lock Escrow Leg (Leg 1 = INR, Leg 2 = USD)
  // =========================================================================

  @Transaction()
  public async LockTradeLeg(
    ctx: Context,
    tradeId: string,
    legId: string
  ): Promise<string> {
    const callerMSP = ctx.clientIdentity.getMSPID();
    const txTime = ctx.stub.getDateTimestamp();
    const txTimestamp = txTime.toISOString();
    const upperLegId = legId.toUpperCase().trim();

    if (upperLegId !== 'LEG1' && upperLegId !== 'LEG2') {
      throw new Error(`Invalid leg ID: ${legId}. Must be LEG1 or LEG2`);
    }
    const normLegId: 'LEG1' | 'LEG2' = upperLegId;

    // Read immutable trade terms
    const termsBytes = await ctx.stub.getState(`trade:terms:${tradeId}`);
    if (termsBytes.length === 0) {
      throw new Error(`Trade terms for ${tradeId} not found`);
    }
    const terms = JSON.parse(termsBytes.toString()) as TradeTerms;

    // Guard: Settlement check
    const settlementBytes = await ctx.stub.getState(`settlement:${tradeId}`);
    if (settlementBytes.length > 0) {
      const settlement = JSON.parse(settlementBytes.toString()) as SettlementRecord;
      if (settlement.status === 'SETTLED') {
        throw new Error(`Trade ${tradeId} is already settled; cannot lock funds`);
      }
    }

    // Guard: Refund check
    const refundBytes = await ctx.stub.getState(`refund:${tradeId}`);
    if (refundBytes.length > 0) {
      throw new Error(`Trade ${tradeId} has already timed out or been refunded`);
    }

    // Guard: Expiry check
    if (txTime.getTime() >= new Date(terms.expiresAt).getTime()) {
      throw new Error(`Trade ${tradeId} has reached cut-off time; locking is closed`);
    }

    // Determine payer, currency, and amount based on leg
    let expectedPayerMSP: string;
    let currency: string;
    let amount: number;

    if (normLegId === 'LEG1') {
      expectedPayerMSP = terms.initiatorMSP;
      currency = 'INR';
      amount = terms.leg1AmountINR;
    } else {
      expectedPayerMSP = terms.counterpartyMSP;
      currency = 'USD';
      amount = terms.leg2AmountUSD;
    }

    // Authorization: Client identity must match the responsible commercial bank
    if (callerMSP !== expectedPayerMSP) {
      throw new Error(
        `Unauthorized caller: ${callerMSP}. Only ${expectedPayerMSP} can lock ${normLegId}`
      );
    }

    // Guard: Duplicate lock prevention
    const escrowKey = `escrow:${normLegId.toLowerCase()}:${tradeId}`;
    const existingEscrowBytes = await ctx.stub.getState(escrowKey);
    if (existingEscrowBytes.length > 0) {
      const existingEscrow = JSON.parse(existingEscrowBytes.toString()) as EscrowRecord;
      if (existingEscrow.status === 'LOCKED') {
        throw new Error(`Leg ${normLegId} for trade ${tradeId} is already locked`);
      }
      if (existingEscrow.status === 'REFUNDED') {
        throw new Error(`Leg ${normLegId} for trade ${tradeId} has already been refunded`);
      }
    }

    // Debit payer's balance
    await this.debitBalance(ctx, callerMSP, currency, amount);

    // Write locked escrow record
    const escrowRecord: EscrowRecord = {
      docType: 'escrow_record',
      tradeId,
      legId: normLegId,
      payerMSP: callerMSP,
      amount,
      currency,
      status: 'LOCKED',
      lockedAt: txTimestamp,
      lockTxId: ctx.stub.getTxID(),
    };
    await this.putDeterministicState(ctx, escrowKey, escrowRecord);

    // Check if other leg is also locked -> ESCROWED
    const otherLegId = normLegId === 'LEG1' ? 'leg2' : 'leg1';
    const otherEscrowBytes = await ctx.stub.getState(`escrow:${otherLegId}:${tradeId}`);
    let bothLocked = false;
    if (otherEscrowBytes.length > 0) {
      const otherEscrow = JSON.parse(otherEscrowBytes.toString()) as EscrowRecord;
      if (otherEscrow.status === 'LOCKED') {
        bothLocked = true;
      }
    }

    const currentStatus: TradeLifecycleStatus = bothLocked
      ? 'ESCROWED'
      : normLegId === 'LEG1'
      ? 'LEG1_LOCKED'
      : 'LEG2_LOCKED';

    this.emitEvent(ctx, 'TradeLegLocked', {
      tradeId,
      legId: normLegId,
      payerMSP: callerMSP,
      amount,
      currency,
      status: currentStatus,
    });

    return JSON.stringify({ status: currentStatus, tradeId, legId: normLegId });
  }

  // =========================================================================
  // Phase 2: Execute PvP Swap (4-Party Mutual SBE Settlement)
  // =========================================================================

  @Transaction()
  public async ExecutePvPSwap(ctx: Context, tradeId: string): Promise<string> {
    const txTime = ctx.stub.getDateTimestamp();
    const txTimestamp = txTime.toISOString();

    const settlementKey = `settlement:${tradeId}`;
    const settlementBytes = await ctx.stub.getState(settlementKey);
    if (settlementBytes.length === 0) {
      throw new Error(`Settlement record for trade ${tradeId} not found`);
    }
    const settlement = JSON.parse(settlementBytes.toString()) as SettlementRecord;

    if (settlement.status !== 'PENDING') {
      throw new Error(`Trade ${tradeId} is not in PENDING status (current: ${settlement.status})`);
    }

    // Check refund hasn't been committed
    const refundBytes = await ctx.stub.getState(`refund:${tradeId}`);
    if (refundBytes.length > 0) {
      throw new Error(`Trade ${tradeId} has already been refunded or timed out`);
    }

    // Read trade terms
    const termsBytes = await ctx.stub.getState(`trade:terms:${tradeId}`);
    if (termsBytes.length === 0) {
      throw new Error(`Trade terms for ${tradeId} not found`);
    }
    const terms = JSON.parse(termsBytes.toString()) as TradeTerms;

    // Verify both escrows are in LOCKED status
    const leg1Key = `escrow:leg1:${tradeId}`;
    const leg2Key = `escrow:leg2:${tradeId}`;
    const leg1Bytes = await ctx.stub.getState(leg1Key);
    const leg2Bytes = await ctx.stub.getState(leg2Key);

    const leg1 = leg1Bytes.length > 0 ? (JSON.parse(leg1Bytes.toString()) as EscrowRecord) : null;
    const leg2 = leg2Bytes.length > 0 ? (JSON.parse(leg2Bytes.toString()) as EscrowRecord) : null;

    if (leg1?.status !== 'LOCKED' || leg2?.status !== 'LOCKED') {
      const leg1Status = leg1 ? leg1.status : 'MISSING';
      const leg2Status = leg2 ? leg2.status : 'MISSING';
      throw new Error(
        `Cannot execute PvP swap: both legs must be LOCKED. Leg 1: ${leg1Status}, Leg 2: ${leg2Status}`
      );
    }

    // Atomic Balance Swap:
    // - Counterparty (Bank C) receives Leg 1 INR amount
    // - Initiator (Bank A) receives Leg 2 USD amount
    await this.creditBalance(ctx, terms.counterpartyMSP, 'INR', terms.leg1AmountINR);
    await this.creditBalance(ctx, terms.initiatorMSP, 'USD', terms.leg2AmountUSD);

    // Release escrows to SETTLED
    leg1.status = 'SETTLED';
    leg2.status = 'SETTLED';
    await this.putDeterministicState(ctx, leg1Key, leg1);
    await this.putDeterministicState(ctx, leg2Key, leg2);

    // Mutating settlement key triggers Fabric VSCC 4-party SBE validation
    settlement.status = 'SETTLED';
    settlement.settledAt = txTimestamp;
    settlement.settlementTxId = ctx.stub.getTxID();
    await this.putDeterministicState(ctx, settlementKey, settlement);

    this.emitEvent(ctx, 'TradeSettled', {
      tradeId,
      settledAt: txTimestamp,
      settlementTxId: settlement.settlementTxId,
      initiatorMSP: terms.initiatorMSP,
      counterpartyMSP: terms.counterpartyMSP,
    });

    return JSON.stringify({
      status: 'SETTLED',
      tradeId,
      settledAt: settlement.settledAt,
      settlementTxId: settlement.settlementTxId,
    });
  }

  // =========================================================================
  // Phase 3: Timeout Refund (Approach B: Dedicated refund:{tradeId} Record)
  // =========================================================================

  @Transaction()
  public async CancelOrRefundTrade(ctx: Context, tradeId: string): Promise<string> {
    const callerMSP = ctx.clientIdentity.getMSPID();
    const txTime = ctx.stub.getDateTimestamp();
    const txTimestamp = txTime.toISOString();

    const termsBytes = await ctx.stub.getState(`trade:terms:${tradeId}`);
    if (termsBytes.length === 0) {
      throw new Error(`Trade terms for ${tradeId} not found`);
    }
    const terms = JSON.parse(termsBytes.toString()) as TradeTerms;

    // 1. Settlement Invariant Guard (settlement key is NEVER modified by refund)
    const settlementBytes = await ctx.stub.getState(`settlement:${tradeId}`);
    if (settlementBytes.length > 0) {
      const settlement = JSON.parse(settlementBytes.toString()) as SettlementRecord;
      if (settlement.status === 'SETTLED') {
        throw new Error(`Trade ${tradeId} is settled; refunds are forbidden`);
      }
    }

    // 2. Proposal timestamp validation (deterministic chaincode cut-off guard)
    if (txTime.getTime() < new Date(terms.expiresAt).getTime()) {
      throw new Error(`Trade ${tradeId} has not reached cut-off time`);
    }

    // 3. Caller authorization: Depositing bank or authorized channel watcher (RBI/MAS)
    const isLeg1Owner = callerMSP === terms.initiatorMSP;
    const isLeg2Owner = callerMSP === terms.counterpartyMSP;
    // PoC simplification: attribute check not enforced; any RBI-MSP or MAS-MSP client may act as watcher
    const isWatcher = callerMSP === 'RBI-MSP' || callerMSP === 'MAS-MSP';

    if (!isLeg1Owner && !isLeg2Owner && !isWatcher) {
      throw new Error(`Unauthorized caller: ${callerMSP}`);
    }

    // 4. Check existing refund record for terminal state
    const existingRefundBytes = await ctx.stub.getState(`refund:${tradeId}`);
    const existingRefund: RefundRecord | null =
      existingRefundBytes.length > 0
        ? (JSON.parse(existingRefundBytes.toString()) as RefundRecord)
        : null;

    if (existingRefund) {
      if (existingRefund.outcome === 'TIMED_OUT_NO_FUNDS') {
        throw new Error('Trade already timed out with no funds locked (TIMED_OUT_NO_FUNDS)');
      }
      if (existingRefund.outcome === 'TIMED_OUT_BOTH_REFUNDED') {
        throw new Error('Trade is already fully refunded (TIMED_OUT_BOTH_REFUNDED)');
      }
      if (
        existingRefund.outcome === 'TIMED_OUT_LEG1_REFUNDED' ||
        existingRefund.outcome === 'TIMED_OUT_LEG2_REFUNDED'
      ) {
        throw new Error(
          `Trade refund is terminal (${existingRefund.outcome}); no further legs to refund`
        );
      }
      if (isLeg1Owner && existingRefund.leg1Refunded) {
        throw new Error('Leg 1 is already refunded');
      }
      if (isLeg2Owner && existingRefund.leg2Refunded) {
        throw new Error('Leg 2 is already refunded');
      }
    }

    // 5. Inspect escrows
    const leg1Key = `escrow:leg1:${tradeId}`;
    const leg2Key = `escrow:leg2:${tradeId}`;
    const leg1Bytes = await ctx.stub.getState(leg1Key);
    const leg2Bytes = await ctx.stub.getState(leg2Key);

    const leg1 = leg1Bytes.length > 0 ? (JSON.parse(leg1Bytes.toString()) as EscrowRecord) : null;
    const leg2 = leg2Bytes.length > 0 ? (JSON.parse(leg2Bytes.toString()) as EscrowRecord) : null;

    // Case 1: No escrows ever locked
    const hasLockedFunds = leg1?.status === 'LOCKED' || leg2?.status === 'LOCKED';
    const hadPriorRefund = existingRefund !== null && (existingRefund.leg1Refunded || existingRefund.leg2Refunded);

    if (!hasLockedFunds && !hadPriorRefund) {
      const refundRecord: RefundRecord = {
        docType: 'refund_record',
        tradeId,
        outcome: 'TIMED_OUT_NO_FUNDS',
        leg1Refunded: false,
        leg2Refunded: false,
        refundedAt: txTimestamp,
        refundTxId: ctx.stub.getTxID(),
      };
      await this.putDeterministicState(ctx, `refund:${tradeId}`, refundRecord);
      this.emitEvent(ctx, 'TradeTimedOut', refundRecord);
      return JSON.stringify({ status: 'TIMED_OUT_NO_FUNDS', tradeId });
    }

    // Case 2 & 3 & 4: Process refunds using amounts from immutable trade terms
    let leg1Refunded = existingRefund ? existingRefund.leg1Refunded : false;
    let leg2Refunded = existingRefund ? existingRefund.leg2Refunded : false;

    if ((isLeg1Owner || isWatcher) && leg1?.status === 'LOCKED') {
      leg1.status = 'REFUNDED';
      await this.putDeterministicState(ctx, leg1Key, leg1);
      await this.restoreBalance(ctx, leg1.payerMSP, leg1.currency, terms.leg1AmountINR);
      leg1Refunded = true;
    }

    if ((isLeg2Owner || isWatcher) && leg2?.status === 'LOCKED') {
      leg2.status = 'REFUNDED';
      await this.putDeterministicState(ctx, leg2Key, leg2);
      await this.restoreBalance(ctx, leg2.payerMSP, leg2.currency, terms.leg2AmountUSD);
      leg2Refunded = true;
    }

    // Derive outcome based on refund and remaining locked states
    let outcome: RefundOutcome = 'TIMED_OUT_NO_FUNDS';
    if (leg1Refunded && leg2Refunded) {
      outcome = 'TIMED_OUT_BOTH_REFUNDED';
    } else if (leg1Refunded && leg2?.status === 'LOCKED') {
      outcome = 'TIMED_OUT_LEG1_REFUNDED_LEG2_LOCKED';
    } else if (leg2Refunded && leg1?.status === 'LOCKED') {
      outcome = 'TIMED_OUT_LEG2_REFUNDED_LEG1_LOCKED';
    } else if (leg1Refunded) {
      outcome = 'TIMED_OUT_LEG1_REFUNDED';
    } else if (leg2Refunded) {
      outcome = 'TIMED_OUT_LEG2_REFUNDED';
    }

    const refundRecord: RefundRecord = {
      docType: 'refund_record',
      tradeId,
      outcome,
      leg1Refunded,
      leg2Refunded,
      refundedAt: txTimestamp,
      refundTxId: ctx.stub.getTxID(),
    };

    await this.putDeterministicState(ctx, `refund:${tradeId}`, refundRecord);
    this.emitEvent(ctx, 'TradeRefunded', refundRecord);

    return JSON.stringify({ status: outcome, tradeId });
  }

  // =========================================================================
  // Query & Status Derivation Methods (§5.4 & §3.3)
  // =========================================================================

  @Transaction(false)
  @Returns('string')
  public async GetTradeTerms(ctx: Context, tradeId: string): Promise<string> {
    const termsBytes = await ctx.stub.getState(`trade:terms:${tradeId}`);
    if (termsBytes.length === 0) {
      throw new Error(`Trade terms for ${tradeId} not found`);
    }
    return termsBytes.toString();
  }

  @Transaction(false)
  @Returns('string')
  public async GetSettlement(ctx: Context, tradeId: string): Promise<string> {
    const bytes = await ctx.stub.getState(`settlement:${tradeId}`);
    if (bytes.length === 0) {
      throw new Error(`Settlement record for ${tradeId} not found`);
    }
    return bytes.toString();
  }

  @Transaction(false)
  @Returns('string')
  public async GetEscrow(ctx: Context, tradeId: string, legId: string): Promise<string> {
    const norm = legId.toLowerCase().trim();
    const bytes = await ctx.stub.getState(`escrow:${norm}:${tradeId}`);
    if (bytes.length === 0) {
      throw new Error(`Escrow record for ${tradeId} ${legId} not found`);
    }
    return bytes.toString();
  }

  @Transaction(false)
  @Returns('string')
  public async GetRefund(ctx: Context, tradeId: string): Promise<string> {
    const bytes = await ctx.stub.getState(`refund:${tradeId}`);
    if (bytes.length === 0) {
      throw new Error(`Refund record for ${tradeId} not found`);
    }
    return bytes.toString();
  }

  @Transaction(false)
  @Returns('string')
  public async GetComplianceRecord(ctx: Context, tradeId: string): Promise<string> {
    const bytes = await ctx.stub.getState(`compliance:${tradeId}`);
    if (bytes.length === 0) {
      throw new Error(`Compliance record for ${tradeId} not found`);
    }
    return bytes.toString();
  }

  /**
   * Status derivation in strict accordance with requirements.md §5.4 & api-contract.md §3.3:
   * 1. If settlement:{tradeId} is SETTLED -> SETTLED (Ledger-Confirmed)
   * 2. Else if refund:{tradeId} exists -> displays exact refund.outcome
   * 3. Else if txTime >= terms.expiresAt -> EXPIRED_AWAITING_REFUND (estimated local clock cut-off reached)
   * 4. Else active pre-expiry progress: ESCROWED, LEG1_LOCKED, LEG2_LOCKED, or VALIDATED
   */
  @Transaction(false)
  @Returns('string')
  public async GetTradeStatus(ctx: Context, tradeId: string): Promise<string> {
    const termsBytes = await ctx.stub.getState(`trade:terms:${tradeId}`);
    if (termsBytes.length === 0) {
      // Check if it was refused at compliance
      const compBytes = await ctx.stub.getState(`compliance:${tradeId}`);
      if (compBytes.length > 0) {
        return JSON.stringify({ status: 'REFUSED', tradeId });
      }
      throw new Error(`Trade ${tradeId} does not exist`);
    }
    const terms = JSON.parse(termsBytes.toString()) as TradeTerms;

    // 1. Settlement check
    const settlementBytes = await ctx.stub.getState(`settlement:${tradeId}`);
    if (settlementBytes.length > 0) {
      const settlement = JSON.parse(settlementBytes.toString()) as SettlementRecord;
      if (settlement.status === 'SETTLED') {
        return JSON.stringify({
          status: 'SETTLED',
          tradeId,
          settledAt: settlement.settledAt,
          settlementTxId: settlement.settlementTxId,
        });
      }
    }

    // 2. Refund check
    const refundBytes = await ctx.stub.getState(`refund:${tradeId}`);
    if (refundBytes.length > 0) {
      const refund = JSON.parse(refundBytes.toString()) as RefundRecord;
      return JSON.stringify({
        status: refund.outcome,
        tradeId,
        refund,
      });
    }

    // 3. Expiry check
    const txTime = ctx.stub.getDateTimestamp();
    if (txTime.getTime() >= new Date(terms.expiresAt).getTime()) {
      return JSON.stringify({
        status: 'EXPIRED_AWAITING_REFUND',
        tradeId,
        expiresAt: terms.expiresAt,
      });
    }

    // 4. Pre-expiry active progress
    const leg1Bytes = await ctx.stub.getState(`escrow:leg1:${tradeId}`);
    const leg2Bytes = await ctx.stub.getState(`escrow:leg2:${tradeId}`);
    const leg1 = leg1Bytes.length > 0 ? (JSON.parse(leg1Bytes.toString()) as EscrowRecord) : null;
    const leg2 = leg2Bytes.length > 0 ? (JSON.parse(leg2Bytes.toString()) as EscrowRecord) : null;

    let derivedStatus: TradeLifecycleStatus = 'VALIDATED';
    if (leg1?.status === 'LOCKED' && leg2?.status === 'LOCKED') {
      derivedStatus = 'ESCROWED';
    } else if (leg1?.status === 'LOCKED') {
      derivedStatus = 'LEG1_LOCKED';
    } else if (leg2?.status === 'LOCKED') {
      derivedStatus = 'LEG2_LOCKED';
    }

    return JSON.stringify({
      status: derivedStatus,
      tradeId,
      expiresAt: terms.expiresAt,
    });
  }

  @Transaction(false)
  @Returns('string')
  public async GetAllTrades(ctx: Context): Promise<string> {
    const iterator = await ctx.stub.getStateByRange('trade:terms:', 'trade:terms:\uffff');
    const trades: TradeTerms[] = [];

    let result = await iterator.next();
    while (!result.done) {
      if (result.value.value.length > 0) {
        try {
          const str = Buffer.from(result.value.value).toString('utf8');
          trades.push(JSON.parse(str) as TradeTerms);
        } catch {
          // ignore malformed entries
        }
      }
      result = await iterator.next();
    }

    return JSON.stringify(trades);
  }

  // =========================================================================
  // Internal Helpers
  // =========================================================================

  private async putDeterministicState(ctx: Context, key: string, data: object): Promise<void> {
    const deterministicJson = stringify(sortKeysRecursive(data));
    await ctx.stub.putState(key, Buffer.from(deterministicJson));
  }

  private emitEvent(ctx: Context, name: string, payload: object): void {
    const payloadBytes = Buffer.from(stringify(sortKeysRecursive(payload)));
    ctx.stub.setEvent(name, payloadBytes);
  }

  private async readBalance(ctx: Context, ownerMSP: string, currency: string): Promise<number> {
    const balanceKey = `balance:${ownerMSP}:${currency}`;
    const balanceBytes = await ctx.stub.getState(balanceKey);
    if (balanceBytes.length === 0) {
      return 0;
    }
    const record = JSON.parse(balanceBytes.toString()) as BalanceRecord;
    return record.balance;
  }

  private async creditBalance(
    ctx: Context,
    ownerMSP: string,
    currency: string,
    amount: number
  ): Promise<void> {
    const balanceKey = `balance:${ownerMSP}:${currency}`;
    const current = await this.readBalance(ctx, ownerMSP, currency);
    const updated = current + amount;
    const txTime = ctx.stub.getDateTimestamp();

    const record: BalanceRecord = {
      docType: 'balance_record',
      ownerMSP,
      currency,
      balance: updated,
      updatedAt: txTime.toISOString(),
    };
    await this.putDeterministicState(ctx, balanceKey, record);
  }

  private async debitBalance(
    ctx: Context,
    ownerMSP: string,
    currency: string,
    amount: number
  ): Promise<void> {
    const current = await this.readBalance(ctx, ownerMSP, currency);
    if (current < amount) {
      throw new Error(
        `Insufficient balance for ${ownerMSP} in ${currency}. Needed: ${String(amount)}, Available: ${String(current)}`
      );
    }
    const updated = current - amount;
    const txTime = ctx.stub.getDateTimestamp();
    const balanceKey = `balance:${ownerMSP}:${currency}`;

    const record: BalanceRecord = {
      docType: 'balance_record',
      ownerMSP,
      currency,
      balance: updated,
      updatedAt: txTime.toISOString(),
    };
    await this.putDeterministicState(ctx, balanceKey, record);
  }

  private async restoreBalance(
    ctx: Context,
    ownerMSP: string,
    currency: string,
    amount: number
  ): Promise<void> {
    await this.creditBalance(ctx, ownerMSP, currency, amount);
  }

  private async evaluateRules(
    ctx: Context,
    leg1AmountINR: number,
    leg2AmountUSD: number
  ): Promise<{ valid: boolean; reasonCode?: string }> {
    if (leg1AmountINR <= 0 || leg2AmountUSD <= 0) {
      return { valid: false, reasonCode: 'INVALID_AMOUNT' };
    }

    // Check India corridor rule
    const indiaRuleBytes = await ctx.stub.getState('rule:INDIA');
    if (indiaRuleBytes.length > 0) {
      const indiaRule = JSON.parse(indiaRuleBytes.toString()) as JurisdictionRule;
      if (indiaRule.maxTransactionLimit > 0 && leg1AmountINR > indiaRule.maxTransactionLimit) {
        return { valid: false, reasonCode: 'EXCEEDS_INDIA_MAX_TRANSACTION_LIMIT' };
      }
      if (indiaRule.baseRate > 0 && indiaRule.rateTolerancePercent > 0) {
        const impliedRate = leg1AmountINR / leg2AmountUSD;
        const diffPercent = (Math.abs(impliedRate - indiaRule.baseRate) / indiaRule.baseRate) * 100;
        if (diffPercent > indiaRule.rateTolerancePercent) {
          return { valid: false, reasonCode: 'EXCHANGE_RATE_EXCEEDS_TOLERANCE' };
        }
      }
    }

    // Check Singapore corridor rule
    const sgRuleBytes = await ctx.stub.getState('rule:SINGAPORE');
    if (sgRuleBytes.length > 0) {
      const sgRule = JSON.parse(sgRuleBytes.toString()) as JurisdictionRule;
      if (sgRule.maxTransactionLimit > 0 && leg2AmountUSD > sgRule.maxTransactionLimit) {
        return { valid: false, reasonCode: 'EXCEEDS_SINGAPORE_MAX_TRANSACTION_LIMIT' };
      }
    }

    return { valid: true };
  }
}
