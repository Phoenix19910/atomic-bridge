import { config } from '../config';
import { gatewayService } from '../fabric/gateway';
import { eventService } from './events';
import { TradeTerms, RefundRecord, SettlementRecord } from '../types';

class ExpiryWatcherService {
  private timer: NodeJS.Timeout | null = null;
  private isScanning: boolean = false;
  private lastScanAt: string | null = null;
  private totalScans: number = 0;
  private totalRefundsTriggered: number = 0;
  private lastRefundedTradeId: string | null = null;

  public start(): void {
    if (this.timer) return;
    console.log(`[ExpiryWatcher] Service starting (interval: ${config.watcherIntervalMs}ms, identity: ${config.watcherMSP})...`);
    this.timer = setInterval(() => {
      this.scanAndRefundTrades().catch((err) => {
        console.error('[ExpiryWatcher] Background scan error:', err.message);
      });
    }, config.watcherIntervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[ExpiryWatcher] Service stopped.');
    }
  }

  public getStatus(): {
    running: boolean;
    intervalMs: number;
    authorizedMSP: string;
    totalScans: number;
    totalRefundsTriggered: number;
    lastScanAt: string | null;
    lastRefundedTradeId: string | null;
  } {
    return {
      running: this.timer !== null,
      intervalMs: config.watcherIntervalMs,
      authorizedMSP: config.watcherMSP,
      totalScans: this.totalScans,
      totalRefundsTriggered: this.totalRefundsTriggered,
      lastScanAt: this.lastScanAt,
      lastRefundedTradeId: this.lastRefundedTradeId,
    };
  }

  /**
   * Safe, idempotent scan over all trades
   */
  public async scanAndRefundTrades(): Promise<{ scanned: number; refunded: string[] }> {
    if (this.isScanning) {
      return { scanned: 0, refunded: [] };
    }

    this.isScanning = true;
    this.lastScanAt = new Date().toISOString();
    this.totalScans++;

    const refundedTradeIds: string[] = [];

    try {
      // 1. Fetch all trades from ledger
      const trades: TradeTerms[] = await gatewayService.evaluate(
        config.watcherMSP,
        'GetAllTrades',
        []
      );

      if (!Array.isArray(trades)) {
        return { scanned: 0, refunded: [] };
      }

      const now = Date.now();

      for (const trade of trades) {
        if (!trade.tradeId || !trade.expiresAt) continue;

        const expiryTime = new Date(trade.expiresAt).getTime();
        // Check if cut-off has passed
        if (now < expiryTime) {
          continue; // Trade has not yet expired
        }

        // Check if already settled
        try {
          const settlement: SettlementRecord = await gatewayService.evaluate(
            config.watcherMSP,
            'GetSettlement',
            [trade.tradeId]
          );
          if (settlement && settlement.status === 'SETTLED') {
            continue; // Settlement invariant: settled trades are never refunded
          }
        } catch {
          // Settlement record missing or pending; proceed
        }

        // Check existing refund record for terminal state
        try {
          const existingRefund: RefundRecord = await gatewayService.evaluate(
            config.watcherMSP,
            'GetRefund',
            [trade.tradeId]
          );
          if (existingRefund) {
            const terminalOutcomes = [
              'TIMED_OUT_NO_FUNDS',
              'TIMED_OUT_BOTH_REFUNDED',
              'TIMED_OUT_LEG1_REFUNDED',
              'TIMED_OUT_LEG2_REFUNDED',
            ];
            if (terminalOutcomes.includes(existingRefund.outcome)) {
              continue; // Already terminally refunded; prevent duplicate refund
            }
          }
        } catch {
          // No refund record yet; safe to trigger
        }

        // Execute idempotent refund under authorized regulator identity
        try {
          console.log(`[ExpiryWatcher] Cut-off reached for trade ${trade.tradeId} (expiresAt: ${trade.expiresAt}). Triggering CancelOrRefundTrade...`);
          const result = await gatewayService.submit(
            config.watcherMSP,
            'CancelOrRefundTrade',
            [trade.tradeId],
            [config.watcherMSP]
          );

          refundedTradeIds.push(trade.tradeId);
          this.totalRefundsTriggered++;
          this.lastRefundedTradeId = trade.tradeId;

          eventService.broadcast('WATCHER_REFUND_TRIGGERED', {
            tradeId: trade.tradeId,
            authorizedMSP: config.watcherMSP,
            result,
            timestamp: new Date().toISOString(),
          });
        } catch (refundErr: any) {
          console.warn(`[ExpiryWatcher] CancelOrRefundTrade for ${trade.tradeId} returned: ${refundErr.message}`);
        }
      }

      return { scanned: trades.length, refunded: refundedTradeIds };
    } finally {
      this.isScanning = false;
    }
  }
}

export const expiryWatcher = new ExpiryWatcherService();
