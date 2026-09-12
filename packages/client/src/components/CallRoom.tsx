import React, { useRef, useEffect } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Shield,
  ShieldCheck,
  ShieldAlert,
  MessageSquare,
  Activity,
  Maximize2,
  Users,
  Lock,
  UploadCloud,
  Sparkles,
} from 'lucide-react';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer.js';

interface CallRoomProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isScreenSharing: boolean;
  isSelfVerified: boolean;
  isPeerVerified: boolean;
  unreadChatCount: number;
  isNoiseSuppressionEnabled?: boolean;
  onToggleNoiseSuppression?: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onOpenSecurity: () => void;
  onToggleHUD: () => void;
  onToggleChat: () => void;
  onOpenFileDrop: () => void;
  onLeave: () => void;
  roomId: string;
}

export const CallRoom: React.FC<CallRoomProps> = ({
  localStream,
  remoteStream,
  isAudioMuted,
  isVideoMuted,
  isScreenSharing,
  isSelfVerified,
  isPeerVerified,
  unreadChatCount,
  isNoiseSuppressionEnabled = true,
  onToggleNoiseSuppression,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onOpenSecurity,
  onToggleHUD,
  onToggleChat,
  onOpenFileDrop,
  onLeave,
  roomId,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { volume: localVolume } = useAudioVisualizer(localStream, !isAudioMuted);
  const { volume: remoteVolume } = useAudioVisualizer(remoteStream, true);

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Keyboard shortcuts (A11y & Power User standard)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        onToggleAudio();
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        onToggleVideo();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        onToggleScreenShare();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        onToggleChat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleAudio, onToggleVideo, onToggleScreenShare, onToggleChat]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const isMutuallyVerified = isSelfVerified && isPeerVerified;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 bg-dark-950 flex flex-col items-center justify-center p-4 overflow-hidden select-none"
    >
      {/* Hidden audio element for remote peer playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline aria-hidden="true" />

      {/* Main Video Stage */}
      <section
        aria-label="Video Call Stage"
        className="relative w-full h-[calc(100vh-140px)] max-w-6xl rounded-3xl overflow-hidden bg-dark-900 border border-dark-800 shadow-2xl flex items-center justify-center"
      >
        {/* Remote Video */}
        {remoteStream ? (
          <div className={`relative w-full h-full rounded-2xl overflow-hidden transition-all duration-200 ${remoteVolume > 15 ? 'ring-4 ring-cyber-emerald/60 shadow-2xl shadow-cyber-emerald/20' : ''}`}>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              aria-label="Remote participant video feed"
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8 space-y-4" role="status">
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-cyber-emerald/10 border border-cyber-emerald/30 flex items-center justify-center animate-pulse-subtle">
                <Users className="w-10 h-10 text-cyber-emerald" aria-hidden="true" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-dark-950 border border-dark-800 flex items-center justify-center">
                <Lock className="w-3 h-3 text-cyber-cyan" aria-hidden="true" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Waiting for peer to join...</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Share this secure room link with your peer. Your call will establish an encrypted direct P2P mesh as soon as they connect.
              </p>
            </div>
            <div className="px-3.5 py-1.5 rounded-full bg-dark-850 border border-dark-750 text-xs font-mono text-slate-300">
              Room: <span className="text-cyber-emerald font-semibold">{roomId}</span>
            </div>
          </div>
        )}

        {/* Top Right Zero-Trust SFU Relay Indicator */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-dark-900/80 backdrop-blur-md border border-dark-750 text-[11px] font-mono text-slate-300 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-cyber-emerald animate-pulse" />
          <span>Zero-Trust SFU • SFrame • ML-KEM-768</span>
        </div>

        {/* Remote Peer Status Overlay */}
        {remoteStream && (
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <button
              onClick={onOpenSecurity}
              aria-label="Open Security Verification Modal"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md border text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none ${
                isMutuallyVerified
                  ? 'bg-cyber-emerald/20 border-cyber-emerald/40 text-cyber-emerald'
                  : 'bg-dark-900/80 border-dark-700 text-slate-200 hover:bg-dark-800'
              }`}
            >
              {isMutuallyVerified ? (
                <ShieldCheck className="w-4 h-4 text-cyber-emerald" aria-hidden="true" />
              ) : isSelfVerified ? (
                <Shield className="w-4 h-4 text-cyber-cyan" aria-hidden="true" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-cyber-amber" aria-hidden="true" />
              )}
              <span>{isMutuallyVerified ? 'Mutually Authenticated' : 'Remote Peer'}</span>
            </button>

            {/* Speaking audio indicator */}
            {remoteVolume > 10 && (
              <div
                role="status"
                aria-label="Remote peer speaking"
                className="flex items-center gap-1 bg-cyber-emerald/20 border border-cyber-emerald/40 px-2.5 py-1 rounded-xl backdrop-blur-md"
              >
                <span className="w-2 h-2 rounded-full bg-cyber-emerald animate-ping" />
                <span className="text-[10px] font-mono text-cyber-emerald uppercase">Speaking</span>
              </div>
            )}
          </div>
        )}

        {/* Floating Local Picture-in-Picture (PiP) */}
        <aside
          aria-label="Your local camera preview"
          className="absolute bottom-6 right-6 w-40 sm:w-56 aspect-video rounded-2xl overflow-hidden bg-dark-950 border border-dark-700 shadow-2xl z-20 group"
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            aria-label="Your local camera feed"
            className={`w-full h-full object-cover scale-x-[-1] ${
              isVideoMuted ? 'opacity-0' : 'opacity-100'
            }`}
          />
          {isVideoMuted && (
            <div className="absolute inset-0 flex items-center justify-center bg-dark-900 text-slate-500">
              <CameraOff className="w-5 h-5 text-slate-400" aria-hidden="true" />
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-dark-950/80 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] text-slate-300 font-mono">
            <span>You</span>
            {isAudioMuted && <MicOff className="w-3 h-3 text-cyber-rose" aria-hidden="true" />}
            {localVolume > 15 && !isAudioMuted && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyber-emerald animate-pulse" />
            )}
          </div>
        </aside>
      </section>

      {/* Floating Cybernetic Control Dock */}
      <nav
        aria-label="Call controls"
        className="absolute bottom-6 z-30 flex items-center gap-2 sm:gap-3 bg-dark-900/90 border border-dark-700/80 backdrop-blur-xl px-4 py-2.5 rounded-2xl shadow-2xl"
      >
        {/* Audio Mute Toggle */}
        <button
          onClick={onToggleAudio}
          aria-label={isAudioMuted ? 'Unmute microphone (Hotkey M)' : 'Mute microphone (Hotkey M)'}
          title="Toggle Microphone (M)"
          className={`min-w-[44px] min-h-[44px] p-3 rounded-xl border transition-all focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none ${
            isAudioMuted
              ? 'bg-cyber-rose/20 border-cyber-rose/50 text-cyber-rose hover:bg-cyber-rose/30'
              : 'bg-dark-850 hover:bg-dark-800 border-dark-700 text-slate-200'
          }`}
        >
          {isAudioMuted ? <MicOff className="w-5 h-5" aria-hidden="true" /> : <Mic className="w-5 h-5" aria-hidden="true" />}
        </button>

        {/* AudioWorklet Voice Isolation Toggle */}
        {onToggleNoiseSuppression && (
          <button
            onClick={onToggleNoiseSuppression}
            aria-label={isNoiseSuppressionEnabled ? 'Disable Voice Isolation' : 'Enable Voice Isolation'}
            title={isNoiseSuppressionEnabled ? 'AudioWorklet Voice Isolation: Active' : 'AudioWorklet Voice Isolation: Off'}
            className={`min-w-[44px] min-h-[44px] p-3 rounded-xl border transition-all focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none ${
              isNoiseSuppressionEnabled
                ? 'bg-cyber-purple/20 border-cyber-purple/50 text-cyber-purple'
                : 'bg-dark-850 hover:bg-dark-800 border-dark-700 text-slate-400'
            }`}
          >
            <Sparkles className="w-5 h-5" aria-hidden="true" />
          </button>
        )}

        {/* Video Camera Toggle */}
        <button
          onClick={onToggleVideo}
          aria-label={isVideoMuted ? 'Turn camera on (Hotkey V)' : 'Turn camera off (Hotkey V)'}
          title="Toggle Camera (V)"
          className={`min-w-[44px] min-h-[44px] p-3 rounded-xl border transition-all focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none ${
            isVideoMuted
              ? 'bg-cyber-rose/20 border-cyber-rose/50 text-cyber-rose hover:bg-cyber-rose/30'
              : 'bg-dark-850 hover:bg-dark-800 border-dark-700 text-slate-200'
          }`}
        >
          {isVideoMuted ? <CameraOff className="w-5 h-5" aria-hidden="true" /> : <Camera className="w-5 h-5" aria-hidden="true" />}
        </button>

        {/* Screen Share */}
        <button
          onClick={onToggleScreenShare}
          aria-label={isScreenSharing ? 'Stop screen share (Hotkey S)' : 'Start screen share (Hotkey S)'}
          title="Toggle Screen Share (S)"
          className={`min-w-[44px] min-h-[44px] p-3 rounded-xl border transition-all focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none ${
            isScreenSharing
              ? 'bg-cyber-cyan/20 border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/30'
              : 'bg-dark-850 hover:bg-dark-800 border-dark-700 text-slate-200'
          }`}
        >
          <MonitorUp className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="h-6 w-px bg-dark-700 my-auto" />

        {/* Safety Numbers Modal Trigger */}
        <button
          onClick={onOpenSecurity}
          aria-label="Inspect Safety Numbers and MitM Protection"
          title="Inspect Safety Numbers"
          className="min-w-[44px] min-h-[44px] p-3 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-700 text-cyber-emerald transition-colors focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none"
        >
          <Shield className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Diagnostic HUD Trigger */}
        <button
          onClick={onToggleHUD}
          aria-label="Toggle Diagnostic HUD"
          title="Diagnostic HUD"
          className="min-w-[44px] min-h-[44px] p-3 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-700 text-cyber-cyan transition-colors focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none"
        >
          <Activity className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* P2P Encrypted File Drop Trigger */}
        <button
          onClick={onOpenFileDrop}
          aria-label="P2P Encrypted File Drop"
          title="P2P Encrypted File Drop"
          className="min-w-[44px] min-h-[44px] p-3 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-700 text-cyber-emerald transition-colors focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none"
        >
          <UploadCloud className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Encrypted Chat Trigger with Unread Counter */}
        <button
          onClick={onToggleChat}
          aria-label={unreadChatCount > 0 ? `Encrypted Chat: ${unreadChatCount} unread (Hotkey C)` : 'Encrypted Chat (Hotkey C)'}
          title="Encrypted P2P Chat (C)"
          className="relative min-w-[44px] min-h-[44px] p-3 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-700 text-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none"
        >
          <MessageSquare className="w-5 h-5" aria-hidden="true" />
          {unreadChatCount > 0 && (
            <span
              role="status"
              aria-label={`${unreadChatCount} unread messages`}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-cyber-emerald text-dark-950 font-bold text-[10px] flex items-center justify-center animate-bounce"
            >
              {unreadChatCount}
            </span>
          )}
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          aria-label="Toggle Fullscreen Mode"
          title="Toggle Fullscreen"
          className="min-w-[44px] min-h-[44px] p-3 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-700 text-slate-400 hover:text-slate-200 transition-colors hidden sm:block focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none"
        >
          <Maximize2 className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="h-6 w-px bg-dark-700 my-auto" />

        {/* Leave / Hang Up Button */}
        <button
          onClick={onLeave}
          aria-label="End and leave call"
          title="Leave Call"
          className="min-h-[44px] px-4 py-3 rounded-xl bg-cyber-rose hover:bg-rose-600 text-white font-semibold flex items-center gap-2 shadow-lg shadow-cyber-rose/20 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          <PhoneOff className="w-5 h-5" aria-hidden="true" />
          <span className="text-xs hidden sm:inline">END CALL</span>
        </button>
      </nav>
    </div>
  );
};
