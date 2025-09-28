import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logging.level,
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: { translateTime: 'SYS:standard', colorize: true }
  } : undefined,
});

export default logger;

