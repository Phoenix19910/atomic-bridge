import { Response } from 'express';
import { SSEEvent } from '../types';

class EventService {
  private clients: Set<Response> = new Set();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  public registerClient(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders?.();

    this.clients.add(res);

    // Initial connection welcome event
    const welcomeEvent: SSEEvent = {
      type: 'CONNECTED',
      payload: { message: 'Connected to AtomicBridge Real-Time Event Stream' },
      timestamp: new Date().toISOString(),
    };
    res.write(`event: ${welcomeEvent.type}\ndata: ${JSON.stringify(welcomeEvent.payload)}\n\n`);

    res.on('close', () => {
      this.clients.delete(res);
      res.end();
    });
  }

  public broadcast(type: string, payload: any): void {
    const event: SSEEvent = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    const message = `event: ${event.type}\ndata: ${JSON.stringify({ ...payload, timestamp: event.timestamp })}\n\n`;

    for (const client of this.clients) {
      try {
        client.write(message);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        try {
          client.write(': heartbeat\n\n');
        } catch {
          this.clients.delete(client);
        }
      }
    }, 15000);
  }

  public stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export const eventService = new EventService();
