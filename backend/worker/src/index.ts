import logger from './logger';
import { startWorker } from './processor';

process.env.SERVICE_NAME = 'worker';

logger.info('Risk Worker service starting');

process.on('SIGTERM', () => {
  logger.info('Worker received SIGTERM — shutting down gracefully');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection in worker');
  process.exit(1);
});

startWorker();
