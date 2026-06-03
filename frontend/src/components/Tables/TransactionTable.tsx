import { Transaction } from '../../types';
import { StatusBadge } from './StatusBadge';
import { TableSkeleton } from '../Skeletons/TableSkeleton';
import { EmptyState } from '../EmptyState';

interface Props {
  transactions: Transaction[];
  loading:      boolean;
  showTenant?:  boolean;
  showMetadata?: boolean;
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

export function TransactionTable({ transactions, loading, showTenant = false, showMetadata = false }: Props) {
  if (loading) return <TableSkeleton rows={10} cols={showTenant ? 5 : (showMetadata ? 6 : 4)} />;

  if (transactions.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="overflow-x-auto">
      <table id="transaction-table" className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
            <th className="px-4 py-3 text-left font-medium">Transaction ID</th>
            {showTenant && <th className="px-4 py-3 text-left font-medium">Tenant</th>}
            {showMetadata && <th className="px-4 py-3 text-left font-medium">Customer</th>}
            {showMetadata && <th className="px-4 py-3 text-left font-medium">Location</th>}
            <th className="px-4 py-3 text-right font-medium">Amount</th>
            <th className="px-4 py-3 text-center font-medium">Status</th>
            <th className="px-4 py-3 text-left font-medium">Timestamp</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {transactions.map((txn) => (
            <tr
              key={txn.id}
              className="hover:bg-zinc-800/30 transition-colors duration-100 group"
            >
              <td className="px-4 py-3 font-mono text-xs text-zinc-400 group-hover:text-zinc-300">
                {txn.id.substring(0, 8)}…{txn.id.substring(28)}
              </td>
              {showTenant && (
                <td className="px-4 py-3 font-mono text-xs text-blue-400">
                  {txn.tenant_id}
                </td>
              )}
              {showMetadata && (
                <td className="px-4 py-3 text-xs text-zinc-300 font-medium">
                  {txn.customer_name || 'N/A'}
                </td>
              )}
              {showMetadata && (
                <td className="px-4 py-3 text-xs text-zinc-500 font-mono">
                  {txn.location || 'N/A'}
                </td>
              )}
              <td className="px-4 py-3 text-right font-mono text-zinc-200 tabular-nums">
                {formatAmount(Number(txn.amount))}
              </td>
              <td className="px-4 py-3 text-center">
                <StatusBadge status={txn.status} />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                {formatDate(txn.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
