import { describe, expect, it, vi } from 'vitest';
import { TurnBuffer } from '../turn-buffer.js';
import { LatencyTracker } from '../latency-tracker.js';
import { TranslationSession } from '../session.js';
import { REALTIME_EVENTS } from '@live-translator/shared';
import type { DialogueTurn } from '@live-translator/shared';

describe('TurnBuffer', () => {
  it('caps turns at maxTurns', () => {
    const buffer = new TurnBuffer(3);
    for (let i = 0; i < 5; i++) {
      buffer.add({
        id: String(i),
        sourceText: `source ${i}`,
        translatedText: `translated ${i}`,
        sourceLang: 'en-AU',
        targetLang: 'hi',
        completedAt: Date.now(),
        latencyMs: 100,
      });
    }
    expect(buffer.size()).toBe(3);
    expect(buffer.getAll()[0]?.sourceText).toBe('source 2');
  });

  it('builds context prompt from turns', () => {
    const buffer = new TurnBuffer(10);
    buffer.add({
      id: '1',
      sourceText: 'Hello',
      translatedText: 'Namaste',
      sourceLang: 'en-AU',
      targetLang: 'hi',
      completedAt: Date.now(),
      latencyMs: 100,
    });
    expect(buffer.toContextPrompt()).toContain('Hello');
    expect(buffer.toContextPrompt()).toContain('Namaste');
  });
});

describe('LatencyTracker', () => {
  it('computes p50 from samples', () => {
    const tracker = new LatencyTracker(5);
    tracker.markTurnEnd();
    const latency = tracker.markTranslationDisplayed();
    expect(latency).toBeGreaterThanOrEqual(0);
    expect(tracker.getP50()).not.toBeNull();
  });
});

describe('TranslationSession', () => {
  it('processes transcript delta events', () => {
    const session = new TranslationSession();
    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA,
      delta: 'Hello',
    });
    expect(session.getState().partialSource).toBe('Hello');
    expect(session.getState().status).toBe('listening');
  });

  it('does not expose streaming output translations in UI state', () => {
    const session = new TranslationSession();
    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA,
      delta: 'Hello',
    });
    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DELTA,
      delta: 'Namaste',
    });
    expect(session.getState().partialTranslation).toBe('');
    expect(session.getState().translatedText).toBe('');
  });

  it('fires onUtteranceReady on input done and applies final translation separately', () => {
    const onUtteranceReady = vi.fn();
    const onTurnComplete = vi.fn();
    const session = new TranslationSession({ onUtteranceReady, onTurnComplete });

    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA,
      delta: 'Hello world',
    });
    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DONE,
      transcript: 'Hello world',
    });

    expect(onUtteranceReady).toHaveBeenCalledWith(
      expect.objectContaining({
        utteranceId: 1,
        sourceText: 'Hello world',
      }),
    );
    expect(session.getState().status).toBe('translating');
    expect(session.getState().translatedText).toBe('');

    session.applyFinalTranslation(1, 'Namaste duniya', 'Hello world');

    expect(session.getState().sourceTranscript).toBe('Hello world');
    expect(session.getState().translatedText).toBe('Namaste duniya');
    expect(session.getState().status).toBe('listening');
    expect(onTurnComplete).toHaveBeenCalledTimes(1);
  });

  it('ignores stale final translations', () => {
    const session = new TranslationSession();
    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA,
      delta: 'First',
    });
    session.handleRealtimeEvent({ type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DONE, transcript: 'First' });
    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA,
      delta: 'Second',
    });
    session.handleRealtimeEvent({ type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DONE, transcript: 'Second' });

    session.applyFinalTranslation(1, 'Stale', 'First');
    session.applyFinalTranslation(2, 'Dusra', 'Second');

    expect(session.getState().translatedText).toBe('Dusra');
    expect(session.getState().turns).toHaveLength(1);
  });

  it('swaps languages', () => {
    const session = new TranslationSession({
      config: { sourceLang: 'en-AU', targetLang: 'hi', silenceDurationMs: 700, maxTurns: 5 },
    });
    const swapped = session.swapLanguages();
    expect(swapped.sourceLang).toBe('hi');
    expect(swapped.targetLang).toBe('en-AU');
  });

  it('stopListening preserves conversation', () => {
    const session = new TranslationSession();
    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA,
      delta: 'Hello',
    });
    session.handleRealtimeEvent({ type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DONE, transcript: 'Hello' });
    session.applyFinalTranslation(1, 'Namaste', 'Hello');

    session.stopListening();
    const state = session.getState();
    expect(state.status).toBe('idle');
    expect(state.turns).toHaveLength(1);
    expect(state.sourceTranscript).toBe('Hello');
    expect(state.translatedText).toBe('Namaste');
  });

  it('hydrates persisted turns', () => {
    const session = new TranslationSession();
    session.hydrate(
      [
        {
          id: '1',
          sourceText: 'Hi',
          translatedText: 'Namaste',
          sourceLang: 'en-AU',
          targetLang: 'hi',
          completedAt: Date.now(),
          latencyMs: 100,
        },
      ],
      'Hi',
      'Namaste',
    );
    expect(session.getState().turns).toHaveLength(1);
    expect(session.getState().sourceTranscript).toBe('Hi');
  });
});
