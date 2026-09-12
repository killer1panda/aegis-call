/**
 * Bell 202 Audio Frequency Shift Keying (AFSK) Acoustic Modem.
 * Enables transmitting short encrypted payloads, SAS tokens, or text across
 * analog audio channels, legacy PSTN phone lines, and radio transceivers.
 *
 * Mark Frequency (1): 1200 Hz
 * Space Frequency (0): 2200 Hz
 * Baud Rate: 300 baud
 */

export const MARK_FREQ = 1200; // Binary 1
export const SPACE_FREQ = 2200; // Binary 0
export const DEFAULT_BAUD_RATE = 300; // 300 baud for high analog noise immunity
export const DEFAULT_SAMPLE_RATE = 48000;
export const SYNC_WORD = [0x7e, 0x5a];

/**
 * Computes CRC-16-CCITT (Polynomial 0x1021, Initial 0xFFFF).
 */
export function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

/**
 * Encodes a binary payload into a 48kHz / 44.1kHz Float32Array PCM audio buffer
 * using Bell 202 continuous-phase Audio Frequency Shift Keying (AFSK).
 */
export function encodeAcousticSignal(
  payload: Uint8Array,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
  baudRate: number = DEFAULT_BAUD_RATE
): Float32Array {
  const samplesPerBit = Math.round(sampleRate / baudRate);

  // 1. Frame construction:
  // [Preamble (32 bits = 4 bytes of 0xAA)]
  // [Sync Word (2 bytes: 0x7E, 0x5A)]
  // [Length (2 bytes, big-endian)]
  // [Payload (N bytes)]
  // [CRC-16 (2 bytes, big-endian)]
  // [Trailer (8 bits = 1 byte of 0xFF)]

  const lengthBytes = new Uint8Array([
    (payload.length >> 8) & 0xff,
    payload.length & 0xff,
  ]);
  const payloadChecksum = crc16(payload);
  const crcBytes = new Uint8Array([
    (payloadChecksum >> 8) & 0xff,
    payloadChecksum & 0xff,
  ]);

  const frameBytes: number[] = [
    0xaa, 0xaa, 0xaa, 0xaa, // Preamble
    ...SYNC_WORD,
    ...lengthBytes,
    ...payload,
    ...crcBytes,
    0xff, // Trailer
  ];

  // 2. Convert bytes to bit stream (LSB first for standard serial)
  const bitStream: number[] = [];
  for (const byte of frameBytes) {
    for (let b = 0; b < 8; b++) {
      bitStream.push((byte >> b) & 1);
    }
  }

  // 3. Continuous-phase FSK signal synthesis
  const totalSamples = bitStream.length * samplesPerBit;
  const audioBuffer = new Float32Array(totalSamples);
  let phase = 0;

  let sampleIdx = 0;
  for (const bit of bitStream) {
    const freq = bit === 1 ? MARK_FREQ : SPACE_FREQ;
    const phaseIncrement = (2 * Math.PI * freq) / sampleRate;

    for (let s = 0; s < samplesPerBit; s++) {
      // Apply smooth raised-cosine window near bit edges to suppress out-of-band splatter
      let amplitude = 0.85;
      if (s < samplesPerBit * 0.05) {
        amplitude *= 0.5 * (1 - Math.cos((Math.PI * s) / (samplesPerBit * 0.05)));
      } else if (s > samplesPerBit * 0.95) {
        amplitude *= 0.5 * (1 - Math.cos((Math.PI * (samplesPerBit - s)) / (samplesPerBit * 0.05)));
      }

      audioBuffer[sampleIdx++] = amplitude * Math.sin(phase);
      phase += phaseIncrement;
      if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
    }
  }

  return audioBuffer;
}

/**
 * Computes the spectral energy at a target frequency across a window of samples
 * using the Goertzel algorithm.
 */
function goertzelEnergy(
  samples: Float32Array,
  start: number,
  length: number,
  targetFreq: number,
  sampleRate: number
): number {
  const k = (length * targetFreq) / sampleRate;
  const w = (2 * Math.PI * k) / length;
  const coeff = 2 * Math.cos(w);

  let q0 = 0;
  let q1 = 0;
  let q2 = 0;

  for (let i = 0; i < length; i++) {
    const sample = samples[start + i] || 0;
    q0 = coeff * q1 - q2 + sample;
    q2 = q1;
    q1 = q0;
  }

  return q1 * q1 + q2 * q2 - q1 * q2 * coeff;
}

/**
 * Decodes an AFSK audio signal back into the original binary payload.
 */
export function decodeAcousticSignal(
  audio: Float32Array,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
  baudRate: number = DEFAULT_BAUD_RATE
): Uint8Array {
  const samplesPerBit = Math.round(sampleRate / baudRate);
  const totalBits = Math.floor(audio.length / samplesPerBit);
  if (totalBits < 48) {
    throw new Error('Acoustic signal too short to contain a valid AFSK frame');
  }

  // 1. Demodulate bit stream via Goertzel dual-frequency discriminator
  const rawBits: number[] = new Array(totalBits);
  for (let b = 0; b < totalBits; b++) {
    const start = b * samplesPerBit;
    const energyMark = goertzelEnergy(audio, start, samplesPerBit, MARK_FREQ, sampleRate);
    const energySpace = goertzelEnergy(audio, start, samplesPerBit, SPACE_FREQ, sampleRate);
    rawBits[b] = energyMark >= energySpace ? 1 : 0;
  }

  // 2. Search for Sync Word in bitstream: 0x7E (01111110) then 0x5A (01011010)
  let syncOffset = -1;
  for (let i = 0; i <= rawBits.length - 16; i++) {
    let b0 = 0;
    let b1 = 0;
    for (let bit = 0; bit < 8; bit++) {
      b0 |= (rawBits[i + bit] << bit);
      b1 |= (rawBits[i + 8 + bit] << bit);
    }
    if (b0 === SYNC_WORD[0] && b1 === SYNC_WORD[1]) {
      syncOffset = i + 16;
      break;
    }
  }

  if (syncOffset === -1) {
    throw new Error('Acoustic sync word not found in audio stream');
  }

  // 3. Helper to read a byte from bitstream starting at an offset
  const readByte = (bitIndex: number): number => {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte |= (rawBits[bitIndex + b] << b);
    }
    return byte;
  };

  // 4. Read Length (2 bytes)
  const lenHigh = readByte(syncOffset);
  const lenLow = readByte(syncOffset + 8);
  const payloadLength = (lenHigh << 8) | lenLow;

  if (payloadLength < 0 || payloadLength > 4096) {
    throw new Error(`Invalid acoustic frame payload length: ${payloadLength}`);
  }

  const payloadBitStart = syncOffset + 16;
  const payloadBitEnd = payloadBitStart + payloadLength * 8;
  const crcBitStart = payloadBitEnd;

  if (crcBitStart + 16 > rawBits.length) {
    throw new Error('Incomplete acoustic frame received');
  }

  // 5. Read Payload
  const payload = new Uint8Array(payloadLength);
  for (let p = 0; p < payloadLength; p++) {
    payload[p] = readByte(payloadBitStart + p * 8);
  }

  // 6. Read and Verify CRC-16
  const crcHigh = readByte(crcBitStart);
  const crcLow = readByte(crcBitStart + 8);
  const expectedCrc = (crcHigh << 8) | crcLow;
  const actualCrc = crc16(payload);

  if (expectedCrc !== actualCrc) {
    throw new Error(`Acoustic payload CRC-16 mismatch: expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)}`);
  }

  return payload;
}
