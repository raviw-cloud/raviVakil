import type { Request, Response, NextFunction } from 'express';
import { reportRepo } from '../infrastructure/reportCache';
import { renderPdf, buildOutFilename } from '../services/reportRenderer';

export async function getResultsController(req: Request, res: Response): Promise<void> {
  const cached = await reportRepo.get(req.params.sessionId);
  if (!cached) {
    res.status(404).json({ error: 'Session not found. Please re-analyze.' });
    return;
  }

  res.json({
    sessionId: req.params.sessionId,
    score: cached.score,
    grade: cached.grade,
    recommendation: cached.recommendation,
    filename: cached.filename,
    summary: cached.results.clauses.summary || '',
    results: cached.results
  });
}

export async function downloadReportController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cached = await reportRepo.get(req.params.sessionId);
    if (!cached) {
      res.status(404).json({ error: 'Report not found. Please re-analyze.' });
      return;
    }

    const buffer = await renderPdf(cached);
    const outFilename = buildOutFilename(cached.filename);
    const encoded = encodeURIComponent(outFilename).replace(/'/g, '%27');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${outFilename}"; filename*=UTF-8''${encoded}`
    );
    res.end(buffer);
  } catch (err) {
    next(err);
  }
}
