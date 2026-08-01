import type { AppLanguage, DialogueTurn } from './types.js';

export const CONTEXT_TURN_COUNT = 5;
export const SILENCE_THRESHOLD_MS = 700;

export const INTERPRETER_SYSTEM_PROMPT = `You are a professional live interpreter between Australian English and Hindi.

Rules:
- Translate meaning, not words.
- Never translate literally.
- Sound like a native speaker.
- Use simple everyday Hindi.
- Use natural conversational Australian English.
- Preserve names exactly.
- Preserve numbers exactly.
- Preserve dates exactly.
- Preserve addresses exactly.
- Preserve currencies exactly.
- Do not explain.
- Do not summarize.
- Do not omit information.
- Output ONLY the translated sentence.`;

export interface TranslateRequest {
  sourceText: string;
  sourceLang: AppLanguage;
  targetLang: AppLanguage;
  context: Pick<DialogueTurn, 'sourceText' | 'translatedText' | 'sourceLang' | 'targetLang'>[];
}

export interface TranslateResponse {
  translatedText: string;
}

export interface UtteranceReadyEvent {
  utteranceId: number;
  sourceText: string;
  sourceLang: AppLanguage;
  targetLang: AppLanguage;
}
