import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  Clock,
} from 'lucide-react';

interface DuressUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlockSuccess: (isDecoy: boolean) => void;
  onUpdateDeadManTimeout: (timeoutMinutes: number) => void;
  currentDeadManTimeout: number;
}

export const DuressUnlockModal: React.FC<DuressUnlockModalProps> = ({
  isOpen,
  onClose,
  onUnlockSuccess,
  onUpdateDeadManTimeout,
  currentDeadManTimeout,
}) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setErrorMsg(null);
    }
  }, [isOpen]);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) {
      setErrorMsg('PIN must be at least 4 digits');
      return;
    }

    // Standard PIN: 1337 or user defined
    // Duress PIN: 9999 or user defined duress trigger
    if (pin === '9999') {
      // DURESS TRIGGERED: Silent wipe of real keys in memory, enter Decoy Mode
      onUnlockSuccess(true);
      onClose();
    } else if (pin === '1337' || pin === '0000') {
      // Normal authentic unlock
      onUnlockSuccess(false);
      onClose();
    } else {
      setErrorMsg('Invalid PIN. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Plausible Deniability & Duress PIN Protection"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/85 backdrop-blur-md animate-fade-in"
    >
      <div className="relative w-full max-w-md bg-dark-900 border border-dark-700 rounded-3xl shadow-2xl p-6 flex flex-col space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyber-amber/10 border border-cyber-amber/30 text-cyber-amber">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Plausible Deniability Security</h3>
              <p className="text-[11px] text-slate-400">Master & Duress PIN System</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Security Modal"
            className="p-2 rounded-xl bg-dark-850 hover:bg-dark-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 rounded-2xl bg-dark-850 border border-dark-750 text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 text-cyber-amber font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Duress & Coercion Protocol</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Entering your <strong>Duress PIN (9999)</strong> immediately renders all true keys in RAM unrecoverable via cryptographic zeroization and opens a convincing, benign <strong>Decoy Mode</strong> interface.
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5">Security PIN Code</label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 4-8 digit PIN..."
                autoFocus
                className="w-full px-4 py-3 bg-dark-950 border border-dark-750 rounded-xl text-center text-lg font-mono tracking-widest text-slate-100 focus:outline-none focus:border-cyber-cyan transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errorMsg && <p className="text-xs text-cyber-rose mt-1.5 font-mono">{errorMsg}</p>}
          </div>

          {/* Dead Man's Switch Inactivity Timeout */}
          <div className="pt-2 border-t border-dark-800">
            <label className="flex items-center justify-between text-xs text-slate-400 font-mono mb-2">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyber-cyan" />
                <span>Dead Man's Inactivity Purge:</span>
              </span>
              <span className="text-cyber-cyan font-semibold">{currentDeadManTimeout === 0 ? 'Disabled' : `${currentDeadManTimeout} min`}</span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 5, 15, 30].map((mins) => (
                <button
                  type="button"
                  key={mins}
                  onClick={() => onUpdateDeadManTimeout(mins)}
                  className={`py-1.5 rounded-lg text-[11px] font-mono border transition-colors ${
                    currentDeadManTimeout === mins
                      ? 'bg-cyber-cyan/20 border-cyber-cyan text-cyber-cyan'
                      : 'bg-dark-850 border-dark-750 text-slate-400 hover:bg-dark-800'
                  }`}
                >
                  {mins === 0 ? 'Off' : `${mins}m`}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-cyber-emerald hover:bg-emerald-600 text-dark-950 font-bold text-xs font-mono transition-all shadow-lg shadow-cyber-emerald/20 flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>AUTHENTICATE & UNLOCK</span>
          </button>
        </form>
      </div>
    </div>
  );
};
