import { useEffect, useCallback } from 'react'
import { useHostStore } from '../store/useHostStore'
import { useClientStore } from '../store/useClientStore'
import { broadcastState, kickPeer } from '../peer/hostPeer'
import { sendGameAction } from '../peer/clientPeer'
import { legalActions } from '../engine'
import Table from '../components/Table'
import ActionBar from '../components/ActionBar'
import HostPanel from '../components/HostPanel'
import type { RoomStatePayload } from '../peer/protocol'
import type { Card as CardType } from '../engine/types'

interface GameProps {
  isHost: boolean
}

export default function Game({ isHost }: GameProps) {
  if (isHost) return <HostGame />
  return <ClientGame />
}

// ─────────────────────────────────────────────
// 宿主视图
// ─────────────────────────────────────────────
function HostGame() {
  const store = useHostStore()
  const {
    phase, roomId, config, seats, handState, winners, isPaused,
    startGame, startNextHand, pauseGame, resumeGame, rebuyPlayer,
    myPlayerId,
  } = store

  const isShowdownOver = phase === 'showdown_over'
  const isWaiting = phase === 'waiting'

  // 每次状态变更后广播给所有 clients
  useEffect(() => {
    broadcastState()
  }, [phase, handState, isPaused, winners, seats])

  const handleAction = useCallback((action: string, amount?: number) => {
    if (!handState) return
    const currentPlayer = handState.players[handState.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.playerId !== myPlayerId) return
    store.applyPlayerAction(myPlayerId, action as 'fold' | 'check' | 'call' | 'raise' | 'allin', amount)
    broadcastState()
  }, [handState, myPlayerId, store])

  const handleKick = useCallback((playerId: string) => {
    const seat = seats.find(s => s.playerId === playerId)
    if (!seat || seat.peerId === null) return // 不能踢自己
    kickPeer(seat.peerId)
  }, [seats])

  const handleRebuy = useCallback((playerId: string) => {
    rebuyPlayer(playerId)
    broadcastState()
  }, [rebuyPlayer])

  // 构建宿主视图的 roomState
  const roomState: RoomStatePayload = store.getRoomStateFor(null)

  // 我的手牌
  const myHoleCards: [CardType, CardType] | null = (() => {
    if (!handState) return null
    const me = handState.players.find(p => p.playerId === myPlayerId)
    return me?.holeCards ?? null
  })()

  // 是否轮到宿主行动
  const isMyTurn = (() => {
    if (!handState || handState.isFinished || isPaused) return false
    const current = handState.players[handState.currentPlayerIndex]
    return current?.playerId === myPlayerId
  })()

  const myLegalActions = isMyTurn && handState
    ? legalActions(handState, myPlayerId)
    : []

  const mySeat = seats.find(s => s.playerId === myPlayerId)

  return (
    <div className="flex flex-col h-screen bg-slate-900 overflow-hidden safe-top">
      {/* 游戏桌面区域 */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start pt-4 px-2 pb-2">
        <Table
          roomState={roomState}
          myPlayerId={myPlayerId}
          myHoleCards={myHoleCards}
          isHost={true}
          onStartGame={startGame}
        />

        {/* 摊牌等待提示 */}
        {isShowdownOver && (
          <div className="mt-2 text-center">
            {winners && winners.length > 0 && (
              <div className="text-yellow-400 font-bold text-base">
                {winners.map(w => `${w.nickname} +${w.amount}`).join('  ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 行动区 */}
      {isMyTurn && myLegalActions.length > 0 && (
        <ActionBar
          legalActions={myLegalActions}
          pot={roomState.pot}
          myChips={mySeat?.chips ?? 0}
          timeoutAt={roomState.timeoutAt}
          timeoutSec={config.timeoutSec}
          onAction={handleAction}
        />
      )}

      {/* 非行动状态底栏 */}
      {!isMyTurn && !isWaiting && (
        <div className="bg-slate-900/95 backdrop-blur border-t border-slate-700 p-3 safe-bottom text-center text-slate-400 text-sm">
          {isShowdownOver ? '手牌结束 — 在控制台点击「开始下一手」' : '等待其他玩家行动...'}
        </div>
      )}

      {/* 宿主控制面板 */}
      <HostPanel
        phase={phase}
        roomCode={roomId}
        seats={roomState.seats}
        maxRebuy={config.maxRebuy}
        isPaused={isPaused}
        winners={winners}
        onPause={pauseGame}
        onResume={resumeGame}
        onStartNext={() => { startNextHand(); broadcastState() }}
        onKick={handleKick}
        onRebuy={handleRebuy}
      />
    </div>
  )
}

// ─────────────────────────────────────────────
// 客户端视图
// ─────────────────────────────────────────────
function ClientGame() {
  const roomState = useClientStore(s => s.roomState)
  const myPlayerId = useClientStore(s => s.myPlayerId)
  const connectionStatus = useClientStore(s => s.connectionStatus)

  if (!roomState) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="text-slate-300 text-lg mb-2">
            {connectionStatus === 'connecting' ? '连接中...' : '等待房间数据...'}
          </div>
          <div className="text-slate-500 text-sm">{connectionStatus}</div>
        </div>
      </div>
    )
  }

  const { phase, timeoutAt, config, pot, seats, winners, isPaused } = roomState
  const isShowdownOver = phase === 'showdown_over'
  const isWaiting = phase === 'waiting'

  const myHoleCards = roomState.holeCards

  // 是否轮到自己行动
  const mySeat = seats.find(s => s.playerId === myPlayerId)
  const isMyTurn = !isWaiting && !isShowdownOver && !isPaused &&
    mySeat != null &&
    roomState.currentSeatIndex === mySeat.seatIndex

  // 计算合法行动（客户端本地计算，仅用于 UI，宿主会再次校验）
  const myLegalActionsClient = (() => {
    if (!isMyTurn || !mySeat) return []
    const maxBet = Math.max(...seats.map(s => s.currentBet))
    const toCall = maxBet - (mySeat.currentBet ?? 0)
    const actions = []
    actions.push({ type: 'fold' as const })
    if (toCall === 0) actions.push({ type: 'check' as const })
    else actions.push({ type: 'call' as const, minAmount: Math.min(toCall, mySeat.chips), maxAmount: Math.min(toCall, mySeat.chips) })
    if (mySeat.chips > toCall) {
      const minRaise = config.bigBlind
      const min = Math.min(toCall + minRaise, mySeat.chips)
      if (min < mySeat.chips) actions.push({ type: 'raise' as const, minAmount: min, maxAmount: mySeat.chips })
      actions.push({ type: 'allin' as const, minAmount: mySeat.chips, maxAmount: mySeat.chips })
    }
    return actions
  })()

  const handleAction = useCallback((action: string, amount?: number) => {
    sendGameAction(action, amount)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-slate-900 overflow-hidden safe-top">
      {/* 游戏桌面 */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start pt-4 px-2 pb-2">
        <Table
          roomState={roomState}
          myPlayerId={myPlayerId}
          myHoleCards={myHoleCards}
          isHost={false}
        />

        {/* 摊牌结果 */}
        {isShowdownOver && winners && winners.length > 0 && (
          <div className="mt-2 text-center">
            <div className="text-yellow-400 font-bold text-base">
              {winners.map(w => `${w.nickname} +${w.amount}`).join('  ')}
            </div>
            {winners[0]?.hand && (
              <div className="text-slate-400 text-sm">{winners[0].hand.description}</div>
            )}
          </div>
        )}
      </div>

      {/* 行动区 */}
      {isMyTurn && myLegalActionsClient.length > 0 && (
        <ActionBar
          legalActions={myLegalActionsClient}
          pot={pot}
          myChips={mySeat?.chips ?? 0}
          timeoutAt={timeoutAt}
          timeoutSec={config.timeoutSec}
          onAction={handleAction}
        />
      )}

      {/* 非行动底栏 */}
      {!isMyTurn && (
        <div className="bg-slate-900/95 backdrop-blur border-t border-slate-700 p-3 safe-bottom text-center text-slate-400 text-sm">
          {isWaiting
            ? '等待房主开始游戏...'
            : isShowdownOver
            ? '等待房主开始下一手...'
            : isPaused
            ? '游戏已暂停'
            : '等待其他玩家行动...'}
        </div>
      )}

      {/* 暂停遮罩 */}
      {isPaused && !isWaiting && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 pointer-events-none">
          <div className="bg-slate-800 rounded-2xl px-8 py-5 text-center">
            <div className="text-2xl mb-2">⏸</div>
            <div className="text-white font-bold">游戏已暂停</div>
            <div className="text-slate-400 text-sm mt-1">等待房主恢复</div>
          </div>
        </div>
      )}
    </div>
  )
}
