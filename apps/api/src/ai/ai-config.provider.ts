export const AI_CONFIG = Symbol('AI_CONFIG');

export interface AiConfig {
  apiKey: string | null;
  model: string;
  baseURL?: string;
}
