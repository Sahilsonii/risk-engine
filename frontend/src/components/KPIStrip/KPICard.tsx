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

const accentGlow: Record<string, string> = {
  blue:  'rgba(59,130,246,0.08)',
  green: 'rgba(16,185,129,0.08)',
  amber: 'rgba(245,158,11,0.08)',
  red:   'rgba(239,68,68,0.08)',
  zinc:  'rgba(113,113,122,0.05)',
};

export function KPICard({ label, value, sub, accent = 'zinc', infoText, loadingInfo = false }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="relative flex flex-col gap-1 p-4 rounded-xl transition-all duration-300 group"
      style={{
        background: `linear-gradient(135deg, rgba(255,255,255,0.70) 0%, rgba(255,255,255,0.50) 100%)`,
        backdropFilter: 'blur(16px) saturate(160%)',
        WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.45)',
        boxShadow: `0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)`,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          `0 8px 32px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.7), 0 0 0 1px rgba(255,255,255,0.25)`;
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          `0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)`;
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Dark mode overlay */}
      <div
        className="absolute inset-0 rounded-xl dark:block hidden pointer-events-none"
        style={{
          background: `linear-gradient(135deg, rgba(24,24,27,0.75) 0%, rgba(24,24,27,0.60) 100%)`,
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      />
      {/* Accent glow behind value */}
      <div
        className="absolute bottom-0 left-4 right-4 h-12 rounded-b-xl pointer-events-none"
        style={{ background: accentGlow[accent], filter: 'blur(12px)', opacity: 0.7 }}
      />

      <div className="relative flex items-center justify-between">
        <span className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase tracking-widest font-semibold">{label}</span>
        {infoText && (
          <div
            className="relative flex items-center justify-center cursor-help text-zinc-400 dark:text-zinc-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors p-1.5 -m-1.5"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <Info size={12} />
            {showTooltip && (
              <div
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 p-3 rounded-xl text-left pointer-events-none z-[100]"
                style={{
                  background: 'rgba(255,255,255,0.90)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  border: '1px solid rgba(255,255,255,0.5)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">AI Insight</div>
                  {loadingInfo ? (
                    <div className="flex flex-col gap-1.5 py-1">
                      <div className="h-2 bg-zinc-200 rounded animate-pulse w-full" />
                      <div className="h-2 bg-zinc-200 rounded animate-pulse w-5/6" />
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-700 leading-relaxed normal-case tracking-normal font-sans font-normal">
                      {infoText}
                    </p>
                  )}
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-white/90" />
              </div>
            )}
          </div>
        )}
      </div>

      <span className={`relative text-2xl font-mono font-semibold tabular-nums ${accentMap[accent]}`}>
        {value}
      </span>
      {sub && <span className="relative text-[11px] text-zinc-400 dark:text-zinc-600 font-medium">{sub}</span>}
    </div>
  );
}
