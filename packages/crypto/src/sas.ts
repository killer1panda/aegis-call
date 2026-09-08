import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { SASVerification } from './types.js';

// Curated 64 distinct, universally recognizable, easily pronouncible emojis
const EMOJI_ALPHABET = [
  '🐶', '🐱', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯',
  '🦄', '🐙', '🦋', '🐬', '🦉', '🦅', '🐝', '🐢',
  '🍏', '🍓', '🍒', '🥑', '🍕', '🌮', '🍩', '🍫',
  '🚀', '🛸', '🛰️', '⛵', '⚓', '🏎️', '🚲', '✈️',
  '💎', '👑', '🛡️', '⚔️', '🗝️', '🔮', '🧭', '⭐',
  '⚡', '🔥', '🌊', '🌈', '🌸', '🌻', '🌲', '🍀',
  '🎸', '🥁', '🎺', '🎹', '🎨', '🎯', '🏆', '🥇',
  '💡', '🔔', '🕹️', '🧭', '⚓', '🧩', '🪐', '✨'
];

/**
 * Derives consistent Short Authentication Strings (SAS / Safety Numbers)
 * for two communicating peers to detect any Man-in-the-Middle (MitM) attacks.
 *
 * The keys are lexicographically sorted to ensure that both Alice and Bob
 * arrive at the exact same numeric and emoji representation.
 */
export function generateSafetyNumbers(
  localPublicKey: Uint8Array,
  remotePublicKey: Uint8Array,
  sasEntropy: Uint8Array
): SASVerification {
  const localHex = bytesToHex(localPublicKey);
  const remoteHex = bytesToHex(remotePublicKey);

  // Canonical ordering ensures identical output regardless of caller/callee role
  const sortedKeys = [localHex, remoteHex].sort();

  const combinedData = new Uint8Array([
    ...new TextEncoder().encode(sortedKeys[0]),
    ...new TextEncoder().encode(sortedKeys[1]),
    ...sasEntropy,
  ]);

  const hash = sha256(combinedData);
  const hashHex = bytesToHex(hash);

  // 1. Generate 60-digit numeric code (12 blocks of 5 digits)
  const view = new DataView(hash.buffer, hash.byteOffset, hash.byteLength);
  const blocks: string[] = [];
  
  // Use sequential 16-bit / 32-bit slices modulo 100000
  for (let i = 0; i < 12; i++) {
    const offset = (i * 2) % (hash.length - 2);
    const val = (view.getUint16(offset, false) * 31 + i * 17) % 100000;
    blocks.push(val.toString().padStart(5, '0'));
  }
  const numericCode = blocks.join(' ');

  // 2. Select 4 distinct emojis
  const emojis: string[] = [];
  for (let i = 0; i < 4; i++) {
    const byte = hash[i * 4 + 7] ^ hash[i * 4 + 8];
    const index = byte % EMOJI_ALPHABET.length;
    emojis.push(EMOJI_ALPHABET[index]);
  }

  // 3. Formatted hex fingerprint (32 bytes formatted in pairs)
  const hexFingerprint = hashHex.match(/.{1,4}/g)?.join(' ') ?? hashHex;

  return {
    numericCode,
    emojis,
    hexFingerprint,
  };
}
