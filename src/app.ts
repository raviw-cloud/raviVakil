import express, { type Express } from 'express';
import path from 'path';
import { analyzeRouter } from './routes/analyze.routes';
import { resultsRouter } from './routes/results.routes';
import { draftRouter } from './routes/draft.routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  app.use(express.static(path.join(process.cwd(), 'public')));
  app.use(express.json());

  app.use('/api', analyzeRouter);
  app.use('/api', resultsRouter);
  app.use('/api', draftRouter);

  app.use(errorHandler);

  return app;
}
