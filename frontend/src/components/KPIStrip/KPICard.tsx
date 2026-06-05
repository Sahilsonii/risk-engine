import { useState } from 'react';
import { Info } from 'lucide-react';

interface Props {
  label:       string;
  value:       string | number;
  sub?:        string;
  accent?:     'blue' | 'green' | 'amber' | 'red' | 'zinc';
  infoText?:   string;
  loadingInfo?: boolean;
}

const accentMap = {
  blue:  'text-blue-600 dark:text-blue-400',
  green: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red:   'text-red-600 dark:text-red-400',
  zinc:  'text-zinc-700 dark:text-zinc-200',
};

export function KPICard({ label, value, sub, accent = 'zinc', infoText, loadingInfo = false }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={[
        'relative flex flex-col gap-1 p-4 rounded-xl transition-all duration-300',
        // Light mode: frosted white glass
        'bg-white/70 backdrop-blur-xl border border-white/50 shadow-sm',
        // Dark mode: dark zinc glass — matches transaction history
        'dark:bg-zinc-900/70 dark:border-zinc-700/40 dark:shadow-none',
        hovered ? 'dark:border-zinc-600/60 -translate-y-px' : '',
      ].join(' ')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Subtle inset top-highlight (light mode only) */}
      <div className="absolute inset-x-0 top-0 h-px rounded-t-xl bg-white/80 dark:bg-white/5 pointer-events-none" />

      <div className="relative flex items-center justify-between">
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-semibold">
          {label}
        </span>
        {infoText && (
          <div
            className="relative flex items-center justify-center cursor-help text-zinc-400 dark:text-zinc-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors p-1.5 -m-1.5"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <Info size={12} />
            {showTooltip && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 p-3 rounded-xl text-left pointer-events-none z-[100] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl backdrop-blur-xl">
                <div className="flex flex-col gap-1.5">
                  <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                    AI Insight
                  </div>
                  {loadingInfo ? (
                    <div className="flex flex-col gap-1.5 py-1">
                      <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse w-full" />
                      <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse w-5/6" />
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-relaxed normal-case tracking-normal font-sans font-normal">
                      {infoText}
                    </p>
                  )}
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-white dark:border-t-zinc-900" />
              </div>
            )}
          </div>
        )}
      </div>

      <span className={`relative text-2xl font-mono font-bold tabular-nums ${accentMap[accent]}`}>
        {value}
      </span>
      {sub && (
        <span className="relative text-[11px] text-zinc-400 dark:text-zinc-600 font-medium">
          {sub}
        </span>
      )}
    </div>
  );
}
