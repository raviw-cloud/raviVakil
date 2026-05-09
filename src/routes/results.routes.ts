import { Router } from 'express';
import { getResultsController, downloadReportController } from '../controllers/results.controller';

export const resultsRouter = Router();
resultsRouter.get('/results/:sessionId', getResultsController);
resultsRouter.get('/download-report/:sessionId', downloadReportController);
resultsRouter.get('/download-leave-license/:sessionId', downloadReportController);
