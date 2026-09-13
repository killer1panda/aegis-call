/**
 * AegisCall Inaudible Ultrasound Near-Field Pairing Modem (Data-Over-Sound)
 * Operates in the 18.5 kHz - 20.5 kHz near-ultrasound band. Inaudible to human ears
 * but captured by standard smartphone/laptop microphones to perform zero-network pairing
 * in < 1.5 seconds.
 */

export const ULTRASONIC_MARK_FREQ = 19000;  // 19 kHz (Binary 1)
export const ULTRASONIC_SPACE_FREQ = 20000; // 20 kHz (Binary 0)
export const ULTRASONIC_SAMPLE_RATE = 48000; // 48 kHz standard audio rate
export const ULTRASONIC_BAUD_RATE = 400;     // 400 symbols/sec = 120 samples per symbol

function computeCrc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

export class UltrasonicModem {
  /**
   * Modulates binary payload into inaudible ultrasound PCM audio waveform (Float32Array).
   */
  public static modulate(
    payload: Uint8Array,
    sampleRate = ULTRASONIC_SAMPLE_RATE,
    baudRate = ULTRASONIC_BAUD_RATE
  ): Float32Array {
    const samplesPerBit = Math.floor(sampleRate / baudRate);

    // 1. Frame format: Preamble (0xAA, 0x55) + Length (1B) + Payload + CRC-16 (2B)
    const crc = computeCrc16(payload);
    const framed = new Uint8Array(2 + 1 + payload.length + 2);
    framed[0] = 0xaa;
    framed[1] = 0x55;
    framed[2] = payload.length;
    framed.set(payload, 3);
    framed[3 + payload.length] = (crc >> 8) & 0xff;
    framed[4 + payload.length] = crc & 0xff;

    // 2. Expand bytes to bitstream with start (0) and stop (1) framing
    const bits: number[] = [];
    // 8-bit carrier lead-in tone (all mark 19 kHz)
    for (let i = 0; i < 8; i++) bits.push(1);

    for (const byte of framed) {
      bits.push(0); // Start bit
      for (let b = 0; b < 8; b++) {
        bits.push((byte >> b) & 1);
      }
      bits.push(1); // Stop bit
    }

    // 8-bit carrier lead-out tone
    for (let i = 0; i < 8; i++) bits.push(1);

    // 3. Synthesize continuous phase sinusoidal PCM audio
    const totalSamples = bits.length * samplesPerBit;
    const pcm = new Float32Array(totalSamples);
    let phase = 0;

    let sampleIdx = 0;
    for (const bit of bits) {
      const freq = bit === 1 ? ULTRASONIC_MARK_FREQ : ULTRASONIC_SPACE_FREQ;
      const phaseIncrement = (2 * Math.PI * freq) / sampleRate;

      for (let s = 0; s < samplesPerBit; s++) {
        // Smooth Tukey envelope at bit transitions to eliminate audio clicks
        let amplitude = 0.8;
        if (s < 8) amplitude *= s / 8;
        if (s > samplesPerBit - 8) amplitude *= (samplesPerBit - s) / 8;

        pcm[sampleIdx++] = amplitude * Math.sin(phase);
        phase += phaseIncrement;
        if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
      }
    }

    return pcm;
  }

  /**
   * Evaluates Goertzel spectral filter energy at given frequency.
   */
  public static goertzelEnergy(
    samples: Float32Array,
    startIdx: number,
    len: number,
    targetFreq: number,
    sampleRate: number
  ): number {
    const k = Math.round((len * targetFreq) / sampleRate);
    const omega = (2 * Math.PI * k) / len;
    const coeff = 2 * Math.cos(omega);

    let sPrev = 0;
    let sPrev2 = 0;

    for (let i = 0; i < len; i++) {
      const idx = startIdx + i;
      if (idx >= samples.length) break;
      const s = samples[idx] + coeff * sPrev - sPrev2;
      sPrev2 = sPrev;
      sPrev = s;
    }

    return sPrev * sPrev + sPrev2 * sPrev2 - coeff * sPrev * sPrev2;
  }

  /**
   * Demodulates ultrasonic audio samples to extract payload bytes.
   */
  public static demodulate(
    samples: Float32Array,
    sampleRate = ULTRASONIC_SAMPLE_RATE,
    baudRate = ULTRASONIC_BAUD_RATE
  ): Uint8Array | null {
    const samplesPerBit = Math.floor(sampleRate / baudRate);
    const totalBits = Math.floor(samples.length / samplesPerBit);
    if (totalBits < 20) return null;

    // Decode bitstream using Goertzel dual-tone filter
    const bits: number[] = [];
    for (let i = 0; i < totalBits; i++) {
      const offset = i * samplesPerBit;
      const markEnergy = this.goertzelEnergy(samples, offset, samplesPerBit, ULTRASONIC_MARK_FREQ, sampleRate);
      const spaceEnergy = this.goertzelEnergy(samples, offset, samplesPerBit, ULTRASONIC_SPACE_FREQ, sampleRate);

      bits.push(markEnergy >= spaceEnergy ? 1 : 0);
    }

    // Search for sync preamble (0xAA = 10101010, 0x55 = 01010101)
    // Find byte alignment by scanning through bits
    for (let bIdx = 0; bIdx < bits.length - 80; bIdx++) {
      // Decode byte starting at bIdx (expecting start bit 0, 8 data bits, stop bit 1)
      if (bits[bIdx] === 0) {
        let byteVal = 0;
        for (let b = 0; b < 8; b++) {
          byteVal |= (bits[bIdx + 1 + b] << b);
        }
        if (byteVal === 0xaa && bits[bIdx + 9] === 1) {
          // Check next byte for 0x55
          const nextIdx = bIdx + 10;
          if (bits[nextIdx] === 0) {
            let byte2 = 0;
            for (let b = 0; b < 8; b++) {
              byte2 |= (bits[nextIdx + 1 + b] << b);
            }
            if (byte2 === 0x55 && bits[nextIdx + 9] === 1) {
              // Preamble found! Extract length and payload
              let cursor = nextIdx + 10;
              const readByte = (): number | null => {
                if (cursor + 9 >= bits.length || bits[cursor] !== 0 || bits[cursor + 9] !== 1) return null;
                let val = 0;
                for (let bit = 0; bit < 8; bit++) {
                  val |= (bits[cursor + 1 + bit] << bit);
                }
                cursor += 10;
                return val;
              };

              const len = readByte();
              if (len === null || len <= 0 || len > 128) continue;

              const payload = new Uint8Array(len);
              let valid = true;
              for (let p = 0; p < len; p++) {
                const byte = readByte();
                if (byte === null) {
                  valid = false;
                  break;
                }
                payload[p] = byte;
              }

              if (valid) {
                const crcHigh = readByte();
                const crcLow = readByte();
                if (crcHigh !== null && crcLow !== null) {
                  const expectedCrc = (crcHigh << 8) | crcLow;
                  if (computeCrc16(payload) === expectedCrc) {
                    return payload;
                  }
                }
              }
            }
          }
        }
      }
    }

    return null;
  }
}
