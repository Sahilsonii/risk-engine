import { getPool } from './db/pool';
import { getRedisClient } from './redis/client';
import { evaluateRisk } from './riskEngine';
import { QueueJob, TransactionStatus } from './types';
import logger from './logger';

const QUEUE_KEY         = 'transactions:queue';
const RECENT_CACHE_KEY  = 'transactions:recent';
const RECENT_CACHE_SIZE = 50;
const PROCESSING_DELAY_MS = 2000;

async function processJob(raw: string): Promise<void> {
  let job: QueueJob;

  try {
    job = JSON.parse(raw);
  } catch (err) {
    logger.error({ raw, err }, 'Failed to parse job from queue — discarding');
    return;
  }

  logger.info(
    { txn_id: job.id, tenant: job.tenant_id, amount: job.amount },
    'Job received from queue'
  );

  // Simulate processing time (risk evaluation takes time in real systems)
  logger.debug({ txn_id: job.id }, 'Risk evaluation started — simulating delay');
  await new Promise(resolve => setTimeout(resolve, PROCESSING_DELAY_MS));

  // Evaluate risk
  const { status, reason } = evaluateRisk(job);
  logger.info({ txn_id: job.id, status, reason }, 'Risk result assigned');

  const pool = getPool();
  const redis = await getRedisClient();

  // Update PostgreSQL — worker is a trusted internal process, uses app_admin role
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE app_admin');
      await client.query(
        `UPDATE transactions SET status = $1 WHERE id = $2`,
        [status, job.id]
      );
      await client.query('COMMIT');
      logger.debug({ txn_id: job.id, status }, 'DB record updated successfully');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ txn_id: job.id, err }, 'DB update failed — rolled back');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ txn_id: job.id, err }, 'Critical: failed to update transaction in DB');
    return;
  }

  // Update Redis recent-activity cache (optional read cache for dashboard)
  try {
    const cacheEntry = JSON.stringify({
      id:            job.id,
      tenant_id:     job.tenant_id,
      amount:        job.amount,
      status,
      created_at:    job.timestamp,
      customer_name: job.customer_name,
      location:      job.location,
      merchant_name: job.merchant_name,
    });
    // Push to head of list, trim to last N items
    await redis.lPush(RECENT_CACHE_KEY, cacheEntry);
    await redis.lTrim(RECENT_CACHE_KEY, 0, RECENT_CACHE_SIZE - 1);
    // Set TTL of 1 hour on the cache list
    await redis.expire(RECENT_CACHE_KEY, 3600);
    logger.debug({ txn_id: job.id }, 'Redis recent-activity cache updated');
  } catch (err) {
    // Non-fatal — cache miss is acceptable, dashboard falls back to DB
    logger.warn({ txn_id: job.id, err }, 'Redis cache update failed — non-fatal');
  }

  logger.info({ txn_id: job.id, status }, 'Job completed successfully');
}

export async function startWorker(): Promise<void> {
  logger.info('Waiting 3s for connection warmup...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  const redis = await getRedisClient();
  logger.info({ queue: QUEUE_KEY }, 'Worker queue listener attached — blocking pop active');

  // Blocking pop loop — waits indefinitely for the next job
  while (true) {
    try {
      // BRPOP blocks until a job arrives (timeout 0 = block forever)
      const result = await redis.brPop(QUEUE_KEY, 0);
      if (result) {
        await processJob(result.element);
      }
    } catch (err) {
      logger.error({ err }, 'Error in worker loop — retrying in 2s');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}
