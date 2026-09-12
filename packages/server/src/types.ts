import { WebSocket } from 'ws';

export type SignalPayload =
  | { type: 'key-exchange'; publicKeyHex: string; hybridPublicKeyHex?: string }
  | { type: 'pqc-encap'; ciphertextHex: string }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit }
  | { type: 'verify-ack' }
  | { type: 'mls-commit'; commit: any }
  | { type: 'mls-welcome'; welcome: any };

export type ClientMessage =
  | { type: 'join'; roomId: string; peerId: string }
  | { type: 'signal'; targetPeerId: string; data: SignalPayload }
  | { type: 'leave'; roomId: string }
  | { type: 'ping' }
  | { type: 'sfu-set-tier'; roomId: string; peerId: string; producerId: string; preferredTier: 'high' | 'medium' | 'low' }
  | { type: 'mls-commit'; roomId: string; commit: any };

export type ServerMessage =
  | { type: 'joined'; roomId: string; peerId: string; peersInRoom: string[]; isInitiator: boolean }
  | { type: 'peer-joined'; peerId: string }
  | { type: 'signal'; senderPeerId: string; data: SignalPayload }
  | { type: 'peer-left'; peerId: string }
  | { type: 'room-full'; roomId: string }
  | { type: 'error'; message: string }
  | { type: 'pong' }
  | { type: 'mls-commit'; senderPeerId: string; commit: any };

export interface PeerSession {
  peerId: string;
  roomId: string;
  socket: WebSocket;
  connectedAt: number;
}
