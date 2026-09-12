import React from 'react';
import {
  Radio,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Globe,
  Lock,
  Cpu,
  X,
  CheckCircle2,
  Signal,
  Wifi,
} from 'lucide-react';

export type SignalingTransportType = 'ws' | 'nostr' | 'tor' | 'dht' | 'mesh';

export interface TransportOption {
  id: SignalingTransportType;
  name: string;
  badge: string;
  description: string;
  resilienceRating: number; // 1-5 stars
  threatModel: string;
  status: 'active' | 'standby' | 'ready';
  latencyMs: number;
}

export const TRANSPORT_OPTIONS: TransportOption[] = [
  {
    id: 'ws',
    name: 'WebSocket (Zero-Log Direct)',
    badge: 'DIRECT TLS',
    description: 'Ultra low-latency ephemeral signaling over encrypted WSS connection.',
    resilienceRating: 3,
    threatModel: 'Standard enterprise/civilian networks with TLS egress.',
    status: 'active',
    latencyMs: 18,
  },
  {
    id: 'nostr',
    name: 'Nostr Relay Mesh (NIP-04/44)',
    badge: 'DECENTRALIZED',
    description: 'Cryptographically signed ephemeral room announcements broadcast across independent Nostr relays.',
    resilienceRating: 4,
    threatModel: 'Bypasses IP-level domain blocking and central server takedowns.',
    status: 'ready',
    latencyMs: 65,
  },
  {
    id: 'tor',
    name: 'Tor Onion SOCKS5 Tunnel',
    badge: 'ANONYMITY NET',
    description: 'Multi-hop onion routing hiding source IP and location metadata via local SOCKS5 proxy (127.0.0.1:9050).',
    resilienceRating: 5,
    threatModel: 'Hostile nation-state ISP deep packet inspection and network surveillance.',
    status: 'ready',
    latencyMs: 140,
  },
  {
    id: 'dht',
    name: 'BitTorrent Mainline DHT',
    badge: 'SERVERLESS BEP-44',
    description: 'Distributed Hash Table immutable/mutable key-value rendezvous hashed from Room ID.',
    resilienceRating: 4,
    threatModel: 'Total central server seizure; relies on millions of global BitTorrent nodes.',
    status: 'ready',
    latencyMs: 110,
  },
  {
    id: 'mesh',
    name: 'Air-Gapped Radio Mesh',
    badge: 'OFF-GRID MESH',
    description: 'Bluetooth Low Energy (BLE) and Wi-Fi Direct peer rendezvous for zero-infrastructure environments.',
    resilienceRating: 5,
    threatModel: 'Total internet shutdown, electrical grid blackout, or telecommunications cutoff.',
    status: 'ready',
    latencyMs: 35,
  },
];

export interface TransportSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTransport: SignalingTransportType;
  onSelectTransport: (transport: SignalingTransportType) => void;
}

export const TransportSelectorModal: React.FC<TransportSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedTransport,
  onSelectTransport,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transport-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div className="bg-dark-900 border border-dark-750 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-dark-800 flex items-center justify-between bg-dark-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyber-cyan/10 border border-cyber-cyan/30 flex items-center justify-center text-cyber-cyan">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 id="transport-modal-title" className="text-base font-bold text-slate-100 flex items-center gap-2">
                Signaling Transport Resilience
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/30 uppercase">
                  ANTI-CENSORSHIP
                </span>
              </h2>
              <p className="text-xs text-slate-400">Multi-Transport Decentralized Signaling Fabric</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Transport Selector"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transport List */}
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <div className="bg-dark-950/70 border border-dark-800 rounded-2xl p-3 text-xs text-slate-400 leading-relaxed">
            <p className="text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-cyber-emerald" />
              Censorship Resistance Guarantee
            </p>
            Switching transports alters the underlying signaling relay mechanism without interrupting active media encryption (AES-256-GCM SFrame remains end-to-end).
          </div>

          {TRANSPORT_OPTIONS.map((opt) => {
            const isSelected = selectedTransport === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectTransport(opt.id)}
                className={`w-full text-left p-4 rounded-2xl border transition-all flex flex-col gap-2 ${
                  isSelected
                    ? 'bg-cyber-cyan/10 border-cyber-cyan/60 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : 'bg-dark-850/70 hover:bg-dark-800 border-dark-750 hover:border-dark-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-100">{opt.name}</span>
                    <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-dark-750 text-slate-300 border border-dark-700">
                      {opt.badge}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-slate-400 text-[11px]">{opt.latencyMs}ms</span>
                    {isSelected ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-cyber-cyan animate-pulse" />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-normal">{opt.description}</p>

                <div className="flex items-center justify-between pt-2 border-t border-dark-800/80 text-[11px]">
                  <span className="text-slate-400">
                    <strong className="text-slate-300">Threat Model:</strong> {opt.threatModel}
                  </span>
                  <div className="flex items-center gap-0.5 text-cyber-amber shrink-0 ml-2" title={`Resilience: ${opt.resilienceRating}/5`}>
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className={i < opt.resilienceRating ? 'text-cyber-amber' : 'text-dark-700'}>
                        ★
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-dark-800 bg-dark-950/60 flex items-center justify-between">
          <div className="text-xs font-mono text-slate-400">
            Active:{' '}
            <span className="text-cyber-cyan font-bold uppercase">
              {TRANSPORT_OPTIONS.find((t) => t.id === selectedTransport)?.name || selectedTransport}
            </span>
          </div>
          <button
            onClick={onClose}
            className="py-2.5 px-5 rounded-xl bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
