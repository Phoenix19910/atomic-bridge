import { Router, Request, Response } from 'express';
import { expiryWatcher } from '../services/watcher';

const router = Router();

// GET /api/watcher/status - Check background watcher status
router.get('/watcher/status', (_req: Request, res: Response) => {
  return res.json(expiryWatcher.getStatus());
});

// POST /api/watcher/trigger - Manually trigger an immediate scan for expired trades
router.post('/watcher/trigger', async (_req: Request, res: Response) => {
  try {
    const result = await expiryWatcher.scanAndRefundTrades();
    return res.json({
      success: true,
      message: 'Watcher scan completed',
      result,
      status: expiryWatcher.getStatus(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
