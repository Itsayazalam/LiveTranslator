/** Detects end-of-utterance via silence after the last speech activity */
export class UtteranceDetector {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly silenceMs: number,
    private readonly onSilence: () => void,
  ) {}

  onSpeechActivity(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onSilence();
    }, this.silenceMs);
  }

  reset(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
