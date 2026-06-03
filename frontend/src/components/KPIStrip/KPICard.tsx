interface Props {
  label:     string;
  value:     string | number;
  sub?:      string;
  accent?:   'blue' | 'green' | 'amber' | 'red' | 'zinc';
}

const accentMap = {
  blue:  'text-blue-400',
  green: 'text-emerald-400',
  amber: 'text-amber-400',
  red:   'text-red-400',
  zinc:  'text-zinc-300',
};

export function KPICard({ label, value, sub, accent = 'zinc' }: Props) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex flex-col gap-1">
      <span className="text-xs text-zinc-500 uppercase tracking-widest font-medium">{label}</span>
      <span className={`text-2xl font-mono font-semibold tabular-nums ${accentMap[accent]}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-zinc-600">{sub}</span>}
    </div>
  );
}
