import { useEffect, useState } from 'react'

interface TimerBarProps {
  timeoutAt: number | null
  totalSec: number
}

export default function TimerBar({ timeoutAt, totalSec }: TimerBarProps) {
  const [remaining, setRemaining] = useState(1)

  useEffect(() => {
    if (!timeoutAt) {
      setRemaining(1)
      return
    }
    const update = () => {
      const now = Date.now()
      const left = Math.max(0, timeoutAt - now)
      setRemaining(left / (totalSec * 1000))
    }
    update()
    const id = setInterval(update, 200)
    return () => clearInterval(id)
  }, [timeoutAt, totalSec])

  const isLow = remaining < 0.33
  const pct = Math.round(remaining * 100)

  return (
    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-200 ${
          isLow ? 'bg-red-500' : 'bg-green-400'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
