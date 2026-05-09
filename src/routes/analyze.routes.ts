import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { analyzeController } from '../controllers/analyze.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_BYTES }
});

const analyzeLimit = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait 15 minutes before analyzing again.' }
});

export const analyzeRouter = Router();
analyzeRouter.post('/analyze', analyzeLimit, upload.single('pdf'), analyzeController);
