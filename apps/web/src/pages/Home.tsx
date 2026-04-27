import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { getSocket } from '../socket.ts';
import { useIdentityStore } from '../store/useIdentityStore.ts';
import { useSocketStore } from '../store/useSocketStore.ts';
import type { RoomConfig } from '@poker/shared';

export default function Home() {
  const navigate = useNavigate();
  const { nickname, setNickname, deviceId } = useIdentityStore();
  const { connect, status } = useSocketStore();
  const [nameInput, setNameInput] = useState(nickname);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<RoomConfig>({
    seatsMax: 6,
    smallBlind: 10,
    bigBlind: 20,
    initialChips: 1000,
    maxRebuy: 2,
    timeoutSec: 30,
  });

  useEffect(() => {
    connect();
  }, []);

  async function createRoom() {
    const name = nameInput.trim();
    if (!name) {
      setError('请输入昵称');
      return;
    }
    setNickname(name);
    setCreating(true);
    setError('');

    const socket = getSocket();
    socket.emit('room:create', { deviceId, nickname: name, config }, res => {
      setCreating(false);
      if (res.ok && res.roomId) {
        navigate(`/r/${res.roomId}`);
      } else {
        setError(res.error ?? '创建失败');
      }
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-3">🃏</div>
          <h1 className="text-3xl font-bold text-white">德州扑克</h1>
          <p className="text-slate-400 text-sm mt-2">和朋友一起玩</p>
        </div>

        {/* Connection status */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs text-slate-400">
            {status === 'connected' ? '已连接' : status === 'connecting' ? '连接中…' : '未连接'}
          </span>
        </div>

        {/* Nickname input */}
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-1">昵称</label>
          <input
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createRoom(); }}
            placeholder="输入你的昵称"
            maxLength={20}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-500"
          />
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        {/* Create room dialog */}
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button
              disabled={status !== 'connected' || !nameInput.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
            >
              {creating ? '创建中…' : '创建房间'}
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 border border-slate-700 rounded-2xl p-6 z-50 w-80 shadow-2xl">
              <Dialog.Title className="text-lg font-bold text-white mb-4">房间设置</Dialog.Title>

              <div className="space-y-3 mb-6">
                <ConfigField
                  label="座位数"
                  min={2} max={9}
                  value={config.seatsMax}
                  onChange={v => setConfig(c => ({ ...c, seatsMax: v }))}
                />
                <ConfigField
                  label="小盲注"
                  min={1} max={1000}
                  value={config.smallBlind}
                  onChange={v => setConfig(c => ({ ...c, smallBlind: v, bigBlind: v * 2 }))}
                />
                <ConfigField
                  label="大盲注"
                  min={2} max={2000}
                  value={config.bigBlind}
                  onChange={v => setConfig(c => ({ ...c, bigBlind: v }))}
                />
                <ConfigField
                  label="初始筹码"
                  min={100} max={100000}
                  value={config.initialChips}
                  onChange={v => setConfig(c => ({ ...c, initialChips: v }))}
                />
                <ConfigField
                  label="最大补码次数"
                  min={0} max={10}
                  value={config.maxRebuy}
                  onChange={v => setConfig(c => ({ ...c, maxRebuy: v }))}
                />
                <ConfigField
                  label="行动时限（秒）"
                  min={10} max={60}
                  value={config.timeoutSec}
                  onChange={v => setConfig(c => ({ ...c, timeoutSec: v }))}
                />
              </div>

              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <button className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors">
                    取消
                  </button>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <button
                    onClick={createRoom}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors"
                  >
                    确认创建
                  </button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <p className="text-center text-xs text-slate-600 mt-6">
          无需注册 · 分享链接即可加入
        </p>
      </div>
    </div>
  );
}

function ConfigField({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-slate-400">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
        className="w-24 bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}
