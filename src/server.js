import express from 'express';
import { logger } from './core/logger.js';
import { connectMongo } from './core/mongo.js';
import { eslClient } from './core/esl.js';
import { buildRoutes } from './routes/index.js';

export async function createServer() {
  const app = express();
  app.use(express.json());
  app.use(buildRoutes());
  return app;
}

export async function startServer() {
  await connectMongo();
  await eslClient.connect();
  const app = await createServer();
  const port = process.env.PORT || 3000;
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      logger.info({ port }, 'API server listening');
      resolve(server);
    });
  });
}

export default startServer;

