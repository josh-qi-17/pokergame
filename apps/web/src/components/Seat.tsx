import { createAvatar } from '@dicebear/core';
import { identicon } from '@dicebear/collection';
import type { Card as CardType, PlayerPublicState } from '@poker/shared';
import Card from './Card.tsx';
import ChipStack from './ChipStack.tsx';

interface SeatProps {
  player?: PlayerPublicState;
  seatIndex: number;
  isDealer?: boolean;
  isSB?: boolean;
  isBB?: boolean;
  isCurrentTurn?: boolean;
  holeCards?: [CardType, CardType] | null;
  showdownCards?: [CardType, CardType] | null;
  bestFive?: CardType[];
  currentBet?: number;
  style?: React.CSSProperties;
  isEmpty?: boolean;
  onSit?: (seatIndex: number) => void;
}

function generateAvatar(seed: string): string {
  const avatar = createAvatar(identicon, {
    seed,
    size: 40,
    backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
  });
  return avatar.toDataUriSync();
}

export default function Seat({
  player,
  seatIndex,
  isDealer,
  isSB,
  isBB,
  isCurrentTurn,
  holeCards,
  showdownCards,
  bestFive,
  currentBet,
  style,
  isEmpty,
  onSit,
}: SeatProps) {
  if (!player || isEmpty) {
    return (
      <div
        className="absolute flex flex-col items-center gap-1 cursor-pointer group"
        style={style}
        onClick={() => onSit?.(seatIndex)}
      >
        <div className="w-14 h-14 rounded-full bg-slate-800 border-2 border-dashed border-slate-600 group-hover:border-slate-400 flex items-center justify-center transition-colors">
          <span className="text-slate-500 group-hover:text-slate-300 text-sm">坐下</span>
        </div>
        <span className="text-xs text-slate-500">{seatIndex + 1}号位</span>
      </div>
    );
  }

  const avatarUri = generateAvatar(player.deviceId);
  const displayCards = showdownCards ?? holeCards;

  return (
    <div
      className={`absolute flex flex-col items-center gap-1 transition-all duration-300 ${isCurrentTurn ? 'scale-110' : ''}`}
      style={style}
    >
      {/* Cards */}
      {displayCards && (
        <div className="flex gap-0.5 mb-1">
          <Card
            card={displayCards[0]}
            small
            highlight={bestFive?.some(c => c.rank === displayCards[0]?.rank && c.suit === displayCards[0]?.suit)}
            animate={!!holeCards && !showdownCards}
          />
          <Card
            card={displayCards[1]}
            small
            highlight={bestFive?.some(c => c.rank === displayCards[1]?.rank && c.suit === displayCards[1]?.suit)}
            animate={!!holeCards && !showdownCards}
          />
        </div>
      )}
      {player.hasCards && !displayCards && (
        <div className="flex gap-0.5 mb-1">
          <Card faceDown small />
          <Card faceDown small />
        </div>
      )}

      {/* Avatar & Info */}
      <div className={`relative ${isCurrentTurn ? 'ring-2 ring-yellow-400 rounded-full' : ''}`}>
        <img
          src={avatarUri}
          alt={player.nickname}
          className={`w-12 h-12 rounded-full border-2 ${player.isConnected ? 'border-slate-500' : 'border-red-800 opacity-50'}`}
        />
        {isDealer && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-slate-900 rounded-full text-xs font-bold flex items-center justify-center shadow">
            D
          </span>
        )}
        {isSB && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 text-white rounded-full text-xs font-bold flex items-center justify-center shadow">
            S
          </span>
        )}
        {isBB && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 text-white rounded-full text-xs font-bold flex items-center justify-center shadow">
            B
          </span>
        )}
      </div>

      <div className="flex flex-col items-center">
        <span className={`text-xs font-semibold truncate max-w-[70px] ${player.isHost ? 'text-yellow-400' : 'text-slate-200'}`}>
          {player.nickname}
        </span>
        <span className="text-xs text-slate-400 tabular-nums">{player.chips}</span>
      </div>

      {currentBet !== undefined && currentBet > 0 && (
        <ChipStack amount={currentBet} />
      )}
    </div>
  );
}
