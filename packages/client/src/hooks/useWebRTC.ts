import { useEffect, useRef, useState, useCallback } from 'react';
import {
  generateEphemeralKeyPair,
  deriveSessionKeys,
  generateSafetyNumbers,
  DataCipher,
  KeyPair,
  DerivedSessionKeys,
  SASVerification,
  FrameCipherStats,
  EncryptedMessagePayload,
} from '@aegis/crypto';

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

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export function useWebRTC(roomId: string) {
  const [callState, setCallState] = useState<CallState>('lobby');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

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

  // Refs for WebRTC & Cryptography
  const peerIdRef = useRef<string>(`peer-${Math.random().toString(36).substring(2, 9)}`);
  const keyPairRef = useRef<KeyPair | null>(null);
  const remotePublicKeyHexRef = useRef<string | null>(null);
  const sessionKeysRef = useRef<DerivedSessionKeys | null>(null);
  const dataCipherRef = useRef<DataCipher | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  const statsIntervalRef = useRef<number | null>(null);
  const lastBytesRef = useRef<{ bytes: number; time: number }>({ bytes: 0, time: Date.now() });

  // 1. Initialize KeyPair and Enumerate Media Devices
  useEffect(() => {
    keyPairRef.current = generateEphemeralKeyPair();

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
    };
  }, []);

  // 2. Setup Local Media Stream
  const initLocalMedia = useCallback(async () => {
    try {
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true,
        video: selectedVideoId
          ? { deviceId: { exact: selectedVideoId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      return stream;
    } catch (err: any) {
      console.warn('getUserMedia failed with video, attempting audio-only fallback:', err);
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(audioOnly);
        return audioOnly;
      } catch (fallbackErr: any) {
        setErrorMessage('Camera or Microphone access denied. Please allow permissions in browser.');
        throw fallbackErr;
      }
    }
  }, [selectedAudioId, selectedVideoId]);

  // Initial preview stream on lobby
  useEffect(() => {
    initLocalMedia().catch(() => {});
  }, [selectedAudioId, selectedVideoId]);

  // 3. Initialize Dedicated Frame Encryption Worker
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
      console.warn('Web Worker for Insertable Streams could not be loaded:', err);
      return null;
    }
  }, []);

  // 4. Setup WebRTC PeerConnection
  const createPeerConnection = useCallback((worker: Worker | null, isInitiator: boolean) => {
    const pc = new RTCPeerConnection({
      iceServers: DEFAULT_ICE_SERVERS,
    });
    pcRef.current = pc;

    // Attach local stream tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, localStream);

        // WebRTC Insertable Streams (RTCRtpScriptTransform)
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

    // Handle remote tracks
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStream(stream);

      // Attach receiver transform for decryption
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

    // ICE Candidate trickle
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'signal',
            targetPeerId: '', // Server will route to other peer in 1-to-1 room
            data: { type: 'ice-candidate', candidate: event.candidate },
          })
        );
      }
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('connected');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setCallState('ended');
      }
    };

    // DataChannel for Encrypted Chat & SAS Verification
    if (isInitiator) {
      const dc = pc.createDataChannel('aegis-secure-channel');
      setupDataChannel(dc);
    } else {
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel);
      };
    }

    return pc;
  }, [localStream]);

  // 5. Setup DataChannel
  const setupDataChannel = (dc: RTCDataChannel) => {
    dataChannelRef.current = dc;

    dc.onopen = () => {
      console.log('🛡️ E2EE DataChannel opened');
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
        if (raw.type === 'chat-cipher' && dataCipherRef.current) {
          const decryptedText = await dataCipherRef.current.decryptMessage(raw.payload);
          const newMsg: ChatMessage = {
            id: Math.random().toString(36).substring(2, 9),
            sender: 'peer',
            text: decryptedText,
            timestamp: raw.payload.timestamp || Date.now(),
            encrypted: true,
          };
          setMessages((prev) => [...prev, newMsg]);
          setUnreadChatCount((prev) => prev + 1);
        }
      } catch (err) {
        console.warn('Error parsing incoming DataChannel message:', err);
      }
    };
  };

  // 6. Connect to Signaling Server & Join Room
  const joinCall = useCallback(async () => {
    setCallState('joining');
    setErrorMessage(null);

    // Make sure we have local stream
    let stream = localStream;
    if (!stream) {
      try {
        stream = await initLocalMedia();
      } catch (e) {
        setCallState('error');
        return;
      }
    }

    const worker = initWorker();

    // Determine WebSocket host
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:4000' : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setCallState('connecting');
      // Send join message
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
            const pc = createPeerConnection(worker, isInitiator);

            // Broadcast our ephemeral X25519 public key immediately
            ws.send(
              JSON.stringify({
                type: 'signal',
                targetPeerId: '',
                data: {
                  type: 'key-exchange',
                  publicKeyHex: keyPairRef.current!.publicKeyHex,
                },
              })
            );
            break;
          }

          case 'peer-joined': {
            // A second peer joined! Re-send our public key to make sure they have it
            ws.send(
              JSON.stringify({
                type: 'signal',
                targetPeerId: msg.peerId,
                data: {
                  type: 'key-exchange',
                  publicKeyHex: keyPairRef.current!.publicKeyHex,
                },
              })
            );
            break;
          }

          case 'signal': {
            const signalData = msg.data;
            const senderPeerId = msg.senderPeerId;
            const pc = pcRef.current;

            if (signalData.type === 'key-exchange') {
              remotePublicKeyHexRef.current = signalData.publicKeyHex;

              // Derive symmetric session keys via X25519 ECDH + HKDF
              const peerPublicKeyBytes = hexToBytes(signalData.publicKeyHex);
              const derivedKeys = deriveSessionKeys(
                keyPairRef.current!.privateKey,
                peerPublicKeyBytes,
                roomId
              );
              sessionKeysRef.current = derivedKeys;

              // Generate SAS Safety Numbers (Emojis + Numbers)
              const sas = generateSafetyNumbers(
                keyPairRef.current!.publicKey,
                peerPublicKeyBytes,
                derivedKeys.sasEntropy
              );
              setSafetyNumbers(sas);

              // Initialize DataChannel Cipher
              dataCipherRef.current = new DataCipher(
                derivedKeys.dataKey,
                keyPairRef.current!.publicKeyHex.slice(0, 8)
              );

              // Initialize Web Worker frame ciphers
              if (worker) {
                worker.postMessage({
                  type: 'init-ciphers',
                  audioKey: Array.from(derivedKeys.audioKey),
                  videoKey: Array.from(derivedKeys.videoKey),
                  ivBase: Array.from(derivedKeys.ivBase),
                });
              }

              // If we are initiator and have peer's key, send WebRTC Offer
              if (pc && pc.signalingState === 'stable') {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                ws.send(
                  JSON.stringify({
                    type: 'signal',
                    targetPeerId: senderPeerId,
                    data: { type: 'offer', sdp: offer },
                  })
                );
              }
            } else if (signalData.type === 'offer' && pc) {
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
              await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
            } else if (signalData.type === 'ice-candidate' && pc) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
              } catch (e) {
                console.warn('Error adding ICE candidate:', e);
              }
            }
            break;
          }

          case 'peer-left': {
            setRemoteStream(null);
            setCallState('ended');
            break;
          }
        }
      } catch (err) {
        console.warn('Signaling parse error:', err);
      }
    };

    ws.onerror = () => {
      setCallState('error');
      setErrorMessage('Could not connect to signaling server. Make sure it is running.');
    };

    ws.onclose = () => {
      if (callState !== 'ended' && callState !== 'room-full') {
        // ended
      }
    };

    // Start live WebRTC stats polling
    startStatsPolling();
  }, [roomId, localStream, initLocalMedia, initWorker, createPeerConnection]);

  // 7. Live WebRTC Stats Poller
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

        // Compute Bitrate
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
          cipherSuite: 'AES-256-GCM (Payload) + DTLS 1.3',
        });
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

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Revert to camera
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
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
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

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
        // Fallback
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

  // 10. Mark Peer as Cryptographically Verified
  const markVerified = () => {
    setIsSelfVerified(true);
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({ type: 'verify-ack' }));
    }
  };

  // 11. Leave Call & Teardown
  const leaveCall = () => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'leave', roomId }));
      socketRef.current.close();
    }
    if (pcRef.current) pcRef.current.close();
    if (workerRef.current) workerRef.current.terminate();
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (screenTrackRef.current) screenTrackRef.current.stop();

    setCallState('ended');
  };

  // Reset unread count when viewing
  const clearUnreadChat = () => setUnreadChatCount(0);

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
    messages,
    unreadChatCount,
    networkStats,
    cryptoStats,
    audioDevices,
    videoDevices,
    selectedAudioId,
    selectedVideoId,
    setSelectedAudioId,
    setSelectedVideoId,
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    sendMessage,
    markVerified,
    clearUnreadChat,
  };
}

// Helper to convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
