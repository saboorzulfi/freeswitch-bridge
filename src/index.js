import { logger } from './core/logger.js';
import { startServer } from './server.js';

startServer().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});

