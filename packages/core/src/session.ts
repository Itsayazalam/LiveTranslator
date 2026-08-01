import {
  DEFAULT_SESSION_CONFIG,
  REALTIME_EVENTS,
  type AppLanguage,
  type DialogueTurn,
  type RealtimeTranscriptDelta,
  type SessionConfig,
  type SessionState,
  type SessionStatus,
} from '@live-translator/shared';
import { LatencyTracker } from './latency-tracker.js';
import { TurnBuffer } from './turn-buffer.js';

export type SessionEventHandler = (state: SessionState) => void;

export interface TranslationSessionOptions {
  config?: Partial<SessionConfig>;
  onStateChange?: SessionEventHandler;
  onTurnComplete?: (turn: DialogueTurn) => void;
}

function createInitialState(): SessionState {
  return {
    status: 'idle',
    sourceTranscript: '',
    translatedText: '',
    partialSource: '',
    partialTranslation: '',
    turns: [],
    latencyMs: null,
    error: null,
    audioLevel: 0,
  };
}

export class TranslationSession {
  private state: SessionState = createInitialState();
  private config: SessionConfig;
  private contextBuffer: TurnBuffer;
  private completedTurns: DialogueTurn[] = [];
  private latencyTracker: LatencyTracker;
  private onStateChange?: SessionEventHandler;
  private onTurnComplete?: (turn: DialogueTurn) => void;
  private currentSourceText = '';
  private currentTranslationText = '';
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private segmentLocked = false;
  private finalizedSourceText = '';
  private finalizedTranslationText = '';

  constructor(options: TranslationSessionOptions = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...options.config };
    this.contextBuffer = new TurnBuffer(this.config.maxTurns);
    this.latencyTracker = new LatencyTracker();
    this.onStateChange = options.onStateChange;
    this.onTurnComplete = options.onTurnComplete;
  }

  getState(): SessionState {
    return this.state;
  }

  getConfig(): SessionConfig {
    return this.config;
  }

  getTurnBuffer(): TurnBuffer {
    return this.contextBuffer;
  }

  getContextTurns(): readonly DialogueTurn[] {
    return this.contextBuffer.getRecent(this.config.maxTurns);
  }

  updateConfig(partial: Partial<SessionConfig>): void {
    this.config = { ...this.config, ...partial };
    if (partial.maxTurns !== undefined) {
      this.contextBuffer = new TurnBuffer(partial.maxTurns);
      for (const turn of this.completedTurns.slice(-partial.maxTurns)) {
        this.contextBuffer.add(turn);
      }
    }
  }

  setStatus(status: SessionStatus, error: string | null = null): void {
    this.patchState({ status, error: error ?? (status === 'error' ? this.state.error : null) });
  }

  setAudioLevel(level: number): void {
    this.patchState({ audioLevel: level });
  }

  handleRealtimeEvent(event: Record<string, unknown>): void {
    // Ignore streaming updates while paused or segment is being finalized
    if (this.state.status === 'paused' || this.segmentLocked) return;

    const type = event.type as string;

    switch (type) {
      case REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA:
        this.handleInputDelta(event as unknown as RealtimeTranscriptDelta);
        break;
      case REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DELTA:
        this.handleOutputDelta(event as unknown as RealtimeTranscriptDelta);
        break;
      case REALTIME_EVENTS.INPUT_TRANSCRIPT_DONE:
        this.handleInputDone();
        break;
      case REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DONE:
      case REALTIME_EVENTS.OUTPUT_AUDIO_DONE:
        this.handleOutputDone();
        break;
      case REALTIME_EVENTS.ERROR:
        this.setStatus('error', String(event.message ?? 'Unknown error'));
        break;
      default:
        break;
    }
  }

  private handleInputDelta(event: RealtimeTranscriptDelta): void {
    const delta = typeof event.delta === 'string' ? event.delta : '';
    if (!delta) return;
    this.currentSourceText += delta;
    this.patchState({
      partialSource: this.currentSourceText,
      status: 'listening',
    });
  }

  private handleOutputDelta(_event: RealtimeTranscriptDelta): void {
    // Deferred translation: ignore realtime output; batch translate on segment boundary
  }

  private handleInputDone(): void {
    this.latencyTracker.markTurnEnd();
    const sourceText = this.currentSourceText.trim();
    if (sourceText) {
      this.patchState({
        sourceTranscript: sourceText,
        partialSource: '',
      });
    }
    this.currentSourceText = '';
  }

  private handleOutputDone(): void {
    // Deferred translation: do not auto-commit streaming output
  }

  /** Snapshot source text and prepare for batch translation (Space press). */
  beginSegmentFinalize(): string | null {
    const sourceText = (
      this.state.partialSource ||
      this.state.sourceTranscript ||
      this.currentSourceText
    ).trim();

    this.finalizedSourceText = sourceText;
    this.finalizedTranslationText = '';
    this.currentTranslationText = '';
    this.segmentLocked = true;

    this.patchState({
      partialTranslation: '',
      translatedText: '',
      status: sourceText ? 'translating' : 'paused',
      error: sourceText ? null : 'No speech detected — speak, then press Space',
    });

    return sourceText || null;
  }

  /** Apply batch translation result from /api/translate. */
  applyFinalTranslation(text: string): void {
    if (!this.segmentLocked) return;

    this.finalizedTranslationText = text.trim();
    this.latencyTracker.markTranslationDisplayed();
    this.patchState({
      translatedText: text.trim(),
      partialTranslation: '',
      status: 'paused',
      error: null,
    });
  }

  /** Commit finalized segment to history (Space release). */
  commitFinalizedSegment(options?: {
    keepStatus?: SessionStatus;
    sourceLang?: AppLanguage;
    targetLang?: AppLanguage;
  }): DialogueTurn | null {
    if (!this.segmentLocked) {
      return null;
    }

    const sourceText = this.finalizedSourceText;
    const translatedText = this.finalizedTranslationText;

    this.segmentLocked = false;
    this.finalizedSourceText = '';
    this.finalizedTranslationText = '';
    this.currentSourceText = '';
    this.currentTranslationText = '';

    if (!sourceText && !translatedText) {
      this.patchState({
        sourceTranscript: '',
        translatedText: '',
        partialSource: '',
        partialTranslation: '',
        status: options?.keepStatus ?? 'listening',
        error: null,
      });
      return null;
    }

    const sourceLang = options?.sourceLang ?? this.config.sourceLang;
    const targetLang = options?.targetLang ?? this.config.targetLang;
    const latencyMs = this.latencyTracker.getP50();
    const turn: DialogueTurn = {
      id: crypto.randomUUID(),
      sourceText: sourceText || '(no source transcript)',
      translatedText: translatedText || '(no translation yet)',
      sourceLang,
      targetLang,
      completedAt: Date.now(),
      latencyMs: latencyMs ?? 0,
    };

    this.contextBuffer.add(turn);
    this.completedTurns.push(turn);
    this.onTurnComplete?.(turn);

    this.patchState({
      sourceTranscript: '',
      translatedText: '',
      partialSource: '',
      partialTranslation: '',
      turns: [...this.completedTurns],
      latencyMs,
      status: options?.keepStatus ?? 'listening',
      error: null,
    });

    return turn;
  }

  isSegmentLocked(): boolean {
    return this.segmentLocked;
  }

  getFinalizedSourceText(): string {
    return this.finalizedSourceText;
  }

  /**
   * Commit whatever is currently on screen into conversation history,
   * then clear the live Original/Translation panels.
   */
  commitCurrentTurn(options?: {
    keepStatus?: SessionStatus;
    sourceLang?: AppLanguage;
    targetLang?: AppLanguage;
  }): DialogueTurn | null {
    const sourceText = (
      this.state.partialSource ||
      this.state.sourceTranscript ||
      this.currentSourceText
    ).trim();
    const translatedText = (
      this.state.partialTranslation ||
      this.state.translatedText ||
      this.currentTranslationText
    ).trim();

    this.currentSourceText = '';
    this.currentTranslationText = '';

    if (!sourceText && !translatedText) {
      this.patchState({
        sourceTranscript: '',
        translatedText: '',
        partialSource: '',
        partialTranslation: '',
        status: options?.keepStatus ?? this.state.status,
      });
      return null;
    }

    const sourceLang = options?.sourceLang ?? this.config.sourceLang;
    const targetLang = options?.targetLang ?? this.config.targetLang;
    const latencyMs = this.latencyTracker.markTranslationDisplayed();
    const turn: DialogueTurn = {
      id: crypto.randomUUID(),
      sourceText: sourceText || '(no source transcript)',
      translatedText: translatedText || '(no translation yet)',
      sourceLang,
      targetLang,
      completedAt: Date.now(),
      latencyMs: latencyMs ?? 0,
    };

    this.contextBuffer.add(turn);
    this.completedTurns.push(turn);
    this.onTurnComplete?.(turn);

    this.patchState({
      sourceTranscript: '',
      translatedText: '',
      partialSource: '',
      partialTranslation: '',
      turns: [...this.completedTurns],
      latencyMs: this.latencyTracker.getP50(),
      status: options?.keepStatus ?? 'listening',
    });

    return turn;
  }

  pause(langs?: { sourceLang: AppLanguage; targetLang: AppLanguage }): DialogueTurn | null {
    const turn = this.commitCurrentTurn({
      keepStatus: 'paused',
      sourceLang: langs?.sourceLang,
      targetLang: langs?.targetLang,
    });
    this.patchState({
      status: 'paused',
      audioLevel: 0,
      partialSource: '',
      partialTranslation: '',
      sourceTranscript: '',
      translatedText: '',
    });
    return turn;
  }

  /** Hold-to-pause: mute input, keep live panels visible. */
  enterHoldPause(): void {
    if (this.state.status === 'paused') return;
    this.patchState({ status: 'paused', audioLevel: 0 });
  }

  /** Release hold: commit finalized segment to history and clear live panels. */
  releaseHoldPause(): DialogueTurn | null {
    if (this.state.status !== 'paused' && !this.segmentLocked) return null;
    if (this.segmentLocked) {
      return this.commitFinalizedSegment({ keepStatus: 'listening' });
    }
    return this.commitCurrentTurn({ keepStatus: 'listening' });
  }

  resume(): void {
    if (this.state.status !== 'paused') return;
    this.patchState({ status: 'listening', error: null });
  }

  swapLanguages(): { sourceLang: AppLanguage; targetLang: AppLanguage } {
    const sourceLang = this.config.targetLang;
    const targetLang = this.config.sourceLang;
    this.updateConfig({ sourceLang, targetLang });
    return { sourceLang, targetLang };
  }

  stopListening(): void {
    if (this.segmentLocked) {
      this.commitFinalizedSegment({ keepStatus: 'idle' });
    } else {
      this.commitCurrentTurn({ keepStatus: 'idle' });
    }
    this.segmentLocked = false;
    this.finalizedSourceText = '';
    this.finalizedTranslationText = '';
    this.currentSourceText = '';
    this.currentTranslationText = '';
    this.reconnectAttempts = 0;
    this.patchState({
      status: 'idle',
      partialSource: '',
      partialTranslation: '',
      sourceTranscript: '',
      translatedText: '',
      audioLevel: 0,
      error: null,
    });
  }

  cancelSegmentFinalize(): void {
    this.segmentLocked = false;
    this.finalizedSourceText = '';
    this.finalizedTranslationText = '';
    this.patchState({ error: null });
  }

  hydrate(
    turns: DialogueTurn[],
    lastSourceText = '',
    lastTranslatedText = '',
  ): void {
    this.completedTurns = [...turns];
    this.contextBuffer.clear();
    for (const turn of turns.slice(-this.config.maxTurns)) {
      this.contextBuffer.add(turn);
    }
    this.patchState({
      turns: [...this.completedTurns],
      sourceTranscript: lastSourceText,
      translatedText: lastTranslatedText,
      partialSource: '',
      partialTranslation: '',
    });
  }

  clearConversation(): void {
    this.contextBuffer.clear();
    this.completedTurns = [];
    this.latencyTracker.reset();
    this.currentSourceText = '';
    this.currentTranslationText = '';
    this.reconnectAttempts = 0;
    this.state = createInitialState();
    this.emit();
  }

  reset(): void {
    this.clearConversation();
  }

  recordReconnectAttempt(): boolean {
    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.setStatus('error', 'Max reconnection attempts reached');
      return false;
    }
    this.setStatus('reconnecting');
    return true;
  }

  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
  }

  getReconnectDelayMs(): number {
    return Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
  }

  private patchState(partial: Partial<SessionState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private emit(): void {
    this.onStateChange?.(this.getState());
  }
}
