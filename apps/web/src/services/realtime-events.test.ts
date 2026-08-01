import { describe, expect, it } from 'vitest';
import { normalizeRealtimeEvent, toSessionEvent } from '@live-translator/shared';
import { REALTIME_EVENTS } from '@live-translator/shared';

describe('normalizeRealtimeEvent', () => {
  it('normalizes standard output transcript delta', () => {
    const normalized = normalizeRealtimeEvent({
      type: 'session.output_transcript.delta',
      delta: 'Namaste',
    });
    expect(normalized.kind).toBe('output_delta');
    expect(toSessionEvent(normalized)).toEqual({
      type: REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DELTA,
      delta: 'Namaste',
    });
  });

  it('normalizes variant event type strings', () => {
    const normalized = normalizeRealtimeEvent({
      type: 'response.output_audio_transcript.delta',
      text: 'Hello',
    });
    expect(normalized.kind).toBe('output_delta');
    expect(toSessionEvent(normalized).delta).toBe('Hello');
  });
});
