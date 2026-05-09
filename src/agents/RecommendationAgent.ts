import { BaseAgent } from './BaseAgent';
import { parseAgentJson } from '../services/jsonParser';

export class RecommendationAgent extends BaseAgent {
  constructor() {
    super('legal-recommendations.md');
  }

  protected get maxTokens(): number {
    return 3000;
  }

  protected buildUserMessage(documentText: string): string {
    return (
      'Give prioritized recommendations for improving this Indian legal document. Return ONLY valid JSON: ' +
      '{"recommendations":[{"priority":"P0-P4","action":"...","recommendation":"..."}],"score":0-100}.\n\n' +
      documentText
    );
  }

  protected parseResponse(raw: string): unknown {
    return parseAgentJson(raw);
  }
}
