import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import { gatewayService } from './fabric/gateway';
import { expiryWatcher } from './services/watcher';
import adminRouter from './routes/admin';
import tradeRouter from './routes/trade';
import rtgsRouter from './routes/rtgs';
import auditRouter from './routes/audit';
import eventsRouter from './routes/events';
import watcherRouter from './routes/watcher';

const app = express();

// Security: Enable CORS and standard body parsing
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health & System Status Endpoint
app.get('/api/health', async (_req: Request, res: Response) => {
  const connectivity = await gatewayService.checkConnectivity();
  const watcherStatus = expiryWatcher.getStatus();

  return res.json({
    status: 'ONLINE',
    service: 'AtomicBridge Cross-Border Corridor API Gateway',
    timestamp: new Date().toISOString(),
    network: connectivity,
    watcher: watcherStatus,
    endpoints: {
      restApi: `http://${config.host}:${config.port}/api`,
      eventsStream: `http://${config.host}:${config.port}/api/events/stream`,
    },
  });
});

app.get(['/', '/api'], (_req: Request, res: Response) => { return res.json({ message: 'AtomicBridge API Gateway', statusUrl: '/api/health', endpoints: ['/api/health', '/api/trades', '/api/balances', '/api/watcher/status', '/api/events/stream'] }); });

// API Routes
app.use('/api', adminRouter);
app.use('/api', tradeRouter);
app.use('/api', rtgsRouter);
app.use('/api', auditRouter);
app.use('/api', eventsRouter);
app.use('/api', watcherRouter);

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ServerError]', err);
  return res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Server Bootstrap
const server = app.listen(config.port, config.host, () => {
  console.log('================================================================');
  console.log('           AtomicBridge Backend API Gateway                     ');
  console.log('================================================================');
  console.log(`  Local Address:     http://${config.host}:${config.port}`);
  console.log(`  Channel Name:      ${config.channelName}`);
  console.log(`  Chaincode Name:    ${config.chaincodeName}`);
  console.log(`  Watcher Identity:  ${config.watcherMSP}`);
  console.log(`  SSE Event Stream:  http://${config.host}:${config.port}/api/events/stream`);
  console.log('================================================================');

  // Start automated background expiry watcher
  expiryWatcher.start();
});

// Graceful Shutdown Handler
const shutdown = async () => {
  console.log('\n[Server] Shutting down gracefully...');
  expiryWatcher.stop();
  await gatewayService.closeAll();
  server.close(() => {
    console.log('[Server] HTTP listener closed.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default app;
