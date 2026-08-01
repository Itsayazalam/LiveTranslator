import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  DEFAULT_SESSION_CONFIG,
  OPENAI_LANGUAGE_MAP,
  REALTIME_TRANSLATION_MODEL,
  type AppLanguage,
  type CreateSessionRequest,
  type CreateSessionResponse,
} from '@live-translator/shared';
import type { Env } from '../env.js';
import { createTranslateRoutes } from './translate.js';

const languageSchema = ['en-AU', 'hi'] as const;

export function createSessionRoutes(env: Env) {
  const app = new Hono();

  app.post('/calls', async (c) => {
    const sourceLang = c.req.query('sourceLang') as AppLanguage | undefined;
    const targetLang = c.req.query('targetLang') as AppLanguage | undefined;

    if (!sourceLang || !targetLang) {
      return c.json({ error: 'sourceLang and targetLang query params are required' }, 400);
    }

    if (!languageSchema.includes(sourceLang) || !languageSchema.includes(targetLang)) {
      return c.json({ error: 'Invalid language. Supported: en-AU, hi' }, 400);
    }

    if (sourceLang === targetLang) {
      return c.json({ error: 'Source and target languages must differ' }, 400);
    }

    const sdp = await c.req.text();
    if (!sdp.trim()) {
      return c.json({ error: 'SDP offer body is required' }, 400);
    }

    const targetOpenAiLang = OPENAI_LANGUAGE_MAP[targetLang];

    try {
      const sessionConfig = JSON.stringify({
        type: 'translation',
        model: REALTIME_TRANSLATION_MODEL,
        audio: {
          input: {
            // Required for session.input_transcript.delta (Original panel)
            transcription: { model: 'gpt-realtime-whisper' },
            noise_reduction: { type: 'near_field' },
          },
          output: { language: targetOpenAiLang },
        },
      });

      const form = new FormData();
      form.set('sdp', sdp);
      form.set('session', sessionConfig);

      const response = await fetch(
        'https://api.openai.com/v1/realtime/translations/calls',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: form,
        },
      );

      const answerSdp = await response.text();

      if (!response.ok) {
        console.error('OpenAI translations/calls error:', response.status, answerSdp.slice(0, 300));

        let message = 'WebRTC handshake failed';
        try {
          const parsed = JSON.parse(answerSdp) as {
            error?: { message?: string; code?: string };
          };
          if (parsed.error?.code === 'insufficient_quota') {
            message =
              'OpenAI quota exceeded. Add billing credits at platform.openai.com/account/billing';
          } else if (parsed.error?.message) {
            message = parsed.error.message;
          }
        } catch {
          if (response.status === 504) {
            message = 'OpenAI WebRTC handshake timed out (504). Retry in a moment.';
          }
        }

        return c.json({ error: message, details: answerSdp }, response.status as 400 | 401 | 402 | 500 | 504);
      }

      return c.text(answerSdp, 200, { 'Content-Type': 'application/sdp' });
    } catch (err) {
      console.error('Calls proxy failed:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  app.post('/session', async (c) => {
    let body: CreateSessionRequest;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const sourceLang = body.sourceLang as AppLanguage;
    const targetLang = body.targetLang as AppLanguage;

    if (!languageSchema.includes(sourceLang) || !languageSchema.includes(targetLang)) {
      return c.json({ error: 'Invalid language. Supported: en-AU, hi' }, 400);
    }

    if (sourceLang === targetLang) {
      return c.json({ error: 'Source and target languages must differ' }, 400);
    }

    const targetOpenAiLang = OPENAI_LANGUAGE_MAP[targetLang];

    try {
      const response = await fetch(
        'https://api.openai.com/v1/realtime/translations/client_secrets',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session: {
              type: 'translation',
              model: REALTIME_TRANSLATION_MODEL,
              audio: {
                input: {
                  transcription: { model: 'gpt-realtime-whisper' },
                  noise_reduction: { type: 'near_field' },
                },
                output: {
                  language: targetOpenAiLang,
                },
              },
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI client_secrets error:', response.status, errorText);

        let message = 'Failed to create translation session';
        try {
          const parsed = JSON.parse(errorText) as {
            error?: { message?: string; code?: string };
          };
          const apiError = parsed.error;
          if (apiError?.code === 'insufficient_quota') {
            message =
              'OpenAI quota exceeded. Add billing credits at platform.openai.com/account/billing';
          } else if (apiError?.message) {
            message = apiError.message;
          }
        } catch {
          // use default message
        }

        return c.json({ error: message, details: errorText }, response.status as 400 | 401 | 402 | 500);
      }

      const data = (await response.json()) as {
        value?: string;
        client_secret?: { value?: string; expires_at?: number };
        expires_at?: number;
      };

      const clientSecret = data.value ?? data.client_secret?.value;
      const expiresAt = data.expires_at ?? data.client_secret?.expires_at ?? Date.now() + 60_000;

      if (!clientSecret) {
        return c.json({ error: 'No client secret returned from OpenAI' }, 500);
      }

      const sessionConfig = {
        ...DEFAULT_SESSION_CONFIG,
        sourceLang,
        targetLang,
      };

      const result: CreateSessionResponse = {
        clientSecret,
        expiresAt,
        sessionConfig,
      };

      return c.json(result);
    } catch (err) {
      console.error('Session creation failed:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}

export function createApp(env: Env) {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: env.CORS_ORIGIN,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  );

  app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

  app.route('/api', createSessionRoutes(env));
  app.route('/api', createTranslateRoutes(env));

  return app;
}
