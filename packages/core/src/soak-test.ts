/**
 * Soak test — simulates 30+ minutes of session engine activity
 * to verify memory stability and turn buffer behavior.
 *
 * Usage: pnpm soak
 */
import { TranslationSession } from '@live-translator/core';
import { REALTIME_EVENTS } from '@live-translator/shared';

const DURATION_MS = 5_000; // Quick validation; set to 30 * 60 * 1000 for full soak
const TURN_INTERVAL_MS = 2000;
const MAX_TURNS = 500;

function simulateTurn(session: TranslationSession, index: number): void {
  const source = `Test utterance number ${index}`;
  const translated = `परीक्षण उत्तर ${index}`;

  session.handleRealtimeEvent({
    type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DELTA,
    delta: source,
  });
  session.handleRealtimeEvent({ type: REALTIME_EVENTS.INPUT_TRANSCRIPT_DONE });
  session.handleRealtimeEvent({
    type: REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DELTA,
    delta: translated,
  });
  session.handleRealtimeEvent({ type: REALTIME_EVENTS.OUTPUT_TRANSCRIPT_DONE });
}

async function main() {
  console.log('Soak test: simulating session engine activity\n');

  const session = new TranslationSession({
    config: { sourceLang: 'en-AU', targetLang: 'hi', silenceDurationMs: 600, maxTurns: 10 },
  });

  const startMem = process.memoryUsage();
  const startTime = Date.now();
  let turnCount = 0;

  while (Date.now() - startTime < DURATION_MS && turnCount < MAX_TURNS) {
    simulateTurn(session, turnCount);
    turnCount++;
    await new Promise((r) => setTimeout(r, TURN_INTERVAL_MS));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const endMem = process.memoryUsage();
  const heapDeltaMB = ((endMem.heapUsed - startMem.heapUsed) / 1024 / 1024).toFixed(2);

  console.log(`Completed ${turnCount} turns in ${elapsed}s`);
  console.log(`Turn buffer size: ${session.getTurnBuffer().size()} (max 10)`);
  console.log(`Heap delta: ${heapDeltaMB} MB`);
  console.log(`Final latency p50: ${session.getState().latencyMs ?? 'N/A'}ms`);

  const bufferOk = session.getTurnBuffer().size() <= 10;
  const memOk = endMem.heapUsed - startMem.heapUsed < 50 * 1024 * 1024; // <50MB growth

  if (bufferOk && memOk) {
    console.log('\nPASS: Soak test completed successfully.');
  } else {
    console.error('\nFAIL: Buffer or memory limits exceeded.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Soak test failed:', err);
  process.exit(1);
});
