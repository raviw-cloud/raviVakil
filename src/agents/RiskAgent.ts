import { BaseAgent } from './BaseAgent';
import { parseAgentJson } from '../services/jsonParser';

export class RiskAgent extends BaseAgent {
  constructor() {
    super('legal-risks.md');
  }

  protected get maxTokens(): number {
    return 2500;
  }

  protected buildUserMessage(documentText: string): string {
    return (
      'Assess risks in this legal document regardless of document type. Return ONLY valid JSON: ' +
      '{"risks":[{"risk":"...","severity":"HIGH|MEDIUM|LOW","clauseRef":"...","explanation":"..."}],"score":0-100}.\n\n' +
      documentText
    );
  }

  protected parseResponse(raw: string): unknown {
    return parseAgentJson(raw);
  }
}
