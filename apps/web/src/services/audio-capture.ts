export interface AudioCaptureOptions {
  deviceId?: string | null;
  onLevelChange?: (level: number) => void;
}

export class AudioCaptureService {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrame: number | null = null;
  private onLevelChange?: (level: number) => void;

  async start(options: AudioCaptureOptions = {}): Promise<MediaStream> {
    this.onLevelChange = options.onLevelChange;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.startLevelMonitoring(this.stream);
    return this.stream;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  stop(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.analyser = null;
  }

  static async listDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  private startLevelMonitoring(stream: MediaStream): void {
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    const data = new Uint8Array(this.analyser.frequencyBinCount);

    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(data);
      const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
      const level = Math.min(100, Math.round((avg / 128) * 100));
      this.onLevelChange?.(level);
      this.animationFrame = requestAnimationFrame(tick);
    };

    tick();
  }
}
