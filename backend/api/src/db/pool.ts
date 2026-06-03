import { Pool } from 'pg';
import logger from '../logger';

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432', 10),
      user:     process.env.DB_USER     || 'api_service',
      password: process.env.DB_PASS     || 'api_service_pass',
      database: process.env.DB_NAME     || 'risk_engine',
      max:      20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('connect', () => logger.info('API: DB connection established'));
    pool.on('error',   (err) => logger.error({ err }, 'API: DB pool error'));
  }
  return pool;
}
