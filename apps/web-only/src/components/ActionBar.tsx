import { useState, useEffect, useCallback } from 'react'
import type { LegalAction } from '../engine/handState'
import TimerBar from './TimerBar'

interface ActionBarProps {
  legalActions: LegalAction[]
  pot: number
  myChips: number
  timeoutAt: number | null
  timeoutSec: number
  onAction: (action: string, amount?: number) => void
}

export default function ActionBar({
  legalActions,
  pot,
  myChips,
  timeoutAt,
  timeoutSec,
  onAction,
}: ActionBarProps) {
  const [showRaiseSheet, setShowRaiseSheet] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState(0)

  const canFold = legalActions.some(a => a.type === 'fold')
  const canCheck = legalActions.some(a => a.type === 'check')
  const callAction = legalActions.find(a => a.type === 'call')
  const raiseAction = legalActions.find(a => a.type === 'raise')
  const canAllin = legalActions.some(a => a.type === 'allin')

  const minRaise = raiseAction?.minAmount ?? 0
  const maxRaise = raiseAction?.maxAmount ?? myChips

  useEffect(() => {
    setRaiseAmount(minRaise)
  }, [minRaise])

  const handleRaise = useCallback(() => {
    if (raiseAmount >= minRaise && raiseAmount <= maxRaise) {
      onAction('raise', raiseAmount)
      setShowRaiseSheet(false)
    }
  }, [raiseAmount, minRaise, maxRaise, onAction])

  // 快捷按钮金额
  const halfPot = Math.min(Math.floor(pot / 2), maxRaise)
  const twothirdPot = Math.min(Math.floor(pot * 2 / 3), maxRaise)
  const fullPot = Math.min(pot, maxRaise)

  // 键盘快捷键
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (showRaiseSheet) {
        if (e.key === 'Escape') setShowRaiseSheet(false)
        if (e.key === 'Enter') handleRaise()
        return
      }
      if (e.key === 'f' || e.key === 'F') canFold && onAction('fold')
      if (e.key === 'c' || e.key === 'C') {
        if (canCheck) onAction('check')
        else if (callAction) onAction('call')
      }
      if (e.key === 'r' || e.key === 'R') raiseAction && setShowRaiseSheet(true)
      if (e.key === 'a' || e.key === 'A') canAllin && onAction('allin')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [canFold, canCheck, callAction, raiseAction, canAllin, onAction, showRaiseSheet, handleRaise])

  return (
    <>
      <div className="bg-slate-900/95 backdrop-blur border-t border-slate-700 p-3 safe-bottom">
        <TimerBar timeoutAt={timeoutAt} totalSec={timeoutSec} />

        <div className="flex gap-2 mt-3">
          {canFold && (
            <button
              onClick={() => onAction('fold')}
              className="flex-1 py-3 bg-slate-700 hover:bg-red-900 text-red-300 font-bold rounded-xl text-sm transition-colors"
            >
              弃牌 <span className="text-xs opacity-50">F</span>
            </button>
          )}

          {canCheck && (
            <button
              onClick={() => onAction('check')}
              className="flex-1 py-3 bg-slate-700 hover:bg-blue-800 text-blue-300 font-bold rounded-xl text-sm transition-colors"
            >
              过牌 <span className="text-xs opacity-50">C</span>
            </button>
          )}

          {callAction && (
            <button
              onClick={() => onAction('call')}
              className="flex-1 py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl text-sm transition-colors"
            >
              跟注 {callAction.minAmount}
              <span className="text-xs opacity-50 ml-1">C</span>
            </button>
          )}

          {raiseAction && (
            <button
              onClick={() => setShowRaiseSheet(true)}
              className="flex-1 py-3 bg-orange-700 hover:bg-orange-600 text-white font-bold rounded-xl text-sm transition-colors"
            >
              加注 <span className="text-xs opacity-50">R</span>
            </button>
          )}

          {canAllin && (
            <button
              onClick={() => onAction('allin')}
              className="flex-1 py-3 bg-red-700 hover:bg-red-600 text-white font-bold rounded-xl text-sm transition-colors"
            >
              全押 <span className="text-xs opacity-50">A</span>
            </button>
          )}
        </div>
      </div>

      {/* Raise Bottom Sheet */}
      {showRaiseSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowRaiseSheet(false)}>
          <div
            className="w-full bg-slate-800 rounded-t-2xl p-5 pb-8 max-h-[70vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mb-5" />
            <h3 className="text-white font-bold text-lg mb-4">设置加注金额</h3>

            {/* 金额输入 */}
            <div className="flex items-center gap-3 mb-4">
              <input
                type="number"
                value={raiseAmount}
                min={minRaise}
                max={maxRaise}
                onChange={e => setRaiseAmount(Math.min(maxRaise, Math.max(minRaise, Number(e.target.value))))}
                className="input-field text-center text-xl font-bold flex-1"
              />
            </div>

            {/* 滑块 */}
            <input
              type="range"
              min={minRaise}
              max={maxRaise}
              value={raiseAmount}
              onChange={e => setRaiseAmount(Number(e.target.value))}
              className="w-full accent-yellow-400 mb-4"
            />
            <div className="flex justify-between text-xs text-slate-400 mb-5">
              <span>最小 {minRaise}</span>
              <span>全押 {maxRaise}</span>
            </div>

            {/* 快捷按钮 */}
            <div className="grid grid-cols-4 gap-2 mb-5">
              {halfPot >= minRaise && (
                <button
                  onClick={() => setRaiseAmount(halfPot)}
                  className="py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg font-medium transition-colors"
                >
                  ½池<br /><span className="text-slate-400">{halfPot}</span>
                </button>
              )}
              {twothirdPot >= minRaise && (
                <button
                  onClick={() => setRaiseAmount(twothirdPot)}
                  className="py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg font-medium transition-colors"
                >
                  ⅔池<br /><span className="text-slate-400">{twothirdPot}</span>
                </button>
              )}
              {fullPot >= minRaise && (
                <button
                  onClick={() => setRaiseAmount(fullPot)}
                  className="py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg font-medium transition-colors"
                >
                  底池<br /><span className="text-slate-400">{fullPot}</span>
                </button>
              )}
              <button
                onClick={() => setRaiseAmount(maxRaise)}
                className="py-2 bg-red-900 hover:bg-red-800 text-red-300 text-xs rounded-lg font-medium transition-colors"
              >
                全押<br /><span className="text-slate-400">{maxRaise}</span>
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowRaiseSheet(false)}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleRaise}
                disabled={raiseAmount < minRaise || raiseAmount > maxRaise}
                className="flex-2 flex-grow-[2] py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
              >
                确认加注 {raiseAmount}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
