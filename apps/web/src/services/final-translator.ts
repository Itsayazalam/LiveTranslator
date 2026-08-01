import type { TranslateRequest, TranslateResponse } from '@live-translator/shared';

export async function fetchFinalTranslation(
  apiBaseUrl: string,
  request: TranslateRequest,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/translate`, {
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
