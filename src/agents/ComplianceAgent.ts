import { BaseAgent } from './BaseAgent';
import { parseAgentJson } from '../services/jsonParser';

export class ComplianceAgent extends BaseAgent {
  constructor() {
    super('legal-compliance.md');
  }

  protected get maxTokens(): number {
    return 2500;
  }

  protected buildUserMessage(documentText: string): string {
    return (
      'Check India-law compliance for the detected document type. Apply Indian statutes, registration, stamp duty, ' +
      'state-specific, consumer, employment, company, property, data, arbitration, tax, and sector rules only where ' +
      'relevant to this document. Return ONLY valid JSON: ' +
      '{"issues":[{"issue":"...","severity":"HIGH|MEDIUM|LOW","statute":"..."}],"score":0-100}.\n\n' +
      documentText
    );
  }

  protected parseResponse(raw: string): unknown {
    return parseAgentJson(raw);
  }
}
