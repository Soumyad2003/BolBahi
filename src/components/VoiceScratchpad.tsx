import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Cpu, Mic, MicOff, Send, Sparkles, Volume2 } from 'lucide-react';
import type { ParserMode } from '../../shared/types';
import { DEMO_QUICK_SPEAK_PILLS } from '../utils/voiceAndWhatsapp';

interface VoiceScratchpadProps {
  onProcessUtterance: (utterance: string) => Promise<void>;
  processing: boolean;
  warningBanner: string | null;
  lastSpokenReply: string | null;
  onReplaySpoken: () => void;
  parserMode: ParserMode;
  onParserModeChange: (mode: ParserMode) => void;
  hasActiveDraft: boolean;
  hasLowStockAlert?: boolean;
  hasActiveRestockDraft?: boolean;
}

interface SpeechRecognitionEventLike {
  results: {
    [index: number]: {
      isFinal: boolean;
      [alt: number]: { transcript: string };
    };
    length: number;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function VoiceScratchpad({
  onProcessUtterance,
  processing,
  warningBanner,
  lastSpokenReply,
  onReplaySpoken,
  parserMode,
  onParserModeChange,
  hasActiveDraft,
  hasLowStockAlert = false,
  hasActiveRestockDraft = false,
}: VoiceScratchpadProps) {
  const [text, setText] = useState('');
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [listening, setListening] = useState(false);
  const [micUnsupported, setMicUnsupported] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const latestTextRef = useRef('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    latestTextRef.current = text;
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (autoSubmit && text.trim().length >= 3 && !processing && !listening) {
      silenceTimerRef.current = window.setTimeout(() => {
        const toSend = latestTextRef.current.trim();
        if (toSend) {
          setText('');
          void onProcessUtterance(toSend);
        }
      }, 2500);
    }

    return () => {
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
      }
    };
  }, [text, autoSubmit, processing, listening, onProcessUtterance]);

  const handleSubmit = async (override?: string) => {
    const value = (override ?? text).trim();
    if (!value || processing) return;
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
    }
    setText('');
    await onProcessUtterance(value);
    inputRef.current?.focus();
  };

  const toggleMic = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      setMicUnsupported(true);
      inputRef.current?.focus();
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = true;

      let finalTranscript = '';

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = 0; i < event.results.length; i++) {
          const chunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += chunk;
          } else {
            interim += chunk;
          }
        }
        const combined = (finalTranscript || interim).trim();
        setText(combined);
        latestTextRef.current = combined;
      };

      recognition.onerror = () => {
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
        const spoken = latestTextRef.current.trim();
        if (spoken) {
          void handleSubmit(spoken);
        }
      };

      recognitionRef.current = recognition;
      setMicUnsupported(false);
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
      setMicUnsupported(true);
    }
  };

  return (
    <section
      aria-label="Voice Scratchpad"
      className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Voice Scratchpad</h1>
          <p className="text-sm text-stone-600">
            Dictate via Wispr Flow or tap mic in Hinglish · Press Enter to bill
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Parser Engine Selector: Gemini LLM vs Offline Local */}
          <div
            role="group"
            aria-label="Voice parser engine"
            data-testid="parser-mode-toggle"
            className="flex items-center p-1 bg-stone-100 rounded-xl"
          >
            <button
              type="button"
              onClick={() => onParserModeChange('gemini')}
              aria-pressed={parserMode === 'gemini'}
              data-testid="parser-mode-gemini"
              className={`min-h-[36px] px-2.5 sm:px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                parserMode === 'gemini'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Gemini LLM</span>
            </button>
            <button
              type="button"
              onClick={() => onParserModeChange('offline')}
              aria-pressed={parserMode === 'offline'}
              data-testid="parser-mode-offline"
              className={`min-h-[36px] px-2.5 sm:px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                parserMode === 'offline'
                  ? 'bg-white text-blue-800 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 shrink-0" />
              <span>Offline</span>
            </button>
          </div>

          {/* 2.5s Silence Auto-Submit Toggle */}
          <label className="inline-flex items-center gap-2 min-h-[40px] text-sm font-medium text-stone-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoSubmit}
              onChange={(e) => setAutoSubmit(e.target.checked)}
              className="w-5 h-5 rounded accent-emerald-600 cursor-pointer"
            />
            <span className="whitespace-nowrap">2.5s Auto-Submit</span>
          </label>
        </div>
      </div>

      {/* Primary Input + 64x64 Tap-to-Speak Mic */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        <div className="flex-1 flex flex-col gap-2">
          <label htmlFor="voice-scratchpad-input" className="sr-only">
            Dictate or type Hinglish voice command
          </label>
          <textarea
            id="voice-scratchpad-input"
            ref={inputRef}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={
              hasActiveDraft
                ? 'Edit ("Tel 155 rupaye kar do"), confirm ("Haan, bhej do"), or "Cancel kar do"...'
                : hasActiveRestockDraft
                  ? 'Edit restock ("Atta 25 kilo kar do", "Tel hata do") or "Cancel kar do"...'
                  : hasLowStockAlert
                    ? 'Say "Haan mangwa lo" or "20 kilo atta aur 10 litre tel mangwa lo"...'
                    : 'Dictate in Hinglish: "Rajesh Sharma ko 5 kilo atta, 300 cash..."'
            }
            className="w-full min-h-[92px] rounded-xl border-2 border-stone-300 focus:border-emerald-600 focus:outline-none bg-stone-50 focus:bg-white px-3.5 py-3 text-base leading-snug text-stone-900 placeholder:text-stone-500 resize-none transition-colors"
          />
        </div>

        <div className="flex sm:flex-col items-center gap-3 shrink-0">
          {/* 64px x 64px Tap-to-Speak Mic Button */}
          <button
            type="button"
            onClick={toggleMic}
            aria-label={listening ? 'Stop microphone listening' : 'Tap to speak with microphone'}
            aria-pressed={listening}
            className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 transition-all cursor-pointer ${
              listening
                ? 'bg-red-600 text-white ring-4 ring-red-200'
                : 'bg-stone-900 hover:bg-stone-800 text-white'
            }`}
          >
            {listening ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
          </button>

          {/* Large Process Voice Button */}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={processing || !text.trim()}
            className="flex-1 sm:flex-none w-full sm:w-auto min-h-[52px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:text-stone-500 text-white font-semibold text-base inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Send className="w-5 h-5" />
            <span>{processing ? 'Processing...' : 'Process Voice'}</span>
          </button>
        </div>
      </div>

      {listening && (
        <p className="text-sm font-semibold text-red-700">
          Listening (Hinglish)... speak now and pause to submit.
        </p>
      )}

      {micUnsupported && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          Browser Web Speech API is unavailable here — dictate directly into the text box with Wispr
          Flow or tap any Quick-Speak test button below.
        </p>
      )}

      {/* Noise / Warning Banner */}
      {warningBanner && (
        <div
          role="alert"
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-base font-medium"
        >
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>{warningBanner}</span>
        </div>
      )}

      {/* Last Spoken Read-Back */}
      {lastSpokenReply && !warningBanner && (
        <div className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl bg-stone-50 border border-stone-200 text-stone-800 text-sm">
          <div className="flex items-start gap-2.5 min-w-0">
            <Volume2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-stone-900">BolBahi said: </span>
              <span>{lastSpokenReply}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onReplaySpoken}
            aria-label="Replay spoken reply"
            className="min-h-[34px] px-2.5 rounded-lg border border-stone-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-xs font-semibold text-emerald-700 inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Replay</span>
          </button>
        </div>
      )}

      {/* 5 Demo Quick-Speak Utterance Buttons */}
      <div className="space-y-2 pt-1">
        <p className="text-xs font-semibold text-stone-500">Quick-Speak Demo Utterances</p>
        <div className="flex flex-wrap gap-2">
          {DEMO_QUICK_SPEAK_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              disabled={processing}
              onClick={() => void handleSubmit(pill.utterance)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 hover:bg-emerald-50 hover:border-emerald-300 text-left text-sm font-medium text-stone-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
