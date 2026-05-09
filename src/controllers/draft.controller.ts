import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { draftClause } from '../services/clauseDrafter';

const DraftBodySchema = z.object({
  prompt: z.string(),
  sessionId: z.string().optional()
});

export async function draftController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = DraftBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'A drafting prompt is required.' });
      return;
    }
    const clause = await draftClause(parsed.data);
    res.json({ clause });
  } catch (err) {
    next(err);
  }
}
