import React from 'react';
import { Shield, ShieldCheck, ShieldAlert, Activity, Key, Copy, Check, Users, Phone, Radio, Cpu } from 'lucide-react';
import { CallState } from '../hooks/useWebRTC.js';
import { SignalingTransportType } from './TransportSelector.js';

interface NavbarProps {
  roomId: string;
  callState: CallState;
  isPeerVerified: boolean;
  isSelfVerified: boolean;
  onOpenSecurity: () => void;
  onToggleHUD: () => void;
  isHUDOpen: boolean;
  onOpenSocialRecovery?: () => void;
  onOpenTelephony?: () => void;
  onOpenTransportSelector?: () => void;
  onOpenSentinelSuite?: () => void;
  selectedTransport?: SignalingTransportType;
}

export const Navbar: React.FC<NavbarProps> = ({
  roomId,
  callState,
  isPeerVerified,
  isSelfVerified,
  onOpenSecurity,
  onToggleHUD,
  isHUDOpen,
  onOpenSocialRecovery,
  onOpenTelephony,
  onOpenTransportSelector,
  onOpenSentinelSuite,
  selectedTransport = 'ws',
}) => {
  const [copied, setCopied] = React.useState(false);

  const copyInviteLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isVerified = isSelfVerified && isPeerVerified;

  return (
    <header className="h-16 border-b border-dark-800 bg-dark-900/80 backdrop-blur-md px-6 flex items-center justify-between z-30 sticky top-0">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyber-emerald/20 to-cyber-cyan/20 border border-cyber-emerald/40 flex items-center justify-center shadow-lg shadow-cyber-emerald/10">
          <Shield className="w-5 h-5 text-cyber-emerald" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Aegis<span className="text-cyber-emerald">Call</span>
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-cyber-emerald/10 text-cyber-emerald border border-cyber-emerald/30 rounded-full">
              E2EE
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">Zero-Trust Encrypted WebRTC</p>
        </div>
      </div>

      {/* Center Room & Security Info */}
      <div className="flex items-center gap-3">
        {roomId && (
          <div className="flex items-center gap-2 bg-dark-850/90 border border-dark-700/80 px-3 py-1.5 rounded-lg text-xs font-mono">
            <span className="text-slate-400 hidden md:inline">ROOM:</span>
            <span className="text-slate-200 font-semibold">{roomId}</span>
            <button
              onClick={copyInviteLink}
              title="Copy invite URL"
              className="p-1 hover:bg-dark-700 text-slate-400 hover:text-slate-100 rounded transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-cyber-emerald" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {callState === 'connected' && (
          <button
            onClick={onOpenSecurity}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              isVerified
                ? 'bg-cyber-emerald/10 border-cyber-emerald/40 text-cyber-emerald hover:bg-cyber-emerald/20'
                : 'bg-cyber-amber/10 border-cyber-amber/40 text-cyber-amber hover:bg-cyber-amber/20'
            }`}
          >
            {isVerified ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-cyber-emerald" />
                <span className="hidden sm:inline">Mutually Verified</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-cyber-amber" />
                <span className="hidden sm:inline">Verify Safety Numbers</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        {callState === 'connected' && (
          <button
            onClick={onOpenSecurity}
            title="Inspect Cryptographic Keys & Safety Numbers"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 border border-dark-700 text-xs text-slate-300 hover:text-slate-100 transition-colors"
          >
            <Key className="w-3.5 h-3.5 text-cyber-cyan" />
            <span className="hidden md:inline">Keys</span>
          </button>
        )}

        {onOpenSocialRecovery && (
          <button
            onClick={onOpenSocialRecovery}
            title="Shamir Social Key Recovery & Guardian Shares"
            data-testid="social-recovery-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 border border-dark-700 text-xs text-cyber-emerald hover:text-emerald-300 transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Recovery</span>
          </button>
        )}

        {onOpenTransportSelector && (
          <button
            onClick={onOpenTransportSelector}
            title="Censorship-Resistant Signaling Transports (WebSocket / Nostr / Tor / DHT / Mesh)"
            data-testid="transport-selector-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 border border-dark-700 text-xs text-cyber-cyan hover:text-cyan-300 transition-colors"
          >
            <Radio className="w-3.5 h-3.5 text-cyber-cyan" />
            <span className="font-mono text-[10px] uppercase font-bold text-cyber-cyan">
              {selectedTransport?.toUpperCase()}
            </span>
          </button>
        )}

        {onOpenTelephony && (
          <button
            onClick={onOpenTelephony}
            title="Sovereign Telephony Dialpad (SIP / PSTN Trunk & DTMF)"
            data-testid="telephony-dialpad-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 border border-dark-700 text-xs text-cyber-emerald hover:text-emerald-300 transition-colors"
          >
            <Phone className="w-3.5 h-3.5 text-cyber-emerald" />
            <span className="hidden md:inline">Dialpad</span>
          </button>
        )}

        {onOpenSentinelSuite && (
          <button
            onClick={onOpenSentinelSuite}
            title="Sovereign Sentinel & Anti-Surveillance Suite (Hardware Enclave, Traffic Camouflage, Acoustic Air-Gap, ZK, Edge AI)"
            data-testid="sovereign-sentinel-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 border border-dark-700 text-xs text-cyber-cyan hover:text-cyan-300 transition-colors"
          >
            <Cpu className="w-3.5 h-3.5 text-cyber-cyan" />
            <span className="hidden md:inline">Sentinels</span>
          </button>
        )}

        <button
          onClick={onToggleHUD}
          title="Toggle Diagnostics HUD"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
            isHUDOpen
              ? 'bg-cyber-cyan/15 border-cyber-cyan/50 text-cyber-cyan'
              : 'bg-dark-850 hover:bg-dark-800 border-dark-700 text-slate-300'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span className="hidden md:inline">HUD</span>
        </button>
      </div>
    </header>
  );
};
