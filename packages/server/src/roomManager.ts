import { Mutex } from 'async-mutex';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type { RoomConfig, RoomState, PlayerPublicState } from '@poker/shared';
import { banDevice, isDeviceBanned, loadAllRooms, markRoomEnded, saveRoom } from './persistence.js';
import { GameLoop } from './gameLoop.js';

export interface PlayerSession {
  playerId: string;
  deviceId: string;
  nickname: string;
  socketId: string | null;
  seatIndex: number;
  chips: number;
  rebuyCount: number;
  disconnectedAt: number | null;
  isConnected: boolean;
  consecutiveTimeouts: number;
}

export interface RoomData {
  roomId: string;
  hostDeviceId: string;
  config: RoomConfig;
  players: Map<string, PlayerSession>;
  phase: 'lobby' | 'playing' | 'ended';
  gameLoop: GameLoop | null;
  mutex: Mutex;
  handNumber: number;
}

const RECONNECT_WINDOW_MS = 5 * 60 * 1000;

export class RoomManager {
  private rooms = new Map<string, RoomData>();
  private socketToPlayer = new Map<string, { roomId: string; playerId: string }>();
  private log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  async init(): Promise<void> {
    const saved = await loadAllRooms();
    for (const row of saved) {
      try {
        const config = JSON.parse(row.config) as RoomConfig;
        const state = JSON.parse(row.state) as { players?: PlayerSession[]; phase?: string; handNumber?: number };
        const room: RoomData = {
          roomId: row.id,
          hostDeviceId: row.hostDeviceId,
          config,
          players: new Map(),
          phase: (state.phase as 'lobby' | 'playing' | 'ended') ?? 'lobby',
          gameLoop: null,
          mutex: new Mutex(),
          handNumber: state.handNumber ?? 0,
        };
        for (const p of state.players ?? []) {
          room.players.set(p.playerId, { ...p, socketId: null, isConnected: false });
        }
        this.rooms.set(row.id, room);
        this.log.info({ roomId: row.id }, 'Restored room from DB');
      } catch (e) {
        this.log.error({ roomId: row.id, err: e }, 'Failed to restore room');
      }
    }
  }

  async createRoom(deviceId: string, nickname: string, config: RoomConfig): Promise<string> {
    const roomId = nanoid(10);
    const playerId = nanoid(12);
    const player: PlayerSession = {
      playerId,
      deviceId,
      nickname,
      socketId: null,
      seatIndex: -1,
      chips: 0,
      rebuyCount: 0,
      disconnectedAt: null,
      isConnected: false,
      consecutiveTimeouts: 0,
    };

    const room: RoomData = {
      roomId,
      hostDeviceId: deviceId,
      config,
      players: new Map([[playerId, player]]),
      phase: 'lobby',
      gameLoop: null,
      mutex: new Mutex(),
      handNumber: 0,
    };

    this.rooms.set(roomId, room);
    await this.persistRoom(room);
    this.log.info({ roomId, deviceId }, 'Room created');
    return roomId;
  }

  async joinRoom(deviceId: string, nickname: string, roomId: string): Promise<{ ok: boolean; error?: string; playerId?: string }> {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };

    if (await isDeviceBanned(roomId, deviceId)) {
      return { ok: false, error: 'BANNED' };
    }

    // 同一设备 + 相同昵称 → 断线重连，返回原有玩家
    // 同一设备 + 不同昵称 → 视为新玩家，允许多人共用同一设备
    const existing = [...room.players.values()].find(
      p => p.deviceId === deviceId && p.nickname === nickname,
    );
    if (existing) {
      existing.nickname = nickname; // 同步更新昵称（兼容 P2-2）
      return { ok: true, playerId: existing.playerId };
    }

    if (room.phase !== 'lobby') {
      return { ok: false, error: 'GAME_IN_PROGRESS' };
    }

    // 清理同一设备的已断线旧玩家（不同昵称），释放其占用的席位
    const stalePlayer = [...room.players.values()].find(
      p => p.deviceId === deviceId && !p.isConnected,
    );
    if (stalePlayer) {
      room.players.delete(stalePlayer.playerId);
      this.log.info(
        { roomId, oldPlayerId: stalePlayer.playerId, oldNickname: stalePlayer.nickname },
        'Removed stale player from same device',
      );
    }

    const playerId = nanoid(12);
    const player: PlayerSession = {
      playerId,
      deviceId,
      nickname,
      socketId: null,
      seatIndex: -1,
      chips: 0,
      rebuyCount: 0,
      disconnectedAt: null,
      isConnected: false,
      consecutiveTimeouts: 0,
    };

    room.players.set(playerId, player);
    await this.persistRoom(room);
    this.log.info({ roomId, deviceId, playerId }, 'Player joined room');
    return { ok: true, playerId };
  }

  async sitDown(roomId: string, playerId: string, seatIndex: number): Promise<{ ok: boolean; error?: string }> {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };

    const release = await room.mutex.acquire();
    try {
      const seatedCount = [...room.players.values()].filter(p => p.seatIndex >= 0).length;
      if (seatedCount >= room.config.seatsMax) return { ok: false, error: 'ROOM_FULL' };

      const seatTaken = [...room.players.values()].some(p => p.seatIndex === seatIndex);
      if (seatTaken) return { ok: false, error: 'SEAT_TAKEN' };

      const player = room.players.get(playerId);
      if (!player) return { ok: false, error: 'ROOM_NOT_FOUND' };

      player.seatIndex = seatIndex;
      player.chips = room.config.initialChips;
      await this.persistRoom(room);
      return { ok: true };
    } finally {
      release();
    }
  }

  async standUp(roomId: string, playerId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(playerId);
    if (player) {
      player.seatIndex = -1;
      await this.persistRoom(room);
    }
  }

  connectSocket(socketId: string, roomId: string, playerId: string): void {
    this.socketToPlayer.set(socketId, { roomId, playerId });
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(playerId);
    if (player) {
      player.socketId = socketId;
      player.isConnected = true;
      player.disconnectedAt = null;
    }
  }

  disconnectSocket(socketId: string): { roomId: string; playerId: string } | null {
    const info = this.socketToPlayer.get(socketId);
    if (!info) return null;

    this.socketToPlayer.delete(socketId);
    const room = this.rooms.get(info.roomId);
    if (!room) return null;

    const player = room.players.get(info.playerId);
    if (player) {
      player.isConnected = false;
      player.disconnectedAt = Date.now();

      // Schedule seat release after reconnect window
      setTimeout(() => {
        const p = room.players.get(info.playerId);
        if (p && !p.isConnected && p.disconnectedAt) {
          const elapsed = Date.now() - p.disconnectedAt;
          if (elapsed >= RECONNECT_WINDOW_MS) {
            p.seatIndex = -1;
            this.log.info({ roomId: info.roomId, playerId: info.playerId }, 'Seat released after timeout');
          }
        }
      }, RECONNECT_WINDOW_MS + 1000);
    }

    return info;
  }

  async kickPlayer(roomId: string, hostDeviceId: string, targetPlayerId: string): Promise<{ ok: boolean; error?: string }> {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
    if (room.hostDeviceId !== hostDeviceId) return { ok: false, error: 'NOT_HOST' };

    const target = room.players.get(targetPlayerId);
    if (!target) return { ok: false, error: 'ROOM_NOT_FOUND' };

    await banDevice(roomId, target.deviceId);
    room.players.delete(targetPlayerId);
    await this.persistRoom(room);
    this.log.info({ roomId, targetPlayerId }, 'Player kicked');
    return { ok: true };
  }

  getRoom(roomId: string): RoomData | undefined {
    return this.rooms.get(roomId);
  }

  getPlayerBySocket(socketId: string): { roomId: string; playerId: string } | undefined {
    return this.socketToPlayer.get(socketId);
  }

  getRoomState(roomId: string): RoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // 大厅阶段包含所有已加入玩家（含未就座），游戏中只包含就座玩家（修复 P0-7）
    const allPlayers = [...room.players.values()];
    const filtered = room.phase === 'lobby'
      ? allPlayers
      : allPlayers.filter(p => p.seatIndex >= 0);

    const players: PlayerPublicState[] = filtered.map(p => ({
      playerId: p.playerId,
      deviceId: p.deviceId,
      nickname: p.nickname,
      seatIndex: p.seatIndex,
      chips: p.chips,
      currentBet: 0,
      status: 'waiting' as const,
      isHost: p.deviceId === room.hostDeviceId,
      rebuyCount: p.rebuyCount,
      isConnected: p.isConnected,
      hasCards: false,
    }));

    return {
      roomId,
      config: room.config,
      players,
      game: null,
      phase: room.phase,
      handHistory: [],
    };
  }

  async startGame(roomId: string): Promise<{ ok: boolean; error?: string }> {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
    if (room.phase === 'playing') return { ok: false, error: 'GAME_IN_PROGRESS' };

    const seated = [...room.players.values()].filter(p => p.seatIndex >= 0 && p.chips > 0);
    if (seated.length < 2) return { ok: false, error: 'NOT_ENOUGH_PLAYERS' };

    room.phase = 'playing';
    await this.persistRoom(room);
    return { ok: true };
  }

  private async persistRoom(room: RoomData): Promise<void> {
    try {
      const state = {
        phase: room.phase,
        handNumber: room.handNumber,
        players: [...room.players.values()],
      };
      await saveRoom(room.roomId, room.hostDeviceId, room.config, state);
    } catch (e) {
      this.log.error({ err: e, roomId: room.roomId }, 'Failed to persist room');
    }
  }

  async endRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.phase = 'ended';
    await markRoomEnded(roomId);
    this.rooms.delete(roomId);
  }
}
