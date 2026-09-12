/**
 * AegisCall Deterministic CRDT Vector Clock Whiteboard Engine
 * Provides Conflict-free Replicated Data Type (CRDT) state synchronization
 * with Lamport timestamps, Vector Clocks, and Last-Write-Wins (LWW) tombstone resolution.
 */

export interface Point {
  x: number;
  y: number;
}

export interface CRDTElement {
  id: string;
  type: 'pen' | 'rect' | 'circle' | 'arrow' | 'eraser';
  points: Point[];
  color: string;
  strokeWidth: number;
  creator: string;
  lamport: number;
  deleted: boolean;
  updatedAt: number;
}

export interface WhiteboardDelta {
  deltaId: string;
  sender: string;
  elements: CRDTElement[];
  vectorClock: Record<string, number>;
  timestamp: number;
}

export class CRDTWhiteboardDoc {
  private elements: Map<string, CRDTElement> = new Map();
  private vectorClock: Map<string, number> = new Map();
  private currentLamport: number = 0;
  private peerId: string;

  constructor(peerId: string) {
    this.peerId = peerId;
    this.vectorClock.set(peerId, 0);
  }

  public getPeerId(): string {
    return this.peerId;
  }

  public getVectorClock(): Record<string, number> {
    const clock: Record<string, number> = {};
    for (const [peer, seq] of this.vectorClock.entries()) {
      clock[peer] = seq;
    }
    return clock;
  }

  public getLamport(): number {
    return this.currentLamport;
  }

  /**
   * Apply a newly created stroke locally and generate a broadcastable delta.
   */
  public addStroke(
    element: Omit<CRDTElement, 'creator' | 'lamport' | 'deleted' | 'updatedAt'>
  ): { element: CRDTElement; delta: WhiteboardDelta } {
    this.currentLamport++;
    const currentSeq = (this.vectorClock.get(this.peerId) || 0) + 1;
    this.vectorClock.set(this.peerId, currentSeq);

    const crdtElement: CRDTElement = {
      ...element,
      creator: this.peerId,
      lamport: this.currentLamport,
      deleted: false,
      updatedAt: Date.now(),
    };

    this.elements.set(crdtElement.id, crdtElement);

    const delta: WhiteboardDelta = {
      deltaId: `delta-${this.peerId}-${currentSeq}-${Date.now()}`,
      sender: this.peerId,
      elements: [crdtElement],
      vectorClock: this.getVectorClock(),
      timestamp: Date.now(),
    };

    return { element: crdtElement, delta };
  }

  /**
   * Tombstone an element locally (soft delete with LWW resolution) and generate a delta.
   */
  public deleteElement(elementId: string): WhiteboardDelta | null {
    const existing = this.elements.get(elementId);
    if (!existing) return null;

    this.currentLamport = Math.max(this.currentLamport, existing.lamport) + 1;
    const currentSeq = (this.vectorClock.get(this.peerId) || 0) + 1;
    this.vectorClock.set(this.peerId, currentSeq);

    const tombstone: CRDTElement = {
      ...existing,
      deleted: true,
      lamport: this.currentLamport,
      updatedAt: Date.now(),
    };

    this.elements.set(elementId, tombstone);

    return {
      deltaId: `delta-del-${this.peerId}-${currentSeq}-${Date.now()}`,
      sender: this.peerId,
      elements: [tombstone],
      vectorClock: this.getVectorClock(),
      timestamp: Date.now(),
    };
  }

  /**
   * Clear the whiteboard by marking all active elements as deleted.
   */
  public clear(): WhiteboardDelta {
    this.currentLamport++;
    const currentSeq = (this.vectorClock.get(this.peerId) || 0) + 1;
    this.vectorClock.set(this.peerId, currentSeq);

    const tombstones: CRDTElement[] = [];

    for (const [id, el] of this.elements.entries()) {
      if (!el.deleted) {
        const tombstone: CRDTElement = {
          ...el,
          deleted: true,
          lamport: this.currentLamport,
          updatedAt: Date.now(),
        };
        this.elements.set(id, tombstone);
        tombstones.push(tombstone);
      }
    }

    return {
      deltaId: `delta-clear-${this.peerId}-${currentSeq}-${Date.now()}`,
      sender: this.peerId,
      elements: tombstones,
      vectorClock: this.getVectorClock(),
      timestamp: Date.now(),
    };
  }

  /**
   * Merges a remote delta using Last-Write-Wins (LWW) resolution.
   * If Lamport timestamps match, ties are deterministically broken using creator string comparison.
   */
  public mergeDelta(delta: WhiteboardDelta): boolean {
    let stateChanged = false;

    // Advance local Lamport clock
    this.currentLamport = Math.max(this.currentLamport, delta.timestamp ? Math.floor(delta.timestamp / 1000) : 0);

    // Merge vector clock
    for (const [peer, seq] of Object.entries(delta.vectorClock)) {
      const localSeq = this.vectorClock.get(peer) || 0;
      if (seq > localSeq) {
        this.vectorClock.set(peer, seq);
      }
    }

    // Merge incoming elements
    for (const incoming of delta.elements) {
      this.currentLamport = Math.max(this.currentLamport, incoming.lamport);
      const existing = this.elements.get(incoming.id);

      if (!existing) {
        this.elements.set(incoming.id, incoming);
        stateChanged = true;
      } else {
        // Last-Write-Wins (LWW) conflict resolution:
        // 1. Higher lamport timestamp wins
        // 2. Tie-break with creator string lexicographical order
        // 3. If still tied, updatedAt timestamp
        const incomingWins =
          incoming.lamport > existing.lamport ||
          (incoming.lamport === existing.lamport && incoming.creator > existing.creator) ||
          (incoming.lamport === existing.lamport &&
            incoming.creator === existing.creator &&
            incoming.updatedAt > existing.updatedAt);

        if (incomingWins) {
          this.elements.set(incoming.id, incoming);
          stateChanged = true;
        }
      }
    }

    return stateChanged;
  }

  /**
   * Returns all currently active (non-tombstoned) elements ordered deterministically.
   */
  public getActiveElements(): CRDTElement[] {
    return Array.from(this.elements.values())
      .filter((el) => !el.deleted)
      .sort((a, b) => {
        if (a.lamport !== b.lamport) return a.lamport - b.lamport;
        return a.id.localeCompare(b.id);
      });
  }

  /**
   * Export the complete state for bootstrapping a new peer.
   */
  public exportFullDelta(): WhiteboardDelta {
    return {
      deltaId: `delta-full-${this.peerId}-${Date.now()}`,
      sender: this.peerId,
      elements: Array.from(this.elements.values()),
      vectorClock: this.getVectorClock(),
      timestamp: Date.now(),
    };
  }

  /**
   * Serialize entire document to JSON.
   */
  public toJSON(): string {
    return JSON.stringify({
      peerId: this.peerId,
      currentLamport: this.currentLamport,
      vectorClock: this.getVectorClock(),
      elements: Array.from(this.elements.values()),
    });
  }

  /**
   * Restore document from JSON string.
   */
  public static fromJSON(json: string, peerId: string): CRDTWhiteboardDoc {
    const data = JSON.parse(json);
    const doc = new CRDTWhiteboardDoc(peerId);
    doc.currentLamport = data.currentLamport || 0;

    if (data.vectorClock) {
      for (const [peer, seq] of Object.entries(data.vectorClock)) {
        doc.vectorClock.set(peer, seq as number);
      }
    }

    if (Array.isArray(data.elements)) {
      for (const el of data.elements) {
        doc.elements.set(el.id, el);
      }
    }

    return doc;
  }
}
