import fs from 'fs';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from '../infrastructure/anthropicClient';
import { config } from '../config';

export interface AgentResponse {
  data: unknown;
  raw: string;
  usage: Anthropic.Messages.Message['usage'];
}

export abstract class BaseAgent {
  protected readonly client = getAnthropicClient();
  protected readonly systemPrompt: string;

  constructor(promptFilename: string) {
    const promptPath = path.join(process.cwd(), 'agents', promptFilename);
    this.systemPrompt = fs.readFileSync(promptPath, 'utf8');
  }

  protected abstract buildUserMessage(documentText: string): string;
  protected abstract get maxTokens(): number;

  async analyze(documentText: string): Promise<AgentResponse> {
    const response = await this.client.messages.create({
      model: config.HAIKU_MODEL,
      max_tokens: this.maxTokens,
      system: [{ type: 'text', text: this.systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: this.buildUserMessage(documentText) }]
    });

    const block = response.content[0];
    const raw = block.type === 'text' ? block.text : '';

    return {
      data: this.parseResponse(raw),
      raw,
      usage: response.usage
    };
  }

  protected parseResponse(raw: string): unknown {
    return raw;
  }
}
