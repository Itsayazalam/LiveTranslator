import type { TranslateRequest, TranslateResponse } from '@live-translator/shared';

export async function fetchFinalTranslation(
  apiBaseUrl: string,
  request: TranslateRequest,
  signal?: AbortSignal,
): Promise<string> {
  const origin =
    apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173');
  const response = await fetch(`${origin}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Translation failed (${response.status})`);
  }

  const data = (await response.json()) as TranslateResponse;
  return data.translatedText;
}
