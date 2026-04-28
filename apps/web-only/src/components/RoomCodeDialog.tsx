import { QRCodeSVG } from 'qrcode.react'
import type { SeatView } from '../peer/protocol'

interface RoomCodeDialogProps {
  roomCode: string
  seats: SeatView[]
  onClose: () => void
}

export default function RoomCodeDialog({ roomCode, seats, onClose }: RoomCodeDialogProps) {
  // 构建加入 URL（当前页面 URL + hash）
  const joinUrl = `${window.location.href.split('#')[0]}#join:${roomCode}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-2xl p-6 max-w-xs w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-bold text-lg">邀请好友</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* 二维码 */}
        <div className="bg-white p-3 rounded-xl mb-4 flex items-center justify-center">
          <QRCodeSVG value={joinUrl} size={180} />
        </div>

        {/* 房间码 */}
        <div className="text-center mb-4">
          <p className="text-slate-400 text-xs mb-1">房间码</p>
          <p className="text-yellow-400 text-3xl font-bold tracking-[0.3em]">{roomCode}</p>
        </div>

        {/* 已连接玩家 */}
        <div className="border-t border-slate-700 pt-3">
          <p className="text-slate-400 text-xs mb-2">已入座 ({seats.length}人)</p>
          <div className="flex flex-col gap-1">
            {seats.map(s => (
              <div key={s.playerId} className="flex justify-between text-sm">
                <span className="text-slate-200">{s.nickname}</span>
                <span className="text-green-400">{s.chips}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
