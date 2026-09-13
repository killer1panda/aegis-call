import React, { useState } from 'react';
import { ShieldCheck, KeyRound, Fingerprint, AlertCircle, X, CheckCircle2 } from 'lucide-react';
import { generateAuthChallenge } from '@aegis/crypto';

interface HardwareGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGatePassed: () => void;
  roomId: string;
}

export const HardwareGateModal: React.FC<HardwareGateModalProps> = ({
  isOpen,
  onClose,
  onGatePassed,
  roomId,
}) => {
  const [isChallenging, setIsChallenging] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [passed, setPassed] = useState(false);

  const handleChallenge = async () => {
    setIsChallenging(true);
    setErrorMsg(null);
    setStatusMsg('Touch your physical YubiKey or authenticate with biometric sensor...');

    try {
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn / FIDO2 hardware tokens are not supported on this browser');
      }

      const challenge = generateAuthChallenge(roomId);

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: challenge as BufferSource,
          timeout: 60000,
          userVerification: 'required',
          rpId: window.location.hostname || 'localhost',
        },
      });

      if (credential) {
        setPassed(true);
        setStatusMsg('Hardware physical presence confirmed. Access granted.');
        setTimeout(() => {
          onGatePassed();
          onClose();
        }, 800);
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setErrorMsg('Hardware touch prompt was cancelled or timed out.');
      } else {
        console.error('WebAuthn challenge error:', err);
        setErrorMsg(err?.message || 'Authentication Failed: Physical Hardware Token Not Detected or Verified.');
      }
    } finally {
      setIsChallenging(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="High-Assurance Hardware Token Gate"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/85 backdrop-blur-md animate-fade-in"
    >
      <div className="relative w-full max-w-md bg-dark-900 border border-dark-700 rounded-3xl shadow-2xl p-6 flex flex-col space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Hardware Security Gate</h3>
              <p className="text-[11px] text-slate-400">FIDO2 / YubiKey User Presence</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Hardware Gate"
            className="p-2 rounded-xl bg-dark-850 hover:bg-dark-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-dark-850 border border-dark-750 text-xs text-slate-300 space-y-2 leading-relaxed">
          <p>
            This room is configured with <strong className="text-cyber-cyan">FIDO2 Level 3 Physical Proof of Presence</strong>.
            Remote malware or compromised session tokens cannot enter without physical contact on a hardware key.
          </p>
        </div>

        {statusMsg && (
          <div className="p-3 rounded-xl bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan text-xs font-mono flex items-center gap-2">
            {passed ? <CheckCircle2 className="w-4 h-4 shrink-0 text-cyber-emerald" /> : <Fingerprint className="w-4 h-4 shrink-0 animate-pulse" />}
            <span>{statusMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-cyber-rose/10 border border-cyber-rose/30 text-cyber-rose text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleChallenge}
          disabled={isChallenging || passed}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyber-cyan to-blue-500 hover:opacity-90 disabled:opacity-50 text-dark-950 font-bold text-xs font-mono transition-all shadow-lg shadow-cyber-cyan/20 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Fingerprint className="w-4 h-4" />
          <span>{isChallenging ? 'WAITING FOR HARDWARE TOUCH...' : passed ? 'VERIFIED' : 'AUTHENTICATE HARDWARE TOKEN'}</span>
        </button>
      </div>
    </div>
  );
};
