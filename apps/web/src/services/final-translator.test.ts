import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchFinalTranslation } from './final-translator';

describe('fetchFinalTranslation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns translated text on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ translatedText: 'Namaste' }),
      }),
    );

    const result = await fetchFinalTranslation('', {
      sourceText: 'Hello',
      sourceLang: 'en-AU',
      targetLang: 'hi',
      context: [],
    });

    expect(result).toBe('Namaste');
  });

  it('throws with API error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Translation failed' }),
      }),
    );

    await expect(
      fetchFinalTranslation('', {
        sourceText: 'Hello',
        sourceLang: 'en-AU',
        targetLang: 'hi',
        context: [],
      }),
    ).rejects.toThrow('Translation failed');
  });
});
