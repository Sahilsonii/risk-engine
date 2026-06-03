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
  zinc:  'text-zinc-700 dark:text-zinc-300',
};

export function KPICard({ label, value, sub, accent = 'zinc', infoText, loadingInfo = false }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 flex flex-col gap-1 relative shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-medium">{label}</span>
        {infoText && (
          <div
            className="relative flex items-center justify-center cursor-help text-zinc-400 dark:text-zinc-650 hover:text-zinc-650 dark:hover:text-zinc-400 transition-colors p-1.5 -m-1.5"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <Info size={12} />
            
            {showTooltip && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-60 p-2.5 bg-white dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-xl text-left pointer-events-none z-[100] backdrop-blur-sm transition-all duration-200">
                <div className="flex flex-col gap-1">
                  <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">AI Insight</div>
                  {loadingInfo ? (
                    <div className="flex flex-col gap-1.5 py-1">
                      <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse w-full" />
                      <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse w-5/6" />
                    </div>
                  ) : (
                    <p className="text-[11px] font-sans font-normal text-zinc-600 dark:text-zinc-300 leading-relaxed normal-case tracking-normal">
                      {infoText}
                    </p>
                  )}
                </div>
                {/* Tooltip triangle */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-white dark:border-t-zinc-900" />
              </div>
            )}
          </div>
        )}
      </div>
      <span className={`text-2xl font-mono font-semibold tabular-nums ${accentMap[accent]}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-zinc-400 dark:text-zinc-600">{sub}</span>}
    </div>
  );
}
