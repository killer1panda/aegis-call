import { describe, it, expect } from 'vitest';
import { CRDTWhiteboardDoc } from '../src/crdtWhiteboard.js';

describe('Deterministic CRDT Vector Clock Whiteboard', () => {
  it('should create strokes locally and update vector clock and lamport timestamps', () => {
    const docA = new CRDTWhiteboardDoc('peer-alice');

    const { element, delta } = docA.addStroke({
      id: 'stroke-1',
      type: 'pen',
      points: [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ],
      color: '#00ffcc',
      strokeWidth: 3,
    });

    expect(element.creator).toBe('peer-alice');
    expect(element.lamport).toBe(1);
    expect(element.deleted).toBe(false);

    expect(delta.sender).toBe('peer-alice');
    expect(delta.vectorClock['peer-alice']).toBe(1);
    expect(delta.elements).toHaveLength(1);

    const active = docA.getActiveElements();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('stroke-1');
  });

  it('should synchronize strokes bidirectionally between two peers', () => {
    const docA = new CRDTWhiteboardDoc('peer-alice');
    const docB = new CRDTWhiteboardDoc('peer-bob');

    const { delta: deltaA } = docA.addStroke({
      id: 'stroke-a1',
      type: 'pen',
      points: [{ x: 5, y: 5 }],
      color: '#ff0055',
      strokeWidth: 2,
    });

    const { delta: deltaB } = docB.addStroke({
      id: 'stroke-b1',
      type: 'circle',
      points: [{ x: 50, y: 50 }],
      color: '#00ccff',
      strokeWidth: 4,
    });

    // Alice merges Bob's delta
    const changedA = docA.mergeDelta(deltaB);
    expect(changedA).toBe(true);

    // Bob merges Alice's delta
    const changedB = docB.mergeDelta(deltaA);
    expect(changedB).toBe(true);

    const activeA = docA.getActiveElements();
    const activeB = docB.getActiveElements();

    expect(activeA).toHaveLength(2);
    expect(activeB).toHaveLength(2);

    // Assert both peers have identical ordered state
    expect(activeA.map((e) => e.id)).toEqual(activeB.map((e) => e.id));
  });

  it('should resolve concurrent conflicting updates using Last-Write-Wins (LWW)', () => {
    const docA = new CRDTWhiteboardDoc('peer-alice');
    const docB = new CRDTWhiteboardDoc('peer-bob');

    // Both peers mutate stroke-1 concurrently with different colors
    const { delta: deltaA } = docA.addStroke({
      id: 'stroke-shared',
      type: 'pen',
      points: [{ x: 10, y: 10 }],
      color: '#00ff00',
      strokeWidth: 2,
    });

    // Bob also creates stroke-shared with higher lamport or different color
    const { delta: deltaB } = docB.addStroke({
      id: 'stroke-shared',
      type: 'pen',
      points: [{ x: 10, y: 10 }],
      color: '#ffff00',
      strokeWidth: 5,
    });

    docA.mergeDelta(deltaB);
    docB.mergeDelta(deltaA);

    const finalA = docA.getActiveElements()[0];
    const finalB = docB.getActiveElements()[0];

    expect(finalA.id).toBe('stroke-shared');
    expect(finalB.id).toBe('stroke-shared');
    // Deterministic winner
    expect(finalA.color).toBe(finalB.color);
    expect(finalA.strokeWidth).toBe(finalB.strokeWidth);
  });

  it('should propagate tombstone deletions and exclude deleted strokes from active list', () => {
    const docA = new CRDTWhiteboardDoc('peer-alice');
    const docB = new CRDTWhiteboardDoc('peer-bob');

    const { delta: strokeDelta } = docA.addStroke({
      id: 'stroke-to-delete',
      type: 'pen',
      points: [{ x: 1, y: 1 }],
      color: '#fff',
      strokeWidth: 1,
    });

    docB.mergeDelta(strokeDelta);
    expect(docB.getActiveElements()).toHaveLength(1);

    // Alice deletes the stroke
    const deleteDelta = docA.deleteElement('stroke-to-delete');
    expect(deleteDelta).not.toBeNull();
    expect(docA.getActiveElements()).toHaveLength(0);

    // Bob receives delete delta
    docB.mergeDelta(deleteDelta!);
    expect(docB.getActiveElements()).toHaveLength(0);
  });

  it('should serialize and restore complete document state accurately', () => {
    const docA = new CRDTWhiteboardDoc('peer-alice');
    docA.addStroke({
      id: 'stroke-1',
      type: 'pen',
      points: [{ x: 10, y: 20 }],
      color: '#abcdef',
      strokeWidth: 2,
    });
    docA.addStroke({
      id: 'stroke-2',
      type: 'rect',
      points: [{ x: 30, y: 40 }],
      color: '#fedcba',
      strokeWidth: 4,
    });

    const json = docA.toJSON();
    const restored = CRDTWhiteboardDoc.fromJSON(json, 'peer-carol');

    expect(restored.getActiveElements()).toHaveLength(2);
    expect(restored.getActiveElements().map((e) => e.id)).toEqual(['stroke-1', 'stroke-2']);
  });
});
