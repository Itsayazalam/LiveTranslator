import { describe, expect, it, vi } from 'vitest';
import { TurnBuffer } from '../turn-buffer.js';
import { LatencyTracker } from '../latency-tracker.js';
import { TranslationSession } from '../session.js';
import { REALTIME_EVENTS } from '@live-translator/shared';

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
  it('streams partial source only — ignores output deltas', () => {
    const session = new TranslationSession();
    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA,
      delta: 'Hello',
    });
    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DELTA,
      delta: 'Namaste',
    });

    expect(session.getState().partialSource).toBe('Hello');
    expect(session.getState().partialTranslation).toBe('');
    expect(session.getState().status).toBe('listening');
  });

  it('does not auto-commit on output done events', () => {
    const onTurnComplete = vi.fn();
    const session = new TranslationSession({ onTurnComplete });

    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA,
      delta: 'Hello world',
    });
    session.handleRealtimeEvent({ type: REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DONE });

    expect(session.getState().turns).toHaveLength(0);
    expect(onTurnComplete).not.toHaveBeenCalled();
  });

  it('finalizes segment with batch translation on commit', () => {
    const onTurnComplete = vi.fn();
    const session = new TranslationSession({ onTurnComplete });

    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA,
      delta: 'Hello',
    });

    expect(session.beginSegmentFinalize()).toBe('Hello');
    expect(session.getState().status).toBe('translating');

    session.applyFinalTranslation('Namaste');
    expect(session.getState().translatedText).toBe('Namaste');
    expect(session.getState().status).toBe('paused');

    session.commitFinalizedSegment();

    const state = session.getState();
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]?.sourceText).toBe('Hello');
    expect(state.turns[0]?.translatedText).toBe('Namaste');
    expect(state.partialSource).toBe('');
    expect(state.translatedText).toBe('');
    expect(onTurnComplete).toHaveBeenCalledTimes(1);
  });

  it('hold pause keeps source visible until release with finalized translation', () => {
    const onTurnComplete = vi.fn();
    const session = new TranslationSession({ onTurnComplete });

    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA,
      delta: 'Hello',
    });

    session.enterHoldPause();
    session.beginSegmentFinalize();
    session.applyFinalTranslation('Namaste');

    let state = session.getState();
    expect(state.status).toBe('paused');
    expect(state.partialSource).toBe('Hello');
    expect(state.translatedText).toBe('Namaste');
    expect(state.turns).toHaveLength(0);

    session.releaseHoldPause();

    state = session.getState();
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]?.translatedText).toBe('Namaste');
    expect(onTurnComplete).toHaveBeenCalledTimes(1);
  });

  it('swapLanguages flips config', () => {
    const session = new TranslationSession({
      config: { sourceLang: 'en-AU', targetLang: 'hi' },
    });
    const swapped = session.swapLanguages();
    expect(swapped).toEqual({ sourceLang: 'hi', targetLang: 'en-AU' });
    expect(session.getConfig().sourceLang).toBe('hi');
    expect(session.getConfig().targetLang).toBe('en-AU');
  });

  it('stopListening commits finalized segment', () => {
    const session = new TranslationSession();
    session.handleRealtimeEvent({
      type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA,
      delta: 'Hello',
    });
    session.beginSegmentFinalize();
    session.applyFinalTranslation('Namaste');

    session.stopListening();
    const state = session.getState();
    expect(state.status).toBe('idle');
    expect(state.turns).toHaveLength(1);
    expect(state.translatedText).toBe('');
  });
});
