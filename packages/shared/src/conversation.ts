import type { AppLanguage, DialogueTurn } from './types.js';

export const CONVERSATION_STORAGE_KEY = 'live-translator-conversation';
export const CONVERSATION_STORAGE_VERSION = 1;

/** Persisted conversation snapshot — storage-format versioned for migrations */
export interface PersistedConversation {
  version: typeof CONVERSATION_STORAGE_VERSION;
  turns: DialogueTurn[];
  lastSourceText: string;
  lastTranslatedText: string;
  updatedAt: number;
}

/** Repository interface — swap LocalStorage for API/DB later */
export interface ConversationRepository {
  load(): Promise<PersistedConversation | null>;
  save(conversation: PersistedConversation): Promise<void>;
  appendTurn(turn: DialogueTurn, lastSourceText: string, lastTranslatedText: string): Promise<void>;
  clear(): Promise<void>;
}

export function createEmptyConversation(): PersistedConversation {
  return {
    version: CONVERSATION_STORAGE_VERSION,
    turns: [],
    lastSourceText: '',
    lastTranslatedText: '',
    updatedAt: Date.now(),
  };
}

export function formatTurnLanguages(sourceLang: AppLanguage, targetLang: AppLanguage): string {
  const labels: Record<AppLanguage, string> = { 'en-AU': 'EN', hi: 'HI' };
  return `${labels[sourceLang]} → ${labels[targetLang]}`;
}
