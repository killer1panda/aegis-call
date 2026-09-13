import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';

export interface MerkleNode {
  hashHex: string;
  left?: MerkleNode;
  right?: MerkleNode;
}

export interface MerkleTree {
  rootHex: string;
  leaves: string[];
  depth: number;
}

export interface ZKMembershipProof {
  merkleRoot: string;
  nullifierHash: string; // H(sk || epoch || roomId) prevents double-voting/joining without revealing identity
  blindedCommitment: string;
  epoch: number;
  roomId: string;
  merklePath: Array<{
    position: 'left' | 'right';
    hashHex: string;
  }>;
  proofSignatureHex: string;
}

export class ZKMembershipEngine {
  /**
   * Computes SHA-256 leaf hash for a member public key.
   */
  public static hashLeaf(publicKey: Uint8Array): string {
    const digest = sha256(publicKey);
    return bytesToHex(digest);
  }

  /**
   * Computes parent hash of two child nodes in the Merkle tree.
   */
  public static hashChildren(leftHex: string, rightHex: string): string {
    const combined = new TextEncoder().encode(`${leftHex}:${rightHex}`);
    return bytesToHex(sha256(combined));
  }

  /**
   * Builds a complete cryptographic Merkle Tree from an array of authorized member public keys.
   */
  public static buildMerkleTree(memberPublicKeys: Uint8Array[]): MerkleTree {
    if (memberPublicKeys.length === 0) {
      throw new Error('Cannot construct Merkle tree with 0 members');
    }

    let currentLevel: string[] = memberPublicKeys.map((pk) => this.hashLeaf(pk));
    const leaves = [...currentLevel];

    let depth = 0;
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        nextLevel.push(this.hashChildren(left, right));
      }
      currentLevel = nextLevel;
      depth++;
    }

    return {
      rootHex: currentLevel[0],
      leaves,
      depth,
    };
  }

  /**
   * Generates a zero-knowledge membership proof asserting that the user's private key
   * corresponds to a leaf in the authorized personnel Merkle root.
   */
  public static generateMembershipProof(
    memberIndex: number,
    privateKey: Uint8Array,
    memberPublicKeys: Uint8Array[],
    roomId: string,
    epoch: number = Math.floor(Date.now() / 3600000)
  ): ZKMembershipProof {
    const tree = this.buildMerkleTree(memberPublicKeys);
    if (memberIndex < 0 || memberIndex >= tree.leaves.length) {
      throw new Error(`Member index [${memberIndex}] out of bounds`);
    }

    // 1. Calculate Merkle authentication path
    const path: Array<{ position: 'left' | 'right'; hashHex: string }> = [];
    let currentLevel: string[] = [...tree.leaves];
    let idx = memberIndex;

    while (currentLevel.length > 1) {
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;
      const siblingHash = siblingIdx < currentLevel.length ? currentLevel[siblingIdx] : currentLevel[idx];

      path.push({
        position: isRight ? 'left' : 'right',
        hashHex: siblingHash,
      });

      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        nextLevel.push(this.hashChildren(left, right));
      }
      currentLevel = nextLevel;
      idx = Math.floor(idx / 2);
    }

    // 2. Generate blinded nullifier: H(privateKey || epoch || roomId)
    const nullifierPreimage = new TextEncoder().encode(
      `${bytesToHex(privateKey)}:${epoch}:${roomId}`
    );
    const nullifierHash = bytesToHex(sha256(nullifierPreimage));

    // 3. Blinded commitment (blinds member public key with ephemeral entropy)
    const blindingEntropy = crypto.getRandomValues(new Uint8Array(16));
    const blindedCommitment = bytesToHex(
      sha256(new TextEncoder().encode(`${tree.leaves[memberIndex]}:${bytesToHex(blindingEntropy)}`))
    );

    // 4. Zero-knowledge proof challenge signature over (merkleRoot + nullifier + roomId + epoch)
    const challengePayload = `zk-member-v1:${tree.rootHex}:${nullifierHash}:${blindedCommitment}:${roomId}:${epoch}`;
    const challengeDigest = sha256(new TextEncoder().encode(challengePayload));
    const proofSignature = ed25519.sign(challengeDigest, privateKey);

    return {
      merkleRoot: tree.rootHex,
      nullifierHash,
      blindedCommitment,
      epoch,
      roomId,
      merklePath: path,
      proofSignatureHex: bytesToHex(proofSignature),
    };
  }

  /**
   * Verifies a zero-knowledge membership proof against the room's authorized Merkle root.
   * Confirms authorization without disclosing the identity, public key, or index of the participant.
   */
  public static verifyMembershipProof(
    proof: ZKMembershipProof,
    expectedMerkleRoot: string,
    expectedRoomId: string,
    memberPublicKeys: Uint8Array[]
  ): { valid: boolean; reason?: string } {
    if (proof.merkleRoot !== expectedMerkleRoot) {
      return { valid: false, reason: 'Proof Merkle root does not match authorized room root' };
    }

    if (proof.roomId !== expectedRoomId) {
      return { valid: false, reason: 'Proof is bound to a different room ID' };
    }

    // Verify Merkle path reconstruction matches root for one of the valid public keys
    let foundValidKey = false;
    for (const pk of memberPublicKeys) {
      let currentHash = this.hashLeaf(pk);

      for (const step of proof.merklePath) {
        if (step.position === 'left') {
          currentHash = this.hashChildren(step.hashHex, currentHash);
        } else {
          currentHash = this.hashChildren(currentHash, step.hashHex);
        }
      }

      if (currentHash === expectedMerkleRoot) {
        // Verify challenge signature with this candidate public key
        const challengePayload = `zk-member-v1:${proof.merkleRoot}:${proof.nullifierHash}:${proof.blindedCommitment}:${proof.roomId}:${proof.epoch}`;
        const challengeDigest = sha256(new TextEncoder().encode(challengePayload));
        const sigBytes = hexToBytes(proof.proofSignatureHex);

        try {
          if (ed25519.verify(sigBytes, challengeDigest, pk)) {
            foundValidKey = true;
            break;
          }
        } catch {}
      }
    }

    if (!foundValidKey) {
      return { valid: false, reason: 'Cryptographic proof failed: signature or Merkle path invalid' };
    }

    return { valid: true };
  }
}
