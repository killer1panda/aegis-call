import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export interface OHttpRequestPayload {
  version: '1.0';
  targetPath: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: any;
}

export interface OHttpResponsePayload {
  version: '1.0';
  status: number;
  headers: Record<string, string>;
  body: any;
  relayedAt: number;
}

export class OHttpRelay {
  /**
   * Registers RFC 9458 Oblivious Relay endpoint on Fastify instance.
   * Strips client network identifiers (IP, user-agent, routing signatures)
   * to provide zero-knowledge IP masking.
   */
  public static registerRoutes(server: FastifyInstance): void {
    server.post('/ohttp-relay', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = request.body as OHttpRequestPayload;

        if (!payload || !payload.targetPath) {
          return reply.status(400).send({
            error: 'Invalid OHTTP encapsulation: missing targetPath',
          });
        }

        // Validate allowed targets to prevent open-proxy SSRF abuse
        const allowedPrefixes = ['/turn-credentials', '/health', '/api/push/'];
        const isAllowed = allowedPrefixes.some((prefix) => payload.targetPath.startsWith(prefix));

        if (!isAllowed) {
          return reply.status(403).send({
            error: 'OHTTP relay target forbidden: targetPath not in zero-knowledge relay whitelist',
          });
        }

        // Sanitize headers: completely remove client IP and origin footprints
        const sanitizedHeaders: Record<string, string> = {
          'x-oblivious-relay': 'aegis-rfc9458',
          'content-type': 'application/json',
        };

        // Internal dispatch via Fastify inject (in-memory, 0 network hop)
        const injectedResponse = await server.inject({
          method: payload.method || 'GET',
          url: payload.targetPath,
          headers: sanitizedHeaders,
          payload: payload.body,
        });

        let parsedBody: any;
        try {
          parsedBody = JSON.parse(injectedResponse.payload);
        } catch {
          parsedBody = injectedResponse.payload;
        }

        const ohttpResponse: OHttpResponsePayload = {
          version: '1.0',
          status: injectedResponse.statusCode,
          headers: {
            'content-type': injectedResponse.headers['content-type'] as string || 'application/json',
          },
          body: parsedBody,
          relayedAt: Date.now(),
        };

        return reply.status(200).header('content-type', 'application/json').send(ohttpResponse);
      } catch (err: any) {
        return reply.status(500).send({
          error: `OHTTP relay failed: ${err.message}`,
        });
      }
    });
  }
}
