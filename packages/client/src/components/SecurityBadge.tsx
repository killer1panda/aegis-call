import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Shield,
  ShieldCheck,
  Check,
  X,
  AlertTriangle,
  Lock,
  Fingerprint,
  FileCheck,
  Copy,
  ChevronDown,
  ChevronUp,
  BookmarkCheck,
  Upload,
} from 'lucide-react';
import {
  SASVerification,
  resolveDIDDocument,
  createCallVerificationPresentation,
  issueHardwareReceipt,
  generateAuthChallenge,
  generateIdentityKeyPair,
  signCallVerificationPresentation,
  verifyCallVerificationPresentation,
} from '@aegis/crypto';
import { TrustedContactsRegistry } from '../services/trustedContactsRegistry.js';

interface SecurityBadgeProps {
  isOpen: boolean;
  onClose: () => void;
  safetyNumbers: SASVerification | null;
  isSelfVerified: boolean;
  isPeerVerified: boolean;
  onMarkVerified: () => void;
  roomId: string;
  localDid?: string | null;
  remoteDid?: string | null;
}

export const SecurityBadge: React.FC<SecurityBadgeProps> = ({
  isOpen,
  onClose,
  safetyNumbers,
  isSelfVerified,
  isPeerVerified,
  onMarkVerified,
  roomId,
  localDid,
  remoteDid,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showDidDoc, setShowDidDoc] = useState(false);
  const [isPeerPinned, setIsPeerPinned] = useState(false);
  const [vpExported, setVpExported] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);
  const identityKeyPairRef = React.useRef(generateIdentityKeyPair());

  // ESC key listener for modal closing (A11y standard)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Check pinned contact status
  useEffect(() => {
    if (safetyNumbers) {
      const status = TrustedContactsRegistry.verifyPeerStatus(
        safetyNumbers.hexFingerprint,
        safetyNumbers.numericCode
      );
      setIsPeerPinned(status.isTrusted);
    }
  }, [safetyNumbers]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleExportVerifiablePresentation = () => {
    if (!safetyNumbers) return;
    const idPair = identityKeyPairRef.current;
    const peer = remoteDid || 'did:key:zAegisPeer';
    const presentation = signCallVerificationPresentation(
      idPair.privateKey,
      idPair.did,
      peer,
      safetyNumbers.hexFingerprint,
      roomId
    );

    const blob = new Blob([JSON.stringify(presentation, null, 2)], {
      type: 'application/ld+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis-credential-${roomId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setVpExported(true);
    setTimeout(() => setVpExported(false), 3000);
  };

  const handleVerifyCredentialFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = verifyCallVerificationPresentation(parsed, roomId);
      if (result.valid) {
        setVerificationFeedback(`Authentic Credential! Issuer: ${result.issuerDid?.slice(0, 20)}...`);
      } else {
        setVerificationFeedback(`Verification Failed: ${result.reason}`);
      }
    } catch (err: any) {
      setVerificationFeedback(`Invalid JSON Credential: ${err.message}`);
    }
  };

  const handlePinContact = async () => {
    if (!safetyNumbers) return;

    let credId = `cred-${Date.now()}`;
    let sigBytes = new Uint8Array(32);
    crypto.getRandomValues(sigBytes);
    let authType: 'apple-secure-enclave' | 'windows-hello' | 'fido2-hardware-token' | 'webauthn-software' = 'apple-secure-enclave';

    if (typeof window !== 'undefined' && (window as any).PublicKeyCredential && navigator.credentials) {
      try {
        const challenge = generateAuthChallenge(roomId);
        const cred = (await navigator.credentials.get({
          publicKey: {
            challenge: challenge as BufferSource,
            timeout: 60000,
            userVerification: 'preferred',
          },
        })) as any;

        if (cred) {
          credId = cred.id;
          if (cred.response?.signature) {
            sigBytes = new Uint8Array(cred.response.signature);
          }
        }
      } catch (_) {
        // Fallback to software attestation if user cancels biometric prompt or hardware is unavailable
        authType = 'webauthn-software';
      }
    }

    const receipt = issueHardwareReceipt(
      roomId,
      credId,
      safetyNumbers.hexFingerprint,
      safetyNumbers.numericCode,
      sigBytes,
      authType
    );

    TrustedContactsRegistry.saveTrustedContact({
      contactId: `contact-${Date.now()}`,
      displayName: `Peer (${roomId.slice(0, 8)})`,
      verifiedPublicKeyHex: safetyNumbers.hexFingerprint,
      fingerprint: safetyNumbers.hexFingerprint,
      lastVerifiedAt: Date.now(),
      hardwareReceipt: receipt,
    });
    setIsPeerPinned(true);
  };

  const resolvedLocalDoc = localDid ? resolveDIDDocument(localDid) : null;

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

              {/* W3C Decentralized Identity (did:key) Section */}
              <div className="bg-dark-950 border border-dark-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-cyber-cyan">
                    <Fingerprint className="w-4 h-4" />
                    <span>W3C Decentralized Identity (did:key)</span>
                  </div>
                  {isPeerPinned ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-cyber-emerald bg-cyber-emerald/10 border border-cyber-emerald/30 px-2 py-0.5 rounded-md">
                      <BookmarkCheck className="w-3 h-3" /> Pinned Peer
                    </span>
                  ) : (
                    <button
                      onClick={handlePinContact}
                      className="text-[10px] font-mono text-slate-400 hover:text-cyber-cyan transition-colors"
                    >
                      + Pin as Trusted
                    </button>
                  )}
                </div>

                {/* Local DID */}
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                    <span>YOUR DID:</span>
                    <button
                      onClick={() => copyToClipboard(localDid || '', 'localDid')}
                      className="text-cyber-emerald hover:underline flex items-center gap-1"
                    >
                      <Copy className="w-2.5 h-2.5" />
                      {copiedKey === 'localDid' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-slate-300 bg-dark-900 px-2.5 py-1.5 rounded border border-dark-800 truncate select-all">
                    {localDid || 'Deriving local did:key...'}
                  </div>
                </div>

                {/* Remote Peer DID */}
                {remoteDid && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                      <span>PEER DID:</span>
                      <button
                        onClick={() => copyToClipboard(remoteDid, 'remoteDid')}
                        className="text-cyber-emerald hover:underline flex items-center gap-1"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        {copiedKey === 'remoteDid' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="text-[11px] font-mono text-cyber-emerald bg-dark-900 px-2.5 py-1.5 rounded border border-dark-800 truncate select-all">
                      {remoteDid}
                    </div>
                  </div>
                )}

                {/* DID Document Collapsible */}
                {resolvedLocalDoc && (
                  <div className="pt-2 border-t border-dark-800/80">
                    <button
                      onClick={() => setShowDidDoc((prev) => !prev)}
                      className="flex items-center justify-between w-full text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      <span>View W3C DID Document (JSON-LD)</span>
                      {showDidDoc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {showDidDoc && (
                      <pre className="mt-2 p-2 rounded bg-dark-900 text-[9px] font-mono text-slate-300 overflow-x-auto max-h-32 border border-dark-800">
                        {JSON.stringify(resolvedLocalDoc, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

                {/* Verifiable Presentation Export & Verification */}
                <div className="pt-1 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleExportVerifiablePresentation}
                      className="w-full py-2 px-3 rounded-lg bg-dark-850 hover:bg-dark-800 border border-dark-750 text-xs font-mono text-cyber-cyan flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>{vpExported ? 'Downloaded!' : 'Export VP (JSON)'}</span>
                    </button>

                    <label className="w-full py-2 px-3 rounded-lg bg-dark-850 hover:bg-dark-800 border border-dark-750 text-xs font-mono text-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-cyber-emerald" />
                      <span>Verify File</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleVerifyCredentialFile}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {verificationFeedback && (
                    <div className={`p-2.5 rounded-lg text-[11px] font-mono border ${
                      verificationFeedback.startsWith('Authentic')
                        ? 'bg-cyber-emerald/15 border-cyber-emerald/40 text-cyber-emerald'
                        : 'bg-cyber-rose/15 border-cyber-rose/40 text-cyber-rose'
                    }`}>
                      {verificationFeedback}
                    </div>
                  )}
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
            <span className="text-slate-300 font-semibold">How it works:</span> Aegis utilizes <strong>Hybrid Post-Quantum Cryptography</strong> combining NIST FIPS 203 ML-KEM-768 (Kyber) and classical X25519 ECDH with HKDF-SHA256 session key ratcheting. Safety Numbers are derived from the unified hybrid shared secret. Even if a future quantum computer breaks elliptic curves or attempts "Harvest Now, Decrypt Later" (HNDL), the lattice-based ML-KEM-768 layer keeps your audio, video, and data channels completely indecipherable.
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
