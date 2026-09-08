import React, { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Shield, ShieldCheck, Check, X, AlertTriangle, Lock } from 'lucide-react';
import { SASVerification } from '@aegis/crypto';

interface SecurityBadgeProps {
  isOpen: boolean;
  onClose: () => void;
  safetyNumbers: SASVerification | null;
  isSelfVerified: boolean;
  isPeerVerified: boolean;
  onMarkVerified: () => void;
  roomId: string;
}

export const SecurityBadge: React.FC<SecurityBadgeProps> = ({
  isOpen,
  onClose,
  safetyNumbers,
  isSelfVerified,
  isPeerVerified,
  onMarkVerified,
  roomId,
}) => {
  // ESC key listener for modal closing (A11y standard)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md animate-fade-in"
    >
      <div className="bg-dark-900 border border-dark-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden relative">
        {/* Modal Header */}
        <div className="p-6 border-b border-dark-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyber-emerald/10 border border-cyber-emerald/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-cyber-emerald" aria-hidden="true" />
            </div>
            <div>
              <h3 id="security-modal-title" className="font-semibold text-base text-slate-100">
                End-to-End Encryption Verification
              </h3>
              <p className="text-xs text-slate-400 font-mono">Room: {roomId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Security Modal"
            className="p-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-slate-400 hover:text-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Verification Status Banner */}
          <div
            role="status"
            aria-live="polite"
            className={`p-4 rounded-xl border flex items-center gap-3 ${
              isSelfVerified && isPeerVerified
                ? 'bg-cyber-emerald/10 border-cyber-emerald/30 text-cyber-emerald'
                : isSelfVerified
                ? 'bg-cyber-cyan/10 border-cyber-cyan/30 text-cyber-cyan'
                : 'bg-cyber-amber/10 border-cyber-amber/30 text-cyber-amber'
            }`}
          >
            <ShieldCheck className="w-6 h-6 shrink-0" aria-hidden="true" />
            <div className="text-xs space-y-0.5">
              <div className="font-semibold">
                {isSelfVerified && isPeerVerified
                  ? 'Mutually Verified & Authenticated'
                  : isSelfVerified
                  ? 'Awaiting peer verification confirmation'
                  : 'Unverified: Compare Safety Numbers with your peer'}
              </div>
              <p className="opacity-80">
                {isSelfVerified && isPeerVerified
                  ? 'Both peers confirmed identical Safety Numbers. No Man-in-the-Middle is present.'
                  : 'Read the 4 emojis or digits aloud. If they match on both screens, your call is cryptographically secure.'}
              </p>
            </div>
          </div>

          {safetyNumbers ? (
            <>
              {/* Visual SAS Emojis */}
              <div>
                <label className="text-xs font-semibold text-slate-400 tracking-wider uppercase block mb-2">
                  Rapid Emoji Verification (SAS)
                </label>
                <div
                  role="group"
                  aria-label="Safety Number Emojis"
                  className="bg-dark-850 border border-dark-700/60 rounded-xl p-4 flex items-center justify-around"
                >
                  {safetyNumbers.emojis.map((emoji, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-dark-800 transition-colors"
                    >
                      <span className="text-4xl filter drop-shadow" role="img" aria-label={`Emoji ${idx + 1}`}>
                        {emoji}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 uppercase">#{idx + 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 60-digit Numeric Code */}
              <div>
                <label className="text-xs font-semibold text-slate-400 tracking-wider uppercase block mb-2">
                  Safety Numbers (60 Digits)
                </label>
                <div
                  aria-label="60 digit cryptographic safety number"
                  className="bg-dark-950 border border-dark-800 rounded-xl p-4 font-mono text-center text-sm md:text-base tracking-widest text-cyber-cyan select-all"
                >
                  {safetyNumbers.numericCode}
                </div>
              </div>

              {/* QR Code & Fingerprint */}
              <div className="flex flex-col sm:flex-row items-center gap-4 bg-dark-850 border border-dark-700/60 rounded-xl p-4">
                <div className="p-2 bg-white rounded-lg shrink-0">
                  <QRCodeSVG
                    value={`aegis://${roomId}/${safetyNumbers.hexFingerprint}`}
                    size={100}
                    level="M"
                    aria-label="Session fingerprint QR code"
                  />
                </div>
                <div className="space-y-1.5 text-center sm:text-left">
                  <div className="text-xs font-semibold text-slate-300 flex items-center justify-center sm:justify-start gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-cyber-emerald" aria-hidden="true" />
                    Cryptographic Session Fingerprint
                  </div>
                  <p className="text-[11px] font-mono text-slate-400 break-all select-all">
                    {safetyNumbers.hexFingerprint}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Scan with another device to verify session identity out-of-band.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-slate-400 text-sm" role="status">
              <AlertTriangle className="w-8 h-8 text-cyber-amber mx-auto mb-2 opacity-80" aria-hidden="true" />
              Waiting for peer connection to complete X25519 key exchange...
            </div>
          )}

          {/* Educational Note on Threat Model */}
          <div className="text-[11px] text-slate-400 bg-dark-950/60 border border-dark-800 rounded-xl p-3 leading-relaxed">
            <span className="text-slate-300 font-semibold">How it works:</span> Aegis uses ephemeral X25519 Elliptic Curve Diffie-Hellman (ECDH) key exchange. The Safety Numbers are derived strictly from the shared secret. If an adversary attempts to tap or impersonate the signaling server, the mathematical keys will differ and the numbers will not match.
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-dark-950 border-t border-dark-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 min-h-[40px] text-xs font-medium text-slate-400 hover:text-slate-200 rounded-lg hover:bg-dark-800 transition-colors focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none"
          >
            Close
          </button>
          <button
            onClick={onMarkVerified}
            disabled={!safetyNumbers || isSelfVerified}
            className={`px-5 py-2 min-h-[40px] text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-lg transition-all focus-visible:ring-2 focus-visible:ring-cyber-emerald focus-visible:outline-none ${
              isSelfVerified
                ? 'bg-cyber-emerald/20 text-cyber-emerald border border-cyber-emerald/40 cursor-default'
                : 'bg-cyber-emerald hover:bg-emerald-400 text-dark-950 hover:shadow-cyber-emerald/20'
            }`}
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            {isSelfVerified ? 'Marked as Verified' : 'Confirm & Mark Verified'}
          </button>
        </div>
      </div>
    </div>
  );
};
