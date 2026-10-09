import { Router, Request, Response } from 'express';
import { rtgsService } from '../services/rtgs';
import { gatewayService } from '../fabric/gateway';

const router = Router();

// GET /api/rtgs/accounts - List all simulated RTGS central bank reserve accounts
router.get('/rtgs/accounts', (_req: Request, res: Response) => {
  return res.json(rtgsService.getAccounts());
});

// GET /api/rtgs/transactions - List simulated RTGS transaction history
router.get('/rtgs/transactions', (_req: Request, res: Response) => {
  return res.json(rtgsService.getTransactions());
});

// POST /api/rtgs/deposit - Deposit cash into commercial bank's reserve account
router.post('/rtgs/deposit', (req: Request, res: Response) => {
  try {
    const { bankMSP, amount, referenceId } = req.body;
    if (!bankMSP || !amount) {
      return res.status(400).json({ error: 'bankMSP and amount are required' });
    }

    const result = rtgsService.depositCash(bankMSP, Number(amount), referenceId);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/rtgs/confirm-mint - Confirm RTGS fiat lock and mint on-chain central bank tokens
router.post('/rtgs/confirm-mint', async (req: Request, res: Response) => {
  try {
    const { bankMSP, currency, amount } = req.body;
    if (!bankMSP || !currency || !amount) {
      return res.status(400).json({ error: 'bankMSP, currency, and amount are required' });
    }

    const numAmount = Number(amount);
    const normCurrency = currency.toUpperCase().trim();

    // 1. Hold / pledge fiat in simulated RTGS reserve
    const holdResult = rtgsService.holdFiatForMint(bankMSP, numAmount);

    // 2. Mint tokens on Hyperledger Fabric ledger via sovereign regulator identity
    const regulatorMSP = normCurrency === 'INR' ? 'RBI-MSP' : 'MAS-MSP';
    let mintResult: any;

    try {
      mintResult = await gatewayService.submit(
        regulatorMSP,
        'MintTokens',
        [bankMSP, normCurrency, String(numAmount)],
        [regulatorMSP]
      );
    } catch (mintErr: any) {
      // Revert RTGS hold if on-chain minting fails
      rtgsService.depositCash(bankMSP, numAmount, `REVERT-${holdResult.holdTxId}`);
      throw new Error(`On-chain mint failed: ${mintErr.message}. RTGS fiat hold was reversed.`);
    }

    return res.json({
      simulated: true,
      success: true,
      message: `Successfully pledged ${numAmount} ${normCurrency} in RTGS and minted on-chain reserve tokens.`,
      rtgsHold: holdResult,
      ledgerMint: mintResult,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/rtgs/payout - Burn tokens on-chain and release RTGS fiat cash to bank
router.post('/rtgs/payout', async (req: Request, res: Response) => {
  try {
    const { bankMSP, currency, amount, referenceId } = req.body;
    if (!bankMSP || !currency || !amount) {
      return res.status(400).json({ error: 'bankMSP, currency, and amount are required' });
    }

    const numAmount = Number(amount);
    const normCurrency = currency.toUpperCase().trim();

    // 1. Burn tokens on-chain from the requesting bank's balance
    let burnResult: any;
    try {
      burnResult = await gatewayService.submit(
        bankMSP,
        'BurnTokens',
        [normCurrency, String(numAmount)],
        [bankMSP]
      );
    } catch (burnErr: any) {
      throw new Error(`On-chain token burn failed: ${burnErr.message}. RTGS payout aborted.`);
    }

    // 2. Release fiat payout to commercial bank's RTGS cash account
    const payoutResult = rtgsService.payoutCash(bankMSP, numAmount, referenceId);

    return res.json({
      simulated: true,
      success: true,
      message: `Successfully burned ${numAmount} ${normCurrency} on-chain and released RTGS fiat payout.`,
      ledgerBurn: burnResult,
      rtgsPayout: payoutResult,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
