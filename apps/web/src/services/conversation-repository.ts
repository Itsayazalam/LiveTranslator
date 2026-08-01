import {
  CONVERSATION_STORAGE_KEY,
  CONVERSATION_STORAGE_VERSION,
  createEmptyConversation,
  type ConversationRepository,
  type PersistedConversation,
  type DialogueTurn,
} from '@live-translator/shared';

const MAX_PERSISTED_TURNS = 500;

/**
 * Browser localStorage implementation of ConversationRepository.
 * Replace with ApiConversationRepository when a backend DB is ready.
 */
export class LocalStorageConversationRepository implements ConversationRepository {
  constructor(private readonly storageKey = CONVERSATION_STORAGE_KEY) {}

  async load(): Promise<PersistedConversation | null> {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as PersistedConversation;
      if (parsed.version !== CONVERSATION_STORAGE_VERSION) {
        return null;
      }

      return {
        ...parsed,
        turns: Array.isArray(parsed.turns) ? parsed.turns : [],
      };
    } catch {
      return null;
    }
  }

  async save(conversation: PersistedConversation): Promise<void> {
    const trimmed: PersistedConversation = {
      ...conversation,
      turns: conversation.turns.slice(-MAX_PERSISTED_TURNS),
      updatedAt: Date.now(),
    };
    localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
  }

  async appendTurn(
    turn: DialogueTurn,
    lastSourceText: string,
    lastTranslatedText: string,
  ): Promise<void> {
    const existing = (await this.load()) ?? createEmptyConversation();
    await this.save({
      ...existing,
      turns: [...existing.turns, turn],
      lastSourceText,
      lastTranslatedText,
    });
  }

  async clear(): Promise<void> {
    localStorage.removeItem(this.storageKey);
  }
}

/** Singleton for the app — inject a different implementation in tests or prod */
export const conversationRepository: ConversationRepository =
  new LocalStorageConversationRepository();
