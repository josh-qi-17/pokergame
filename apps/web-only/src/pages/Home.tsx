import { useState } from 'react'
import { useHostStore } from '../store/useHostStore'
import { initHostPeer } from '../peer/hostPeer'
import { connectToHost } from '../peer/clientPeer'
import type { RoomConfig } from '../engine/types'

type View = 'main' | 'create' | 'join'

export default function Home() {
  const [view, setView] = useState<View>('main')
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold text-yellow-400 mb-2 tracking-widest">♠ 德州扑克 ♥</h1>
      <p className="text-slate-400 text-sm mb-10">局域网联机 · 无需注册</p>

      {view === 'main' && <MainMenu onCreate={() => setView('create')} onJoin={() => setView('join')} />}
      {view === 'create' && <CreateRoom onBack={() => setView('main')} />}
      {view === 'join' && <JoinRoom onBack={() => setView('main')} />}
    </div>
  )
}

function MainMenu({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="flex flex-col gap-4 w-full max-w-xs">
      <button
        onClick={onCreate}
        className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-4 rounded-2xl text-lg transition-colors"
      >
        创建房间
      </button>
      <button
        onClick={onJoin}
        className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 rounded-2xl text-lg transition-colors"
      >
        加入房间
      </button>
    </div>
  )
}

function CreateRoom({ onBack }: { onBack: () => void }) {
  const [nickname, setNickname] = useState('')
  const [config, setConfig] = useState<RoomConfig>({
    seatsMax: 6,
    smallBlind: 10,
    bigBlind: 20,
    initialChips: 1000,
    maxRebuy: 2,
    timeoutSec: 30,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const createRoom = useHostStore(s => s.createRoom)

  async function handleCreate() {
    if (!nickname.trim()) { setError('请输入昵称'); return }
    if (config.bigBlind <= config.smallBlind) { setError('大盲必须大于小盲'); return }
    setLoading(true)
    setError('')
    try {
      createRoom(nickname.trim(), config)
      // roomId 会在 createRoom 后更新，我们用 setTimeout 等一个 tick
      await new Promise(r => setTimeout(r, 50))
      const id = useHostStore.getState().roomId
      await initHostPeer(id)
    } catch (e) {
      setError('创建房间失败，请检查网络')
    } finally {
      setLoading(false)
    }
  }

  const updateConfig = (key: keyof RoomConfig, value: number) =>
    setConfig(c => ({ ...c, [key]: value }))

  return (
    <div className="w-full max-w-sm">
      <button onClick={onBack} className="text-slate-400 hover:text-white mb-4 flex items-center gap-1 text-sm">
        ← 返回
      </button>
      <h2 className="text-xl font-bold text-white mb-6">创建房间</h2>

      <div className="flex flex-col gap-4">
        <FormField label="你的昵称">
          <input
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="输入昵称"
            maxLength={12}
            className="input-field"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="座位上限">
            <select value={config.seatsMax} onChange={e => updateConfig('seatsMax', Number(e.target.value))} className="input-field">
              {[2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n}人</option>)}
            </select>
          </FormField>
          <FormField label="初始筹码">
            <input type="number" value={config.initialChips} min={100} step={100}
              onChange={e => updateConfig('initialChips', Number(e.target.value))} className="input-field" />
          </FormField>
          <FormField label="小盲">
            <input type="number" value={config.smallBlind} min={1}
              onChange={e => updateConfig('smallBlind', Number(e.target.value))} className="input-field" />
          </FormField>
          <FormField label="大盲">
            <input type="number" value={config.bigBlind} min={2}
              onChange={e => updateConfig('bigBlind', Number(e.target.value))} className="input-field" />
          </FormField>
          <FormField label="最大补码次数">
            <input type="number" value={config.maxRebuy} min={0} max={10}
              onChange={e => updateConfig('maxRebuy', Number(e.target.value))} className="input-field" />
          </FormField>
          <FormField label="行动时限(秒)">
            <input type="number" value={config.timeoutSec} min={10} max={60}
              onChange={e => updateConfig('timeoutSec', Number(e.target.value))} className="input-field" />
          </FormField>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={loading}
          className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-slate-900 font-bold py-3 rounded-xl text-base transition-colors mt-2"
        >
          {loading ? '创建中...' : '创建并进入'}
        </button>
      </div>
    </div>
  )
}

function JoinRoom({ onBack }: { onBack: () => void }) {
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin() {
    if (!nickname.trim()) { setError('请输入昵称'); return }
    if (!roomCode.trim()) { setError('请输入房间码'); return }
    setLoading(true)
    setError('')
    try {
      await connectToHost(roomCode.trim(), nickname.trim())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加入失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <button onClick={onBack} className="text-slate-400 hover:text-white mb-4 flex items-center gap-1 text-sm">
        ← 返回
      </button>
      <h2 className="text-xl font-bold text-white mb-6">加入房间</h2>

      <div className="flex flex-col gap-4">
        <FormField label="你的昵称">
          <input
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="输入昵称"
            maxLength={12}
            className="input-field"
          />
        </FormField>
        <FormField label="房间码">
          <input
            value={roomCode}
            inputMode="numeric"
            pattern="[0-9]*"
            onChange={e => setRoomCode(e.target.value.replace(/\D/g, ''))}
            placeholder="6位数字房间码"
            maxLength={6}
            className="input-field tracking-widest text-center text-lg font-bold"
          />
        </FormField>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleJoin}
          disabled={loading}
          className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-slate-900 font-bold py-3 rounded-xl text-base transition-colors mt-2"
        >
          {loading ? '连接中...' : '加入房间'}
        </button>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-slate-400 text-xs font-medium">{label}</label>
      {children}
    </div>
  )
}
