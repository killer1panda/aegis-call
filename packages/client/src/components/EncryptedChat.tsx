import React, { useState, useRef, useEffect } from 'react';
import { Send, Lock, X, MessageSquare } from 'lucide-react';
import { ChatMessage } from '../hooks/useWebRTC.js';

interface EncryptedChatProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
}

export const EncryptedChat: React.FC<EncryptedChatProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-80 sm:w-96 bg-dark-900 border-l border-dark-800 shadow-2xl flex flex-col animate-slide-left">
      {/* Header */}
      <div className="p-4 border-b border-dark-800 flex items-center justify-between bg-dark-850/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyber-emerald/10 border border-cyber-emerald/30 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-cyber-emerald" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-100 flex items-center gap-1.5">
              Encrypted P2P Chat
              <Lock className="w-3 h-3 text-cyber-emerald" />
            </h3>
            <p className="text-[10px] text-slate-400">Direct WebRTC DataChannel</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-dark-800 hover:bg-dark-750 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Message List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs">
            <Lock className="w-8 h-8 text-dark-700 mb-2" />
            <p>Messages in this room are end-to-end encrypted with AES-256-GCM.</p>
            <p className="mt-1 text-[11px] text-slate-400">Zero server storage or interception.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isSelf = msg.sender === 'self';
            return (
              <div key={msg.id} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow ${
                    isSelf
                      ? 'bg-cyber-emerald/20 text-slate-100 border border-cyber-emerald/40 rounded-br-none'
                      : 'bg-dark-850 text-slate-200 border border-dark-700/80 rounded-bl-none'
                  }`}
                >
                  <p className="leading-relaxed break-words">{msg.text}</p>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1 px-1">
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {msg.encrypted && <Lock className="w-2.5 h-2.5 text-cyber-emerald" />}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Field */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-dark-800 bg-dark-950/60 flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Send encrypted message..."
          className="flex-1 bg-dark-850 border border-dark-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyber-emerald/60 transition-colors"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2 rounded-xl bg-cyber-emerald hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-cyber-emerald text-dark-950 font-semibold transition-all shadow-lg shadow-cyber-emerald/10"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
