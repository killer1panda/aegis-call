import { useState, useEffect, useRef, useCallback } from 'react';
import { whisperEngine, WhisperEngine } from '../services/whisperEngine.js';

export interface CaptionEntry {
  id: string;
  speaker: 'local' | 'peer';
  text: string;
  timestamp: number;
}

interface UseLiveCaptionsProps {
  onBroadcastCaption?: (text: string) => void;
  localStream: MediaStream | null;
}

export function useLiveCaptions({ onBroadcastCaption, localStream }: UseLiveCaptionsProps) {
  const [isCaptionsEnabled, setIsCaptionsEnabled] = useState(false);
  const [captions, setCaptions] = useState<CaptionEntry[]>([]);
  const recognitionRef = useRef<any>(null);
  const isEnabledRef = useRef(isCaptionsEnabled);
  isEnabledRef.current = isCaptionsEnabled;

  // Add remote caption received from peer over encrypted DataChannel
  const addIncomingCaption = useCallback((text: string, speaker: 'peer' | 'local' = 'peer') => {
    if (!text || !text.trim()) return;
    const entry: CaptionEntry = {
      id: Math.random().toString(36).substring(2, 9),
      speaker,
      text: text.trim(),
      timestamp: Date.now(),
    };
    setCaptions((prev) => [...prev.slice(-3), entry]);
  }, []);

  const toggleCaptions = useCallback(() => {
    setIsCaptionsEnabled((prev) => !prev);
  }, []);

  // Initialize browser speech recognition engine on-device with Whisper fallback
  useEffect(() => {
    if (!isCaptionsEnabled || !localStream) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      if (WhisperEngine.isSupported()) {
        const stopWhisper = whisperEngine.startContinuousTranscription(localStream, (result) => {
          if (result.text) {
            addIncomingCaption(result.text, 'local');
            if (result.isFinal && onBroadcastCaption) {
              onBroadcastCaption(result.text);
            }
          }
        });
        return stopWhisper;
      }
      console.warn('SpeechRecognition and WhisperEngine not available in this environment');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const activeText = (finalTranscript || interimTranscript).trim();
        if (activeText) {
          addIncomingCaption(activeText, 'local');
          if (finalTranscript && onBroadcastCaption) {
            onBroadcastCaption(finalTranscript.trim());
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn('SpeechRecognition error:', event.error);
        }
      };

      recognition.onend = () => {
        if (isEnabledRef.current) {
          try {
            recognition.start();
          } catch {}
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, [isCaptionsEnabled, localStream, addIncomingCaption, onBroadcastCaption]);

  // Automatically prune old captions after 6 seconds of silence
  useEffect(() => {
    if (captions.length === 0) return;
    const timer = setTimeout(() => {
      setCaptions((prev) => {
        const now = Date.now();
        return prev.filter((c) => now - c.timestamp < 6000);
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [captions]);

  return {
    isCaptionsEnabled,
    toggleCaptions,
    captions,
    addIncomingCaption,
  };
}
