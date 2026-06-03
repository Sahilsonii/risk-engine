import { RefreshCw } from 'lucide-react';

interface Props {
  title:        string;
  subtitle:     string;
  lastUpdated:  Date;
  onRefresh:    () => void;
}

export function TopBar({ title, subtitle, lastUpdated, onRefresh }: Props) {
  return (
    <div id="topbar" className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">{title}</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          {subtitle} · Last updated:{' '}
          <span className="font-mono">{lastUpdated.toLocaleTimeString()}</span>
          <span className="ml-2 inline-flex items-center gap-1 text-emerald-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </p>
      </div>
      <button
        id="refresh-btn"
        onClick={onRefresh}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-md hover:border-zinc-600 transition-colors"
      >
        <RefreshCw size={12} />
        Refresh
      </button>
    </div>
  );
}
