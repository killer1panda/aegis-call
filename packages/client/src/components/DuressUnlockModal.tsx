import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  Clock,
  Settings,
  CheckCircle2,
  RotateCcw,
  Lock,
} from 'lucide-react';
import { PinSecurityService } from '../services/pinSecurityService.js';

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
  const [activeTab, setActiveTab] = useState<'unlock' | 'setup'>('unlock');

  // Unlock State
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Setup State
  const [currentMasterPin, setCurrentMasterPin] = useState('');
  const [newMasterPin, setNewMasterPin] = useState('');
  const [newDuressPin, setNewDuressPin] = useState('');
  const [setupSuccessMsg, setSetupSuccessMsg] = useState<string | null>(null);
  const [setupErrorMsg, setSetupErrorMsg] = useState<string | null>(null);
  const [isCustomized, setIsCustomized] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setErrorMsg(null);
      setCurrentMasterPin('');
      setNewMasterPin('');
      setNewDuressPin('');
      setSetupSuccessMsg(null);
      setSetupErrorMsg(null);
      setIsCustomized(PinSecurityService.getInstance().isCustomized());
      setActiveTab('unlock');
    }
  }, [isOpen]);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) {
      setErrorMsg('PIN must be at least 4 digits');
      return;
    }

    const pinService = PinSecurityService.getInstance();
    const result = pinService.verifyPin(pin);

    if (result.status === 'duress') {
      // DURESS TRIGGERED: Silent wipe of real keys in memory, enter Decoy Mode
      onUnlockSuccess(true);
      onClose();
    } else if (result.status === 'master') {
      // Normal authentic unlock
      onUnlockSuccess(false);
      onClose();
    } else {
      setErrorMsg('Invalid PIN. Please try again.');
    }
  };

  const handleSaveSetup = (e: React.FormEvent) => {
    e.preventDefault();
    setSetupErrorMsg(null);
    setSetupSuccessMsg(null);

    const pinService = PinSecurityService.getInstance();
    const result = pinService.updatePins(currentMasterPin, newMasterPin, newDuressPin);

    if (result.success) {
      setIsCustomized(true);
      setSetupSuccessMsg('Custom Master & Duress PINs saved successfully!');
      setCurrentMasterPin('');
      setNewMasterPin('');
      setNewDuressPin('');
      setTimeout(() => {
        setSetupSuccessMsg(null);
        setActiveTab('unlock');
      }, 1800);
    } else {
      setSetupErrorMsg(result.error || 'Failed to update PINs');
    }
  };

  const handleResetDefaults = () => {
    PinSecurityService.getInstance().resetToDefaults();
    setIsCustomized(false);
    setCurrentMasterPin('');
    setNewMasterPin('');
    setNewDuressPin('');
    setSetupSuccessMsg('PINs reset to default factory settings (Master: 1337, Duress: 9999)');
    setTimeout(() => setSetupSuccessMsg(null), 3000);
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyber-amber/10 border border-cyber-amber/30 text-cyber-amber">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                Plausible Deniability Security
                {isCustomized ? (
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-cyber-emerald/10 text-cyber-emerald border border-cyber-emerald/30 uppercase">
                    Custom PINs Active
                  </span>
                ) : (
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-cyber-amber/10 text-cyber-amber border border-cyber-amber/30 uppercase">
                    Default PINs Active
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">Master & Duress PIN Protection</p>
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

        {/* Tab Navigation: Unlock vs Setup */}
        <div className="flex bg-dark-950 p-1 rounded-xl border border-dark-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('unlock')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'unlock'
                ? 'bg-dark-800 text-slate-100 shadow-sm border border-dark-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Unlock Call</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('setup')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'setup'
                ? 'bg-dark-800 text-slate-100 shadow-sm border border-dark-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Configure PINs</span>
          </button>
        </div>

        {activeTab === 'unlock' ? (
          <>
            {/* Protocol Advisory */}
            <div className="p-3.5 rounded-2xl bg-dark-850 border border-dark-750 text-xs text-slate-300 space-y-2">
              <div className="flex items-center gap-2 text-cyber-amber font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Duress & Coercion Protocol</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Entering your <strong>Duress PIN</strong> immediately renders all true keys in RAM unrecoverable via cryptographic zeroization and opens a convincing, benign <strong>Decoy Mode</strong> interface.
              </p>
              {!isCustomized && (
                <p className="text-[10px] text-slate-500 font-mono">
                  Default: Master PIN (<span className="text-slate-400">1337</span>) / Duress PIN (<span className="text-cyber-amber">9999</span>). Switch to "Configure PINs" tab to customize.
                </p>
              )}
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
                  <span className="text-cyber-cyan font-semibold">
                    {currentDeadManTimeout === 0 ? 'Disabled' : `${currentDeadManTimeout} min`}
                  </span>
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
          </>
        ) : (
          /* Setup Mode: Configure Custom Master & Duress PINs */
          <form onSubmit={handleSaveSetup} className="space-y-4">
            <div className="p-3 rounded-2xl bg-dark-850 border border-dark-750 text-xs text-slate-300">
              <p className="font-semibold text-slate-200 mb-1">Personalize Security Credentials</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Set distinct PINs. Both PINs are hashed with a local cryptographic salt; plaintext is never stored or transmitted.
              </p>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">
                Current Master PIN {!isCustomized && <span className="text-slate-500">(Default: 1337)</span>}
              </label>
              <input
                type="password"
                maxLength={8}
                value={currentMasterPin}
                onChange={(e) => setCurrentMasterPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter current master PIN..."
                className="w-full px-3.5 py-2.5 bg-dark-950 border border-dark-750 rounded-xl text-sm font-mono text-slate-100 focus:outline-none focus:border-cyber-cyan transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">New Master PIN</label>
                <input
                  type="password"
                  maxLength={8}
                  value={newMasterPin}
                  onChange={(e) => setNewMasterPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4-8 digits"
                  className="w-full px-3.5 py-2.5 bg-dark-950 border border-dark-750 rounded-xl text-sm font-mono text-slate-100 focus:outline-none focus:border-cyber-emerald transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">New Duress PIN</label>
                <input
                  type="password"
                  maxLength={8}
                  value={newDuressPin}
                  onChange={(e) => setNewDuressPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4-8 digits"
                  className="w-full px-3.5 py-2.5 bg-dark-950 border border-dark-750 rounded-xl text-sm font-mono text-slate-100 focus:outline-none focus:border-cyber-amber transition-colors"
                />
              </div>
            </div>

            {setupErrorMsg && <p className="text-xs text-cyber-rose font-mono">{setupErrorMsg}</p>}
            {setupSuccessMsg && (
              <p className="text-xs text-cyber-emerald font-mono flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{setupSuccessMsg}</span>
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={!currentMasterPin || !newMasterPin || !newDuressPin}
                className="flex-1 py-3 rounded-xl bg-cyber-emerald hover:bg-emerald-600 disabled:opacity-50 text-dark-950 font-bold text-xs font-mono transition-all shadow-lg shadow-cyber-emerald/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>SAVE CUSTOM PINS</span>
              </button>

              <button
                type="button"
                onClick={handleResetDefaults}
                title="Reset to factory default PINs (1337 / 9999)"
                className="p-3 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-700 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
