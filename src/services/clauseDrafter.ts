import { getAnthropicClient } from '../infrastructure/anthropicClient';
import { reportRepo } from '../infrastructure/reportCache';
import { config } from '../config';

const SYSTEM_PROMPT =
  'You are an expert Indian legal drafting lawyer. Draft clear, precise, enforceable legal clauses ' +
  'compliant with Indian law. Return ONLY the drafted clause text.';

export interface DraftRequest {
  prompt: string;
  sessionId?: string;
}

export class InvalidDraftPromptError extends Error {
  constructor(msg = 'A drafting prompt is required.') {
    super(msg);
    this.name = 'InvalidDraftPromptError';
  }
}

export async function draftClause({ prompt, sessionId }: DraftRequest): Promise<string> {
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
    throw new InvalidDraftPromptError();
  }

  let documentContext = '';
  if (sessionId) {
    const cached = await reportRepo.get(sessionId);
    if (cached) {
      const meta = cached.results.clauses.metadata as Record<string, string | undefined>;
      const parts = [
        meta.documentType ?? meta.contractType ?? '',
        meta.parties ? `Parties: ${meta.parties}` : '',
        meta.governingLaw ? `Governing Law: ${meta.governingLaw}` : ''
      ].filter(Boolean);
      if (parts.length) documentContext = '\n\nDocument context: ' + parts.join(', ') + '.';
    }
  }

  const client = getAnthropicClient();
  const msg = await client.messages.create({
    model: config.HAIKU_MODEL,
    max_tokens: 1200,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt.trim() + documentContext }]
  });

  const block = msg.content[0];
  return block.type === 'text' ? block.text : '';
}
