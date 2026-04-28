import Card from './Card'
import type { SeatView } from '../peer/protocol'
import type { Card as CardType } from '../engine/types'

interface SeatProps {
  seat: SeatView
  isMe: boolean
  isCurrent: boolean
  isWinner: boolean
  holeCards: [CardType, CardType] | null  // 自己的手牌（仅 isMe 时有效）
  showdownCards?: [CardType, CardType]     // 摊牌时他人的牌
  bestFiveCards?: CardType[]              // 赢家最佳5张
  isShowdown: boolean
  empty?: boolean
}

export default function Seat({
  seat,
  isMe,
  isCurrent,
  isWinner,
  holeCards,
  showdownCards,
  bestFiveCards,
  isShowdown,
  empty,
}: SeatProps) {
  if (empty) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="w-14 h-14 rounded-full bg-slate-800/60 border-2 border-dashed border-slate-600 flex items-center justify-center">
          <span className="text-slate-600 text-xs">空位</span>
        </div>
      </div>
    )
  }

  const isFolded = seat.status === 'folded'
  const isAllin = seat.status === 'allin'
  const isSitout = seat.status === 'sitout'

  const borderClass = (() => {
    if (isWinner) return 'border-yellow-400 shadow-yellow-400/40 shadow-md'
    if (isCurrent) return 'border-blue-400 shadow-blue-400/40 shadow-md animate-pulse'
    if (isAllin) return 'border-red-500'
    if (isFolded) return 'border-slate-600 opacity-50'
    return 'border-slate-500'
  })()

  // 决定展示什么手牌
  const cardsToShow: ([CardType, CardType] | null) = (() => {
    if (isMe && holeCards) return holeCards
    if (isShowdown && showdownCards && !isFolded) return showdownCards
    return null
  })()

  return (
    <div className="flex flex-col items-center gap-1">
      {/* 手牌区 */}
      {(isMe || isShowdown) && (
        <div className="flex gap-0.5 mb-0.5">
          {cardsToShow ? (
            <>
              <Card
                card={cardsToShow[0]}
                highlight={isShowdown && isWinner && bestFiveCards?.some(c => c.rank === cardsToShow[0].rank && c.suit === cardsToShow[0].suit)}
                small
              />
              <Card
                card={cardsToShow[1]}
                highlight={isShowdown && isWinner && bestFiveCards?.some(c => c.rank === cardsToShow[1].rank && c.suit === cardsToShow[1].suit)}
                small
              />
            </>
          ) : !isFolded ? (
            <>
              <Card faceDown small />
              <Card faceDown small />
            </>
          ) : (
            <div className="w-16 h-11" />
          )}
        </div>
      )}

      {/* 头像 + 名字 */}
      <div
        className={`w-14 h-14 rounded-full bg-slate-700 border-2 ${borderClass} flex items-center justify-center relative`}
      >
        <span className="text-lg">{seat.nickname.charAt(0).toUpperCase()}</span>

        {/* 庄家/SB/BB 标记 */}
        {seat.isDealer && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white text-slate-900 text-xs font-bold flex items-center justify-center">D</span>
        )}
        {seat.isSmallBlind && !seat.isDealer && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">S</span>
        )}
        {seat.isBigBlind && !seat.isDealer && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">B</span>
        )}
      </div>

      {/* 昵称 */}
      <span className={`text-xs font-medium max-w-16 truncate ${isFolded ? 'text-slate-500' : isMe ? 'text-yellow-300' : 'text-slate-200'}`}>
        {isMe ? `${seat.nickname}(我)` : seat.nickname}
      </span>

      {/* 筹码 */}
      <span className={`text-xs font-bold ${isSitout ? 'text-slate-500' : 'text-green-400'}`}>
        {isSitout ? '筹码用完' : seat.chips}
      </span>

      {/* 当前下注 */}
      {seat.currentBet > 0 && (
        <span className="text-xs text-yellow-500 font-medium">下注: {seat.currentBet}</span>
      )}

      {/* 状态标签 */}
      {isFolded && <span className="text-xs text-slate-500 font-medium">弃牌</span>}
      {isAllin && <span className="text-xs text-red-400 font-bold">ALL IN</span>}

      {/* 赢家高亮 */}
      {isWinner && isShowdown && (
        <span className="text-xs text-yellow-400 font-bold animate-bounce">赢家!</span>
      )}
    </div>
  )
}

export type { SeatProps }
