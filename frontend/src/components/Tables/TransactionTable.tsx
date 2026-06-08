import { Transaction } from '../../types';
import { StatusBadge } from './StatusBadge';
import { TableSkeleton } from '../Skeletons/TableSkeleton';
import { EmptyState } from '../EmptyState';

interface Props {
  transactions: Transaction[];
  loading:      boolean;
  showTenant?:  boolean;
  showMetadata?: boolean;
  onQuickReview?: (txnId: string) => void;
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style:    'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month:   'short',
    day:     '2-digit',
    hour:    '2-digit',
    minute:  '2-digit',
    second:  '2-digit',
    hour12:  false,
  }).format(new Date(iso));
}

export function TransactionTable({ transactions, loading, showTenant = false, showMetadata = false, onQuickReview }: Props) {
  if (loading) return <TableSkeleton rows={10} cols={showTenant ? 5 : (showMetadata ? 8 : 4)} />;

  if (transactions.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="overflow-x-auto">
      <table id="transaction-table" className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-medium">
            <th className="px-4 py-3 text-left">Transaction ID</th>
            {showTenant && <th className="px-4 py-3 text-left">Tenant</th>}
            {showMetadata && <th className="px-4 py-3 text-left">Customer</th>}
            {showMetadata && <th className="px-4 py-3 text-left">Location</th>}
            {showMetadata && <th className="px-4 py-3 text-left">Bank / Merchant</th>}
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3 text-center">Status</th>
            <th className="px-4 py-3 text-left">Timestamp</th>
            {showMetadata && <th className="px-4 py-3 text-center">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200/50 dark:divide-zinc-800/50">
          {transactions.map((txn) => (
            <tr
              key={txn.id}
              className="hover:bg-zinc-50 dark:hover:bg-zinc-800/10 transition-colors duration-100 group"
            >
              <td className="px-4 py-3 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                {txn.id.substring(0, 8)}…{txn.id.substring(28)}
              </td>
              {showTenant && (
                <td className="px-4 py-3 font-mono text-xs text-blue-600 dark:text-blue-400">
                  {txn.tenant_id}
                </td>
              )}
              {showMetadata && (
                <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                  {txn.customer_name || 'N/A'}
                </td>
              )}
              {showMetadata && (
                <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-500 font-mono">
                  {txn.location || 'N/A'}
                </td>
              )}
              {showMetadata && (
                <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                  {txn.merchant_name || 'N/A'}
                </td>
              )}
              <td className="px-4 py-3 text-right font-mono text-xs text-zinc-800 dark:text-zinc-200 tabular-nums font-semibold">
                {formatAmount(Number(txn.amount))}
              </td>
              <td className="px-4 py-3 text-center">
                <div className="flex flex-col items-center justify-center gap-0.5">
                  <StatusBadge status={txn.status} />
                  {(txn.status === 'FLAGGED' || txn.status === 'SUSPICIOUS') && txn.reviewed_by && (
                    <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/5 px-1.5 py-0.5 border border-amber-500/10 rounded mt-0.5 whitespace-nowrap">
                      Pending Admin
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                {formatDate(txn.created_at)}
              </td>
              {showMetadata && (
                <td className="px-4 py-3 text-center">
                  {onQuickReview && (
                    <button
                      onClick={() => onQuickReview(txn.id)}
                      className="text-[10px] px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40 text-blue-600 dark:text-blue-400 rounded font-semibold transition-all"
                    >
                      Review
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
