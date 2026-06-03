import { v4 as uuidv4 } from 'uuid';
import { getPool } from './db/pool';
import { getRedisClient } from './redis/client';
import { TransactionStatus, QueueJob } from './types';
import logger from './logger';

// Fixed tenant pool — 5 merchants
const TENANTS = [
  'merchant_alpha',
  'merchant_beta',
  'merchant_gamma',
  'merchant_delta',
  'merchant_epsilon',
];

const CUSTOMERS = [
  'John Doe', 'Jane Smith', 'Michael Johnson', 'Emily Davis', 'David Miller',
  'Sarah Wilson', 'James Taylor', 'Jessica Anderson', 'Robert Thomas', 'Karen Jackson',
  'Sahil Soni', 'Alex Mercer', 'Evelyn Carter', 'Marcus Vance', 'Diana Prince',
  'Thomas Shelby', 'Bruce Wayne', 'Peter Parker', 'Tony Stark', 'Clark Kent'
];

const LOCATIONS = [
  'Mumbai, India', 'New York, USA', 'London, UK', 'Tokyo, Japan', 'Singapore',
  'Sydney, Australia', 'Berlin, Germany', 'Paris, France', 'Dubai, UAE', 'Toronto, Canada',
  'Delhi, India', 'San Francisco, USA', 'Bangalore, India', 'Amsterdam, Netherlands'
];

const MERCHANT_NAMES: Record<string, string> = {
  merchant_alpha: 'Alpha Retailers',
  merchant_beta: 'Beta Electronics',
  merchant_gamma: 'Gamma Foods',
  merchant_delta: 'Delta Logistics',
  merchant_epsilon: 'Epsilon Tech',
};

// Amount ranges: mix of normal, high-value, suspicious
const AMOUNT_RANGES = [
  { min: 1,     max: 500,    weight: 60 },   // 60% — normal transactions
  { min: 500,   max: 5000,   weight: 25 },   // 25% — mid-range
  { min: 5000,  max: 50000,  weight: 10 },   // 10% — high value (likely flagged)
  { min: 50000, max: 500000, weight: 5  },   // 5%  — very high (likely rejected)
];

function weightedRandomAmount(): number {
  const totalWeight = AMOUNT_RANGES.reduce((s, r) => s + r.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const range of AMOUNT_RANGES) {
    rand -= range.weight;
    if (rand <= 0) {
      return parseFloat(
        (Math.random() * (range.max - range.min) + range.min).toFixed(2)
      );
    }
  }
  return 100.00;
}

function randomTenant(): string {
  return TENANTS[Math.floor(Math.random() * TENANTS.length)];
}

async function generateAndPublish(): Promise<void> {
  const pool   = getPool();
  const client = await getRedisClient();

  const tenant = randomTenant();
  const customerName = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
  const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  const merchantName = MERCHANT_NAMES[tenant] || 'Unknown Merchant';

  const job: QueueJob = {
    id:            uuidv4(),
    tenant_id:     tenant,
    amount:        weightedRandomAmount(),
    timestamp:     new Date().toISOString(),
    customer_name: customerName,
    location:      location,
    merchant_name: merchantName,
  };

  logger.info(
    { txn_id: job.id, tenant: job.tenant_id, amount: job.amount, customer: job.customer_name },
    'Transaction generated'
  );

  // Step 1: Write PENDING record to PostgreSQL immediately
  // Simulator is a trusted internal process — uses app_admin role
  try {
    await pool.query('SET ROLE app_admin');
    await pool.query(
      `INSERT INTO transactions (id, tenant_id, amount, status, customer_name, location, merchant_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        job.id,
        job.tenant_id,
        job.amount,
        TransactionStatus.PENDING,
        job.customer_name,
        job.location,
        job.merchant_name
      ]
    );
    await pool.query('RESET ROLE');

    logger.debug({ txn_id: job.id }, 'PENDING record written to PostgreSQL');
  } catch (err) {
    logger.error({ txn_id: job.id, err }, 'Failed to write PENDING record to DB');
    throw err;
  }

  // Step 2: Publish job to Redis queue
  try {
    await client.lPush('transactions:queue', JSON.stringify(job));
    logger.info({ txn_id: job.id, queue: 'transactions:queue' }, 'Job published to Redis queue');
  } catch (err) {
    logger.error({ txn_id: job.id, err }, 'Failed to publish job to Redis');
    throw err;
  }
}

export async function runSimulator(intervalMs: number): Promise<void> {
  // Initial wait for DB + Redis to be ready (Docker healthchecks should handle this,
  // but add a small buffer for connection pool warmup)
  logger.info('Waiting 3s for connection warmup...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  logger.info({ interval_ms: intervalMs }, 'Starting transaction generation loop');

  // Run immediately, then on interval
  const tick = async () => {
    try {
      await generateAndPublish();
    } catch (err) {
      logger.error({ err }, 'Error in simulation tick — will retry next interval');
    }
  };

  await tick();
  setInterval(tick, intervalMs);
}
