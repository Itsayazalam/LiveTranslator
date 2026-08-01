import type { AppLanguage } from '@live-translator/shared';
import { normalizeRealtimeEvent, toSessionEvent } from '@live-translator/shared';

const ICE_GATHERING_TIMEOUT_MS = 5_000;
const DATA_CHANNEL_OPEN_TIMEOUT_MS = 15_000;
const SDP_EXCHANGE_TIMEOUT_MS = 60_000;
const SDP_RETRY_ATTEMPTS = 3;

export type RealtimeEventHandler = (event: Record<string, unknown>) => void;

export interface WebRTCClientOptions {
  apiBaseUrl: string;
  sourceLang: AppLanguage;
  targetLang: AppLanguage;
  onEvent: RealtimeEventHandler;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: Error) => void;
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }

    const onStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onStateChange);
        resolve();
      }
    };

    pc.addEventListener('icegatheringstatechange', onStateChange);
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      resolve();
    }, ICE_GATHERING_TIMEOUT_MS);
  });
}

function waitForDataChannelOpen(dc: RTCDataChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    if (dc.readyState === 'open') {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error('Data channel failed to open. Check network or retry.'));
    }, DATA_CHANNEL_OPEN_TIMEOUT_MS);

    dc.onopen = () => {
      clearTimeout(timeout);
      resolve();
    };

    dc.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Data channel error during connection'));
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WebRTCClient {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;

  async connect(
    localStream: MediaStream,
    options: WebRTCClientOptions,
  ): Promise<void> {
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
      throw new Error('No audio track available');
    }
    this.pc.addTrack(audioTrack, localStream);

    // Receive remote tracks for WebRTC negotiation, but never play them —
    // this app is text-only (subtitles), not spoken interpretation.
    this.pc.ontrack = (event) => {
      for (const track of event.streams.flatMap((s) => s.getTracks())) {
        track.enabled = false;
      }
      for (const track of event.track ? [event.track] : []) {
        track.enabled = false;
      }
    };

    this.pc.ondatachannel = (event) => {
      this.bindDataChannel(event.channel, options);
    };

    this.dataChannel = this.pc.createDataChannel('oai-events');
    this.bindDataChannel(this.dataChannel, options);

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state === 'connected') {
        options.onConnectionChange?.(true);
      } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        options.onConnectionChange?.(false);
        if (state === 'failed') {
          options.onError?.(new Error('WebRTC connection failed'));
        }
      }
    };

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await waitForIceGathering(this.pc);

    const localSdp = this.pc.localDescription?.sdp;
    if (!localSdp) {
      throw new Error('Failed to create local SDP offer');
    }

    const answerSdp = await this.exchangeSdpViaServer(localSdp, options);
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    if (this.dataChannel) {
      await waitForDataChannelOpen(this.dataChannel);
    }
  }

  disconnect(): void {
    this.dataChannel?.close();
    this.pc?.close();
    this.dataChannel = null;
    this.pc = null;
  }

  private bindDataChannel(channel: RTCDataChannel, options: WebRTCClientOptions): void {
    // OpenAI may deliver events on the client-created or server-created channel
    if (channel.label !== 'oai-events') return;

    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.dataChannel = channel;
    }

    channel.onmessage = ({ data }) => {
      try {
        const raw = JSON.parse(data as string) as Record<string, unknown>;
        const normalized = normalizeRealtimeEvent(raw);
        const sessionEvent =
          normalized.kind === 'other' ? raw : toSessionEvent(normalized);
        if (import.meta.env.DEV) {
          console.debug('[realtime]', normalized.type, normalized.kind, normalized.delta || '');
        }
        options.onEvent(sessionEvent);
      } catch {
        // ignore malformed events
      }
    };
  }

  private async exchangeSdpViaServer(
    sdp: string,
    options: WebRTCClientOptions,
  ): Promise<string> {
    const origin =
      options.apiBaseUrl ||
      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173');
    const url = new URL('/api/calls', origin);
    url.searchParams.set('sourceLang', options.sourceLang);
    url.searchParams.set('targetLang', options.targetLang);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < SDP_RETRY_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await sleep(1000 * attempt);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SDP_EXCHANGE_TIMEOUT_MS);

      try {
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: sdp,
          signal: controller.signal,
        });

        if (response.ok) {
          return response.text();
        }

        const errorText = await response.text();
        let message = `WebRTC negotiation failed (${response.status})`;

        try {
          const parsed = JSON.parse(errorText) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          if (response.status === 504) {
            message = 'OpenAI WebRTC handshake timed out (504)';
          }
        }

        lastError = new Error(message);

        if (response.status >= 502 && response.status <= 504 && attempt < SDP_RETRY_ATTEMPTS - 1) {
          continue;
        }

        throw lastError;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new Error('WebRTC handshake timed out. Check your network and retry.');
          if (attempt < SDP_RETRY_ATTEMPTS - 1) continue;
          throw lastError;
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError ?? new Error('WebRTC handshake failed');
  }
}
