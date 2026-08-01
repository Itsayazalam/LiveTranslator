import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  type AppLanguage,
  type AppSettings,
  type PersistedConversation,
  type SessionState,
  SETTINGS_STORAGE_KEY,
} from '@live-translator/shared';
import { conversationRepository } from '../services/conversation-repository';

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<AppSettings> & { autoDetect?: boolean };
      const { autoDetect: _legacyAutoDetect, ...rest } = stored;
      const parsed = { ...DEFAULT_SETTINGS, ...rest } as AppSettings;
      // Prefer same-origin Vite proxy in dev instead of hard-coded localhost:3001
      if (parsed.apiBaseUrl === 'http://localhost:3001') {
        parsed.apiBaseUrl = '';
      }
      return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function loadPersistedConversationSync(): PersistedConversation | null {
  try {
    const raw = localStorage.getItem('live-translator-conversation');
    if (!raw) return null;
    return JSON.parse(raw) as PersistedConversation;
  } catch {
    return null;
  }
}

interface UIStore {
  settings: AppSettings;
  sessionState: SessionState | null;
  persistedConversation: PersistedConversation | null;
  isSessionActive: boolean;
  showSettings: boolean;
  updateSettings: (partial: Partial<AppSettings>) => void;
  setSessionState: (state: SessionState) => void;
  setSessionActive: (active: boolean) => void;
  toggleSettings: () => void;
  swapLanguages: () => void;
  clearConversation: () => Promise<void>;
  reloadConversation: () => Promise<void>;
}

const persisted = loadPersistedConversationSync();

const initialSessionState: SessionState = {
  status: 'idle',
  sourceTranscript: persisted?.lastSourceText ?? '',
  translatedText: persisted?.lastTranslatedText ?? '',
  partialSource: '',
  partialTranslation: '',
  turns: persisted?.turns ?? [],
  latencyMs: null,
  error: null,
  audioLevel: 0,
};

export const useUIStore = create<UIStore>((set, get) => ({
  settings: loadSettings(),
  sessionState: initialSessionState,
  persistedConversation: persisted,
  isSessionActive: false,
  showSettings: false,

  updateSettings: (partial) => {
    const settings = { ...get().settings, ...partial };
    saveSettings(settings);
    set({ settings });
    if (partial.darkMode !== undefined) {
      document.documentElement.classList.toggle('dark', settings.darkMode);
    }
  },

  setSessionState: (sessionState) => set({ sessionState }),
  setSessionActive: (isSessionActive) => set({ isSessionActive }),
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),

  swapLanguages: () => {
    const { settings } = get();
    const sourceLang = settings.targetLang;
    const targetLang = settings.sourceLang;
    get().updateSettings({ sourceLang, targetLang });
  },

  clearConversation: async () => {
    await conversationRepository.clear();
    set({
      persistedConversation: null,
      sessionState: {
        status: 'idle',
        sourceTranscript: '',
        translatedText: '',
        partialSource: '',
        partialTranslation: '',
        turns: [],
        latencyMs: null,
        error: null,
        audioLevel: 0,
      },
    });
  },

  reloadConversation: async () => {
    const loaded = await conversationRepository.load();
    set({ persistedConversation: loaded });
    if (loaded) {
      set({
        sessionState: {
          status: 'idle',
          sourceTranscript: loaded.lastSourceText,
          translatedText: loaded.lastTranslatedText,
          partialSource: '',
          partialTranslation: '',
          turns: loaded.turns,
          latencyMs: null,
          error: null,
          audioLevel: 0,
        },
      });
    }
  },
}));

document.documentElement.classList.toggle('dark', loadSettings().darkMode);

export function getLanguagePairLabel(source: AppLanguage, target: AppLanguage): string {
  const labels: Record<AppLanguage, string> = { 'en-AU': 'EN', hi: 'HI' };
  return `${labels[source]} → ${labels[target]}`;
}
