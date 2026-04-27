import { useEffect, useState } from 'react';
import type { ActionType, GameTurnPayload } from '@poker/shared';
import { getSocket } from '../socket.ts';
import { nanoid } from 'nanoid';

interface ActionBarProps {
  turn: GameTurnPayload;
  myChips: number;
  potTotal: number;
  onAction?: () => void;
}

export default function ActionBar({ turn, myChips, potTotal, onAction }: ActionBarProps) {
  const [raiseAmount, setRaiseAmount] = useState(turn.minRaise + turn.callAmount);
  const [showRaiseSlider, setShowRaiseSlider] = useState(false);
  const [timeLeft, setTimeLeft] = useState(100);

  const socket = getSocket();

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = turn.timeoutAt - Date.now();
      const total = 30000;
      setTimeLeft(Math.max(0, Math.min(100, (remaining / total) * 100)));
      if (remaining <= 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [turn.timeoutAt]);

  useEffect(() => {
    setRaiseAmount(Math.min(turn.minRaise + turn.callAmount, myChips));
  }, [turn.minRaise, turn.callAmount, myChips]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toUpperCase()) {
        case 'F':
          if (turn.legalActions.includes('fold')) sendAction('fold');
          break;
        case 'C':
          if (turn.legalActions.includes('check')) sendAction('check');
          else if (turn.legalActions.includes('call')) sendAction('call');
          break;
        case 'R':
          if (turn.legalActions.includes('raise')) setShowRaiseSlider(v => !v);
          break;
        case 'A':
          if (turn.legalActions.includes('allin')) sendAction('allin');
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [turn.legalActions]);

  function sendAction(type: ActionType, amount?: number) {
    socket.emit('game:action', {
      roomId: turn.roomId,
      actionId: nanoid(),
      type,
      amount,
    }, () => {});
    onAction?.();
  }

  const canFold = turn.legalActions.includes('fold');
  const canCheck = turn.legalActions.includes('check');
  const canCall = turn.legalActions.includes('call');
  const canRaise = turn.legalActions.includes('raise');
  const canAllin = turn.legalActions.includes('allin');

  const minRaise = turn.callAmount + turn.minRaise;
  const maxRaise = myChips;

  function setQuickRaise(fraction: number) {
    setRaiseAmount(Math.min(Math.max(minRaise, Math.floor(potTotal * fraction)), maxRaise));
  }

  return (
    <div className="w-full">
      {/* Timer bar */}
      <div className="w-full h-1.5 bg-slate-700 rounded-full mb-3">
        <div
          className={`h-full rounded-full transition-all duration-100 ${timeLeft > 30 ? 'bg-green-500' : timeLeft > 10 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${timeLeft}%` }}
        />
      </div>

      {/* Raise slider */}
      {showRaiseSlider && canRaise && (
        <div className="mb-3 p-3 bg-slate-800 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <input
              type="range"
              min={minRaise}
              max={maxRaise}
              value={raiseAmount}
              onChange={e => setRaiseAmount(Number(e.target.value))}
              onWheel={e => setRaiseAmount(v => Math.min(maxRaise, Math.max(minRaise, v - Math.sign(e.deltaY) * turn.minRaise)))}
              className="flex-1 accent-yellow-400"
            />
            <input
              type="number"
              value={raiseAmount}
              min={minRaise}
              max={maxRaise}
              onChange={e => setRaiseAmount(Math.min(maxRaise, Math.max(minRaise, Number(e.target.value))))}
              className="w-20 bg-slate-700 text-white rounded px-2 py-1 text-sm text-center"
            />
          </div>
          <div className="flex gap-2 justify-center flex-wrap">
            <button onClick={() => setQuickRaise(0.5)} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded transition-colors">
              1/2 底
            </button>
            <button onClick={() => setQuickRaise(0.67)} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded transition-colors">
              2/3 底
            </button>
            <button onClick={() => setQuickRaise(1)} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded transition-colors">
              满底
            </button>
            <button onClick={() => setRaiseAmount(maxRaise)} className="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 rounded transition-colors">
              全押
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 justify-center">
        {canFold && (
          <button
            onClick={() => sendAction('fold')}
            className="action-btn bg-slate-700 hover:bg-slate-600 text-white min-w-[80px]"
          >
            弃牌 <kbd className="ml-1 text-xs opacity-50">F</kbd>
          </button>
        )}

        {canCheck && (
          <button
            onClick={() => sendAction('check')}
            className="action-btn bg-blue-700 hover:bg-blue-600 text-white min-w-[80px]"
          >
            过牌 <kbd className="ml-1 text-xs opacity-50">C</kbd>
          </button>
        )}

        {canCall && (
          <button
            onClick={() => sendAction('call')}
            className="action-btn bg-blue-700 hover:bg-blue-600 text-white min-w-[80px]"
          >
            跟注 {turn.callAmount} <kbd className="ml-1 text-xs opacity-50">C</kbd>
          </button>
        )}

        {canRaise && (
          <button
            onClick={() => {
              if (showRaiseSlider) {
                sendAction('raise', raiseAmount);
                setShowRaiseSlider(false);
              } else {
                setShowRaiseSlider(true);
              }
            }}
            className={`action-btn min-w-[80px] ${showRaiseSlider ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-yellow-700 hover:bg-yellow-600'} text-white`}
          >
            {showRaiseSlider ? `加注 ${raiseAmount}` : '加注'} <kbd className="ml-1 text-xs opacity-50">R</kbd>
          </button>
        )}

        {canAllin && (
          <button
            onClick={() => sendAction('allin')}
            className="action-btn bg-red-700 hover:bg-red-600 text-white min-w-[80px]"
          >
            全押 <kbd className="ml-1 text-xs opacity-50">A</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
