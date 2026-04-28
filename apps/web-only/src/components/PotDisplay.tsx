import type { SidePot } from '../peer/protocol'

interface PotDisplayProps {
  pot: number
  sidePots: SidePot[]
}

export default function PotDisplay({ pot, sidePots }: PotDisplayProps) {
  const hasMultiplePots = sidePots.length > 1

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="bg-black/40 rounded-full px-4 py-1 flex items-center gap-2">
        <span className="text-yellow-400 text-xs">底池</span>
        <span className="text-white font-bold text-sm">{pot}</span>
      </div>
      {hasMultiplePots && (
        <div className="flex flex-wrap gap-1 justify-center">
          {sidePots.map((sp, i) => (
            <div key={i} className="bg-black/30 rounded-full px-2 py-0.5 text-xs text-slate-300">
              边池{i + 1}: {sp.amount}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
