import React, { useState, useRef } from 'react';
import { UploadCloud, File, CheckCircle2, AlertTriangle, X, Download, Shield, Loader2 } from 'lucide-react';
import { FileMetadata } from '@aegis/crypto';

export interface ReceivedFile {
  metadata: FileMetadata;
  blobUrl: string;
  timestamp: number;
}

interface FileDropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendFile: (file: globalThis.File) => Promise<void>;
  transferProgress: { active: boolean; percent: number; fileName: string; mode: 'sending' | 'receiving' };
  receivedFiles: ReceivedFile[];
  isDataChannelOpen: boolean;
}

export const FileDropModal: React.FC<FileDropModalProps> = ({
  isOpen,
  onClose,
  onSendFile,
  transferProgress,
  receivedFiles,
  isDataChannelOpen,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!isDataChannelOpen) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onSendFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isDataChannelOpen) {
      onSendFile(file);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md animate-fade-in"
    >
      <div className="bg-dark-900 border border-dark-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="p-6 border-b border-dark-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyber-emerald/10 border border-cyber-emerald/30 flex items-center justify-center">
              <UploadCloud className="w-5 h-5 text-cyber-emerald" aria-hidden="true" />
            </div>
            <div>
              <h3 id="file-modal-title" className="font-semibold text-base text-slate-100">
                P2P Encrypted File Drop
              </h3>
              <p className="text-xs text-slate-400">Zero-Server AES-256-GCM Streaming</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg bg-dark-800 hover:bg-dark-750 text-slate-400 hover:text-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-cyber-emerald"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Active Transfer Progress Banner */}
          {transferProgress.active && (
            <div className="p-4 rounded-xl bg-dark-850 border border-cyber-emerald/40 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  <Loader2 className="w-3.5 h-3.5 text-cyber-emerald animate-spin" />
                  <span>
                    {transferProgress.mode === 'sending' ? 'Encrypting & Sending:' : 'Receiving & Decrypting:'}{' '}
                    {transferProgress.fileName}
                  </span>
                </div>
                <span className="font-mono text-cyber-emerald font-bold">{transferProgress.percent}%</span>
              </div>
              <div className="w-full bg-dark-950 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-cyber-emerald h-full transition-all duration-150 rounded-full"
                  style={{ width: `${transferProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              !isDataChannelOpen
                ? 'border-dark-750 bg-dark-950/40 opacity-50 cursor-not-allowed'
                : dragOver
                ? 'border-cyber-emerald bg-cyber-emerald/10'
                : 'border-dark-700 hover:border-cyber-emerald/60 bg-dark-950/40 hover:bg-dark-950/60'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              disabled={!isDataChannelOpen || transferProgress.active}
            />
            <div className="w-12 h-12 rounded-2xl bg-dark-800 flex items-center justify-center mx-auto mb-3 text-slate-400 group-hover:text-cyber-emerald">
              <File className="w-6 h-6" />
            </div>
            <div className="text-xs font-semibold text-slate-200">
              {isDataChannelOpen
                ? 'Drag & drop a file here, or click to browse'
                : 'Waiting for direct P2P connection to open...'}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Encrypted with AES-256-GCM in 64KB chunks directly to peer
            </p>
          </div>

          {/* Received Files Section */}
          {receivedFiles.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Decrypted Received Files ({receivedFiles.length})
              </h4>
              <div className="space-y-2">
                {receivedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-dark-850 border border-dark-700 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5 truncate mr-3">
                      <CheckCircle2 className="w-4 h-4 text-cyber-emerald shrink-0" />
                      <div className="truncate">
                        <div className="font-semibold text-slate-200 truncate">{file.metadata.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {(file.metadata.size / 1024).toFixed(1)} KB • Verified SHA-256
                        </div>
                      </div>
                    </div>
                    <a
                      href={file.blobUrl}
                      download={file.metadata.name}
                      className="px-3 py-1.5 rounded-lg bg-cyber-emerald hover:bg-emerald-400 text-dark-950 font-semibold text-xs flex items-center gap-1.5 transition-all shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security Notice */}
          <div className="p-3 rounded-xl bg-dark-950 border border-dark-800 text-[11px] text-slate-400 flex items-start gap-2">
            <Shield className="w-4 h-4 text-cyber-emerald shrink-0 mt-0.5" />
            <p leading-relaxed>
              <strong className="text-slate-300">End-to-End Encrypted File Transfer:</strong> Files are sliced into 64KB chunks, encrypted with AES-256-GCM, and streamed directly through the WebRTC DataChannel. The server never sees or stores any byte.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-dark-950 border-t border-dark-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 min-h-[40px] text-xs font-medium text-slate-400 hover:text-slate-200 rounded-lg hover:bg-dark-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
