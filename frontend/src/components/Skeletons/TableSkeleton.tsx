interface Props { rows: number; cols: number; }

export function TableSkeleton({ rows, cols }: Props) {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-20" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-zinc-150 dark:border-zinc-800/50">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-3 bg-zinc-200/60 dark:bg-zinc-800/70 rounded"
              style={{ width: `${60 + Math.random() * 40}px` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
