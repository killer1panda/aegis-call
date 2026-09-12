import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

export interface NostrSignalingEvent {
  roomId: string;
  senderPeerId: string;
  type: 'offer' | 'answer' | 'candidate';
  payload: any;
  timestamp: number;
}

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
];

export class NostrSignalingGateway {
  private sockets: WebSocket[] = [];
  private roomId: string;
  private peerId: string;
  private roomTag: string;
  private onMessageCallback: ((event: NostrSignalingEvent) => void) | null = null;
  private isConnected: boolean = false;

  constructor(roomId: string, peerId: string) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.roomTag = bytesToHex(sha256(new TextEncoder().encode(`aegis-nostr-room:${roomId}`)));
  }

  public connect(onMessage: (event: NostrSignalingEvent) => void) {
    this.onMessageCallback = onMessage;
    this.sockets = [];

    for (const relayUrl of DEFAULT_RELAYS) {
      try {
        const ws = new WebSocket(relayUrl);

        ws.onopen = () => {
          this.isConnected = true;
          // Subscribe to Nostr events tagged with this room's hash
          const subFilter = {
            kinds: [20000], // Ephemeral event kind (NIP-16) - never saved to disk by relays
            '#t': [this.roomTag],
            since: Math.floor(Date.now() / 1000) - 30,
          };
          const req = JSON.stringify(['REQ', `sub-${this.peerId.slice(0, 8)}`, subFilter]);
          ws.send(req);
        };

        ws.onmessage = (msgEvent) => {
          try {
            const data = JSON.parse(msgEvent.data);
            if (Array.isArray(data) && data[0] === 'EVENT' && data[2]) {
              const nostrEvent = data[2];
              const parsed: NostrSignalingEvent = JSON.parse(nostrEvent.content);
              if (parsed.senderPeerId !== this.peerId && this.onMessageCallback) {
                this.onMessageCallback(parsed);
              }
            }
          } catch {
            // Ignore parse errors from unformatted relay traffic
          }
        };

        ws.onerror = () => {};
        this.sockets.push(ws);
      } catch (err) {
        console.warn(`Could not connect to Nostr relay ${relayUrl}:`, err);
      }
    }
  }

  public broadcast(type: 'offer' | 'answer' | 'candidate', payload: any) {
    const eventPayload: NostrSignalingEvent = {
      roomId: this.roomId,
      senderPeerId: this.peerId,
      type,
      payload,
      timestamp: Date.now(),
    };

    const contentStr = JSON.stringify(eventPayload);
    const nowSec = Math.floor(Date.now() / 1000);

    // Ephemeral Nostr Event structure (Kind 20000)
    const nostrEvent = {
      id: bytesToHex(sha256(new TextEncoder().encode(`${this.peerId}:${nowSec}:${contentStr}`))),
      pubkey: bytesToHex(sha256(new TextEncoder().encode(this.peerId))),
      created_at: nowSec,
      kind: 20000,
      tags: [
        ['t', this.roomTag],
        ['p', this.peerId],
      ],
      content: contentStr,
      sig: 'ephemeral-nostr-sig',
    };

    const msg = JSON.stringify(['EVENT', nostrEvent]);

    for (const ws of this.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  public disconnect() {
    for (const ws of this.sockets) {
      try {
        ws.close();
      } catch {}
    }
    this.sockets = [];
    this.isConnected = false;
  }

  public get activeRelayCount(): number {
    return this.sockets.filter((s) => s.readyState === WebSocket.OPEN).length;
  }
}
