import { Hono } from 'hono';
import {
  type AppLanguage,
  type TranslateRequest,
  type TranslateResponse,
} from '@live-translator/shared';
import type { Env } from '../env.js';
import {
  buildTranslationUserMessage,
  INTERPRETER_SYSTEM_PROMPT,
} from '../translation-prompt.js';

const languageSchema = ['en-AU', 'hi'] as const;
const DEFAULT_TRANSLATION_MODEL = 'gpt-4.1-mini';

export function createTranslateRoutes(env: Env) {
  const app = new Hono();

  app.post('/translate', async (c) => {
    let body: TranslateRequest;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { sourceText, sourceLang, targetLang, context } = body;

    if (!sourceText?.trim()) {
      return c.json({ error: 'sourceText is required' }, 400);
    }

    if (!languageSchema.includes(sourceLang) || !languageSchema.includes(targetLang)) {
      return c.json({ error: 'Invalid language' }, 400);
    }

    const model = process.env.TRANSLATION_MODEL ?? DEFAULT_TRANSLATION_MODEL;
    const userMessage = buildTranslationUserMessage(
      sourceText.trim(),
      sourceLang as AppLanguage,
      targetLang as AppLanguage,
      context ?? [],
    );

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            { role: 'system', content: INTERPRETER_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Translation API error:', response.status, errorText.slice(0, 300));
        return c.json({ error: 'Translation failed', details: errorText }, response.status as 500);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };

      const translatedText = data.choices?.[0]?.message?.content?.trim();
      if (!translatedText) {
        return c.json({ error: 'Empty translation response' }, 500);
      }

      const result: TranslateResponse = { translatedText };
      return c.json(result);
    } catch (err) {
      console.error('Translate route failed:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}
