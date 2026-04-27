import type { Server, Socket } from 'socket.io';
import type { Logger } from 'pino';
import { nanoid } from 'nanoid';
import type { ClientToServerEvents, ServerToClientEvents } from '@poker/shared';
import type { RoomManager } from './roomManager.js';
import { GameLoop } from './gameLoop.js';

type PokerSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager,
  log: Logger,
): void {
  function emitToRoom(event: string, roomId: string, payload: unknown, targetSocketId?: string) {
    if (targetSocketId) {
      io.to(targetSocketId).emit(event as keyof ServerToClientEvents, payload as never);
    } else {
      io.to(roomId).emit(event as keyof ServerToClientEvents, payload as never);
    }
  }

  io.on('connection', (socket: PokerSocket) => {
    log.info({ socketId: socket.id }, 'Socket connected');

    socket.on('room:create', async (payload, cb) => {
      try {
        const roomId = await roomManager.createRoom(payload.deviceId, payload.nickname, payload.config);
        const info = await roomManager.joinRoom(payload.deviceId, payload.nickname, roomId);
        if (!info.ok || !info.playerId) {
          cb({ ok: false, error: info.error });
          return;
        }
        roomManager.connectSocket(socket.id, roomId, info.playerId);
        await socket.join(roomId);
        const state = roomManager.getRoomState(roomId);
        if (state) socket.emit('room:state', state);
        cb({ ok: true, roomId });
      } catch (e) {
        log.error({ err: e }, 'room:create error');
        cb({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('room:join', async (payload, cb) => {
      try {
        const result = await roomManager.joinRoom(payload.deviceId, payload.nickname, payload.roomId);
        if (!result.ok || !result.playerId) {
          cb({ ok: false, error: result.error });
          socket.emit('error', { code: result.error ?? 'JOIN_FAILED', message: result.error ?? 'Failed to join room' });
          return;
        }
        roomManager.connectSocket(socket.id, payload.roomId, result.playerId);
        await socket.join(payload.roomId);

        // 向本人推送完整状态
        const state = roomManager.getRoomState(payload.roomId);
        if (state) socket.emit('room:state', state);

        // 向房间内其他人广播完整状态，确保新玩家出现在所有人的列表中（修复 P0-7）
        const freshState = roomManager.getRoomState(payload.roomId);
        if (freshState) socket.to(payload.roomId).emit('room:state', freshState);

        cb({ ok: true, playerId: result.playerId });
      } catch (e) {
        log.error({ err: e }, 'room:join error');
        cb({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('room:sit', async (payload, cb) => {
      try {
        const playerInfo = roomManager.getPlayerBySocket(socket.id);
        if (!playerInfo) {
          cb({ ok: false, error: 'NOT_IN_ROOM' });
          return;
        }

        const result = await roomManager.sitDown(payload.roomId, playerInfo.playerId, payload.seatIndex);
        if (!result.ok) {
          cb({ ok: false, error: result.error });
          return;
        }

        // 广播完整状态快照，确保所有客户端看到最新就座情况（修复 P0-6）
        const freshState = roomManager.getRoomState(payload.roomId);
        if (freshState) io.to(payload.roomId).emit('room:state', freshState);

        cb({ ok: true });
      } catch (e) {
        log.error({ err: e }, 'room:sit error');
        cb({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('room:stand', async (payload, cb) => {
      try {
        const playerInfo = roomManager.getPlayerBySocket(socket.id);
        if (!playerInfo) {
          cb({ ok: false, error: 'NOT_IN_ROOM' });
          return;
        }
        await roomManager.standUp(payload.roomId, playerInfo.playerId);
        const freshState = roomManager.getRoomState(payload.roomId);
        if (freshState) io.to(payload.roomId).emit('room:state', freshState);
        cb({ ok: true });
      } catch (e) {
        log.error({ err: e }, 'room:stand error');
        cb({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('room:leave', (payload) => {
      void socket.leave(payload.roomId);
      roomManager.disconnectSocket(socket.id);
    });

    socket.on('game:action', async (payload, cb) => {
      try {
        const playerInfo = roomManager.getPlayerBySocket(socket.id);
        if (!playerInfo || playerInfo.roomId !== payload.roomId) {
          cb({ ok: false, error: 'NOT_IN_ROOM' });
          return;
        }

        const room = roomManager.getRoom(payload.roomId);
        if (!room?.gameLoop) {
          cb({ ok: false, error: 'NO_ACTIVE_GAME' });
          return;
        }

        const release = await room.mutex.acquire();
        try {
          const result = await room.gameLoop.handleAction(
            playerInfo.playerId,
            payload.actionId,
            payload.type,
            payload.amount,
          );
          cb(result);
          if (!result.ok) {
            socket.emit('error', { code: result.error ?? 'ACTION_FAILED', message: result.error ?? 'Action failed' });
          }
        } finally {
          release();
        }
      } catch (e) {
        log.error({ err: e }, 'game:action error');
        cb({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('chat:send', (payload) => {
      const playerInfo = roomManager.getPlayerBySocket(socket.id);
      if (!playerInfo || playerInfo.roomId !== payload.roomId) return;

      const room = roomManager.getRoom(payload.roomId);
      if (!room) return;

      const player = room.players.get(playerInfo.playerId);
      if (!player) return;

      io.to(payload.roomId).emit('chat:message', {
        id: nanoid(),
        playerId: playerInfo.playerId,
        nickname: player.nickname,
        content: payload.content,
        type: payload.type,
        timestamp: Date.now(),
      });
    });

    socket.on('host:kick', async (payload, cb) => {
      try {
        const playerInfo = roomManager.getPlayerBySocket(socket.id);
        if (!playerInfo) {
          cb({ ok: false, error: 'NOT_IN_ROOM' });
          return;
        }

        const room = roomManager.getRoom(payload.roomId);
        if (!room) {
          cb({ ok: false, error: 'ROOM_NOT_FOUND' });
          return;
        }

        const hostPlayer = room.players.get(playerInfo.playerId);
        if (!hostPlayer) {
          cb({ ok: false, error: 'NOT_HOST' });
          return;
        }

        const result = await roomManager.kickPlayer(payload.roomId, hostPlayer.deviceId, payload.targetPlayerId);
        if (!result.ok) {
          cb(result);
          return;
        }

        const targetSession = [...room.players.values()].find(p => p.playerId === payload.targetPlayerId);
        if (targetSession?.socketId) {
          io.to(targetSession.socketId).emit('error', { code: 'BANNED', message: '您已被移出此房间' });
        }

        io.to(payload.roomId).emit('room:update', {
          roomId: payload.roomId,
          type: 'player_kicked',
          data: { playerId: payload.targetPlayerId },
        });

        cb({ ok: true });
      } catch (e) {
        log.error({ err: e }, 'host:kick error');
        cb({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('host:pause', async (payload, cb) => {
      try {
        const room = roomManager.getRoom(payload.roomId);
        if (!room) {
          cb({ ok: false, error: 'ROOM_NOT_FOUND' });
          return;
        }
        room.gameLoop?.pause();
        io.to(payload.roomId).emit('room:update', {
          roomId: payload.roomId,
          type: 'paused',
          data: {},
        });
        cb({ ok: true });
      } catch (e) {
        log.error({ err: e }, 'host:pause error');
        cb({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('host:resume', async (payload, cb) => {
      try {
        const room = roomManager.getRoom(payload.roomId);
        if (!room) {
          cb({ ok: false, error: 'ROOM_NOT_FOUND' });
          return;
        }
        room.gameLoop?.resume();
        io.to(payload.roomId).emit('room:update', {
          roomId: payload.roomId,
          type: 'resumed',
          data: {},
        });
        cb({ ok: true });
      } catch (e) {
        log.error({ err: e }, 'host:resume error');
        cb({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('host:start', async (payload, cb) => {
      try {
        const playerInfo = roomManager.getPlayerBySocket(socket.id);
        if (!playerInfo || playerInfo.roomId !== payload.roomId) {
          cb({ ok: false, error: 'NOT_IN_ROOM' });
          return;
        }

        const room = roomManager.getRoom(payload.roomId);
        if (!room) {
          cb({ ok: false, error: 'ROOM_NOT_FOUND' });
          return;
        }

        const hostPlayer = room.players.get(playerInfo.playerId);
        if (!hostPlayer || hostPlayer.deviceId !== room.hostDeviceId) {
          cb({ ok: false, error: 'NOT_HOST' });
          return;
        }

        const release = await room.mutex.acquire();
        try {
          if (room.phase === 'playing' || room.gameLoop) {
            cb({ ok: false, error: 'GAME_IN_PROGRESS' });
            return;
          }

          const startResult = await roomManager.startGame(payload.roomId);
          if (!startResult.ok) {
            cb({ ok: false, error: startResult.error });
            return;
          }

          const gl = new GameLoop(room, emitToRoom, log);
          room.gameLoop = gl;

          io.to(payload.roomId).emit('room:update', {
            roomId: payload.roomId,
            type: 'game_started',
            data: {},
          });

          void gl.startHand();
        } finally {
          release();
        }

        cb({ ok: true });
      } catch (e) {
        log.error({ err: e }, 'host:start error');
        cb({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('disconnect', () => {
      const info = roomManager.disconnectSocket(socket.id);
      if (info) {
        io.to(info.roomId).emit('room:update', {
          roomId: info.roomId,
          type: 'player_disconnected',
          data: { playerId: info.playerId },
        });
        log.info({ socketId: socket.id, ...info }, 'Socket disconnected');
      }
    });
  });
}
