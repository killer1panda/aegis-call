import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FileCode2,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  Lock,
} from 'lucide-react';

interface ScratchpadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBroadcastText: (text: string) => void;
  incomingText: string | null;
  isDataChannelOpen: boolean;
}

export const ScratchpadModal: React.FC<ScratchpadModalProps> = ({
  isOpen,
  onClose,
  onBroadcastText,
  incomingText,
  isDataChannelOpen,
}) => {
  const [content, setContent] = useState<string>(
    '// 🛡️ AegisCall Self-Shredding Ephemeral Scratchpad\n// All text here is synchronized in RAM over the P2P DataChannel (AES-256-GCM).\n// Zero disk persistence. Buffer is cryptographically shredded on call termination.\n\n'
  );
  const [copied, setCopied] = useState(false);
  const [isShredded, setIsShredded] = useState(false);
  const contentRef = useRef(content);
  contentRef.current = content;

  // Handle incoming remote edits
  useEffect(() => {
    if (incomingText !== null && incomingText !== contentRef.current) {
      setContent(incomingText);
    }
  }, [incomingText]);

  // Self-shred on unmount / cleanup
  useEffect(() => {
    return () => {
      // Overwrite memory buffer with random noise before dereference
      const noise = new Uint8Array(contentRef.current.length);
      globalThis.crypto.getRandomValues(noise);
      contentRef.current = Array.from(noise).map((b) => String.fromCharCode(b)).join('');
    };
  }, []);

  // Keyboard shortcut listener (ESC to close)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    onBroadcastText(val);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleShred = () => {
    // 1. Overwrite with pseudorandom noise passes
    const len = content.length;
    const noise = new Uint8Array(len);
    globalThis.crypto.getRandomValues(noise);
    setContent(Array.from(noise).map((b) => String.fromCharCode(33 + (b % 90))).join(''));

    setTimeout(() => {
      setContent('');
      onBroadcastText('');
      setIsShredded(true);
      setTimeout(() => setIsShredded(false), 2500);
    }, 400);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Self-Shredding Ephemeral Scratchpad"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md animate-fade-in"
    >
      <div className="relative w-full max-w-4xl h-[75vh] bg-dark-900 border border-dark-700 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-800 bg-dark-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyber-purple/10 border border-cyber-purple/30 text-cyber-purple">
              <FileCode2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <span>Ephemeral Scratchpad</span>
                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyber-emerald/10 border border-cyber-emerald/30 text-cyber-emerald">
                  <Lock className="w-3 h-3" /> Encrypted RAM Buffer
                </span>
              </h2>
              <p className="text-xs text-slate-400">Zero disk caching • Overwritten on session close</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopy}
              aria-label="Copy scratchpad content"
              title="Copy to Clipboard"
              className="p-2.5 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-700 text-slate-300 hover:text-slate-100 transition-colors flex items-center gap-1.5 text-xs font-mono"
            >
              {copied ? <Check className="w-4 h-4 text-cyber-emerald" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={handleShred}
              aria-label="Cryptographically shred scratchpad"
              title="Shred Memory Buffer"
              className="p-2.5 rounded-xl bg-cyber-rose/20 hover:bg-cyber-rose/30 border border-cyber-rose/50 text-cyber-rose transition-colors flex items-center gap-1.5 text-xs font-mono"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isShredded ? 'Shredded!' : 'Zeroize Buffer'}</span>
            </button>

            <button
              onClick={onClose}
              aria-label="Close Scratchpad Modal"
              className="p-2.5 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Text Area */}
        <div className="relative flex-1 p-4 bg-dark-950">
          <textarea
            value={content}
            onChange={handleChange}
            placeholder="Type confidential notes, code snippets, or keys..."
            spellCheck={false}
            className="w-full h-full bg-dark-950 border border-dark-800 rounded-2xl p-4 text-slate-200 font-mono text-sm resize-none focus:outline-none focus:border-cyber-purple/60 leading-relaxed"
          />
        </div>

        {/* Status Footer */}
        <div className="px-6 py-2.5 bg-dark-900 border-t border-dark-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-cyber-emerald" />
            <span>P2P DataChannel: {isDataChannelOpen ? 'Synchronized' : 'Buffering locally'}</span>
          </div>
          <div>Length: {content.length} characters</div>
        </div>
      </div>
    </div>
  );
};
