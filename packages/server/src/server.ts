import Fastify, { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { WebSocket } from 'ws';
import { RoomManager } from './roomManager.js';
import { ClientMessage, ServerMessage } from './types.js';

import { generateEphemeralTurnCredentials } from './turnCredentials.js';

export function createServer(): FastifyInstance {
  const server = Fastify({
    logger: false,
  });

  const roomManager = new RoomManager();

  server.register(cors, {
    origin: '*',
  });

  server.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB max message size for SDP/candidates
    },
  });

  // REST endpoints for health check & stats
  server.get('/health', async () => {
    return {
      status: 'ok',
      service: 'aegis-signaling-server',
      version: '1.0.0',
      activeRooms: roomManager.getActiveRoomCount(),
      timestamp: Date.now(),
    };
  });

  // RFC 5766 REST API for dynamic ephemeral TURN credentials
  server.get('/turn-credentials', async (request) => {
    const peerId = (request.query as { peerId?: string })?.peerId || `peer-${Date.now()}`;
    return generateEphemeralTurnCredentials(peerId);
  });

  // WebSocket signaling gateway
  server.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      const socket = connection as unknown as WebSocket;

      socket.on('message', (rawData: Buffer | string) => {
        try {
          const message: ClientMessage = JSON.parse(rawData.toString());

          switch (message.type) {
            case 'join': {
              const result = roomManager.joinRoom(message.roomId, message.peerId, socket);
              if (!result.success) {
                const response: ServerMessage = {
                  type: 'room-full',
                  roomId: message.roomId,
                };
                socket.send(JSON.stringify(response));
                return;
              }

              const response: ServerMessage = {
                type: 'joined',
                roomId: message.roomId,
                peerId: message.peerId,
                peersInRoom: result.peersInRoom!,
                isInitiator: result.isInitiator!,
              };
              socket.send(JSON.stringify(response));
              break;
            }

            case 'signal': {
              roomManager.routeSignal(socket, message.targetPeerId, message.data);
              break;
            }

            case 'leave': {
              roomManager.handleDisconnect(socket);
              break;
            }

            case 'ping': {
              const pong: ServerMessage = { type: 'pong' };
              socket.send(JSON.stringify(pong));
              break;
            }
          }
        } catch (err) {
          const errorMsg: ServerMessage = {
            type: 'error',
            message: 'Invalid signaling message format',
          };
          socket.send(JSON.stringify(errorMsg));
        }
      });

      socket.on('close', () => {
        roomManager.handleDisconnect(socket);
      });

      socket.on('error', () => {
        roomManager.handleDisconnect(socket);
      });
    });
  });

  return server;
}

// Start standalone server if executed directly
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const PORT = parseInt(process.env.PORT || '4000', 10);
  const server = createServer();
  server.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error('Failed to start Aegis signaling server:', err);
      process.exit(1);
    }
    console.log(`🛡️  Aegis E2EE Signaling Server running at: ${address}`);
    console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/ws`);
    console.log(`🩺 Health check: http://localhost:${PORT}/health`);
  });
}
