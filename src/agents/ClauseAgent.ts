import { BaseAgent } from './BaseAgent';
import { parseAgentJson } from '../services/jsonParser';

export class ClauseAgent extends BaseAgent {
  constructor() {
    super('legal-clauses.md');
  }

  protected get maxTokens(): number {
    return 4000;
  }

  protected buildUserMessage(documentText: string): string {
    return (
      'Analyze this Indian legal document. First infer the document type from the text. Return ONLY valid JSON:\n' +
      '{"clauses":[{"clauseName":"...","location":"...","summary":"...","severity":"HIGH|MEDIUM|LOW"}],' +
      '"metadata":{"documentTitle":"...","documentType":"...","contractType":"...","parties":"...",' +
      '"effectiveDate":"...","term":"...","governingLaw":"...","jurisdiction":"...","state":"...",' +
      '"subjectMatter":"...","totalValue":"...","registrationDetails":"...","stampDuty":"..."},' +
      '"missingProtections":["missing protection 1","missing protection 2"],"score":0-100,"summary":"2 sentences"}\n\n' +
      documentText
    );
  }

  protected parseResponse(raw: string): unknown {
    return parseAgentJson(raw);
  }
}
