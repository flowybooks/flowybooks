import type { KevinResponse } from './schemas';
import { isValidUrlString, validateAnswerLabelForSources } from './source-tiers';

export function sanitizeCitations(citations: string[]): string[] {
  return Array.from(new Set(citations.filter(isValidUrlString)));
}

export function validateKevinResponseAuthority(response: KevinResponse): KevinResponse {
  return {
    ...response,
    answerLabel: validateAnswerLabelForSources(response.answerLabel),
    citations: sanitizeCitations(response.citations),
  };
}
