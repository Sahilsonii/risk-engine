import { useState } from 'react';
import { RefreshCw, Sun, Moon } from 'lucide-react';

interface Props {
  title:        string;
  subtitle:     string;
  lastUpdated:  Date;
  onRefresh:    () => void;
}

export function TopBar({ title, subtitle, lastUpdated, onRefresh }: Props) {
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark') || !document.documentElement.classList.contains('light');
  });

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  return (
    <div id="topbar" className="flex items-center justify-between mb-6 border-b border-zinc-200/50 dark:border-zinc-900 pb-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">{title}</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          {subtitle} · Last updated:{' '}
          <span className="font-mono">{lastUpdated.toLocaleTimeString()}</span>
          <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-500 animate-pulse" />
            Live
          </span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          id="theme-toggle-btn"
          onClick={toggleTheme}
          className="flex items-center justify-center p-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-md hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDark ? <Sun size={12} /> : <Moon size={12} />}
        </button>
        <button
          id="refresh-btn"
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-md hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>
    </div>
  );
}
