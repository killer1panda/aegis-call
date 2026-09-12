export interface OHttpFetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: any;
}

export class OHttpGateway {
  private static relayUrl: string = '/ohttp-relay';

  /**
   * Sets a custom external oblivious relay URL (e.g. Cloudflare Privacy Gateway or self-hosted proxy).
   */
  public static setRelayUrl(url: string): void {
    this.relayUrl = url;
  }

  /**
   * Dispatches an HTTP request through an RFC 9458 Oblivious Relay.
   * Strips client public IP address and device signatures from target server perception.
   */
  public static async fetch<T = any>(targetPath: string, options: OHttpFetchOptions = {}): Promise<T> {
    const payload = {
      version: '1.0',
      targetPath,
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
    };

    const res = await fetch(this.relayUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`OHTTP relay request failed with status ${res.status}`);
    }

    const data = await res.json();
    if (data.status >= 400) {
      throw new Error(`OHTTP target returned error status ${data.status}: ${JSON.stringify(data.body)}`);
    }

    return data.body as T;
  }
}
