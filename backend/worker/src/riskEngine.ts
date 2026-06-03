import { QueueJob, TransactionStatus } from './types';
import logger from './logger';

interface RiskResult {
  status: TransactionStatus;
  reason: string;
}

/**
 * Deterministic + probabilistic risk evaluation.
 *
 * Rules (in priority order):
 * 1. Amount > 100,000  → REJECTED  (exceeds hard limit)
 * 2. Amount > 10,000   → FLAGGED   (high-value — needs review)
 * 3. Amount > 5,000    → 30% chance FLAGGED, else APPROVED
 * 4. Otherwise         → 5% chance FLAGGED, 3% chance REJECTED, else APPROVED
 */
export function evaluateRisk(job: QueueJob): RiskResult {
  const { amount } = job;

  if (amount > 100_000) {
    return { status: TransactionStatus.REJECTED, reason: 'Exceeds hard transaction limit (>100,000)' };
  }

  if (amount > 10_000) {
    return { status: TransactionStatus.FLAGGED, reason: 'High-value transaction requires manual review (>10,000)' };
  }

  if (amount > 5_000) {
    const roll = Math.random();
    if (roll < 0.30) {
      return { status: TransactionStatus.FLAGGED, reason: 'Mid-high value with elevated risk score (>5,000)' };
    }
    return { status: TransactionStatus.APPROVED, reason: 'Mid-high value passed automated checks' };
  }

  // Normal range — mostly approved, small random noise
  const roll = Math.random();
  if (roll < 0.03) {
    return { status: TransactionStatus.REJECTED, reason: 'Rejected by probabilistic fraud model' };
  }
  if (roll < 0.08) {
    return { status: TransactionStatus.FLAGGED, reason: 'Flagged by anomaly detector' };
  }
  return { status: TransactionStatus.APPROVED, reason: 'Passed all risk checks' };
}
