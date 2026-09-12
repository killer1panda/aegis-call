import { useEffect, useRef, useState, useCallback } from 'react';
import {
  generateEphemeralKeyPair,

  deriveSessionKeys,
  deriveDirectionalSessionKeys,
  DirectionalSessionKeys,
  generateHybridKeyPair,
  encapsulateHybrid,
  decapsulateHybridDirectional,
  deriveHybridDirectionalSessionKeys,
  HybridKeyPair,
  generateSafetyNumbers,
  DataCipher,
  FileCipher,
  FileMetadata,
  EncryptedFileChunk,
  KeyPair,
  DerivedSessionKeys,
  SASVerification,
  FrameCipherStats,
  EncryptedMessagePayload,
  formatX25519DID,
  hexToBytes,
  bytesToHex,
  computeBlobChecksum,
  CHUNK_SIZE_BYTES,
} from '@aegis/crypto';

import { ReceivedFile } from '../components/FileDropModal.js';
import { WhiteboardStroke } from '../components/WhiteboardModal.js';
import { useAudioWorklet } from './useAudioWorklet.js';
import { AdaptiveBitrateController, ABRTelemetry } from '../services/congestionController.js';
import { CallNotificationService } from '@aegis/mobile';
import { AudioIsolationService } from '../services/audioIsolationService.js';

export type CallState =
  | 'idle'
  | 'lobby'
  | 'joining'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'room-full'
  | 'error';

export interface ChatMessage {
  id: string;
  sender: 'self' | 'peer';
  text: string;
  timestamp: number;
  encrypted: boolean;
}

export interface NetworkStats {
  rttMs: number;
  packetLossPercent: number;
  jitterMs: number;
  bitrateKbps: number;
  fps: number;
  resolution: string;
  candidateType: string;
  cipherSuite: string;
}

export interface TransferProgress {
  active: boolean;
  percent: number;
  fileName: string;
  mode: 'sending' | 'receiving';
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const fetchIceServers = async (peerId: string): Promise<RTCIceServer[]> => {
  try {
    const httpProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https:' : 'http:';
    const httpHost = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'localhost:4000' : (typeof window !== 'undefined' ? window.location.host : 'localhost:4000');
    const res = await fetch(`${httpProtocol}//${httpHost}/turn-credentials?peerId=${encodeURIComponent(peerId)}`);
    if (res.ok) {
      const creds = await res.json();
      return [
        { urls: creds.urls[0] }, // stun
        {
          urls: creds.urls.slice(1),
          username: creds.username,
          credential: creds.credential,
        },
      ];
    }
  } catch (e) {
    console.warn('Could not fetch dynamic TURN credentials, falling back to STUN:', e);
  }
  return DEFAULT_ICE_SERVERS;
};

export function useWebRTC(roomId: string) {
  const [callState, setCallState] = useState<CallState>('lobby');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [rawLocalStream, setRawLocalStream] = useState<MediaStream | null>(null);
  const {
    processedStream,
    isNoiseSuppressionEnabled,
    toggleNoiseSuppression,
    isVoiceMaskEnabled,
    toggleVoiceMask,
    isVadActive,
    estimatedNoiseFloorDb,
    acousticAuthenticityScore,
    ensureAudioResumed,
  } = useAudioWorklet(rawLocalStream);
  const localStream = processedStream || rawLocalStream;
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const [localDid, setLocalDid] = useState<string | null>(null);
  const [remoteDid, setRemoteDid] = useState<string | null>(null);
  const [simulcastTier, setSimulcastTierState] = useState<'auto' | 'high' | 'medium' | 'low'>('auto');
  const [abrTelemetry, setAbrTelemetry] = useState<ABRTelemetry | null>(null);

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const [safetyNumbers, setSafetyNumbers] = useState<SASVerification | null>(null);
  const [isSelfVerified, setIsSelfVerified] = useState(false);
  const [isPeerVerified, setIsPeerVerified] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const [networkStats, setNetworkStats] = useState<NetworkStats>({
    rttMs: 0,
    packetLossPercent: 0,
    jitterMs: 0,
    bitrateKbps: 0,
    fps: 0,
    resolution: '0x0',
    candidateType: 'direct',
    cipherSuite: 'AES-256-GCM (Frame) + DTLS 1.3',
  });

  const [cryptoStats, setCryptoStats] = useState<{ audio?: FrameCipherStats; video?: FrameCipherStats }>({});

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');

  // File Transfer State
  const [isDataChannelOpen, setIsDataChannelOpen] = useState(false);
  const [transferProgress, setTransferProgress] = useState<TransferProgress>({
    active: false,
    percent: 0,
    fileName: '',
    mode: 'sending',
  });
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [incomingStroke, setIncomingStroke] = useState<WhiteboardStroke | null>(null);
  const [incomingScratchpadText, setIncomingScratchpadText] = useState<string | null>(null);
  const [incomingCaption, setIncomingCaption] = useState<{ text: string; id: string } | null>(null);
  const [isDecoyMode, setIsDecoyMode] = useState(false);
  const [isAudioIsolationEnabled, setIsAudioIsolationEnabled] = useState(true);

  // Refs for WebRTC & Cryptography
  const peerIdRef = useRef<string>(`peer-${Math.random().toString(36).substring(2, 9)}`);
  const keyPairRef = useRef<KeyPair | null>(null);
  const hybridKeyPairRef = useRef<HybridKeyPair | null>(null);
  const remotePublicKeyHexRef = useRef<string | null>(null);
  const remoteHybridPublicKeyHexRef = useRef<string | null>(null);
  const sessionKeysRef = useRef<DerivedSessionKeys | null>(null);
  const directionalKeysRef = useRef<DirectionalSessionKeys | null>(null);
  const dataCipherRef = useRef<DataCipher | null>(null);
  const recvDataCipherRef = useRef<DataCipher | null>(null);
  const fileCipherRef = useRef<FileCipher | null>(null);
  const recvFileCipherRef = useRef<FileCipher | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  // Perfect Negotiation state refs
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const politeRef = useRef(false);
  const blobUrlsRef = useRef<string[]>([]);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isExplicitLeaveRef = useRef<boolean>(false);

  const statsIntervalRef = useRef<number | null>(null);
  const lastBytesRef = useRef<{ bytes: number; time: number }>({ bytes: 0, time: Date.now() });
  const abrControllerRef = useRef<AdaptiveBitrateController>(new AdaptiveBitrateController('high'));
  const effectiveSimulcastTierRef = useRef<'high' | 'medium' | 'low'>('high');

  // Incoming file assembly buffer
  const incomingFileRef = useRef<{
    metadata: FileMetadata | null;
    chunks: Map<number, Uint8Array>;
  }>({ metadata: null, chunks: new Map() });

  // 1. Initialize KeyPair and Enumerate Media Devices
  useEffect(() => {
    keyPairRef.current = generateEphemeralKeyPair();
    hybridKeyPairRef.current = generateHybridKeyPair();
    try {
      setLocalDid(formatX25519DID(keyPairRef.current.publicKey));
    } catch (e) {
      console.warn('Could not derive local DID:', e);
    }


    const fetchDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioIns = devices.filter((d) => d.kind === 'audioinput');
        const videoIns = devices.filter((d) => d.kind === 'videoinput');
        setAudioDevices(audioIns);
        setVideoDevices(videoIns);
        if (audioIns.length > 0 && !selectedAudioId) setSelectedAudioId(audioIns[0].deviceId);
        if (videoIns.length > 0 && !selectedVideoId) setSelectedVideoId(videoIns[0].deviceId);
      } catch (err) {
        console.warn('Could not enumerate devices yet:', err);
      }
    };

    fetchDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', fetchDevices);

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', fetchDevices);
      isExplicitLeaveRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      blobUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      });
      blobUrlsRef.current = [];
    };
  }, []);


  // 2. Setup Local Media Stream
  const initLocalMedia = useCallback(async () => {
    try {
      if (rawLocalStream) {
        rawLocalStream.getTracks().forEach((t) => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true,
        video: selectedVideoId
          ? { deviceId: { exact: selectedVideoId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setRawLocalStream(stream);
      return stream;
    } catch (err: any) {
      console.warn('getUserMedia fallback to audio-only:', err);
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        setRawLocalStream(audioOnly);
        return audioOnly;
      } catch (fallbackErr: any) {
        setErrorMessage('Camera or Microphone access denied. Please allow permissions in browser.');
        throw fallbackErr;
      }
    }
  }, [selectedAudioId, selectedVideoId, rawLocalStream]);

  useEffect(() => {
    initLocalMedia().catch(() => {});
  }, [selectedAudioId, selectedVideoId]);

  // 3. Initialize Dedicated Worker
  const initWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    try {
      const worker = new Worker(new URL('../workers/transformWorker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = (e) => {
        if (e.data?.type === 'crypto-stats') {
          setCryptoStats({
            audio: e.data.audio,
            video: e.data.video,
          });
        }
      };

      workerRef.current = worker;
      return worker;
    } catch (err) {
      console.warn('Web Worker for Insertable Streams not available:', err);
      return null;
    }
  }, []);

  // 4. Setup DataChannel with Encrypted Chat & File Streaming
  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dataChannelRef.current = dc;

    dc.onopen = () => {
      setIsDataChannelOpen(true);
    };

    dc.onclose = () => {
      setIsDataChannelOpen(false);
    };

    dc.onmessage = async (event) => {
      try {
        const raw = JSON.parse(event.data);

        // Verification Acknowledgement
        if (raw.type === 'verify-ack') {
          setIsPeerVerified(true);
          return;
        }

        // Encrypted Chat Message
        const activeChatCipher = recvDataCipherRef.current || dataCipherRef.current;
        if (raw.type === 'chat-cipher' && activeChatCipher) {
          const decryptedText = await activeChatCipher.decryptMessage(raw.payload);
          const newMsg: ChatMessage = {
            id: Math.random().toString(36).substring(2, 9),
            sender: 'peer',
            text: decryptedText,
            timestamp: raw.payload.timestamp || Date.now(),
            encrypted: true,
          };
          setMessages((prev) => [...prev, newMsg]);
          setUnreadChatCount((prev) => prev + 1);
          return;
        }

        // Incoming File Metadata
        if (raw.type === 'file-meta') {
          const meta = raw.metadata as FileMetadata;
          incomingFileRef.current = {
            metadata: meta,
            chunks: new Map(),
          };
          setTransferProgress({
            active: true,
            percent: 0,
            fileName: meta.name,
            mode: 'receiving',
          });
          return;
        }

        // Incoming Encrypted File Chunk
        const activeFileCipher = recvFileCipherRef.current || fileCipherRef.current;
        if (raw.type === 'file-chunk' && activeFileCipher) {
          const chunk = raw.chunk as EncryptedFileChunk;
          const meta = incomingFileRef.current.metadata;
          if (!meta || meta.fileId !== chunk.fileId) return;

          const decryptedChunk = await activeFileCipher.decryptChunk(chunk);
          incomingFileRef.current.chunks.set(chunk.chunkIndex, decryptedChunk);

          const progress = Math.round((incomingFileRef.current.chunks.size / meta.totalChunks) * 100);
          setTransferProgress({
            active: true,
            percent: progress,
            fileName: meta.name,
            mode: 'receiving',
          });

          // All chunks received! Verify SHA-256 and assemble
          if (incomingFileRef.current.chunks.size === meta.totalChunks) {
            const sortedChunks: Uint8Array[] = [];
            for (let i = 0; i < meta.totalChunks; i++) {
              sortedChunks.push(incomingFileRef.current.chunks.get(i)!);
            }

            try {
              const fullFile = activeFileCipher.verifyAndReassemble(sortedChunks, meta.sha256Checksum);
              const blob = new Blob([fullFile.buffer as ArrayBuffer], { type: meta.mimeType });
              const blobUrl = URL.createObjectURL(blob);
              blobUrlsRef.current.push(blobUrl);

              setReceivedFiles((prev) => [
                {
                  metadata: meta,
                  blobUrl,
                  timestamp: Date.now(),
                },
                ...prev,
              ]);

            } catch (checksumErr) {
              console.error('File integrity verification failed:', checksumErr);
            } finally {
              setTransferProgress({
                active: false,
                percent: 100,
                fileName: meta.name,
                mode: 'receiving',
              });
              incomingFileRef.current = { metadata: null, chunks: new Map() };
            }
          }
        }

        // Whiteboard Stroke Synchronization
        if (raw.type === 'wb-stroke') {
          setIncomingStroke(raw.stroke);
          return;
        }

        // Ephemeral Scratchpad Synchronization
        if (raw.type === 'scratchpad-text') {
          setIncomingScratchpadText(raw.text);
          return;
        }

        // Live Closed Captions Broadcast
        if (raw.type === 'live-caption' && raw.text) {
          setIncomingCaption({ text: raw.text, id: Math.random().toString(36).substring(2, 9) });
          return;
        }
      } catch (err) {
        console.warn('Error parsing incoming DataChannel message:', err);
      }
    };
  }, []);

  const applyDirectionalKeys = useCallback(
    (keys: DirectionalSessionKeys, peerPublicKeyBytes: Uint8Array, worker: Worker | null) => {
      directionalKeysRef.current = keys;
      sessionKeysRef.current = {
        audioKey: keys.sendAudioKey,
        videoKey: keys.sendVideoKey,
        dataKey: keys.sendDataKey,
        ivBase: keys.sendIvBase,
        sasEntropy: keys.sasEntropy,
      };

      const sas = generateSafetyNumbers(
        keyPairRef.current!.publicKey,
        peerPublicKeyBytes,
        keys.sasEntropy
      );
      setSafetyNumbers(sas);

      dataCipherRef.current = new DataCipher(
        keys.sendDataKey,
        keyPairRef.current!.publicKeyHex.slice(0, 8)
      );
      recvDataCipherRef.current = new DataCipher(
        keys.recvDataKey,
        bytesToHex(peerPublicKeyBytes).slice(0, 8)
      );
      fileCipherRef.current = new FileCipher(keys.sendDataKey);
      recvFileCipherRef.current = new FileCipher(keys.recvDataKey);

      const targetWorker = worker || workerRef.current;
      if (targetWorker) {
        targetWorker.postMessage({
          type: 'init-ciphers',
          sendAudioKey: Array.from(keys.sendAudioKey),
          recvAudioKey: Array.from(keys.recvAudioKey),
          sendVideoKey: Array.from(keys.sendVideoKey),
          recvVideoKey: Array.from(keys.recvVideoKey),
          sendIvBase: Array.from(keys.sendIvBase),
          recvIvBase: Array.from(keys.recvIvBase),
        });
      }
    },
    []
  );

  // 5. Setup WebRTC PeerConnection
  const createPeerConnection = useCallback(async (worker: Worker | null, isInitiator: boolean) => {
    if (pcRef.current) pcRef.current.close();

    const iceServers = await fetchIceServers(peerIdRef.current);
    const pc = new RTCPeerConnection({
      iceServers,
    });
    pcRef.current = pc;


    if (localStream) {
      localStream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, localStream);

        if (worker && 'RTCRtpScriptTransform' in window && (window as any).RTCRtpScriptTransform) {
          try {
            (sender as any).transform = new (window as any).RTCRtpScriptTransform(worker, {
              operation: 'encode',
              kind: track.kind,
            });
          } catch (e) {
            console.warn('Error attaching sender transform:', e);
          }
        }
      });
    }

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStream(stream);

      if (worker && 'RTCRtpScriptTransform' in window && (window as any).RTCRtpScriptTransform) {
        try {
          (event.receiver as any).transform = new (window as any).RTCRtpScriptTransform(worker, {
            operation: 'decode',
            kind: event.track.kind,
          });
        } catch (e) {
          console.warn('Error attaching receiver transform:', e);
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'signal',
            targetPeerId: '',
            data: { type: 'ice-candidate', candidate: event.candidate },
          })
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('connected');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setCallState('ended');
      }
    };

    if (isInitiator) {
      const dc = pc.createDataChannel('aegis-secure-channel');
      setupDataChannel(dc);
    } else {
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel);
      };
    }

    return pc;
  }, [localStream, setupDataChannel]);

  // 6. Connect to Signaling Server & Join Room
  const joinCall = useCallback(async () => {
    isExplicitLeaveRef.current = false;
    setCallState('joining');
    setErrorMessage(null);

    let stream = localStream;
    if (!stream) {
      try {
        stream = await initLocalMedia();
      } catch (e) {
        setCallState('error');
        return;
      }
    }

    try {
      await ensureAudioResumed();
    } catch (_) {}


    const worker = initWorker();

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:4000' : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setCallState('connecting');
      ws.send(
        JSON.stringify({
          type: 'join',
          roomId,
          peerId: peerIdRef.current,
        })
      );
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'room-full': {
            setCallState('room-full');
            setErrorMessage('This calling room is already full (1-to-1 maximum reached).');
            ws.close();
            break;
          }

          case 'joined': {
            const isInitiator = msg.isInitiator;
            await createPeerConnection(worker, isInitiator);

            ws.send(
              JSON.stringify({
                type: 'signal',
                targetPeerId: '',
                data: {
                  type: 'key-exchange',
                  publicKeyHex: keyPairRef.current!.publicKeyHex,
                  hybridPublicKeyHex: hybridKeyPairRef.current?.publicKeyHex,
                },
              })
            );
            break;
          }

          case 'peer-joined': {
            CallNotificationService.reportIncomingCall({
              callId: `call-${roomId}-${Date.now()}`,
              callerDid: `peer:${msg.peerId}`,
              callerName: `Peer (${msg.peerId.slice(0, 8)})`,
              roomId,
              hasVideo: true,
              isPostQuantum: true,
              timestamp: Date.now(),
            }).catch(() => {});

            ws.send(
              JSON.stringify({
                type: 'signal',
                targetPeerId: msg.peerId,
                data: {
                  type: 'key-exchange',
                  publicKeyHex: keyPairRef.current!.publicKeyHex,
                  hybridPublicKeyHex: hybridKeyPairRef.current?.publicKeyHex,
                },
              })
            );
            break;
          }

          case 'signal': {
            const signalData = msg.data;
            const senderPeerId = msg.senderPeerId;
            const pc = pcRef.current;

            const isPolite = peerIdRef.current.localeCompare(senderPeerId) > 0;
            politeRef.current = isPolite;

            if (signalData.type === 'key-exchange') {
              remotePublicKeyHexRef.current = signalData.publicKeyHex;
              if (signalData.hybridPublicKeyHex) {
                remoteHybridPublicKeyHexRef.current = signalData.hybridPublicKeyHex;
              }
              try {
                setRemoteDid(formatX25519DID(hexToBytes(signalData.publicKeyHex)));
              } catch (e) {
                console.warn('Could not derive remote DID:', e);
              }

              const peerPublicKeyBytes = hexToBytes(signalData.publicKeyHex);

              // 1. Post-Quantum Hybrid or Classical Directional Key Exchange
              if (signalData.hybridPublicKeyHex && hybridKeyPairRef.current) {
                if (isPolite) {
                  // Polite peer encapsulates hybrid shared secret
                  const encap = encapsulateHybrid(signalData.hybridPublicKeyHex, roomId);
                  const dirKeys = deriveHybridDirectionalSessionKeys(
                    encap.sharedSecret,
                    hybridKeyPairRef.current.publicKey,
                    hexToBytes(signalData.hybridPublicKeyHex),
                    roomId
                  );
                  applyDirectionalKeys(dirKeys, peerPublicKeyBytes, worker);

                  ws.send(
                    JSON.stringify({
                      type: 'signal',
                      targetPeerId: senderPeerId,
                      data: {
                        type: 'pqc-encap',
                        cipherTextHex: encap.cipherTextHex,
                      },
                    })
                  );
                } else {
                  // Impolite peer derives directional baseline until pqc-encap is received
                  const dirKeys = deriveDirectionalSessionKeys(
                    keyPairRef.current!.privateKey,
                    keyPairRef.current!.publicKey,
                    peerPublicKeyBytes,
                    roomId
                  );
                  applyDirectionalKeys(dirKeys, peerPublicKeyBytes, worker);
                }
              } else {
                // Classical X25519 directional keys
                const dirKeys = deriveDirectionalSessionKeys(
                  keyPairRef.current!.privateKey,
                  keyPairRef.current!.publicKey,
                  peerPublicKeyBytes,
                  roomId
                );
                applyDirectionalKeys(dirKeys, peerPublicKeyBytes, worker);
              }

              // W3C Perfect Negotiation: impolite peer creates the offer
              if (!isPolite && pc && pc.signalingState === 'stable') {
                try {
                  makingOfferRef.current = true;
                  const offer = await pc.createOffer();
                  if (pc.signalingState === 'stable') {
                    await pc.setLocalDescription(offer);
                    ws.send(
                      JSON.stringify({
                        type: 'signal',
                        targetPeerId: senderPeerId,
                        data: { type: 'offer', sdp: offer },
                      })
                    );
                  }
                } finally {
                  makingOfferRef.current = false;
                }
              }
            } else if (signalData.type === 'pqc-encap' && hybridKeyPairRef.current) {
              // Impolite peer decapsulates hybrid shared secret
              const peerPublicKeyBytes = hexToBytes(remotePublicKeyHexRef.current!);
              const peerHybridPkBytes = remoteHybridPublicKeyHexRef.current
                ? hexToBytes(remoteHybridPublicKeyHexRef.current)
                : peerPublicKeyBytes;
              const dirKeys = decapsulateHybridDirectional(
                signalData.cipherTextHex,
                hybridKeyPairRef.current.secretKey,
                hybridKeyPairRef.current.publicKey,
                peerHybridPkBytes,
                roomId
              );
              applyDirectionalKeys(dirKeys, peerPublicKeyBytes, worker);
            } else if (signalData.type === 'offer' && pc) {
              // Perfect Negotiation handling for offer
              const offerCollision = makingOfferRef.current || pc.signalingState !== 'stable';
              ignoreOfferRef.current = !isPolite && offerCollision;

              if (ignoreOfferRef.current) {
                console.warn('Impolite peer ignoring offer collision');
                return;
              }

              if (offerCollision) {
                await pc.setLocalDescription({ type: 'rollback' });
              }

              await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              ws.send(
                JSON.stringify({
                  type: 'signal',
                  targetPeerId: senderPeerId,
                  data: { type: 'answer', sdp: answer },
                })
              );
            } else if (signalData.type === 'answer' && pc) {
              if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
              }
            } else if (signalData.type === 'ice-candidate' && pc) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
              } catch (e) {
                if (!ignoreOfferRef.current) {
                  console.warn('Error adding ICE candidate:', e);
                }
              }
            }
            break;
          }


          case 'peer-left': {
            CallNotificationService.endCall(`call-${roomId}`);
            setRemoteStream(null);
            setCallState('ended');
            break;
          }
        }
      } catch (err) {
        console.warn('Signaling parse error:', err);
      }
    };

    ws.onclose = () => {
      if (isExplicitLeaveRef.current) return;
      if (callState === 'room-full') return;

      const attempts = reconnectAttemptsRef.current;
      if (attempts < 5) {
        reconnectAttemptsRef.current++;
        const backoffMs = Math.min(1000 * Math.pow(1.8, attempts) + Math.random() * 500, 10000);
        console.warn(`Signaling transport closed. Reconnecting attempt ${attempts + 1}/5 in ${Math.round(backoffMs)}ms...`);
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          joinCall();
        }, backoffMs);
      } else {
        setCallState('error');
        setErrorMessage('Signaling server connection lost after 5 reconnect attempts.');
      }
    };

    ws.onerror = (e) => {
      console.warn('Signaling WebSocket error:', e);
    };

    startStatsPolling();
  }, [roomId, localStream, initLocalMedia, initWorker, createPeerConnection]);

  // 7. Live WebRTC Stats Poller
  const applyVideoEncodingTier = async (tier: 'high' | 'medium' | 'low') => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const senders = pc.getSenders();
      const videoSender = senders.find((s) => s.track?.kind === 'video');
      if (!videoSender) return;

      const params = videoSender.getParameters();
      if (params.encodings && params.encodings.length > 0) {
        const bitrateMap: Record<string, number> = {
          high: 2_500_000,
          medium: 800_000,
          low: 250_000,
        };
        params.encodings[0].maxBitrate = bitrateMap[tier] || 1_200_000;
        if (tier === 'low') {
          params.encodings[0].scaleResolutionDownBy = 2.0;
        } else if (tier === 'medium') {
          params.encodings[0].scaleResolutionDownBy = 1.5;
        } else {
          params.encodings[0].scaleResolutionDownBy = 1.0;
        }
        await videoSender.setParameters(params);
      }
    } catch {
      // Best-effort encoder parameter adjustment
    }
  };

  const startStatsPolling = () => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);

    statsIntervalRef.current = window.setInterval(async () => {
      const pc = pcRef.current;
      if (!pc || pc.connectionState !== 'connected') return;

      try {
        const stats = await pc.getStats();
        let rtt = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        let jitter = 0;
        let totalBytes = 0;
        let fps = 0;
        let resolution = '0x0';
        let candidateType = 'Direct P2P';

        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = Math.round((report.currentRoundTripTime || 0) * 1000);
          }
          if (report.type === 'inbound-rtp') {
            if (report.kind === 'video') {
              fps = report.framesPerSecond || 0;
              resolution = `${report.frameWidth || 1280}x${report.frameHeight || 720}`;
              jitter = Math.round((report.jitter || 0) * 1000);
            }
            packetsLost += report.packetsLost || 0;
            packetsReceived += report.packetsReceived || 0;
            totalBytes += report.bytesReceived || 0;
          }
          if (report.type === 'remote-candidate') {
            candidateType = report.candidateType || 'Direct P2P';
          }
        });

        const now = Date.now();
        const deltaT = (now - lastBytesRef.current.time) / 1000;
        const deltaB = totalBytes - lastBytesRef.current.bytes;
        const bitrateKbps = deltaT > 0 && deltaB > 0 ? Math.round((deltaB * 8) / deltaT / 1000) : 0;
        lastBytesRef.current = { bytes: totalBytes, time: now };

        const totalPackets = packetsLost + packetsReceived;
        const lossPercent = totalPackets > 0 ? Math.min(100, Math.round((packetsLost / totalPackets) * 1000) / 10) : 0;

        setNetworkStats({
          rttMs: rtt,
          packetLossPercent: lossPercent,
          jitterMs: jitter,
          bitrateKbps,
          fps,
          resolution,
          candidateType,
          cipherSuite: 'IETF SFrame + AES-256-GCM + DTLS 1.3',
        });

        if (abrControllerRef.current) {
          const adaptedTier = abrControllerRef.current.evaluateNetworkSample({
            rttMs: rtt,
            packetLossPercent: lossPercent,
            bitrateKbps,
            fps,
          });

          if (simulcastTier === 'auto' && adaptedTier !== effectiveSimulcastTierRef.current) {
            effectiveSimulcastTierRef.current = adaptedTier;
            applyVideoEncodingTier(adaptedTier);
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              socketRef.current.send(
                JSON.stringify({
                  type: 'sfu-set-tier',
                  roomId,
                  peerId: peerIdRef.current,
                  producerId: 'video',
                  preferredTier: adaptedTier,
                })
              );
            }
          }
          setAbrTelemetry(abrControllerRef.current.getTelemetry());
        }
      } catch (err) {
        // ignore
      }
    }, 1000);
  };

  // 8. User Actions: Mute Audio, Toggle Video, Screen Share
  const toggleAudio = () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoMuted(!videoTrack.enabled);
    }
  };

  const toggleAudioIsolation = () => {
    setIsAudioIsolationEnabled((prev) => !prev);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      if (screenAudioTrackRef.current) {
        screenAudioTrackRef.current.stop();
        screenAudioTrackRef.current = null;
      }
      const stream = await initLocalMedia();
      const videoTrack = stream?.getVideoTracks()[0];
      if (videoTrack && pcRef.current) {
        const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        // Process application audio with AudioIsolationService DSP filters if audio track is present
        const screenAudio = screenStream.getAudioTracks()[0];
        if (screenAudio) {
          if (isAudioIsolationEnabled) {
            const isolatedTrack = AudioIsolationService.getInstance().createIsolatedAudioTrack(screenStream);
            screenAudioTrackRef.current = isolatedTrack || screenAudio;
          } else {
            screenAudioTrackRef.current = screenAudio;
          }
        }

        screenTrack.onended = () => {
          toggleScreenShare();
        };

        if (pcRef.current) {
          const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        }

        setIsScreenSharing(true);
      } catch (err) {
        console.warn('Screen share canceled or denied:', err);
      }
    }
  };

  // 9. Send Encrypted Chat Message
  const sendMessage = async (text: string) => {
    if (!text.trim() || !dataChannelRef.current || dataChannelRef.current.readyState !== 'open') return;

    try {
      let payload: EncryptedMessagePayload;
      if (dataCipherRef.current) {
        payload = await dataCipherRef.current.encryptMessage(text);
      } else {
        payload = {
          iv: '',
          ciphertext: btoa(text),
          senderFingerprint: 'unencrypted',
          timestamp: Date.now(),
        };
      }

      dataChannelRef.current.send(
        JSON.stringify({
          type: 'chat-cipher',
          payload,
        })
      );

      const selfMsg: ChatMessage = {
        id: Math.random().toString(36).substring(2, 9),
        sender: 'self',
        text,
        timestamp: Date.now(),
        encrypted: !!dataCipherRef.current,
      };

      setMessages((prev) => [...prev, selfMsg]);
    } catch (err) {
      console.error('Failed to send encrypted message:', err);
    }
  };

  // 10. Send Encrypted File Chunks with O(1) Memory Chunk-Streaming
  const sendFile = async (file: globalThis.File) => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open' || !fileCipherRef.current) {
      return;
    }

    const cipher = fileCipherRef.current;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE_BYTES) || 1;

    setTransferProgress({
      active: true,
      percent: 0,
      fileName: file.name,
      mode: 'sending',
    });

    // Stream-hash the file without buffering whole payload into memory
    const checksum = await computeBlobChecksum(file);
    const metadata = cipher.prepareFileMetadata(file.size, file.name, file.type || 'application/octet-stream', checksum);

    // Send metadata announcement first
    dataChannelRef.current.send(
      JSON.stringify({
        type: 'file-meta',
        metadata,
      })
    );

    // Stream each slice incrementally
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE_BYTES;
      const end = Math.min(file.size, start + CHUNK_SIZE_BYTES);
      const sliceBlob = file.slice(start, end);
      const sliceBuffer = await sliceBlob.arrayBuffer();
      const chunkBytes = new Uint8Array(sliceBuffer);

      const encryptedChunk = await cipher.encryptChunk(metadata.fileId, i, totalChunks, chunkBytes);

      // Backpressure check on data channel buffer (wait if buffer exceeds 1MB)
      while (dataChannelRef.current && dataChannelRef.current.bufferedAmount > 1024 * 1024) {
        await new Promise((r) => setTimeout(r, 20));
      }

      dataChannelRef.current.send(
        JSON.stringify({
          type: 'file-chunk',
          chunk: encryptedChunk,
        })
      );

      const percent = Math.round(((i + 1) / totalChunks) * 100);
      setTransferProgress({
        active: true,
        percent,
        fileName: file.name,
        mode: 'sending',
      });

      // Micro-pause to yield main thread every 10 chunks
      if (i % 10 === 0 && i > 0) {
        await new Promise((r) => setTimeout(r, 5));
      }
    }

    setTimeout(() => {
      setTransferProgress({
        active: false,
        percent: 100,
        fileName: file.name,
        mode: 'sending',
      });
    }, 500);
  };

  // 11. Mark Peer as Cryptographically Verified
  const markVerified = () => {
    setIsSelfVerified(true);
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({ type: 'verify-ack' }));
    }
  };

  // 12. Leave Call & Teardown
  const leaveCall = () => {
    isExplicitLeaveRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;

    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'leave', roomId }));
      socketRef.current.close();
    }
    if (pcRef.current) pcRef.current.close();
    if (workerRef.current) workerRef.current.terminate();
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (screenTrackRef.current) screenTrackRef.current.stop();

    // Revoke object URLs to eliminate memory leak
    blobUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    });
    blobUrlsRef.current = [];

    setCallState('ended');
  };


  const setSimulcastTier = useCallback((tier: 'auto' | 'high' | 'medium' | 'low') => {
    setSimulcastTierState(tier);
    if (tier === 'auto') {
      abrControllerRef.current.setMode('auto');
    } else {
      abrControllerRef.current.setManualTier(tier);
    }
    const targetTier = tier === 'auto' ? abrControllerRef.current.getCurrentTier() : tier;
    effectiveSimulcastTierRef.current = targetTier;
    applyVideoEncodingTier(targetTier);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'sfu-set-tier',
          roomId,
          peerId: peerIdRef.current,
          producerId: 'video',
          preferredTier: targetTier,
        })
      );
    }
    setAbrTelemetry(abrControllerRef.current.getTelemetry());
  }, [roomId]);

  const clearUnreadChat = () => setUnreadChatCount(0);

  const broadcastStroke = useCallback((stroke: WhiteboardStroke) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        dataChannelRef.current.send(JSON.stringify({ type: 'wb-stroke', stroke }));
      } catch (err) {
        console.warn('Failed to broadcast whiteboard stroke:', err);
      }
    }
  }, []);

  const broadcastScratchpadText = useCallback((text: string) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        dataChannelRef.current.send(JSON.stringify({ type: 'scratchpad-text', text }));
      } catch (err) {
        console.warn('Failed to broadcast scratchpad text:', err);
      }
    }
  }, []);

  const broadcastCaption = useCallback((text: string) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        dataChannelRef.current.send(JSON.stringify({ type: 'live-caption', text }));
      } catch (err) {
        console.warn('Failed to broadcast live caption:', err);
      }
    }
  }, []);

  const triggerDuressWipe = useCallback(() => {
    setIsDecoyMode(true);
    // 1. Zeroize directional session keys
    if (directionalKeysRef.current) {
      directionalKeysRef.current.sendAudioKey.fill(0);
      directionalKeysRef.current.sendVideoKey.fill(0);
      directionalKeysRef.current.sendDataKey.fill(0);
      directionalKeysRef.current.recvAudioKey.fill(0);
      directionalKeysRef.current.recvVideoKey.fill(0);
      directionalKeysRef.current.recvDataKey.fill(0);
      directionalKeysRef.current = null;
    }
    if (sessionKeysRef.current) {
      sessionKeysRef.current.audioKey.fill(0);
      sessionKeysRef.current.videoKey.fill(0);
      sessionKeysRef.current.dataKey.fill(0);
      sessionKeysRef.current = null;
    }
    // 2. Wipe messages and received files from RAM
    setMessages([]);
    setReceivedFiles([]);
    setSafetyNumbers(null);
    setIsPeerVerified(false);
    setIsSelfVerified(false);
    // 3. Post zeroization command to Web Worker
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'zeroize-keys' });
    }
  }, []);

  return {
    callState,
    errorMessage,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    safetyNumbers,
    isSelfVerified,
    isPeerVerified,
    localDid,
    remoteDid,
    isVadActive,
    estimatedNoiseFloorDb,
    acousticAuthenticityScore,
    simulcastTier,
    setSimulcastTier,
    abrTelemetry,
    messages,
    unreadChatCount,
    networkStats,
    cryptoStats,
    audioDevices,
    videoDevices,
    selectedAudioId,
    selectedVideoId,
    isDataChannelOpen,
    transferProgress,
    receivedFiles,
    isNoiseSuppressionEnabled,
    toggleNoiseSuppression,
    isVoiceMaskEnabled,
    toggleVoiceMask,
    incomingStroke,
    broadcastStroke,
    incomingScratchpadText,
    broadcastScratchpadText,
    incomingCaption,
    broadcastCaption,
    isDecoyMode,
    triggerDuressWipe,
    setSelectedAudioId,
    setSelectedVideoId,
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    isAudioIsolationEnabled,
    toggleAudioIsolation,
    sendMessage,
    sendFile,
    markVerified,
    clearUnreadChat,
  };
}

