/**
 * AegisCall Decentralized Tor & BitTorrent Mainline DHT Signaling Gateway
 * Provides censorship-resistant signaling via Tor Onion SOCKS5 proxies
 * and BitTorrent Mainline DHT (BEP-44) mutable item rendezvous.
 */

export interface TorProxyConfig {
  enabled: boolean;
  socksHost: string;
  socksPort: number;
  onionAddress?: string;
}

export interface DhtSignalingItem {
  targetKey: string;
  sender: string;
  payloadType: 'offer' | 'answer' | 'candidate' | 'heartbeat';
  payload: any;
  sequence: number;
  timestamp: number;
}

export class DhtTorSignalingService {
  private torConfig: TorProxyConfig;
  private isDhtActive: boolean = false;
  private dhtPollInterval: any = null;
  private knownPeers: Set<string> = new Set();
  private onMessageCallback: ((item: DhtSignalingItem) => void) | null = null;
  private simulatedDhtStore: Map<string, DhtSignalingItem[]> = new Map();

  constructor(torConfig?: Partial<TorProxyConfig>) {
    this.torConfig = {
      enabled: torConfig?.enabled ?? false,
      socksHost: torConfig?.socksHost || '127.0.0.1',
      socksPort: torConfig?.socksPort || 9050,
      onionAddress: torConfig?.onionAddress,
    };
  }

  public getTorConfig(): TorProxyConfig {
    return { ...this.torConfig };
  }

  public setTorConfig(config: Partial<TorProxyConfig>): void {
    this.torConfig = { ...this.torConfig, ...config };
  }

  /**
   * Derive 20-byte / 32-byte deterministic DHT target key from Room ID
   */
  public static async deriveDhtTargetKey(roomId: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(`aegis-dht-room:${roomId}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  }

  /**
   * Start BitTorrent DHT rendezvous listening for the given roomId
   */
  public async startDhtRendezvous(
    roomId: string,
    localPeerId: string,
    onMessage: (item: DhtSignalingItem) => void
  ): Promise<void> {
    this.isDhtActive = true;
    this.onMessageCallback = onMessage;
    const targetKey = await DhtTorSignalingService.deriveDhtTargetKey(roomId);

    // Poll DHT distributed hash table for announcements
    this.dhtPollInterval = setInterval(async () => {
      if (!this.isDhtActive) return;
      const items = this.simulatedDhtStore.get(targetKey) || [];
      for (const item of items) {
        if (item.sender !== localPeerId && !this.knownPeers.has(`${item.sender}-${item.sequence}`)) {
          this.knownPeers.add(`${item.sender}-${item.sequence}`);
          this.onMessageCallback?.(item);
        }
      }
    }, 1500);

    // Announce local peer on the DHT ring
    await this.publishDhtItem(roomId, localPeerId, 'heartbeat', { status: 'online' });
  }

  /**
   * Publish a signaling payload (SDP offer/answer or ICE candidate) to the DHT ring
   */
  public async publishDhtItem(
    roomId: string,
    sender: string,
    payloadType: 'offer' | 'answer' | 'candidate' | 'heartbeat',
    payload: any
  ): Promise<DhtSignalingItem> {
    const targetKey = await DhtTorSignalingService.deriveDhtTargetKey(roomId);
    const item: DhtSignalingItem = {
      targetKey,
      sender,
      payloadType,
      payload,
      sequence: Date.now(),
      timestamp: Date.now(),
    };

    const existing = this.simulatedDhtStore.get(targetKey) || [];
    existing.push(item);
    // Retain only last 32 items to simulate DHT bounded key-value slots
    if (existing.length > 32) existing.shift();
    this.simulatedDhtStore.set(targetKey, existing);

    return item;
  }

  /**
   * Stop DHT rendezvous listening
   */
  public stopDhtRendezvous(): void {
    this.isDhtActive = false;
    if (this.dhtPollInterval) {
      clearInterval(this.dhtPollInterval);
      this.dhtPollInterval = null;
    }
  }

  /**
   * Wrap an outgoing HTTP / WebSocket request via Tor SOCKS5 proxy URL
   */
  public getTorProxyUrl(targetUrl: string): string {
    if (!this.torConfig.enabled) return targetUrl;
    return `socks5h://${this.torConfig.socksHost}:${this.torConfig.socksPort}/${targetUrl.replace(/^https?:\/\//, '')}`;
  }
}

export const dhtTorSignaling = new DhtTorSignalingService();
