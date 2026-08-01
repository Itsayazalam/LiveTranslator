/** Tracks utterance generations to prevent stale translations updating the UI */
export class TranslationCoordinator {
  private latestUtteranceId = 0;
  private activeTranslationId: number | null = null;

  nextUtteranceId(): number {
    this.latestUtteranceId += 1;
    return this.latestUtteranceId;
  }

  getLatestId(): number {
    return this.latestUtteranceId;
  }

  beginTranslation(utteranceId: number): void {
    this.activeTranslationId = utteranceId;
  }

  isCurrent(utteranceId: number): boolean {
    return utteranceId === this.latestUtteranceId;
  }

  isActiveTranslation(utteranceId: number): boolean {
    return this.activeTranslationId === utteranceId && this.isCurrent(utteranceId);
  }

  reset(): void {
    this.latestUtteranceId = 0;
    this.activeTranslationId = null;
  }
}
