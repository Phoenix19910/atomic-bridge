import { Router, Request, Response } from 'express';
import { eventService } from '../services/events';

const router = Router();

// GET /api/events/stream - Server-Sent Events stream for connected browser clients
router.get('/events/stream', (req: Request, res: Response) => {
  eventService.registerClient(res);
});

export default router;
