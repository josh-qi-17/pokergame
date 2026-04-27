import { useEffect, useState } from 'react';
import type { Card as CardType } from '@poker/shared';
import Card from './Card.tsx';

interface HandHistoryEntry {
  handNumber: number;
  players: Array<{ playerId: string; seatIndex: number; holeCards?: [CardType, CardType] | null }>;
  actions: Array<{ playerId: string; type: string; amount?: number; street: string }>;
  board: CardType[];
  winners: Array<{ playerId: string; amount: number }>;
  pots: Array<{ amount: number; eligiblePlayerIds: string[] }>;
}

interface HandHistoryProps {
  roomId: string;
  myPlayerId?: string;
}

export default function HandHistory({ roomId, myPlayerId }: HandHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<HandHistoryEntry[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  void roomId;

  async function loadHistory() {
    try {
      const res = await fetch(`/api/rooms/${roomId}/history`);
      if (res.ok) {
        const data = await res.json() as HandHistoryEntry[];
        setHistory(data);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (isOpen) void loadHistory();
  }, [isOpen]);

  const STREET_LABELS: Record<string, string> = {
    preflop: '翻牌前',
    flop: '翻牌',
    turn: '转牌',
    river: '河牌',
    showdown: '摊牌',
  };

  const ACTION_LABELS: Record<string, string> = {
    fold: '弃牌',
    check: '过牌',
    call: '跟注',
    raise: '加注',
    allin: '全押',
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-sm px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
      >
        手牌历史
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <h2 className="font-bold text-white">手牌历史</h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300 text-xl">×</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {history.length === 0 ? (
                <div className="text-center text-slate-500 py-12 text-sm">暂无历史记录</div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {history.map((hand, idx) => (
                    <div key={idx} className="p-4">
                      <button
                        onClick={() => setSelected(selected === idx ? null : idx)}
                        className="w-full text-left flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-200">第 {hand.handNumber} 手</span>
                        <span className="text-slate-500 text-sm">{selected === idx ? '▲' : '▼'}</span>
                      </button>

                      {selected === idx && (
                        <div className="mt-3 space-y-3">
                          <div className="flex gap-1.5 flex-wrap">
                            <span className="text-xs text-slate-400">公共牌：</span>
                            {hand.board.map((c, i) => (
                              <Card key={i} card={c} small />
                            ))}
                          </div>

                          {myPlayerId && hand.players.find(p => p.playerId === myPlayerId)?.holeCards && (
                            <div className="flex gap-1.5 flex-wrap">
                              <span className="text-xs text-slate-400">我的手牌：</span>
                              {hand.players.find(p => p.playerId === myPlayerId)!.holeCards!.map((c, i) => (
                                <Card key={i} card={c} small />
                              ))}
                            </div>
                          )}

                          <div className="space-y-0.5">
                            <div className="text-xs text-slate-400 mb-1">行动记录：</div>
                            {Object.entries(
                              hand.actions.reduce<Record<string, typeof hand.actions>>((acc, a) => {
                                const street = a.street ?? 'preflop';
                                if (!acc[street]) acc[street] = [];
                                acc[street]!.push(a);
                                return acc;
                              }, {})
                            ).map(([street, actions]) => (
                              <div key={street}>
                                <div className="text-xs text-blue-400 font-medium">{STREET_LABELS[street] ?? street}</div>
                                {actions.map((a, i) => (
                                  <div key={i} className="text-xs text-slate-300 pl-3">
                                    {a.playerId.slice(0, 6)}: {ACTION_LABELS[a.type] ?? a.type}
                                    {a.amount ? ` ${a.amount}` : ''}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>

                          <div className="text-xs">
                            <span className="text-slate-400">赢家：</span>
                            {hand.winners.map((w, i) => (
                              <span key={i} className="text-green-400 ml-1">
                                {w.playerId.slice(0, 6)} +{w.amount}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
