import { useState } from 'react';
import type { PlayerPublicState } from '@poker/shared';
import { getSocket } from '../socket.ts';

interface HostPanelProps {
  roomId: string;
  players: PlayerPublicState[];
  myPlayerId: string;
  isPaused: boolean;
  isInLobby?: boolean;
  seatedCount?: number;
}

export default function HostPanel({
  roomId,
  players,
  myPlayerId,
  isPaused,
  isInLobby = false,
  seatedCount = 0,
}: HostPanelProps) {
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const socket = getSocket();

  function togglePause() {
    if (isPaused) {
      socket.emit('host:resume', { roomId }, () => {});
    } else {
      socket.emit('host:pause', { roomId }, () => {});
    }
  }

  function kick(targetPlayerId: string) {
    socket.emit('host:kick', { roomId, targetPlayerId }, (res) => {
      if (!res.ok) alert(res.error);
      setKickTarget(null);
    });
  }

  function startGame() {
    if (starting) return;
    setStarting(true);
    socket.emit('host:start', { roomId }, (res) => {
      setStarting(false);
      if (!res.ok) alert(res.error ?? '开始失败，请重试');
    });
  }

  const otherPlayers = players.filter(p => p.playerId !== myPlayerId);
  const canStart = seatedCount >= 2;

  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-yellow-400">房主控制</span>

        {isInLobby ? (
          <button
            onClick={startGame}
            disabled={!canStart || starting}
            className={`text-xs px-3 py-1 rounded-lg transition-colors font-semibold ${
              canStart && !starting
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
            title={!canStart ? '至少需要 2 名玩家就座才能开始' : ''}
          >
            {starting ? '开始中…' : canStart ? '▶ 开始游戏' : `等待就座 (${seatedCount}/2)`}
          </button>
        ) : (
          <button
            onClick={togglePause}
            className={`text-xs px-3 py-1 rounded-lg transition-colors ${
              isPaused ? 'bg-green-700 hover:bg-green-600' : 'bg-yellow-700 hover:bg-yellow-600'
            } text-white`}
          >
            {isPaused ? '▶ 恢复' : '⏸ 暂停'}
          </button>
        )}
      </div>

      {otherPlayers.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 mb-1">踢出玩家</div>
          <div className="space-y-1">
            {otherPlayers.map(p => (
              <div key={p.playerId} className="flex items-center justify-between">
                <span className="text-xs text-slate-300 truncate max-w-[120px]">{p.nickname}</span>
                {kickTarget === p.playerId ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => kick(p.playerId)}
                      className="text-xs px-2 py-0.5 bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
                    >
                      确认
                    </button>
                    <button
                      onClick={() => setKickTarget(null)}
                      className="text-xs px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setKickTarget(p.playerId)}
                    className="text-xs px-2 py-0.5 bg-slate-700 hover:bg-red-900 text-slate-300 rounded transition-colors"
                  >
                    踢出
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
