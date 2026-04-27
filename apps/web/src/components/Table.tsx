import type { Card as CardType, PlayerPublicState } from '@poker/shared';
import Seat from './Seat.tsx';
import Card from './Card.tsx';
import ChipStack from './ChipStack.tsx';

const SEAT_POSITIONS: Array<{ top: string; left: string; transform: string }> = [
  { top: '85%', left: '50%', transform: 'translate(-50%, -50%)' },
  { top: '75%', left: '80%', transform: 'translate(-50%, -50%)' },
  { top: '50%', left: '92%', transform: 'translate(-50%, -50%)' },
  { top: '25%', left: '80%', transform: 'translate(-50%, -50%)' },
  { top: '12%', left: '50%', transform: 'translate(-50%, -50%)' },
  { top: '25%', left: '20%', transform: 'translate(-50%, -50%)' },
  { top: '50%', left: '8%', transform: 'translate(-50%, -50%)' },
  { top: '75%', left: '20%', transform: 'translate(-50%, -50%)' },
  { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
];

interface ShowdownHandInfo {
  playerId: string;
  seatIndex: number;
  holeCards: [CardType, CardType];
  bestFive: CardType[];
}

interface TableProps {
  players: PlayerPublicState[];
  board: CardType[];
  totalPot: number;
  dealerSeat?: number;
  sbSeat?: number;
  bbSeat?: number;
  currentTurnSeat?: number;
  myPlayerId?: string;
  myHoleCards?: [CardType, CardType] | null;
  showdownHands?: ShowdownHandInfo[];
  seatsMax: number;
  onSit?: (seatIndex: number) => void;
}

export default function Table({
  players,
  board,
  totalPot,
  dealerSeat,
  sbSeat,
  bbSeat,
  currentTurnSeat,
  myPlayerId,
  myHoleCards,
  showdownHands,
  seatsMax,
  onSit,
}: TableProps) {
  const playerBySeat = new Map(players.map(p => [p.seatIndex, p]));

  // 找到本玩家的座位，将其旋转到底部（视角中心）
  const myPlayer = players.find(p => p.playerId === myPlayerId);
  const mySeatIndex = myPlayer?.seatIndex ?? -1;

  /**
   * 将真实座位编号映射为屏幕视觉槽位：
   * 本玩家座位 → 槽位 0（底部），其余顺时针排列。
   * 若尚未入座（mySeatIndex === -1），不做旋转。
   */
  function visualSlot(seatIndex: number): number {
    if (mySeatIndex < 0) return seatIndex;
    return (seatIndex - mySeatIndex + seatsMax) % seatsMax;
  }

  return (
    <div className="relative w-full" style={{ paddingBottom: '60%' }}>
      {/* Table felt */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="absolute bg-felt border-4 border-felt-dark shadow-2xl"
          style={{
            width: '80%',
            height: '75%',
            top: '12.5%',
            left: '10%',
            borderRadius: '50%',
          }}
        >
          {/* Table rim */}
          <div
            className="absolute inset-0 border-8 border-amber-900/30 rounded-full"
          />

          {/* Center info */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            {/* Board cards */}
            <div className="flex gap-1.5 items-center">
              {[0, 1, 2, 3, 4].map(i => (
                <Card
                  key={i}
                  card={board[i]}
                  faceDown={!board[i]}
                  animate={!!board[i]}
                />
              ))}
            </div>

            {/* Pot */}
            {totalPot > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <ChipStack amount={totalPot} />
                <span className="text-xs text-slate-300">底池</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seats — 座位坐标按本玩家视角旋转 */}
      {Array.from({ length: seatsMax }, (_, i) => {
        const player = playerBySeat.get(i);
        const showdownHand = showdownHands?.find(h => h.seatIndex === i);
        const isMe = player?.playerId === myPlayerId;
        const holeCards = isMe ? myHoleCards : null;
        const slot = visualSlot(i);

        return (
          <Seat
            key={i}
            seatIndex={i}
            player={player}
            isDealer={player?.seatIndex === dealerSeat}
            isSB={player?.seatIndex === sbSeat}
            isBB={player?.seatIndex === bbSeat}
            isCurrentTurn={player?.seatIndex === currentTurnSeat}
            holeCards={holeCards ?? undefined}
            showdownCards={showdownHand?.holeCards}
            bestFive={showdownHand?.bestFive}
            currentBet={player?.currentBet}
            style={SEAT_POSITIONS[slot]}
            isEmpty={!player}
            onSit={onSit}
          />
        );
      })}
    </div>
  );
}
