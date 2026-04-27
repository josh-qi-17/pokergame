interface ChipStackProps {
  amount: number;
  label?: string;
  className?: string;
}

function getChipColors(amount: number): string[] {
  if (amount >= 1000) return ['bg-chip-black', 'bg-chip-black', 'bg-chip-black'];
  if (amount >= 500) return ['bg-purple-700', 'bg-chip-black'];
  if (amount >= 100) return ['bg-chip-black', 'bg-chip-red'];
  if (amount >= 50) return ['bg-chip-blue', 'bg-chip-red'];
  if (amount >= 25) return ['bg-chip-green', 'bg-chip-blue'];
  if (amount >= 10) return ['bg-chip-blue'];
  if (amount >= 5) return ['bg-chip-red'];
  return ['bg-chip-white'];
}

export default function ChipStack({ amount, label, className = '' }: ChipStackProps) {
  if (amount <= 0) return null;

  const colors = getChipColors(amount);

  return (
    <div className={`flex flex-col items-center gap-0.5 ${className}`}>
      <div className="chip-stack">
        {colors.map((color, i) => (
          <div
            key={i}
            className={`w-6 h-2 ${color} rounded-full border border-white/20 shadow-sm`}
            style={{ marginBottom: i < colors.length - 1 ? '-2px' : '0' }}
          />
        ))}
      </div>
      <span className="text-xs font-bold text-yellow-400 tabular-nums">
        {label ?? formatChips(amount)}
      </span>
    </div>
  );
}

export function formatChips(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return String(amount);
}
