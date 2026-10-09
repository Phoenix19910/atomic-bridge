import { Router, Request, Response } from 'express';
import { gatewayService } from '../fabric/gateway';
import { TradeTerms } from '../types';

const router = Router();

function getCallerMSP(req: Request): string {
  return (req.headers['x-org'] || req.headers['x-identity'] || 'Auditor-MSP') as string;
}

// GET /api/audit/compliance/:tradeId - Read compliance refusal or evaluation record
router.get('/audit/compliance/:tradeId', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const callerMSP = getCallerMSP(req);
    const result = await gatewayService.evaluate(callerMSP, 'GetComplianceRecord', [tradeId]);
    return res.json(result);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// GET /api/audit/settlement/:tradeId - Read 4-party mutual settlement record
router.get('/audit/settlement/:tradeId', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const callerMSP = getCallerMSP(req);
    const result = await gatewayService.evaluate(callerMSP, 'GetSettlement', [tradeId]);
    return res.json(result);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// GET /api/audit/refund/:tradeId - Read Approach B refund record
router.get('/audit/refund/:tradeId', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const callerMSP = getCallerMSP(req);
    const result = await gatewayService.evaluate(callerMSP, 'GetRefund', [tradeId]);
    return res.json(result);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// GET /api/audit/trades - Consolidated audit ledger history for regulators & auditor
router.get('/audit/trades', async (req: Request, res: Response) => {
  try {
    const callerMSP = getCallerMSP(req);
    const trades: TradeTerms[] = await gatewayService.evaluate(callerMSP, 'GetAllTrades', []);

    if (!Array.isArray(trades)) {
      return res.json({ auditRecords: [] });
    }

    const auditRecords = await Promise.all(
      trades.map(async (trade) => {
        let settlement: any = null;
        let refund: any = null;
        let compliance: any = null;
        let status: any = 'VALIDATED';

        try {
          settlement = await gatewayService.evaluate(callerMSP, 'GetSettlement', [trade.tradeId]);
        } catch {}

        try {
          refund = await gatewayService.evaluate(callerMSP, 'GetRefund', [trade.tradeId]);
        } catch {}

        try {
          compliance = await gatewayService.evaluate(callerMSP, 'GetComplianceRecord', [trade.tradeId]);
        } catch {}

        try {
          const st = await gatewayService.evaluate(callerMSP, 'GetTradeStatus', [trade.tradeId]);
          status = st?.status || 'VALIDATED';
        } catch {}

        return {
          tradeId: trade.tradeId,
          status,
          terms: trade,
          settlement,
          refund,
          compliance,
        };
      })
    );

    return res.json({ auditRecords });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
