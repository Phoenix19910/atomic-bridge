import { RTGSAccount, RTGSTransaction } from '../types';
import { eventService } from './events';

export const RTGS_SIMULATION_DISCLAIMER =
  'Simulated Central Bank RTGS Cash Leg Rail for demonstration only. Not connected to live sovereign payment rails (RBI NEFT/RTGS, MAS MEPS+).';

class RTGSService {
  private accounts: Map<string, RTGSAccount> = new Map();
  private transactions: RTGSTransaction[] = [];

  constructor() {
    this.initDefaultAccounts();
  }

  private initDefaultAccounts(): void {
    const defaultAccounts: RTGSAccount[] = [
      {
        accountNumber: 'RTGS-RBI-BANKA-001',
        bankMSP: 'BankA-MSP',
        currency: 'INR',
        reserveBankMSP: 'RBI-MSP',
        fiatBalance: 1000000000, // 1 Billion INR
        pledgedBalance: 0,
        lastUpdated: new Date().toISOString(),
      },
      {
        accountNumber: 'RTGS-RBI-BANKB-002',
        bankMSP: 'BankB-MSP',
        currency: 'INR',
        reserveBankMSP: 'RBI-MSP',
        fiatBalance: 200000000, // 200M INR
        pledgedBalance: 0,
        lastUpdated: new Date().toISOString(),
      },
      {
        accountNumber: 'RTGS-MAS-BANKC-003',
        bankMSP: 'BankC-MSP',
        currency: 'USD',
        reserveBankMSP: 'MAS-MSP',
        fiatBalance: 25000000, // 25M USD
        pledgedBalance: 0,
        lastUpdated: new Date().toISOString(),
      },
      {
        accountNumber: 'RTGS-MAS-BANKD-004',
        bankMSP: 'BankD-MSP',
        currency: 'USD',
        reserveBankMSP: 'MAS-MSP',
        fiatBalance: 10000000, // 10M USD
        pledgedBalance: 0,
        lastUpdated: new Date().toISOString(),
      },
    ];

    for (const acc of defaultAccounts) {
      this.accounts.set(acc.bankMSP, acc);
    }
  }

  public getAccounts(): { simulated: true; disclaimer: string; accounts: RTGSAccount[] } {
    return {
      simulated: true,
      disclaimer: RTGS_SIMULATION_DISCLAIMER,
      accounts: Array.from(this.accounts.values()),
    };
  }

  public getAccount(bankMSP: string): RTGSAccount | undefined {
    return this.accounts.get(bankMSP);
  }

  public getTransactions(): { simulated: true; disclaimer: string; transactions: RTGSTransaction[] } {
    return {
      simulated: true,
      disclaimer: RTGS_SIMULATION_DISCLAIMER,
      transactions: this.transactions,
    };
  }

  /**
   * Simulate cash deposit into commercial bank's reserve account at Central Bank
   */
  public depositCash(
    bankMSP: string,
    amount: number,
    referenceId?: string
  ): { simulated: true; transaction: RTGSTransaction; account: RTGSAccount } {
    const account = this.accounts.get(bankMSP);
    if (!account) {
      throw new Error(`RTGS reserve account for ${bankMSP} not found`);
    }
    if (amount <= 0) {
      throw new Error('Deposit amount must be positive');
    }

    account.fiatBalance += amount;
    account.lastUpdated = new Date().toISOString();

    const tx: RTGSTransaction = {
      txId: `RTGS-DEP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: 'DEPOSIT',
      bankMSP,
      currency: account.currency,
      amount,
      status: 'COMPLETED',
      referenceId: referenceId || `DEP-REF-${Date.now()}`,
      timestamp: new Date().toISOString(),
      note: `Fiat cash deposit credited to reserve account ${account.accountNumber}`,
    };

    this.transactions.unshift(tx);
    eventService.broadcast('RTGS_DEPOSIT', { transaction: tx, account });

    return {
      simulated: true,
      transaction: tx,
      account,
    };
  }

  /**
   * Pre-requisite step for token minting:
   * Holds/pledges fiat cash in RTGS reserve account before minting tokenized central bank reserves on Fabric.
   */
  public holdFiatForMint(
    bankMSP: string,
    amount: number
  ): { simulated: true; holdTxId: string; account: RTGSAccount } {
    const account = this.accounts.get(bankMSP);
    if (!account) {
      throw new Error(`RTGS reserve account for ${bankMSP} not found`);
    }
    if (amount <= 0) {
      throw new Error('Hold amount must be positive');
    }
    if (account.fiatBalance < amount) {
      throw new Error(
        `Insufficient RTGS fiat reserve balance in ${account.accountNumber}. Available: ${account.fiatBalance} ${account.currency}, Required: ${amount}`
      );
    }

    account.fiatBalance -= amount;
    account.pledgedBalance += amount;
    account.lastUpdated = new Date().toISOString();

    const holdTxId = `RTGS-HOLD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const tx: RTGSTransaction = {
      txId: holdTxId,
      type: 'MINT_HOLD',
      bankMSP,
      currency: account.currency,
      amount,
      status: 'COMPLETED',
      referenceId: holdTxId,
      timestamp: new Date().toISOString(),
      note: `Fiat reserve held/pledged at Central Bank for on-chain token minting`,
    };

    this.transactions.unshift(tx);
    eventService.broadcast('RTGS_MINT_HOLD', { transaction: tx, account });

    return {
      simulated: true,
      holdTxId,
      account,
    };
  }

  /**
   * Post-settlement fiat payout:
   * Commercial bank redeems tokens with Central Bank to release fiat cash.
   */
  public payoutCash(
    bankMSP: string,
    amount: number,
    referenceId?: string
  ): { simulated: true; transaction: RTGSTransaction; account: RTGSAccount } {
    const account = this.accounts.get(bankMSP);
    if (!account) {
      throw new Error(`RTGS reserve account for ${bankMSP} not found`);
    }
    if (amount <= 0) {
      throw new Error('Payout amount must be positive');
    }

    account.fiatBalance += amount;
    account.lastUpdated = new Date().toISOString();

    const tx: RTGSTransaction = {
      txId: `RTGS-PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: 'PAYOUT',
      bankMSP,
      currency: account.currency,
      amount,
      status: 'COMPLETED',
      referenceId: referenceId || `PAY-REF-${Date.now()}`,
      timestamp: new Date().toISOString(),
      note: `Fiat cash payout released to commercial bank account ${account.accountNumber}`,
    };

    this.transactions.unshift(tx);
    eventService.broadcast('RTGS_PAYOUT', { transaction: tx, account });

    return {
      simulated: true,
      transaction: tx,
      account,
    };
  }
}

export const rtgsService = new RTGSService();
