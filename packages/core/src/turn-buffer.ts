import type { DialogueTurn } from '@live-translator/shared';

export class TurnBuffer {
  private turns: DialogueTurn[] = [];

  constructor(private readonly maxTurns: number) {}

  add(turn: DialogueTurn): void {
    this.turns.push(turn);
    if (this.turns.length > this.maxTurns) {
      this.turns.shift();
    }
  }

  getAll(): readonly DialogueTurn[] {
    return this.turns;
  }

  getRecent(count: number): readonly DialogueTurn[] {
    return this.turns.slice(-count);
  }

  clear(): void {
    this.turns = [];
  }

  size(): number {
    return this.turns.length;
  }

  /** Build context string for session.update transcription hints */
  toContextPrompt(): string {
    return this.turns
      .map((t) => `[${t.sourceLang}] ${t.sourceText} → [${t.targetLang}] ${t.translatedText}`)
      .join('\n');
  }
}
