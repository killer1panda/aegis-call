import React from 'react';
import { Activity, Cpu, Shield, Wifi, X, CheckCircle2, Layers } from 'lucide-react';
import { NetworkStats } from '../hooks/useWebRTC.js';
import { FrameCipherStats } from '@aegis/crypto';

interface NetworkStatsHUDProps {
  isOpen: boolean;
  onClose: () => void;
  networkStats: NetworkStats;
  cryptoStats: { audio?: FrameCipherStats; video?: FrameCipherStats };
  simulcastTier?: 'auto' | 'high' | 'medium' | 'low';
  onSetSimulcastTier?: (tier: 'auto' | 'high' | 'medium' | 'low') => void;
}

export const NetworkStatsHUD: React.FC<NetworkStatsHUDProps> = ({
  isOpen,
  onClose,
  networkStats,
  cryptoStats,
  simulcastTier = 'auto',
  onSetSimulcastTier,
}) => {
  if (!isOpen) return null;

  const audioStats = cryptoStats.audio;
  const videoStats = cryptoStats.video;

  const totalFrames = (audioStats?.framesEncrypted || 0) + (videoStats?.framesEncrypted || 0);
  const avgLatency = Math.round(
    ((audioStats?.averageLatencyMicros || 0) + (videoStats?.averageLatencyMicros || 0)) / 2
  );

  return (
    <div className="fixed bottom-24 right-6 z-40 w-84 sm:w-96 bg-dark-900/95 border border-dark-700/90 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden font-mono text-xs animate-slide-up">
      {/* HUD Header */}
      <div className="px-4 py-3 bg-dark-850/80 border-b border-dark-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-cyber-cyan font-semibold">
          <Activity className="w-4 h-4" />
          <span>REAL-TIME DIAGNOSTIC HUD</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-dark-750 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto select-none">
        {/* Network & WebRTC Metrics */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            <Wifi className="w-3.5 h-3.5 text-cyber-emerald" />
            <span>WebRTC Transport Layer</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-xl bg-dark-950/70 border border-dark-800">
              <div className="text-[10px] text-slate-400">RTT (Latency)</div>
              <div className="text-base font-bold text-slate-100 flex items-baseline gap-1">
                <span className={networkStats.rttMs > 100 ? 'text-cyber-amber' : 'text-cyber-emerald'}>
                  {networkStats.rttMs}
                </span>
                <span className="text-[10px] text-slate-400">ms</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-dark-950/70 border border-dark-800">
              <div className="text-[10px] text-slate-400">Packet Loss</div>
              <div className="text-base font-bold text-slate-100 flex items-baseline gap-1">
                <span className={networkStats.packetLossPercent > 2 ? 'text-cyber-rose' : 'text-cyber-emerald'}>
                  {networkStats.packetLossPercent}%
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-dark-950/70 border border-dark-800">
              <div className="text-[10px] text-slate-400">Bitrate</div>
              <div className="text-base font-bold text-slate-100 flex items-baseline gap-1">
                <span>{networkStats.bitrateKbps}</span>
                <span className="text-[10px] text-slate-400">kbps</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-dark-950/70 border border-dark-800">
              <div className="text-[10px] text-slate-400">Video Res / FPS</div>
              <div className="text-xs font-bold text-slate-100 truncate mt-1">
                {networkStats.resolution} @ {networkStats.fps} fps
              </div>
            </div>
          </div>
        </div>

        {/* Cryptographic Pipeline & Insertable Streams */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            <Shield className="w-3.5 h-3.5 text-cyber-cyan" />
            <span>Zero-Trust Cryptographic Engine</span>
          </div>

          <div className="p-3 rounded-xl bg-dark-950/70 border border-dark-800 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Key Exchange:</span>
              <span className="text-cyber-cyan font-semibold">Curve25519 (X25519) + HKDF</span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Payload Cipher:</span>
              <span className="text-cyber-emerald font-semibold">AES-256-GCM (Frame level)</span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Frame Overhead:</span>
              <span className="text-slate-300">+22 bytes / frame</span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Avg Cipher Latency:</span>
              <span className="text-cyber-emerald font-semibold">
                {avgLatency > 0 ? `${avgLatency} µs` : '< 0.05 ms'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Replay Protection:</span>
              <span className="text-cyber-emerald flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Active (Counter + Tag)
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Frames Encrypted:</span>
              <span className="text-slate-200">{totalFrames.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Connection Topology */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            <Cpu className="w-3.5 h-3.5 text-cyber-purple" />
            <span>Network Path & Topology</span>
          </div>
          <div className="p-2.5 rounded-xl bg-dark-950/70 border border-dark-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Candidate Type:</span>
            <span className="px-2 py-0.5 rounded bg-cyber-purple/15 text-cyber-purple border border-cyber-purple/30 font-semibold">
              {networkStats.candidateType}
            </span>
          </div>
        </div>

        {/* Blind SFU Encrypted Simulcast Controls */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            <Layers className="w-3.5 h-3.5 text-cyber-cyan" />
            <span>Blind SFU Encrypted Simulcast</span>
          </div>

          <div className="p-3 rounded-xl bg-dark-950/70 border border-dark-800 space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Target Layer:</span>
              <span className="text-cyber-cyan font-bold uppercase">{simulcastTier}</span>
            </div>

            {onSetSimulcastTier && (
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {(['auto', 'high', 'medium', 'low'] as const).map((tier) => (
                  <button
                    key={tier}
                    onClick={() => onSetSimulcastTier(tier)}
                    className={`py-1 px-1.5 rounded-lg text-[10px] font-mono uppercase transition-all ${
                      simulcastTier === tier
                        ? 'bg-cyber-cyan text-dark-950 font-bold shadow-sm'
                        : 'bg-dark-850 hover:bg-dark-800 text-slate-400 border border-dark-750'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            )}
            <div className="text-[10px] text-slate-400 leading-tight pt-1">
              SFU blindly filters encrypted spatial frames based on downstream tier without payload decryption.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
