export type AppLanguage = 'en-AU' | 'hi';

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  'en-AU': 'English (AU)',
  hi: 'Hindi',
};

/** OpenAI Realtime Translation output language codes */
export const OPENAI_LANGUAGE_MAP: Record<AppLanguage, string> = {
  'en-AU': 'en',
  hi: 'hi',
};

export type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'translating'
  | 'paused'
  | 'error'
  | 'reconnecting';

export interface DialogueTurn {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLang: AppLanguage;
  targetLang: AppLanguage;
  completedAt: number;
  latencyMs: number;
}

export interface SessionConfig {
  sourceLang: AppLanguage;
  targetLang: AppLanguage;
  silenceDurationMs: number;
  maxTurns: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sourceLang: 'en-AU',
  targetLang: 'hi',
  silenceDurationMs: 700,
  maxTurns: 5,
};

export interface CreateSessionRequest {
  sourceLang: AppLanguage;
  targetLang: AppLanguage;
}

export interface CreateSessionResponse {
  clientSecret: string;
  expiresAt: number;
  sessionConfig: SessionConfig;
}

export interface SessionState {
  status: SessionStatus;
  sourceTranscript: string;
  translatedText: string;
  partialSource: string;
  partialTranslation: string;
  turns: DialogueTurn[];
  latencyMs: number | null;
  error: string | null;
  audioLevel: number;
}

export const REALTIME_TRANSLATION_MODEL = 'gpt-realtime-translate';

export const REALTIME_EVENTS = {
  INPUT_TRANSCRIPT_DELTA: 'session.input_transcript.delta',
  OUTPUT_TRANSCRIPT_DELTA: 'session.output_transcript.delta',
  INPUT_TRANSCRIPT_DONE: 'session.input_transcript.done',
  OUTPUT_TRANSCRIPT_DONE: 'session.output_transcript.done',
  OUTPUT_AUDIO_DONE: 'session.output_audio.done',
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  SESSION_CLOSED: 'session.closed',
  ERROR: 'error',
} as const;

export type RealtimeEventType =
  (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

export interface RealtimeTranscriptDelta {
  type: typeof REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA | typeof REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DELTA;
  delta: string;
  item_id?: string;
}

export interface AppSettings {
  sourceLang: AppLanguage;
  targetLang: AppLanguage;
  micDeviceId: string | null;
  apiBaseUrl: string;
  darkMode: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  sourceLang: 'en-AU',
  targetLang: 'hi',
  micDeviceId: null,
  apiBaseUrl: '',
  darkMode: true,
};

export const SETTINGS_STORAGE_KEY = 'live-translator-settings';
