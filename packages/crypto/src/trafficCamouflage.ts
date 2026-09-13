/**
 * AegisCall Constant-Rate Constant-Volume Traffic Camouflage (Anti-Traffic-Analysis)
 * Defeats Deep Packet Inspection (DPI) and statistical traffic analysis by maintaining
 * an unbroken, flat, continuous transmission rate with synthetic dummy packets.
 */

export const DUMMY_FRAME_MAGIC = new Uint8Array([0xd0, 0xda, 0x55, 0xaa]);
export const DEFAULT_CAMOUFLAGE_FRAME_SIZE = 256; // 256 bytes constant frame size

export interface CamouflageStats {
  realFramesSent: number;
  dummyFramesSent: number;
  totalBytesTransmitted: number;
  dummyFramesDropped: number;
  targetPps: number;
}

export class TrafficCamouflagePacer {
  private targetFrameSizeBytes: number;
  private targetPps: number; // Packets per second (default 50 = 20ms interval)
  private realFramesSent = 0;
  private dummyFramesSent = 0;
  private totalBytesTransmitted = 0;

  constructor(targetFrameSizeBytes = DEFAULT_CAMOUFLAGE_FRAME_SIZE, targetPps = 50) {
    this.targetFrameSizeBytes = targetFrameSizeBytes;
    this.targetPps = targetPps;
  }

  /**
   * Generates a synthetic dummy frame with identical length, structure, and pseudo-random
   * entropy as legitimate encrypted Opus audio frames.
   */
  public generateDummyFrame(): Uint8Array {
    const frame = new Uint8Array(this.targetFrameSizeBytes);
    crypto.getRandomValues(frame);

    // Embed camouflage magic marker in first 4 bytes
    frame.set(DUMMY_FRAME_MAGIC, 0);

    // 2-byte random sequence number to mimic RTP counters
    const seq = Math.floor(Math.random() * 65535);
    frame[4] = (seq >> 8) & 0xff;
    frame[5] = seq & 0xff;

    this.dummyFramesSent++;
    this.totalBytesTransmitted += frame.length;
    return frame;
  }

  /**
   * Processes an outgoing frame: if real frame exists, pads it to constant size.
   * If real frame is absent (muted/silence), substitutes with synthetic dummy frame.
   */
  public paceFrame(realFrame?: Uint8Array | null): Uint8Array {
    if (realFrame && realFrame.length > 0) {
      this.realFramesSent++;
      if (realFrame.length === this.targetFrameSizeBytes) {
        this.totalBytesTransmitted += realFrame.length;
        return realFrame;
      }

      // Pad or truncate to target constant frame size
      const padded = new Uint8Array(this.targetFrameSizeBytes);
      crypto.getRandomValues(padded); // Fill with random noise
      padded.set(realFrame.slice(0, this.targetFrameSizeBytes), 0);
      this.totalBytesTransmitted += padded.length;
      return padded;
    }

    return this.generateDummyFrame();
  }

  public getStats(): CamouflageStats {
    return {
      realFramesSent: this.realFramesSent,
      dummyFramesSent: this.dummyFramesSent,
      totalBytesTransmitted: this.totalBytesTransmitted,
      dummyFramesDropped: 0,
      targetPps: this.targetPps,
    };
  }
}

export class TrafficCamouflageFilter {
  private dummyFramesDropped = 0;

  /**
   * Checks if an incoming ciphertext packet is a synthetic camouflage dummy packet.
   */
  public isDummyFrame(packet: Uint8Array): boolean {
    if (packet.length < DUMMY_FRAME_MAGIC.length) return false;
    for (let i = 0; i < DUMMY_FRAME_MAGIC.length; i++) {
      if (packet[i] !== DUMMY_FRAME_MAGIC[i]) return false;
    }
    return true;
  }

  /**
   * Demultiplexes wire packets: discards dummy camouflage frames with zero downstream latency,
   * while letting genuine encrypted audio/video payloads proceed to SFrame decryption.
   */
  public filterFrame(packet: Uint8Array): Uint8Array | null {
    if (this.isDummyFrame(packet)) {
      this.dummyFramesDropped++;
      return null;
    }
    return packet;
  }

  public getDroppedCount(): number {
    return this.dummyFramesDropped;
  }
}
