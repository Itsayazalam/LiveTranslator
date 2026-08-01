import type { AppLanguage } from '@live-translator/shared';
import {
  CONTEXT_TURN_COUNT,
  INTERPRETER_SYSTEM_PROMPT,
  LANGUAGE_LABELS,
  type DialogueTurn,
  type TranslateRequest,
  type TranslateResponse,
} from '@live-translator/shared';

export function buildTranslationUserMessage(
  sourceText: string,
  sourceLang: AppLanguage,
  targetLang: AppLanguage,
  context: readonly Pick<DialogueTurn, 'sourceText' | 'translatedText' | 'sourceLang' | 'targetLang'>[],
): string {
  const sourceLabel = LANGUAGE_LABELS[sourceLang];
  const targetLabel = LANGUAGE_LABELS[targetLang];

  const contextBlock =
    context.length > 0
      ? context
          .map(
            (t) =>
              `[${LANGUAGE_LABELS[t.sourceLang]}] ${t.sourceText}\n[${LANGUAGE_LABELS[t.targetLang]}] ${t.translatedText}`,
          )
          .join('\n\n')
      : '(none)';

  return `Translate the following sentence from ${sourceLabel} to ${targetLabel}.

Recent conversation for context (last ${CONTEXT_TURN_COUNT} turns):
${contextBlock}

Sentence to translate:
${sourceText}`;
}

export type { TranslateRequest, TranslateResponse };

export { INTERPRETER_SYSTEM_PROMPT, CONTEXT_TURN_COUNT };
