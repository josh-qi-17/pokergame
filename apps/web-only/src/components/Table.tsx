import Card from './Card'
import Seat from './Seat'
import PotDisplay from './PotDisplay'
import type { SeatView, RoomStatePayload } from '../peer/protocol'
import type { Card as CardType } from '../engine/types'

interface TableProps {
  roomState: RoomStatePayload
  myPlayerId: string | null
  myHoleCards: [CardType, CardType] | null
  isHost: boolean
  onStartGame?: () => void
}

// 计算椭圆上各座位的位置（自己固定在底部）
function getSeatPositions(totalSeats: number): { x: number; y: number }[] {
  // 返回以百分比表示的位置，0,0 是左上角
  // 自己在底部中心（index 0），其余座位顺时针从底部左侧开始
  const positions: { x: number; y: number }[] = []
  for (let i = 0; i < totalSeats; i++) {
    // i=0 是底部，逆时针分布
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / totalSeats
    const x = 50 + 44 * Math.cos(angle)
    const y = 50 + 38 * Math.sin(angle)
    positions.push({ x, y })
  }
  return positions
}

export default function Table({ roomState, myPlayerId, myHoleCards, isHost, onStartGame }: TableProps) {
  const { seats, board, pot, sidePots, phase, currentSeatIndex, config, winners } = roomState
  const isShowdown = phase === 'showdown' || phase === 'showdown_over'
  const isWaiting = phase === 'waiting'

  // 对座位进行排序：自己排第一（底部）
  const mySeat = seats.find(s => s.playerId === myPlayerId)
  const otherSeats = seats.filter(s => s.playerId !== myPlayerId)

  // 将空位补全到最大座位数
  const maxSeats = config.seatsMax
  const emptyCount = Math.max(0, maxSeats - seats.length)
  const emptySlots = Array.from({ length: emptyCount }, (_, i) => ({
    seatIndex: 100 + i,
    isEmpty: true,
  }))

  // 重新排列：我在底部（index 0），其余顺时针
  const orderedSeats: (SeatView | null)[] = mySeat ? [mySeat, ...otherSeats] : [null, ...otherSeats]
  const totalSlots = maxSeats
  const positions = getSeatPositions(totalSlots)

  return (
    <div className="relative w-full" style={{ paddingBottom: '90%', maxWidth: '480px', margin: '0 auto' }}>
      {/* 椭圆牌桌 */}
      <div
        className="absolute inset-4 rounded-[50%] border-4 border-yellow-800/60 shadow-2xl"
        style={{ background: 'radial-gradient(ellipse at center, #1a5c38 0%, #0f3d24 60%, #0a2718 100%)' }}
      />

      {/* 公共牌 + 底池（中心） */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
        <div className="flex gap-1">
          {board.length > 0
            ? board.map((card, i) => <Card key={i} card={card} />)
            : isWaiting
            ? null
            : Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="w-11 h-16 rounded-lg border border-slate-700/30" />
              ))}
        </div>
        {pot > 0 && <PotDisplay pot={pot} sidePots={sidePots} />}

        {/* 等待阶段提示 */}
        {isWaiting && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-slate-400 text-sm">等待玩家加入...</span>
            {isHost && seats.length >= 2 && (
              <button
                onClick={onStartGame}
                className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold px-6 py-2 rounded-xl text-sm transition-colors"
              >
                开始游戏
              </button>
            )}
            {!isHost && (
              <span className="text-slate-500 text-xs">等待房主开始...</span>
            )}
          </div>
        )}
      </div>

      {/* 座位 */}
      {orderedSeats.map((seat, i) => {
        const pos = positions[i]
        if (!pos) return null
        if (!seat) {
          return (
            <div
              key={`empty-${i}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <Seat
                seat={{ seatIndex: -1, playerId: '', nickname: '', chips: 0, currentBet: 0, totalContributed: 0, status: 'empty', isDealer: false, isSmallBlind: false, isBigBlind: false, timeoutCount: 0, rebuyCount: 0 }}
                isMe={false}
                isCurrent={false}
                isWinner={false}
                holeCards={null}
                isShowdown={false}
                empty
              />
            </div>
          )
        }

        const isMe = seat.playerId === myPlayerId
        const isCurrent = seat.seatIndex === currentSeatIndex && !isShowdown
        const winnerInfo = winners?.find(w => w.playerId === seat.playerId)
        const isWinner = !!winnerInfo

        return (
          <div
            key={seat.playerId}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <Seat
              seat={seat}
              isMe={isMe}
              isCurrent={isCurrent}
              isWinner={isWinner}
              holeCards={isMe ? myHoleCards : null}
              showdownCards={isShowdown && seat.holeCards ? seat.holeCards : undefined}
              bestFiveCards={isWinner && winnerInfo?.hand ? winnerInfo.hand.cards : undefined}
              isShowdown={isShowdown}
            />
          </div>
        )
      })}

      {/* 填充空位 */}
      {emptySlots.map((_, i) => {
        const slotIdx = orderedSeats.length + i
        const pos = positions[slotIdx]
        if (!pos) return null
        return (
          <div
            key={`empty-slot-${i}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <Seat
              seat={{ seatIndex: -1, playerId: '', nickname: '', chips: 0, currentBet: 0, totalContributed: 0, status: 'empty', isDealer: false, isSmallBlind: false, isBigBlind: false, timeoutCount: 0, rebuyCount: 0 }}
              isMe={false}
              isCurrent={false}
              isWinner={false}
              holeCards={null}
              isShowdown={false}
              empty
            />
          </div>
        )
      })}
    </div>
  )
}
