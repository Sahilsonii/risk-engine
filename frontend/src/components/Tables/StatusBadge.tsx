import { TransactionStatus } from '../../types';
import { CheckCircle, AlertTriangle, XCircle, Clock, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';

const config: Record<TransactionStatus, {
  label: string;
  icon:  React.ReactNode;
  cls:   string;
}> = {
  [TransactionStatus.APPROVED]: {
    label: 'Approved',
    icon:  <CheckCircle size={11} />,
    cls:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  [TransactionStatus.REJECTED]: {
    label: 'Rejected',
    icon:  <XCircle size={11} />,
    cls:   'bg-red-500/10 text-red-400 border-red-500/20',
  },
  [TransactionStatus.FLAGGED]: {
    label: 'Flagged',
    icon:  <AlertTriangle size={11} />,
    cls:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  [TransactionStatus.SUSPICIOUS]: {
    label: 'Suspicious',
    icon:  <ShieldAlert size={11} />,
    cls:   'bg-pink-500/10 text-pink-400 border-pink-500/20',
  },
  [TransactionStatus.PENDING]: {
    label: 'Pending',
    icon:  <Clock size={11} />,
    cls:   'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  },
};

export function StatusBadge({ status }: { status: TransactionStatus }) {
  const { label, icon, cls } = config[status] ?? config[TransactionStatus.PENDING];
  return (
    <span
      id={`status-badge-${status.toLowerCase()}`}
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        cls
      )}
    >
      {icon}
      {label}
    </span>
  );
}
