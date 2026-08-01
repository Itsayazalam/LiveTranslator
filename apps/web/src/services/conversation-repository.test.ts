import { describe, expect, it, beforeEach } from 'vitest';
import { LocalStorageConversationRepository } from './conversation-repository';
import type { DialogueTurn } from '@live-translator/shared';

const TEST_KEY = 'test-conversation';

function makeTurn(id: string): DialogueTurn {
  return {
    id,
    sourceText: 'Hello',
    translatedText: 'Namaste',
    sourceLang: 'en-AU',
    targetLang: 'hi',
    completedAt: Date.now(),
    latencyMs: 120,
  };
}

describe('LocalStorageConversationRepository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads turns', async () => {
    const repo = new LocalStorageConversationRepository(TEST_KEY);
    await repo.appendTurn(makeTurn('1'), 'Hello', 'Namaste');

    const loaded = await repo.load();
    expect(loaded?.turns).toHaveLength(1);
    expect(loaded?.lastSourceText).toBe('Hello');
    expect(loaded?.lastTranslatedText).toBe('Namaste');
  });

  it('clears conversation', async () => {
    const repo = new LocalStorageConversationRepository(TEST_KEY);
    await repo.appendTurn(makeTurn('1'), 'Hello', 'Namaste');
    await repo.clear();

    expect(await repo.load()).toBeNull();
  });
});
