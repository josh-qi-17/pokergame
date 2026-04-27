import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  GameActionBroadcast,
  GameDealPayload,
  GameEndPayload,
  GameShowdownPayload,
  GameStartPayload,
  GameTurnPayload,
  RoomState,
  RoomUpdatePayload,
} from '@poker/shared';
import { getSocket } from '../socket.ts';
import { useIdentityStore } from '../store/useIdentityStore.ts';
import { useSocketStore } from '../store/useSocketStore.ts';
import { useRoomStore } from '../store/useRoomStore.ts';
import Table from '../components/Table.tsx';
import ActionBar from '../components/ActionBar.tsx';
import Chat from '../components/Chat.tsx';
import ShareDialog from '../components/ShareDialog.tsx';
import HostPanel from '../components/HostPanel.tsx';

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { deviceId, nickname, setNickname } = useIdentityStore();
  const { connect, status } = useSocketStore();
  const roomStore = useRoomStore();
  const [nicknameInput, setNicknameInput] = useState(nickname);
  const [joined, setJoined] = useState(false);
  const [joiningError, setJoiningError] = useState('');
  const [dealerSeat, setDealerSeat] = useState<number | undefined>();
  const [sbSeat, setSbSeat] = useState<number | undefined>();
  const [bbSeat, setBbSeat] = useState<number | undefined>();
  const [potTotal, setPotTotal] = useState(0);
  const [disconnectMsg, setDisconnectMsg] = useState('');
  const hasJoined = useRef(false);

  const socket = getSocket();

  useEffect(() => {
    if (!roomId) return;
    connect();

    // 用具名函数，确保 cleanup 只移除本组件注册的监听器（修复 P0-2）
    const onConnect = () => {
      roomStore.setConnected(true);
      setDisconnectMsg('');
      if (hasJoined.current && nickname) {
        joinRoom(nickname);
      }
    };

    const onDisconnect = () => {
      roomStore.setConnected(false);
      setDisconnectMsg('连接已断开，尝试重连中…');
    };

    const onRoomState = (state: RoomState) => {
      roomStore.setRoomState(state);
      // 若 myPlayerId 尚未设置，尝试从状态中按 deviceId 识别自身（修复 P0-5 兜底）
      if (!roomStore.myPlayerId) {
        const me = state.players.find(p => p.deviceId === deviceId);
        if (me) roomStore.setMyPlayerId(me.playerId);
      }
    };

    const onRoomUpdate = (payload: RoomUpdatePayload) => {
      roomStore.applyRoomUpdate(payload.type, payload.data);
    };

    const onGameStart = (payload: GameStartPayload) => {
      setDealerSeat(payload.dealerSeat);
      setSbSeat(payload.sbSeat);
      setBbSeat(payload.bbSeat);
      roomStore.setCurrentTurn(null);
      roomStore.setMyHoleCards(null as never);
    };

    const onGameDeal = (payload: GameDealPayload) => {
      roomStore.setMyHoleCards(payload.holeCards);
    };

    const onGameTurn = (payload: GameTurnPayload) => {
      roomStore.setCurrentTurn(payload);
    };

    const onGameAction = (payload: GameActionBroadcast) => {
      setPotTotal(payload.potTotal);
      // 实时同步行动后筹码，确保 ActionBar 的 maxRaise 始终准确（修复 Bug 1 stale chips）
      roomStore.updatePlayerChips(payload.playerId, payload.chipsAfter);
      if (payload.playerId === roomStore.myPlayerId) {
        roomStore.setCurrentTurn(null);
      }
    };

    const onGameShowdown = (payload: GameShowdownPayload) => {
      roomStore.setShowdown(payload);
      roomStore.setBoard(payload.board);
    };

    const onGameEnd = (payload: GameEndPayload) => {
      roomStore.setGameEnd(payload);
      setPotTotal(0);
    };

    const onError = (err: { code: string; message: string }) => {
      if (err.code === 'BANNED') {
        alert('您已被移出此房间');
        navigate('/');
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onRoomState);
    socket.on('room:update', onRoomUpdate);
    socket.on('game:start', onGameStart);
    socket.on('game:deal', onGameDeal);
    socket.on('game:turn', onGameTurn);
    socket.on('game:action', onGameAction);
    socket.on('game:showdown', onGameShowdown);
    socket.on('game:end', onGameEnd);
    socket.on('error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onRoomState);
      socket.off('room:update', onRoomUpdate);
      socket.off('game:start', onGameStart);
      socket.off('game:deal', onGameDeal);
      socket.off('game:turn', onGameTurn);
      socket.off('game:action', onGameAction);
      socket.off('game:showdown', onGameShowdown);
      socket.off('game:end', onGameEnd);
      socket.off('error', onError);
    };
  }, [roomId]);

  function joinRoom(name: string) {
    if (!roomId) return;
    socket.emit('room:join', { deviceId, nickname: name, roomId }, res => {
      if (res.ok) {
        setJoined(true);
        hasJoined.current = true;
        // 服务端返回 playerId，立即写入 store（修复 P0-5）
        if (res.playerId) roomStore.setMyPlayerId(res.playerId);
      } else {
        setJoiningError(res.error ?? '加入失败');
      }
    });
  }

  function handleJoin() {
    const name = nicknameInput.trim();
    if (!name) return;
    setNickname(name);
    joinRoom(name);
  }

  function handleSit(seatIndex: number) {
    if (!roomId || !joined) return;
    socket.emit('room:sit', { roomId, seatIndex }, res => {
      if (!res.ok) alert(res.error);
    });
  }

  if (!joined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">🃏</div>
            <h2 className="text-xl font-bold text-white">加入房间</h2>
            <p className="text-xs text-slate-400 mt-1">房间 #{roomId}</p>
          </div>

          {status !== 'connected' ? (
            <div className="text-center text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              连接中…
            </div>
          ) : (
            <>
              <input
                type="text"
                value={nicknameInput}
                onChange={e => setNicknameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                placeholder="输入昵称"
                maxLength={20}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-500"
              />
              {joiningError && <p className="text-red-400 text-sm mb-3">{joiningError}</p>}
              <button
                onClick={handleJoin}
                disabled={!nicknameInput.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
              >
                进入房间
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const { roomState, myPlayerId, myHoleCards, currentTurn, showdownHands, lastWinners, board, isPaused } = roomStore;

  if (!roomState) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 text-sm">加载中…</div>
      </div>
    );
  }

  const myPlayer = roomState.players.find(p => p.playerId === myPlayerId);
  const isMyTurn = currentTurn?.playerId === myPlayerId;
  const isHost = myPlayer?.isHost ?? false;
  const currentTurnSeatIndex = currentTurn
    ? roomState.players.find(p => p.playerId === currentTurn.playerId)?.seatIndex
    : undefined;
  const seatedCount = roomState.players.filter(p => p.seatIndex >= 0 && p.chips > 0).length;
  const isInLobby = roomState.phase === 'lobby';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white">🃏 德州扑克</span>
          <span className="text-xs text-slate-500">#{roomId}</span>
          {isPaused && (
            <span className="text-xs bg-yellow-800 text-yellow-300 px-2 py-0.5 rounded-full">已暂停</span>
          )}
          {isInLobby && (
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
              {seatedCount} 人已就座
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ShareDialog roomId={roomId!} />
          {isHost && (
            <HostPanel
              roomId={roomId!}
              players={roomState.players}
              myPlayerId={myPlayerId!}
              isPaused={isPaused}
              isInLobby={isInLobby}
              seatedCount={seatedCount}
            />
          )}
        </div>
      </div>

      {/* Disconnection overlay */}
      <AnimatePresence>
        {disconnectMsg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
          >
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 text-center shadow-2xl">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white font-semibold">{disconnectMsg}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pause overlay */}
      <AnimatePresence>
        {isPaused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-30 flex items-center justify-center pointer-events-none"
          >
            <div className="bg-slate-900/90 border border-yellow-600 rounded-2xl px-8 py-4">
              <p className="text-yellow-400 font-bold text-lg">⏸ 游戏已暂停</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main table */}
      <div className="flex-1 flex flex-col items-center justify-between p-2 max-w-4xl mx-auto w-full">
        <div className="w-full">
          <Table
            players={roomState.players}
            board={board}
            totalPot={potTotal}
            dealerSeat={dealerSeat}
            sbSeat={sbSeat}
            bbSeat={bbSeat}
            currentTurnSeat={currentTurnSeatIndex}
            myPlayerId={myPlayerId ?? undefined}
            myHoleCards={myHoleCards}
            showdownHands={showdownHands}
            seatsMax={roomState.config.seatsMax}
            onSit={isInLobby ? handleSit : undefined}
          />
        </div>

        {/* Action bar */}
        {isMyTurn && currentTurn && myPlayer && (
          <div className="w-full max-w-lg mx-auto p-3 bg-slate-900/90 border border-yellow-600/50 rounded-2xl shadow-2xl">
            <div className="text-xs text-yellow-400 text-center mb-2 font-semibold">轮到你了</div>
            <ActionBar
              turn={currentTurn}
              myChips={myPlayer.chips}
              potTotal={potTotal}
            />
          </div>
        )}

        {/* Winners announcement */}
        <AnimatePresence>
          {lastWinners.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg mx-auto p-3 bg-slate-900/95 border border-green-600/50 rounded-2xl"
            >
              {lastWinners.map(w => (
                <div key={w.playerId} className="text-center text-sm">
                  <span className="text-yellow-400 font-bold">{w.nickname}</span>
                  <span className="text-slate-300"> 赢得 </span>
                  <span className="text-green-400 font-bold">{w.amount}</span>
                  {w.hand && <span className="text-slate-400"> ({w.hand.description})</span>}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lobby status */}
        {isInLobby && (
          <div className="text-center text-slate-500 text-sm py-4 space-y-1">
            <p>
              {seatedCount < 2
                ? `等待玩家就座…（还需 ${2 - seatedCount} 人坐下才能开局）`
                : isHost
                  ? '所有玩家已就位，可以开始游戏'
                  : '等待房主开始游戏…'}
            </p>
          </div>
        )}
      </div>

      {/* Chat */}
      {myPlayerId && (
        <Chat roomId={roomId!} playerId={myPlayerId} />
      )}
    </div>
  );
}
