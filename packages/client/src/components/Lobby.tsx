import React, { useRef, useEffect } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Shield,
  Lock,
  Zap,
  ArrowRight,
  Copy,
  Check,
  Cpu,
  Fingerprint,
} from 'lucide-react';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer.js';

interface LobbyProps {
  roomId: string;
  setRoomId: (id: string) => void;
  localStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioId: string;
  selectedVideoId: string;
  onSelectAudio: (id: string) => void;
  onSelectVideo: (id: string) => void;
  onJoin: () => void;
  errorMessage: string | null;
}

export const Lobby: React.FC<LobbyProps> = ({
  roomId,
  setRoomId,
  localStream,
  isAudioMuted,
  isVideoMuted,
  onToggleAudio,
  onToggleVideo,
  audioDevices,
  videoDevices,
  selectedAudioId,
  selectedVideoId,
  onSelectAudio,
  onSelectVideo,
  onJoin,
  errorMessage,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [copied, setCopied] = React.useState(false);
  const { volume } = useAudioVisualizer(localStream, !isAudioMuted);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const copyInvite = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateRandomRoom = () => {
    const words = ['cipher', 'shield', 'sentinel', 'stealth', 'nexus', 'vanguard', 'matrix', 'quantum'];
    const word = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    setRoomId(`${word}-${num}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col lg:flex-row items-center gap-10">
      {/* Left: Camera Preview & Device Controls */}
      <div className="w-full lg:w-7/12 space-y-4">
        <div className="relative aspect-video rounded-3xl overflow-hidden bg-dark-900 border border-dark-750 shadow-2xl group">
          {/* Video Preview */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${
              isVideoMuted ? 'opacity-0' : 'opacity-100'
            }`}
          />

          {/* Placeholder when Video is Off */}
          {isVideoMuted && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-900 text-slate-500">
              <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-3">
                <CameraOff className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-sm font-medium">Camera is disabled</p>
            </div>
          )}

          {/* Audio Input Level Meter Overlay */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 bg-dark-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-dark-800">
              {isAudioMuted ? (
                <MicOff className="w-3.5 h-3.5 text-cyber-rose" />
              ) : (
                <Mic className="w-3.5 h-3.5 text-cyber-emerald" />
              )}
              <div className="flex items-center gap-0.5 h-3 w-16">
                {[...Array(8)].map((_, i) => {
                  const active = !isAudioMuted && volume > i * 12;
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-sm transition-all duration-75 ${
                        active
                          ? i > 5
                            ? 'bg-cyber-rose h-3'
                            : i > 3
                            ? 'bg-cyber-amber h-2.5'
                            : 'bg-cyber-emerald h-2'
                          : 'bg-dark-700 h-1'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* In-Preview Media Toggles */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onClick={onToggleAudio}
                className={`p-2.5 rounded-xl backdrop-blur-md border transition-all ${
                  isAudioMuted
                    ? 'bg-cyber-rose/20 border-cyber-rose/50 text-cyber-rose hover:bg-cyber-rose/30'
                    : 'bg-dark-900/80 border-dark-700 text-slate-200 hover:bg-dark-800'
                }`}
              >
                {isAudioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                onClick={onToggleVideo}
                className={`p-2.5 rounded-xl backdrop-blur-md border transition-all ${
                  isVideoMuted
                    ? 'bg-cyber-rose/20 border-cyber-rose/50 text-cyber-rose hover:bg-cyber-rose/30'
                    : 'bg-dark-900/80 border-dark-700 text-slate-200 hover:bg-dark-800'
                }`}
              >
                {isVideoMuted ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Device Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Microphone
            </label>
            <select
              value={selectedAudioId}
              onChange={(e) => onSelectAudio(e.target.value)}
              className="w-full bg-dark-900 border border-dark-750 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyber-emerald/60"
            >
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone (${d.deviceId.slice(0, 6)}...)`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Camera
            </label>
            <select
              value={selectedVideoId}
              onChange={(e) => onSelectVideo(e.target.value)}
              className="w-full bg-dark-900 border border-dark-750 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyber-emerald/60"
            >
              {videoDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera (${d.deviceId.slice(0, 6)}...)`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Right: Room Configuration & Launch Card */}
      <div className="w-full lg:w-5/12 space-y-6">
        <div className="bg-dark-900 border border-dark-750 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyber-emerald/10 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-2 mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyber-emerald/10 border border-cyber-emerald/30 text-cyber-emerald text-xs font-mono">
              <Lock className="w-3 h-3" />
              <span>MILITARY-GRADE E2EE</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">
              Zero-Trust Calling
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Insertable Streams payload encryption with X25519 ephemeral key agreement. The signaling server never sees plaintext audio or video.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 mb-4 rounded-xl bg-cyber-rose/10 border border-cyber-rose/30 text-cyber-rose text-xs">
              {errorMessage}
            </div>
          )}

          {/* Room Input Form */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Calling Room ID
                </label>
                <button
                  type="button"
                  onClick={generateRandomRoom}
                  className="text-xs text-cyber-cyan hover:underline flex items-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  Random Room
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="e.g. quantum-7701"
                  className="flex-1 bg-dark-950 border border-dark-700 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyber-emerald/60"
                />
                <button
                  type="button"
                  onClick={copyInvite}
                  title="Copy share link"
                  className="p-2.5 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-700 text-slate-300 hover:text-slate-100 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-cyber-emerald" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Launch Button */}
            <button
              onClick={onJoin}
              disabled={!roomId.trim()}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyber-emerald to-emerald-400 text-dark-950 font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-xl shadow-cyber-emerald/20 hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              <span>ENTER SECURE CALL</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Security Guarantee List */}
          <div className="mt-8 pt-6 border-t border-dark-800 grid grid-cols-2 gap-3 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-cyber-emerald shrink-0" />
              <span>AES-256-GCM SFrame</span>
            </div>
            <div className="flex items-center gap-2">
              <Fingerprint className="w-3.5 h-3.5 text-cyber-cyan shrink-0" />
              <span>SAS Safety Numbers</span>
            </div>
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-cyber-purple shrink-0" />
              <span>Zero-Log Ephemeral WS</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-cyber-amber shrink-0" />
              <span>Perfect Forward Secrecy</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
