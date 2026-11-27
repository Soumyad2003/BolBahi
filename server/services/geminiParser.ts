import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  CustomerDoc,
  DraftBill,
  ExtractedPayload,
  ItemDoc,
  ParserMode,
  ParserSource,
} from '../../shared/types.ts';
import { parseWithLocalFallback } from '../utils/localFallbackParser.ts';

const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const TIMEOUT_MS = 4000;

const COMPRESSED_SKUS =
  'atta,tel,namak,chawal,dal,doodh,cheeni,chai,maggi,parle,surf,colgate,pyaaz,aloo,anda';

const SYSTEM_INSTRUCTION = [
  'Extract Indian kirana Hinglish/Hindi voice billing entities to strict JSON. Always transliterate customerQuery and rawName into Roman/English letters (e.g. "राजेश शर्मा"->"Rajesh Sharma"). Never compute totals.',
  `Match known item slugs from [${COMPRESSED_SKUS}]; if item is not in list set matchedSlug="" and keep rawName. Keep last value on self-corrections ("nahi"/"sorry").`,
  'Split cashPaid (cash/nakad/diye) vs upiPaid (UPI/GPay/PhonePe/Paytm). Set intent="EDIT_BILL" only if modifying activeDraft, else "LOG_SALE" or "NOISE".',
].join('\n');

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      description: 'LOG_SALE, EDIT_BILL, or NOISE',
    },
    customerQuery: {
      type: Type.STRING,
      description: 'Customer name or alias spoken, or empty string if walk-in/unspecified',
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rawName: { type: Type.STRING },
          matchedSlug: { type: Type.STRING },
          qty: { type: Type.NUMBER },
          unit: { type: Type.STRING },
          overridePrice: { type: Type.NUMBER },
        },
        required: ['rawName', 'matchedSlug', 'qty', 'unit', 'overridePrice'],
      },
    },
    cashPaid: { type: Type.NUMBER, description: 'Cash paid in INR, or -1 if not mentioned' },
    upiPaid: { type: Type.NUMBER, description: 'UPI/GPay/PhonePe paid in INR, or -1 if not mentioned' },
    isUdhaar: { type: Type.BOOLEAN },
    confidence: { type: Type.NUMBER },
    ambiguityNote: { type: Type.STRING },
  },
  required: [
    'intent',
    'customerQuery',
    'items',
    'cashPaid',
    'upiPaid',
    'isUdhaar',
    'confidence',
    'ambiguityNote',
  ],
};

let cachedClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function callGeminiModel(
  ai: GoogleGenAI,
  model: string,
  userPrompt: string
): Promise<string> {
  const thinkingLevel = model.includes('hydrogen') ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL;
  const response = await withTimeout(
    ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 250,
        thinkingConfig: {
          thinkingLevel,
        },
      },
    }),
    TIMEOUT_MS
  );
  return (response.text ?? '').trim();
}

function sanitizeGeminiJson(rawText: string): ExtractedPayload {
  const parsed = JSON.parse(rawText) as {
    intent?: string;
    customerQuery?: string;
    items?: Array<{
      rawName?: string;
      matchedSlug?: string;
      qty?: number;
      unit?: string;
      overridePrice?: number;
    }>;
    cashPaid?: number;
    upiPaid?: number;
    isUdhaar?: boolean;
    confidence?: number;
    ambiguityNote?: string;
  };

  const validIntent =
    parsed.intent === 'EDIT_BILL' || parsed.intent === 'NOISE' ? parsed.intent : 'LOG_SALE';

  return {
    intent: validIntent,
    customerQuery: parsed.customerQuery?.trim() ? parsed.customerQuery.trim() : null,
    items: Array.isArray(parsed.items)
      ? parsed.items
          .filter((it) => it && typeof it.rawName === 'string' && it.rawName.trim().length > 0)
          .slice(0, 20)
          .map((it) => ({
            rawName: String(it.rawName ?? '').trim(),
            matchedSlug: it.matchedSlug?.trim() ? it.matchedSlug.trim().toLowerCase() : null,
            qty: typeof it.qty === 'number' && Number.isFinite(it.qty) && it.qty > 0 ? it.qty : 1,
            unit: it.unit?.trim() ? it.unit.trim() : null,
            overridePrice:
              typeof it.overridePrice === 'number' &&
              Number.isFinite(it.overridePrice) &&
              it.overridePrice > 0
                ? it.overridePrice
                : null,
          }))
      : [],
    cashPaid:
      typeof parsed.cashPaid === 'number' && Number.isFinite(parsed.cashPaid) && parsed.cashPaid >= 0
        ? parsed.cashPaid
        : null,
    upiPaid:
      typeof parsed.upiPaid === 'number' && Number.isFinite(parsed.upiPaid) && parsed.upiPaid >= 0
        ? parsed.upiPaid
        : null,
    isUdhaar: Boolean(parsed.isUdhaar),
    confidence:
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? parsed.confidence
        : 0.9,
    ambiguityNote: parsed.ambiguityNote?.trim() ? parsed.ambiguityNote.trim() : null,
  };
}

export async function parseVoiceWithGeminiOrFallback(params: {
  utterance: string;
  activeDraft: DraftBill | null;
  items: ItemDoc[];
  customers: CustomerDoc[];
  parserMode?: ParserMode;
}): Promise<{ payload: ExtractedPayload; source: ParserSource; modelUsed?: string }> {
  if (params.parserMode === 'offline') {
    return {
      payload: parseWithLocalFallback(params),
      source: 'fallback',
    };
  }

  const ai = getAiClient();
  if (!ai) {
    return {
      payload: parseWithLocalFallback(params),
      source: 'fallback',
    };
  }

  // Build ultra-compact prompt (~120–180 input tokens max, zero chat history)
  const minimalDraft = params.activeDraft
    ? JSON.stringify({
        c: params.activeDraft.customerName,
        items: params.activeDraft.items.map((i) => ({ s: i.slug, q: i.qty, p: i.unitPrice })),
        cash: params.activeDraft.cashPaid,
        upi: params.activeDraft.upiPaid,
      })
    : null;

  const userPrompt = minimalDraft
    ? `ActiveDraft:${minimalDraft}\nUtterance:${params.utterance}`
    : `Utterance:${params.utterance}`;

  const modelsToTry = [PRIMARY_MODEL, FALLBACK_MODEL, 'gemini-4-hydrogen'];

  try {
    let rawText = '';
    let modelUsed = PRIMARY_MODEL;
    let lastErr: unknown = null;

    for (const model of modelsToTry) {
      try {
        modelUsed = model;
        rawText = await callGeminiModel(ai, model, userPrompt);
        if (rawText) break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('not found')) {
          continue;
        }
        throw err;
      }
    }

    if (!rawText) {
      throw lastErr ?? new Error('EMPTY_GEMINI_RESPONSE');
    }

    const payload = sanitizeGeminiJson(rawText);
    return { payload, source: 'gemini', modelUsed };
  } catch (err) {
    console.warn('[BolBahi] Gemini call failed/timed out, using Offline Fallback:', err instanceof Error ? err.message : err);
    return {
      payload: parseWithLocalFallback(params),
      source: 'fallback',
    };
  }
}
