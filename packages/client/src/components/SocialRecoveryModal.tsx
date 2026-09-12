import React, { useState } from 'react';
import {
  Users,
  KeyRound,
  Copy,
  Check,
  X,
  ShieldCheck,
  AlertCircle,
  Volume2,
  Sparkles,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  splitSecret,
  reconstructSecret,
  formatShareString,
  parseShareString,
  ShamirShare,
} from '@aegis/crypto';
import { AcousticModemBridge } from '../services/acousticModemBridge.js';

interface SocialRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterKeyHex?: string;
}

export const SocialRecoveryModal: React.FC<SocialRecoveryModalProps> = ({
  isOpen,
  onClose,
  masterKeyHex,
}) => {
  const [activeTab, setActiveTab] = useState<'split' | 'recover'>('split');
  const [secretInput, setSecretInput] = useState<string>(masterKeyHex || 'aegis-master-identity-seed-778899aabbcc');
  const [totalShares, setTotalShares] = useState(5);
  const [threshold, setThreshold] = useState(3);
  const [generatedShares, setGeneratedShares] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [acousticPlayingIndex, setAcousticPlayingIndex] = useState<number | null>(null);

  // Recovery State
  const [recoveryInputs, setRecoveryInputs] = useState<string[]>(['', '', '']);
  const [reconstructedKey, setReconstructedKey] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSplitSecret = () => {
    try {
      const secretBytes = new TextEncoder().encode(secretInput);
      const shares = splitSecret(secretBytes, totalShares, threshold);
      const formatted = shares.map((s) => formatShareString(s));
      setGeneratedShares(formatted);
    } catch (err: any) {
      console.error('Shamir split failed:', err);
    }
  };

  const copyShare = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const transmitShareAcoustic = async (shareStr: string, index: number) => {
    setAcousticPlayingIndex(index);
    try {
      const payload = new TextEncoder().encode(shareStr);
      await AcousticModemBridge.playAcousticPayload(payload);
    } catch (err) {
      console.warn('Acoustic transmission error:', err);
    } finally {
      setAcousticPlayingIndex(null);
    }
  };

  const handleReconstruct = () => {
    setRecoveryError(null);
    setReconstructedKey(null);

    try {
      const validShares: ShamirShare[] = [];
      for (const input of recoveryInputs) {
        if (input.trim()) {
          validShares.push(parseShareString(input.trim()));
        }
      }

      if (validShares.length < 2) {
        throw new Error('Please enter at least 2 valid guardian share strings');
      }

      const reconstructedBytes = reconstructSecret(validShares);
      const recoveredStr = new TextDecoder().decode(reconstructedBytes);
      setReconstructedKey(recoveredStr);
    } catch (err: any) {
      setRecoveryError(err.message || 'Recovery failed. Verify share checksums.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shamir Social Key Recovery & Guardian Splitter"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/85 backdrop-blur-md animate-fade-in"
    >
      <div className="relative w-full max-w-2xl bg-dark-900 border border-dark-700 rounded-3xl shadow-2xl p-6 flex flex-col space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dark-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyber-emerald/10 border border-cyber-emerald/30 text-cyber-emerald">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Shamir Social Key Recovery
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-cyber-emerald/10 border border-cyber-emerald/30 text-cyber-emerald">
                  GF(2⁸) Math
                </span>
              </h3>
              <p className="text-xs text-slate-400">Zero-Cloud Threshold Guardian Backup & Restoration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Social Recovery Modal"
            className="p-2 rounded-xl bg-dark-850 hover:bg-dark-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex rounded-xl bg-dark-950 p-1 border border-dark-800">
          <button
            onClick={() => setActiveTab('split')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'split'
                ? 'bg-dark-800 text-cyber-emerald shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Split Master Key (Guardian Setup)
          </button>
          <button
            onClick={() => setActiveTab('recover')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'recover'
                ? 'bg-dark-800 text-cyber-cyan shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Reconstruct Master Key
          </button>
        </div>

        {/* Tab 1: Split Master Key */}
        {activeTab === 'split' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Master Secret / Identity Seed:</label>
              <input
                type="text"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                className="w-full bg-dark-950 border border-dark-750 rounded-xl px-3 py-2 text-xs font-mono text-cyber-emerald focus:outline-none focus:border-cyber-emerald"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <span className="text-slate-400 font-mono">Total Guardians (N):</span>
                <select
                  value={totalShares}
                  onChange={(e) => setTotalShares(Number(e.target.value))}
                  className="w-full bg-dark-950 border border-dark-750 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
                >
                  <option value={3}>3 Guardians</option>
                  <option value={5}>5 Guardians (Recommended)</option>
                  <option value={7}>7 Guardians</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-mono">Quorum Threshold (K):</span>
                <select
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full bg-dark-950 border border-dark-750 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
                >
                  <option value={2}>2 of {totalShares} required</option>
                  <option value={3}>3 of {totalShares} required (Recommended)</option>
                  <option value={4}>4 of {totalShares} required</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleSplitSecret}
              className="w-full py-2.5 rounded-xl bg-cyber-emerald hover:bg-emerald-400 text-dark-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Compute Shamir Polynomial Shares
            </button>

            {generatedShares.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-dark-800">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>Guardian Shares ({generatedShares.length}):</span>
                  <span>Threshold: {threshold}-of-{totalShares}</span>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {generatedShares.map((shareStr, idx) => (
                    <div
                      key={idx}
                      className="bg-dark-950 border border-dark-800 rounded-xl p-3 flex items-center justify-between gap-2"
                    >
                      <div className="space-y-1 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-cyber-emerald bg-cyber-emerald/10 px-2 py-0.5 rounded">
                            Guardian #{idx + 1}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-300 truncate max-w-xs select-all">
                          {shareStr}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => copyShare(shareStr, idx)}
                          title="Copy Share String"
                          className="p-2 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-300 hover:text-white transition-colors"
                        >
                          {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-cyber-emerald" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={() => transmitShareAcoustic(shareStr, idx)}
                          title="Transmit via Bell 202 Acoustic Modem Tones"
                          className={`p-2 rounded-lg border transition-colors ${
                            acousticPlayingIndex === idx
                              ? 'bg-cyber-cyan/20 border-cyber-cyan text-cyber-cyan animate-pulse'
                              : 'bg-dark-850 hover:bg-dark-800 border-dark-750 text-slate-400 hover:text-cyber-cyan'
                          }`}
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Reconstruct Master Key */}
        {activeTab === 'recover' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Enter any <strong>{threshold} or more</strong> guardian share strings to re-assemble the original master identity key using Lagrange polynomial interpolation.
            </p>

            <div className="space-y-2">
              {recoveryInputs.map((val, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400 w-16">Share #{i + 1}:</span>
                  <input
                    type="text"
                    placeholder="aegis-share:1:hex:crc32..."
                    value={val}
                    onChange={(e) => {
                      const updated = [...recoveryInputs];
                      updated[i] = e.target.value;
                      setRecoveryInputs(updated);
                    }}
                    className="flex-1 bg-dark-950 border border-dark-750 rounded-xl px-3 py-2 text-xs font-mono text-cyber-cyan focus:outline-none focus:border-cyber-cyan"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setRecoveryInputs((prev) => [...prev, ''])}
                className="py-1.5 px-3 rounded-lg bg-dark-850 hover:bg-dark-800 border border-dark-750 text-[11px] font-mono text-slate-300"
              >
                + Add Another Guardian Share
              </button>
              <button
                onClick={handleReconstruct}
                className="flex-1 py-2 rounded-xl bg-cyber-cyan hover:bg-cyan-400 text-dark-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                Reconstruct Master Identity
              </button>
            </div>

            {reconstructedKey && (
              <div className="p-4 rounded-2xl bg-cyber-emerald/15 border border-cyber-emerald/40 space-y-2 animate-fade-in">
                <div className="flex items-center gap-2 text-xs font-bold text-cyber-emerald">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Master Identity Successfully Restored!</span>
                </div>
                <div className="bg-dark-950 p-2.5 rounded-xl border border-dark-800 text-xs font-mono text-slate-100 break-all select-all">
                  {reconstructedKey}
                </div>
              </div>
            )}

            {recoveryError && (
              <div className="p-3 rounded-xl bg-cyber-rose/15 border border-cyber-rose/40 text-cyber-rose text-xs font-mono flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{recoveryError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
