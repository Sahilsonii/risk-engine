import { Inbox } from 'lucide-react';

export function EmptyState() {
  return (
    <div
      id="empty-state"
      className="flex flex-col items-center justify-center py-20 text-zinc-500"
    >
      <div className="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4">
        <Inbox size={20} className="text-zinc-600" />
      </div>
      <p className="text-sm font-medium text-zinc-400">No transactions found</p>
      <p className="text-xs mt-1 text-zinc-600">
        Transactions will appear here as they are processed by the risk engine
      </p>
    </div>
  );
}
