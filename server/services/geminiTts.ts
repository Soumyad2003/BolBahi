import { GoogleGenAI } from '@google/genai';
import { toDevanagariHindiSpeech, toHinglishSpeech } from '../../shared/hindiSpeech.ts';

const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts'];
const TTS_TIMEOUT_MS = 6500;
const MAX_CACHE_ENTRIES = 40;

let cachedAi: GoogleGenAI | null = null;
const audioCache = new Map<string, { audioBase64: string; mimeType: string }>();

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAi;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GEMINI_TTS_TIMEOUT')), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function wrapPcm16AsWav(pcm: Buffer, sampleRate = 24000, numChannels = 1): Buffer {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function ensurePlayableWav(base64Data: string, rawMimeType?: string): { audioBase64: string; mimeType: string } {
  const buf = Buffer.from(base64Data, 'base64');
  // Already a RIFF/WAV file (Gemini 3.8 unary default)
  if (buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'RIFF') {
    return { audioBase64: base64Data, mimeType: 'audio/wav' };
  }
  // Raw L16 PCM (e.g., audio/L16;codec=pcm;rate=24000) -> wrap in standard WAV header for browser <audio>
  const rateMatch = rawMimeType?.match(/rate=(\d+)/i);
  const sampleRate = rateMatch ? Number(rateMatch[1]) || 24000 : 24000;
  const wav = wrapPcm16AsWav(buf, sampleRate, 1);
  return { audioBase64: wav.toString('base64'), mimeType: 'audio/wav' };
}

export async function synthesizeKiranaSpeech(params: {
  text: string;
  lang: 'en-IN' | 'hi-IN';
}): Promise<{ audioBase64: string; mimeType: string; spokenText: string; modelUsed?: string } | null> {
  const ai = getAiClient();
  if (!ai) {
    return null;
  }

  const spokenText =
    params.lang === 'hi-IN'
      ? toDevanagariHindiSpeech(params.text)
      : toHinglishSpeech(params.text);

  if (!spokenText) {
    return null;
  }

  const cacheKey = `${params.lang}::${spokenText}`;
  const cached = audioCache.get(cacheKey);
  if (cached) {
    return { ...cached, spokenText };
  }

  let lastErr: unknown = null;

  for (const model of TTS_MODELS) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [{ text: spokenText }],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        }),
        TTS_TIMEOUT_MS
      );

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const base64Audio = part?.inlineData?.data;
      if (!base64Audio) {
        continue;
      }

      const playable = ensurePlayableWav(base64Audio, part?.inlineData?.mimeType);

      if (audioCache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = audioCache.keys().next().value;
        if (firstKey) audioCache.delete(firstKey);
      }
      audioCache.set(cacheKey, playable);

      return { ...playable, spokenText, modelUsed: model };
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr ?? new Error('No TTS model returned audio');
}
