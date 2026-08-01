import { describe, expect, it } from 'vitest';
import { WebRTCClient } from './webrtc-client';

describe('WebRTCClient', () => {
  it('disconnect clears peer connection', () => {
    const client = new WebRTCClient();
    client.disconnect();
    expect((client as unknown as { pc: RTCPeerConnection | null }).pc).toBeNull();
  });
});
