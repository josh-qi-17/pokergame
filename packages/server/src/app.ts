import Fastify from 'fastify';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@poker/shared';
import { registerSocketHandlers } from './socket.js';
import { RoomManager } from './roomManager.js';

export async function buildApp() {
  const isDev = process.env['NODE_ENV'] !== 'production';
  const app = Fastify({
    logger: isDev
      ? { transport: { target: 'pino-pretty' } }
      : true,
  });

  await app.register(import('@fastify/cors'), {
    origin: process.env['CORS_ORIGIN'] ?? true,
  });

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/history', async (req) => {
    const { getHandHistories } = await import('./persistence.js');
    const rows = await getHandHistories(req.params.roomId);
    return rows.map(r => ({ handNumber: r.handNumber, ...JSON.parse(r.data) }));
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    cors: {
      origin: process.env['CORS_ORIGIN'] ?? '*',
    },
    pingTimeout: 25000,
    pingInterval: 20000,
  });

  const logger = app.log as unknown as import('pino').Logger;
  const roomManager = new RoomManager(logger);
  await roomManager.init();

  registerSocketHandlers(io, roomManager, logger);

  return app;
}
