export class LatencyTracker {
  private samples: number[] = [];
  private turnEndTime: number | null = null;

  constructor(private readonly sampleSize: number = 5) {}

  markTurnEnd(): void {
    this.turnEndTime = performance.now();
  }

  markTranslationDisplayed(): number | null {
    if (this.turnEndTime === null) return null;
    const latency = Math.round(performance.now() - this.turnEndTime);
    this.samples.push(latency);
    if (this.samples.length > this.sampleSize) {
      this.samples.shift();
    }
    this.turnEndTime = null;
    return latency;
  }

  getLast(): number | null {
    return this.samples.length > 0 ? this.samples[this.samples.length - 1]! : null;
  }

  getP50(): number | null {
    if (this.samples.length === 0) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
      : sorted[mid]!;
  }

  reset(): void {
    this.samples = [];
    this.turnEndTime = null;
  }
}
