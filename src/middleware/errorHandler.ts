import type { Request, Response, NextFunction } from 'express';
import { logger } from '../infrastructure/logger';
import { UnusableReviewError } from '../services/reviewer';
import { InvalidDraftPromptError } from '../services/clauseDrafter';

interface AnthropicErrorLike {
  status?: number;
  message?: string;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof InvalidDraftPromptError) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err instanceof UnusableReviewError) {
    res.status(502).json({ error: 'The AI review returned an incomplete result. Please try again.' });
    return;
  }

  const e = err as AnthropicErrorLike;
  if (e?.status === 401) {
    res.status(500).json({ error: 'Invalid API key.' });
    return;
  }
  if (e?.status === 429) {
    res.status(500).json({ error: 'Rate limit reached. Try again in a moment.' });
    return;
  }

  logger.error('[errorHandler] unhandled', { path: req.path, error: (err as Error).message ?? String(err) });
  res.status(500).json({ error: 'Internal server error. Please try again.' });
}
