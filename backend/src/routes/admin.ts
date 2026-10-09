import { Router, Request, Response } from 'express';
import { gatewayService } from '../fabric/gateway';

const router = Router();

function getCallerMSP(req: Request, defaultMSP: string = 'RBI-MSP'): string {
  return (req.headers['x-org'] || req.headers['x-identity'] || req.body?.callerMSP || defaultMSP) as string;
}

// POST /api/rules - Set Jurisdiction Rule
router.post('/rules', async (req: Request, res: Response) => {
  try {
    const { jurisdiction, maxTransactionLimit, dailyLimit, baseRate, rateTolerancePercent, cutOffHourUTC } = req.body;
    if (!jurisdiction || maxTransactionLimit === undefined || dailyLimit === undefined || baseRate === undefined) {
      return res.status(400).json({ error: 'Missing required jurisdiction rule fields' });
    }

    const normJurisdiction = jurisdiction.toUpperCase().trim();
    const defaultRegulator = normJurisdiction === 'INDIA' || normJurisdiction === 'INR' ? 'RBI-MSP' : 'MAS-MSP';
    const callerMSP = getCallerMSP(req, defaultRegulator);

    const result = await gatewayService.submit(
      callerMSP,
      'SetJurisdictionRule',
      [
        normJurisdiction,
        String(maxTransactionLimit),
        String(dailyLimit),
        String(baseRate),
        String(rateTolerancePercent ?? 10.0),
        String(cutOffHourUTC ?? 18),
      ],
      [callerMSP]
    );

    return res.json({ success: true, rule: result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/rules/:jurisdiction - Get Jurisdiction Rule
router.get('/rules/:jurisdiction', async (req: Request, res: Response) => {
  try {
    const { jurisdiction } = req.params;
    const callerMSP = getCallerMSP(req, 'RBI-MSP');
    const rule = await gatewayService.evaluate(callerMSP, 'GetJurisdictionRule', [jurisdiction]);
    return res.json(rule);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// POST /api/tokens/mint - Mint Tokens (Central Bank Regulator only)
router.post('/tokens/mint', async (req: Request, res: Response) => {
  try {
    const { targetMSP, currency, amount } = req.body;
    if (!targetMSP || !currency || !amount) {
      return res.status(400).json({ error: 'targetMSP, currency, and amount are required' });
    }

    const normCurrency = currency.toUpperCase().trim();
    const regulatorMSP = normCurrency === 'INR' ? 'RBI-MSP' : 'MAS-MSP';
    const callerMSP = getCallerMSP(req, regulatorMSP);

    const result = await gatewayService.submit(
      callerMSP,
      'MintTokens',
      [targetMSP, normCurrency, String(amount)],
      [callerMSP]
    );

    return res.json({ success: true, balance: result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/tokens/burn - Burn Tokens (Owner Bank)
router.post('/tokens/burn', async (req: Request, res: Response) => {
  try {
    const { currency, amount } = req.body;
    if (!currency || !amount) {
      return res.status(400).json({ error: 'currency and amount are required' });
    }

    const callerMSP = getCallerMSP(req, 'BankA-MSP');
    const result = await gatewayService.submit(
      callerMSP,
      'BurnTokens',
      [currency.toUpperCase().trim(), String(amount)],
      [callerMSP]
    );

    return res.json({ success: true, balance: result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/balances/:ownerMSP/:currency - Get Bank Balance
router.get('/balances/:ownerMSP/:currency', async (req: Request, res: Response) => {
  try {
    const { ownerMSP, currency } = req.params;
    const callerMSP = getCallerMSP(req, ownerMSP);
    const balance = await gatewayService.evaluate(callerMSP, 'GetBalance', [ownerMSP, currency]);
    return res.json(balance);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/balances - Get balances for all corridor participants
router.get('/balances', async (req: Request, res: Response) => {
  try {
    const orgs = [
      { msp: 'BankA-MSP', currency: 'INR' },
      { msp: 'BankA-MSP', currency: 'USD' },
      { msp: 'BankC-MSP', currency: 'USD' },
      { msp: 'BankC-MSP', currency: 'INR' },
      { msp: 'BankB-MSP', currency: 'INR' },
      { msp: 'BankD-MSP', currency: 'USD' },
    ];

    const balances = await Promise.all(
      orgs.map(async (item) => {
        try {
          const bal = await gatewayService.evaluate(item.msp, 'GetBalance', [item.msp, item.currency]);
          return bal;
        } catch {
          return {
            docType: 'balance_record',
            ownerMSP: item.msp,
            currency: item.currency,
            balance: 0,
            updatedAt: '',
          };
        }
      })
    );

    return res.json({ balances });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
