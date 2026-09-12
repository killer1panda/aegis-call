/**
 * WebTransport (HTTP/3 over UDP 443) Gateway Client
 * Traverses strict corporate proxies and deep packet inspection (DPI) firewalls
 * that block standard STUN/TURN UDP ports (3478/5349).
 */
export class WebTransportGateway {
  private transport: any = null;
  private writer: any = null;
  private reader: any = null;
  private isConnected = false;

  public static isSupported(): boolean {
    return typeof window !== 'undefined' && 'WebTransport' in window;
  }

  public async connect(url: string): Promise<boolean> {
    if (!WebTransportGateway.isSupported()) {
      console.warn('WebTransport is not supported in this browser environment');
      return false;
    }

    try {
      const WebTransportClass = (window as any).WebTransport;
      this.transport = new WebTransportClass(url);

      await this.transport.ready;
      this.isConnected = true;
      this.writer = this.transport.datagrams.writable.getWriter();
      this.listenDatagrams();

      console.info('🛡️ WebTransport (HTTP/3 UDP:443) tunnel established');
      return true;
    } catch (err) {
      console.warn('WebTransport connection failed (falling back to standard WebRTC):', err);
      this.isConnected = false;
      return false;
    }
  }

  private async listenDatagrams() {
    try {
      this.reader = this.transport.datagrams.readable.getReader();
      while (this.isConnected) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this.onDatagramReceived(value);
      }
    } catch (err) {
      if (this.isConnected) {
        console.warn('WebTransport datagram read error:', err);
      }
    }
  }

  protected onDatagramReceived(datagram: Uint8Array) {
    // Dispatched to SFrame frame decoder when operating in WebTransport media relay mode
  }

  public async sendDatagram(data: Uint8Array): Promise<void> {
    if (!this.isConnected || !this.writer) return;
    try {
      await this.writer.write(data);
    } catch (err) {
      console.warn('Failed to send WebTransport datagram:', err);
    }
  }

  public async close(): Promise<void> {
    this.isConnected = false;
    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch {}
      this.writer = null;
    }
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {}
      this.reader = null;
    }
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {}
      this.transport = null;
    }
  }
}
