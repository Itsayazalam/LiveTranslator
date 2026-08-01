import {
  DEFAULT_SESSION_CONFIG,
  REALTIME_EVENTS,
  type AppLanguage,
  type DialogueTurn,
  type RealtimeTranscriptDelta,
  type SessionConfig,
  type SessionState,
  type SessionStatus,
  type UtteranceReadyEvent,
} from '@live-translator/shared';
import { LatencyTracker } from './latency-tracker.js';
import { TranslationCoordinator } from './translation-coordinator.js';
import { TurnBuffer } from './turn-buffer.js';
import { UtteranceDetector } from './utterance-detector.js';

export type SessionEventHandler = (state: SessionState) => void;

export interface TranslationSessionOptions {
  config?: Partial<SessionConfig>;
  onStateChange?: SessionEventHandler;
  onTurnComplete?: (turn: DialogueTurn) => void;
  /** Fired when a sentence is complete and ready for final translation */
  onUtteranceReady?: (event: UtteranceReadyEvent) => void;
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
  private coordinator: TranslationCoordinator;
  private utteranceDetector: UtteranceDetector;
  private onStateChange?: SessionEventHandler;
  private onTurnComplete?: (turn: DialogueTurn) => void;
  private onUtteranceReady?: (event: UtteranceReadyEvent) => void;
  private currentSourceText = '';
  /** Internal draft from Realtime stream — never shown in UI */
  private draftTranslation = '';
  private awaitingCommit = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  constructor(options: TranslationSessionOptions = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...options.config };
    this.contextBuffer = new TurnBuffer(this.config.maxTurns);
    this.latencyTracker = new LatencyTracker();
    this.coordinator = new TranslationCoordinator();
    this.utteranceDetector = new UtteranceDetector(this.config.silenceDurationMs, () => {
      this.commitUtteranceFromSilence();
    });
    this.onStateChange = options.onStateChange;
    this.onTurnComplete = options.onTurnComplete;
    this.onUtteranceReady = options.onUtteranceReady;
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
    const type = event.type as string;

    switch (type) {
      case REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA:
        this.handleInputDelta(event as unknown as RealtimeTranscriptDelta);
        break;
      case REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DELTA:
        this.handleOutputDelta(event as unknown as RealtimeTranscriptDelta);
        break;
      case REALTIME_EVENTS.INPUT_TRANSCRIPT_DONE:
        this.handleInputDone(event);
        break;
      case REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DONE:
        this.handleOutputDone();
        break;
      case REALTIME_EVENTS.ERROR:
        this.setStatus('error', String(event.message ?? 'Unknown error'));
        break;
      default:
        break;
    }
  }

  /** Apply a refined final translation — ignores stale utterance IDs */
  applyFinalTranslation(utteranceId: number, translatedText: string, sourceText: string): void {
    if (!this.coordinator.isActiveTranslation(utteranceId)) {
      return;
    }

    const latencyMs = this.latencyTracker.markTranslationDisplayed();
    const turn: DialogueTurn = {
      id: crypto.randomUUID(),
      sourceText,
      translatedText,
      sourceLang: this.config.sourceLang,
      targetLang: this.config.targetLang,
      completedAt: Date.now(),
      latencyMs: latencyMs ?? 0,
    };

    this.contextBuffer.add(turn);
    this.completedTurns.push(turn);
    this.onTurnComplete?.(turn);

    this.patchState({
      sourceTranscript: sourceText,
      translatedText,
      partialSource: '',
      partialTranslation: '',
      turns: [...this.completedTurns],
      latencyMs: this.latencyTracker.getP50(),
      status: 'listening',
    });

    this.draftTranslation = '';
    this.awaitingCommit = false;
  }

  /** Mark translation in flight for an utterance */
  beginFinalTranslation(utteranceId: number, sourceText: string): void {
    if (!this.coordinator.isCurrent(utteranceId)) return;

    this.coordinator.beginTranslation(utteranceId);
    this.latencyTracker.markTurnEnd();
    this.patchState({
      status: 'translating',
      sourceTranscript: sourceText,
      partialSource: '',
      partialTranslation: '',
    });
  }

  private handleInputDelta(event: RealtimeTranscriptDelta): void {
    this.awaitingCommit = true;
    this.currentSourceText += event.delta;
    this.utteranceDetector.onSpeechActivity();
    this.patchState({
      partialSource: this.currentSourceText,
      status: 'listening',
    });
  }

  /** Accumulate draft translation internally — never exposed to UI */
  private handleOutputDelta(event: RealtimeTranscriptDelta): void {
    this.draftTranslation += event.delta;
  }

  private handleInputDone(event: Record<string, unknown>): void {
    const transcript =
      typeof event.transcript === 'string' ? event.transcript.trim() : '';
    const sourceText = transcript || this.currentSourceText.trim();
    this.currentSourceText = '';
    this.utteranceDetector.reset();

    if (sourceText) {
      this.commitUtterance(sourceText);
    }
  }

  private handleOutputDone(): void {
    // Discard streaming draft — final translation comes from dedicated request
    this.draftTranslation = '';
  }

  private commitUtteranceFromSilence(): void {
    if (!this.awaitingCommit) return;

    const sourceText = this.currentSourceText.trim();
    if (!sourceText) return;

    this.currentSourceText = '';
    this.commitUtterance(sourceText);
  }

  private commitUtterance(sourceText: string): void {
    if (!sourceText.trim()) return;

    this.awaitingCommit = false;
    this.utteranceDetector.reset();
    this.draftTranslation = '';

    const utteranceId = this.coordinator.nextUtteranceId();
    this.beginFinalTranslation(utteranceId, sourceText);

    this.onUtteranceReady?.({
      utteranceId,
      sourceText,
      sourceLang: this.config.sourceLang,
      targetLang: this.config.targetLang,
    });
  }

  swapLanguages(): { sourceLang: AppLanguage; targetLang: AppLanguage } {
    const sourceLang = this.config.targetLang;
    const targetLang = this.config.sourceLang;
    this.updateConfig({ sourceLang, targetLang });
    return { sourceLang, targetLang };
  }

  stopListening(): void {
    this.currentSourceText = '';
    this.draftTranslation = '';
    this.awaitingCommit = false;
    this.utteranceDetector.reset();
    this.reconnectAttempts = 0;
    this.patchState({
      status: 'idle',
      partialSource: '',
      partialTranslation: '',
      audioLevel: 0,
      error: null,
    });
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
    this.coordinator.reset();
    this.latencyTracker.reset();
    this.currentSourceText = '';
    this.draftTranslation = '';
    this.awaitingCommit = false;
    this.utteranceDetector.reset();
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
