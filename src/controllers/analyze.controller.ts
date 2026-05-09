import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { extractPdfText, isPdfBuffer } from '../services/pdfExtractor';
import { runReview } from '../services/reviewer';
import { calculateScore, scoreToGrade, scoreToRec } from '../services/scorer';
import { reportRepo } from '../infrastructure/reportCache';
import { logger } from '../infrastructure/logger';

export async function analyzeController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No PDF uploaded.' });
      return;
    }
    if (!isPdfBuffer(req.file.buffer)) {
      res.status(400).json({ error: 'Only PDF files are accepted.' });
      return;
    }

    const rawText = await extractPdfText(req.file.buffer);
    if (!rawText) {
      res.status(422).json({
        error:
          'No selectable text found in this PDF. If it is a scanned document, please run it through an OCR tool first (e.g. Adobe Acrobat, ILovePDF) and re-upload.'
      });
      return;
    }

    const { results, cost, elapsedMs } = await runReview(rawText);

    const score = calculateScore(results);
    const grade = scoreToGrade(score);
    const recommendation = scoreToRec(score);
    const sessionId = uuidv4();

    await reportRepo.save(sessionId, {
      results,
      score,
      grade,
      recommendation,
      filename: req.file.originalname
    });

    logger.info('[analyze]', {
      file: req.file.originalname,
      elapsedSec: (elapsedMs / 1000).toFixed(1),
      input: cost.input,
      output: cost.output,
      cacheWrite: cost.cacheWrite,
      cacheRead: cost.cacheRead,
      dollars: cost.dollars
    });

    res.json({
      sessionId,
      score,
      grade,
      recommendation,
      summary: results.clauses.summary || 'Analysis complete.'
    });
  } catch (err) {
    next(err);
  }
}
