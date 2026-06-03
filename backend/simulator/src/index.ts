import logger from './logger';
import { runSimulator } from './generator';

const INTERVAL_MS = parseInt(process.env.SIMULATE_INTERVAL_MS || '3000', 10);

process.env.SERVICE_NAME = 'simulator';

logger.info({ interval_ms: INTERVAL_MS }, 'Simulator service starting');

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Simulator received SIGTERM — shutting down gracefully');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection in simulator');
  process.exit(1);
});

runSimulator(INTERVAL_MS);
