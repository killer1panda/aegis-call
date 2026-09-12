import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export interface DeviceRegistration {
  peerDid: string;
  platform: 'ios' | 'android' | 'web';
  pushToken: string;
  registeredAt: number;
}

export interface PushCallPayload {
  callerDid: string;
  callerName: string;
  recipientDid: string;
  roomId: string;
  hasVideo: boolean;
}

export class PushService {
  private static registrations = new Map<string, DeviceRegistration>();

  /**
   * Registers push routes on the signaling server instance.
   */
  public static registerRoutes(server: FastifyInstance): void {
    // 1. Device Token Registration
    server.post('/api/push/register', async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Partial<DeviceRegistration>;
      if (!body.peerDid || !body.pushToken || !body.platform) {
        return reply.status(400).send({ error: 'Missing required registration parameters (peerDid, platform, pushToken)' });
      }

      const registration: DeviceRegistration = {
        peerDid: body.peerDid,
        platform: body.platform,
        pushToken: body.pushToken,
        registeredAt: Date.now(),
      };

      this.registrations.set(body.peerDid, registration);
      return reply.send({
        success: true,
        message: `Registered ${body.platform} VoIP push token for ${body.peerDid.slice(0, 16)}...`,
        registeredAt: registration.registeredAt,
      });
    });

    // 2. Outgoing Call Push Dispatch (APNs VoIP & FCM Data-Only)
    server.post('/api/push/call', async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as PushCallPayload;
      if (!body.callerDid || !body.recipientDid || !body.roomId) {
        return reply.status(400).send({ error: 'Missing required call parameters (callerDid, recipientDid, roomId)' });
      }

      const recipient = this.registrations.get(body.recipientDid);
      const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      if (!recipient) {
        return reply.status(200).send({
          dispatched: false,
          callId,
          recipientFound: false,
          message: 'Recipient does not have an active push registration. Falling back to in-band signaling.',
        });
      }

      // Simulate native APNs VoIP / FCM Data-Only dispatch
      const pushPacket = {
        apnsHeaders: {
          'apns-push-type': 'voip',
          'apns-priority': '10',
          'apns-expiration': '0',
          'apns-topic': 'org.aegiscall.app.voip',
        },
        fcmPayload: {
          priority: 'high',
          content_available: true,
        },
        data: {
          callId,
          callerDid: body.callerDid,
          callerName: body.callerName || 'Aegis Verified Peer',
          roomId: body.roomId,
          hasVideo: !!body.hasVideo,
          isPostQuantum: true,
          timestamp: Date.now(),
        },
      };

      return reply.status(200).send({
        dispatched: true,
        callId,
        recipientFound: true,
        platform: recipient.platform,
        packet: pushPacket,
      });
    });

    // 3. Query registration status
    server.get('/api/push/status/:peerDid', async (request: FastifyRequest<{ Params: { peerDid: string } }>, reply: FastifyReply) => {
      const { peerDid } = request.params;
      const reg = this.registrations.get(peerDid);
      return reply.send({
        registered: !!reg,
        platform: reg?.platform,
        registeredAt: reg?.registeredAt,
      });
    });
  }

  public static getActiveRegistrationsCount(): number {
    return this.registrations.size;
  }

  public static clearRegistrations(): void {
    this.registrations.clear();
  }
}
