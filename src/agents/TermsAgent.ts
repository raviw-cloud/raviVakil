import { BaseAgent } from './BaseAgent';
import { parseAgentJson } from '../services/jsonParser';

export class TermsAgent extends BaseAgent {
  constructor() {
    super('legal-terms.md');
  }

  protected get maxTokens(): number {
    return 2500;
  }

  protected buildUserMessage(documentText: string): string {
    return (
      'Map obligations, deadlines, notices, conditions, renewal dates, payment duties, filings, and consequences in ' +
      'this legal document. Return ONLY valid JSON: ' +
      '{"obligations":[{"party":"...","obligation":"...","deadline":"...","consequence":"..."}],"score":0-100}.\n\n' +
      documentText
    );
  }

  protected parseResponse(raw: string): unknown {
    return parseAgentJson(raw);
  }
}
