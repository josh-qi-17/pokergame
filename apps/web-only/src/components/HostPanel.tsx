import { useState } from 'react'
import RoomCodeDialog from './RoomCodeDialog'
import type { SeatView } from '../peer/protocol'

interface HostPanelProps {
  phase: string
  roomCode: string
  seats: SeatView[]
  maxRebuy: number
  isPaused: boolean
  winners: { playerId: string; nickname: string; amount: number; hand?: { description: string } }[] | null
  onPause: () => void
  onResume: () => void
  onStartNext: () => void
  onKick: (playerId: string) => void
  onRebuy: (playerId: string) => void
}

export default function HostPanel({
  phase,
  roomCode,
  seats,
  maxRebuy,
  isPaused,
  winners,
  onPause,
  onResume,
  onStartNext,
  onKick,
  onRebuy,
}: HostPanelProps) {
  const [open, setOpen] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const isShowdownOver = phase === 'showdown_over'

  return (
    <>
      {/* 悬浮按钮（右上角） */}
      <div className="fixed top-3 right-3 z-40 flex flex-col items-end gap-2">
        <button
          onClick={() => setOpen(!open)}
          className="w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 text-white text-lg flex items-center justify-center shadow-lg transition-colors"
        >
          ⚙
        </button>

        {/* 邀请按钮 */}
        <button
          onClick={() => setShowQr(true)}
          className="w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 text-white text-lg flex items-center justify-center shadow-lg transition-colors"
        >
          📲
        </button>
      </div>

      {/* 侧边抽屉 */}
      {open && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setOpen(false)}>
          <div className="flex-1" />
          <div
            className="w-72 bg-slate-800 h-full overflow-y-auto p-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">宿主控制台</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">×</button>
            </div>

            {/* 暂停/恢复 */}
            <div className="mb-4">
              {isPaused ? (
                <button
                  onClick={onResume}
                  className="w-full py-2 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl transition-colors"
                >
                  ▶ 恢复游戏
                </button>
              ) : (
                <button
                  onClick={onPause}
                  className="w-full py-2 bg-yellow-700 hover:bg-yellow-600 text-white font-bold rounded-xl transition-colors"
                  disabled={phase === 'waiting'}
                >
                  ⏸ 暂停游戏
                </button>
              )}
            </div>

            {/* 开始下一手 */}
            {isShowdownOver && (
              <div className="mb-4">
                {winners && winners.length > 0 && (
                  <div className="mb-2 p-2 bg-slate-700 rounded-lg">
                    {winners.map(w => (
                      <div key={w.playerId} className="text-sm">
                        <span className="text-yellow-400 font-bold">{w.nickname}</span>
                        <span className="text-slate-300"> 赢得 </span>
                        <span className="text-green-400 font-bold">{w.amount}</span>
                        {w.hand && <div className="text-xs text-slate-400">{w.hand.description}</div>}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={onStartNext}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors"
                >
                  开始下一手 →
                </button>
              </div>
            )}

            {/* 邀请 */}
            <button
              onClick={() => { setShowQr(true); setOpen(false) }}
              className="w-full py-2 mb-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors text-sm"
            >
              📲 邀请好友（显示房间码）
            </button>

            {/* 玩家列表 */}
            <div className="border-t border-slate-700 pt-3">
              <p className="text-slate-400 text-xs mb-3">玩家管理</p>
              <div className="flex flex-col gap-3">
                {seats.map(s => (
                  <div key={s.playerId} className="bg-slate-700 rounded-xl p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-white font-medium text-sm">{s.nickname}</div>
                        <div className="text-green-400 text-xs">筹码: {s.chips}</div>
                        <div className="text-slate-400 text-xs">补码: {s.rebuyCount}/{maxRebuy}</div>
                      </div>
                      <button
                        onClick={() => onKick(s.playerId)}
                        className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-slate-600 rounded-lg transition-colors"
                      >
                        踢出
                      </button>
                    </div>
                    <button
                      onClick={() => onRebuy(s.playerId)}
                      disabled={s.rebuyCount >= maxRebuy}
                      className="w-full py-1.5 text-xs bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                    >
                      +补码 {s.rebuyCount >= maxRebuy ? '(已达上限)' : ''}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 二维码弹窗 */}
      {showQr && (
        <RoomCodeDialog
          roomCode={roomCode}
          seats={seats}
          onClose={() => setShowQr(false)}
        />
      )}
    </>
  )
}
