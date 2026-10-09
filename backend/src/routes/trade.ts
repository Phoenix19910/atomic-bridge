import { Router, Request, Response } from 'express';
import { gatewayService } from '../fabric/gateway';
import { TradeSummary, TradeTerms, EscrowRecord, SettlementRecord, RefundRecord, ComplianceAttempt } from '../types';

const router = Router();

function getCallerMSP(req: Request, defaultMSP: string = 'BankA-MSP'): string {
  return (req.headers['x-org'] || req.headers['x-identity'] || req.body?.callerMSP || defaultMSP) as string;
}

// POST /api/trades/initiate - Initiate Trade with Compliance Check & SBE Installation
router.post('/trades/initiate', async (req: Request, res: Response) => {
  try {
    const { tradeId, counterpartyMSP, leg1AmountINR, leg2AmountUSD, timeoutSeconds } = req.body;
    if (!tradeId || !counterpartyMSP || !leg1AmountINR || !leg2AmountUSD || !timeoutSeconds) {
      return res.status(400).json({
        error: 'tradeId, counterpartyMSP, leg1AmountINR, leg2AmountUSD, and timeoutSeconds are required',
      });
    }

    const callerMSP = getCallerMSP(req, 'BankA-MSP');
    const result = await gatewayService.submit(
      callerMSP,
      'InitiateTrade',
      [
        tradeId,
        counterpartyMSP,
        String(leg1AmountINR),
        String(leg2AmountUSD),
        String(timeoutSeconds),
      ],
      [callerMSP]
    );

    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/trades/:tradeId/lock - Lock Trade Leg (LEG1 or LEG2)
router.post('/trades/:tradeId/lock', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const { legId } = req.body;
    if (!legId || (legId.toUpperCase() !== 'LEG1' && legId.toUpperCase() !== 'LEG2')) {
      return res.status(400).json({ error: 'legId must be LEG1 or LEG2' });
    }

    const normLeg = legId.toUpperCase() as 'LEG1' | 'LEG2';
    const defaultMSP = normLeg === 'LEG1' ? 'BankA-MSP' : 'BankC-MSP';
    const callerMSP = getCallerMSP(req, defaultMSP);

    const result = await gatewayService.submit(
      callerMSP,
      'LockTradeLeg',
      [tradeId, normLeg],
      [callerMSP]
    );

    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/trades/:tradeId/settle - Execute 4-Party Mutual SBE PvP Swap
router.post('/trades/:tradeId/settle', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const callerMSP = getCallerMSP(req, 'BankA-MSP');

    // Mandatory 4-Party Mutual Endorsement Policy
    const endorsingOrgs = ['BankA-MSP', 'BankC-MSP', 'RBI-MSP', 'MAS-MSP'];

    const result = await gatewayService.submit(
      callerMSP,
      'ExecutePvPSwap',
      [tradeId],
      endorsingOrgs
    );

    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/trades/:tradeId/refund - Unilateral or Watcher Timeout Refund
router.post('/trades/:tradeId/refund', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const callerMSP = getCallerMSP(req, 'BankA-MSP');

    const result = await gatewayService.submit(
      callerMSP,
      'CancelOrRefundTrade',
      [tradeId],
      [callerMSP]
    );

    return res.json({ success: true, refund: result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/trades/:tradeId/status - Get Derived Trade Status
router.get('/trades/:tradeId/status', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const callerMSP = getCallerMSP(req, 'BankA-MSP');
    const status = await gatewayService.evaluate(callerMSP, 'GetTradeStatus', [tradeId]);
    return res.json(status);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// GET /api/trades/:tradeId - Get Full Trade Summary
router.get('/trades/:tradeId', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const callerMSP = getCallerMSP(req, 'BankA-MSP');

    let terms: TradeTerms | undefined;
    let escrowLeg1: EscrowRecord | undefined;
    let escrowLeg2: EscrowRecord | undefined;
    let settlement: SettlementRecord | undefined;
    let refund: RefundRecord | undefined;
    let compliance: ComplianceAttempt | undefined;

    try {
      terms = await gatewayService.evaluate(callerMSP, 'GetTradeTerms', [tradeId]);
    } catch {
      // may have failed compliance
    }

    try {
      escrowLeg1 = await gatewayService.evaluate(callerMSP, 'GetEscrow', [tradeId, 'leg1']);
    } catch {
      // not locked yet
    }

    try {
      escrowLeg2 = await gatewayService.evaluate(callerMSP, 'GetEscrow', [tradeId, 'leg2']);
    } catch {
      // not locked yet
    }

    try {
      settlement = await gatewayService.evaluate(callerMSP, 'GetSettlement', [tradeId]);
    } catch {
      // pending
    }

    try {
      refund = await gatewayService.evaluate(callerMSP, 'GetRefund', [tradeId]);
    } catch {
      // no refund
    }

    try {
      compliance = await gatewayService.evaluate(callerMSP, 'GetComplianceRecord', [tradeId]);
    } catch {
      // passed or not initiated
    }

    // Derived Status
    let derivedStatus = 'VALIDATED';
    try {
      const st = await gatewayService.evaluate(callerMSP, 'GetTradeStatus', [tradeId]);
      derivedStatus = st?.status || 'VALIDATED';
    } catch {
      if (compliance && compliance.result === 'REFUSED') {
        derivedStatus = 'REFUSED';
      }
    }

    const summary: TradeSummary = {
      tradeId,
      derivedStatus: derivedStatus as any,
      terms,
      escrowLeg1,
      escrowLeg2,
      settlement,
      refund,
      compliance,
    };

    return res.json(summary);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// GET /api/trades - List All Trades
router.get('/trades', async (req: Request, res: Response) => {
  try {
    const callerMSP = getCallerMSP(req, 'BankA-MSP');
    const trades = await gatewayService.evaluate(callerMSP, 'GetAllTrades', []);
    return res.json({ trades: Array.isArray(trades) ? trades : [] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
