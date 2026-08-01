/**
 * Phase 0 validation spike — verifies OpenAI Realtime Translation API
 * supports Hindi ↔ English session creation without a browser.
 *
 * Usage: OPENAI_API_KEY=sk-... pnpm spike
 */
import '../load-env.js';
import { OPENAI_LANGUAGE_MAP, REALTIME_TRANSLATION_MODEL } from '@live-translator/shared';

const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  console.error('Set OPENAI_API_KEY to run the validation spike.');
  process.exit(1);
}

interface SpikeResult {
  direction: string;
  targetLang: string;
  ok: boolean;
  status: number;
  clientSecret?: string;
  error?: string;
}

async function validateDirection(
  label: string,
  targetLang: 'en' | 'hi',
): Promise<SpikeResult> {
  const response = await fetch(
    'https://api.openai.com/v1/realtime/translations/client_secrets',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          model: REALTIME_TRANSLATION_MODEL,
          audio: {
            output: {
              language: targetLang,
            },
          },
        },
      }),
    },
  );

  const body = await response.text();
  let clientSecret: string | undefined;

  if (response.ok) {
    try {
      const parsed = JSON.parse(body) as {
        value?: string;
        client_secret?: { value?: string };
      };
      clientSecret = parsed.value ?? parsed.client_secret?.value;
    } catch {
      // ignore parse errors
    }
  }

  return {
    direction: label,
    targetLang,
    ok: response.ok && !!clientSecret,
    status: response.status,
    clientSecret: clientSecret ? `${clientSecret.slice(0, 12)}...` : undefined,
    error: response.ok ? undefined : body,
  };
}

async function main() {
  console.log('Phase 0: Realtime Translation API validation spike\n');
  console.log(`Model: ${REALTIME_TRANSLATION_MODEL}`);
  console.log(`Languages: en-AU (${OPENAI_LANGUAGE_MAP['en-AU']}), hi (${OPENAI_LANGUAGE_MAP.hi})\n`);

  const results = await Promise.all([
    validateDirection('English → Hindi', 'hi'),
    validateDirection('Hindi → English', 'en'),
  ]);

  for (const result of results) {
    const icon = result.ok ? 'PASS' : 'FAIL';
    console.log(`[${icon}] ${result.direction} (target: ${result.targetLang})`);
    console.log(`       Status: ${result.status}`);
    if (result.clientSecret) console.log(`       Client secret: ${result.clientSecret}`);
    if (result.error) console.log(`       Error: ${result.error.slice(0, 200)}`);
    console.log();
  }

  const allPassed = results.every((r) => r.ok);
  if (allPassed) {
    console.log('Go: Both language directions validated. Proceed with full implementation.');
  } else {
    console.log('No-go: One or more directions failed. Check API key and model access.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Spike failed:', err);
  process.exit(1);
});
