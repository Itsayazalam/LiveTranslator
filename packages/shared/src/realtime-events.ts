import { REALTIME_EVENTS } from './types.js';

export type NormalizedRealtimeKind =
  | 'input_delta'
  | 'output_delta'
  | 'input_done'
  | 'output_done'
  | 'error'
  | 'other';

export interface NormalizedRealtimeEvent {
  kind: NormalizedRealtimeKind;
  type: string;
  delta: string;
  transcript: string;
  message: string;
  raw: Record<string, unknown>;
}

function readDelta(raw: Record<string, unknown>): string {
  const value = raw.delta ?? raw.text ?? raw.transcript ?? '';
  return typeof value === 'string' ? value : '';
}

function readTranscript(raw: Record<string, unknown>): string {
  const value = raw.transcript ?? raw.text ?? '';
  return typeof value === 'string' ? value : '';
}

/** Map API event variants onto the shapes TranslationSession expects */
export function normalizeRealtimeEvent(raw: Record<string, unknown>): NormalizedRealtimeEvent {
  const type = String(raw.type ?? '');
  const lower = type.toLowerCase();

  let kind: NormalizedRealtimeKind = 'other';

  if (
    type === REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA ||
    (lower.includes('input') && lower.includes('transcript') && lower.includes('delta'))
  ) {
    kind = 'input_delta';
  } else if (
    type === REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DELTA ||
    (lower.includes('output') && lower.includes('transcript') && lower.includes('delta'))
  ) {
    kind = 'output_delta';
  } else if (
    type === REALTIME_EVENTS.INPUT_TRANSCRIPT_DONE ||
    (lower.includes('input') && lower.includes('transcript') && lower.includes('done'))
  ) {
    kind = 'input_done';
  } else if (
    type === REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DONE ||
    type === REALTIME_EVENTS.OUTPUT_AUDIO_DONE ||
    (lower.includes('output') && (lower.includes('done') || lower.includes('completed')))
  ) {
    kind = 'output_done';
  } else if (type === REALTIME_EVENTS.ERROR || lower === 'error') {
    kind = 'error';
  }

  return {
    kind,
    type,
    delta: readDelta(raw),
    transcript: readTranscript(raw),
    message: String(raw.message ?? raw.error ?? ''),
    raw,
  };
}

export function toSessionEvent(normalized: NormalizedRealtimeEvent): Record<string, unknown> {
  switch (normalized.kind) {
    case 'input_delta':
      return { type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA, delta: normalized.delta };
    case 'output_delta':
      return { type: REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DELTA, delta: normalized.delta };
    case 'input_done':
      return {
        type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DONE,
        transcript: normalized.transcript,
      };
    case 'output_done':
      return { type: REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DONE };
    case 'error':
      return { type: REALTIME_EVENTS.ERROR, message: normalized.message };
    default:
      return normalized.raw;
  }
}
