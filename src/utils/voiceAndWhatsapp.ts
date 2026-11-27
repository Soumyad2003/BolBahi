import type { CustomerDoc, ItemDoc, SupplierDoc, TransactionDoc } from '../../shared/types';
import { toDevanagariHindiSpeech, toHinglishSpeech } from '../../shared/hindiSpeech';

export const DEMO_QUICK_SPEAK_PILLS = [
  {
    id: 'sale-split',
    label: 'Rajesh Sharma: Atta, Oil, Salt + Cash/Udhaar',
    utterance:
      'Rajesh Sharma ke khate mein 5 kilo Aashirvaad atta, 2 litre Fortune tel, aur 1 Tata namak likho, 300 cash diye baaki udhaar',
  },
  {
    id: 'ambiguous-upi',
    label: 'Sharma ji (Ambiguous) + UPI Split',
    utterance: 'Sharma ji ko 2 kilo chawal aur 1 Tata namak, 100 UPI kiya',
  },
  {
    id: 'edit-price',
    label: 'Voice Edit: Tel ₹155 kar do',
    utterance: 'Tel 155 rupaye kar do',
  },
  {
    id: 'query-galla',
    label: 'Aaj ka galla batao',
    utterance: 'Aaj ka galla batao',
  },
  {
    id: 'query-restock',
    label: 'Aaj kya mangwana hai?',
    utterance: 'Aaj kya mangwana hai?',
  },
] as const;

export function formatINR(amount: number): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? `₹${rounded.toLocaleString('en-IN')}` : `₹${rounded.toFixed(2)}`;
}

let cachedVoices: SpeechSynthesisVoice[] = [];
let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeAbortController: AbortController | null = null;
let speakTimer: number | null = null;
let speakRequestId = 0;

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const loadVoices = () => {
    try {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) cachedVoices = list;
    } catch {
      // Ignore restricted environments
    }
  };
  loadVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

export function stopSpeaking(): void {
  speakRequestId += 1;
  if (speakTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(speakTimer);
    speakTimer = null;
  }
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      // Ignore audio cleanup errors
    }
    activeAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore synthesis cancel errors
    }
  }
  activeUtterance = null;
}

function pickIndianVoice(
  voices: SpeechSynthesisVoice[],
  targetPrefix: 'hi' | 'en-in'
): SpeechSynthesisVoice | undefined {
  const matches = voices.filter((v) => {
    const l = v.lang.toLowerCase().replace('_', '-');
    return targetPrefix === 'hi' ? l === 'hi-in' || l.startsWith('hi-') || l === 'hi' : l === 'en-in';
  });
  if (matches.length === 0) return undefined;

  // Prefer natural Google / Microsoft / Apple Indian voices over generic fallbacks
  return (
    matches.find((v) => /google|swara|madhur|neerja|prabhat|lekha|rishi|veena|heera/i.test(v.name)) ||
    matches[0]
  );
}

function speakWithBrowserSynthesis(text: string, lang: 'en-IN' | 'hi-IN'): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) {
    return;
  }
  try {
    const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
    const hiVoice = pickIndianVoice(voices, 'hi');
    const enInVoice = pickIndianVoice(voices, 'en-in');

    let spokenText: string;
    let resolvedLang: string;
    let selectedVoice: SpeechSynthesisVoice | undefined;

    if (lang === 'hi-IN') {
      if (hiVoice) {
        // Devanagari text + verified hi-IN voice -> natural Hindi pronunciation
        spokenText = toDevanagariHindiSpeech(text);
        resolvedLang = hiVoice.lang || 'hi-IN';
        selectedVoice = hiVoice;
      } else if (enInVoice) {
        // Device has no Hindi voice pack -> fall back cleanly to Indian English Hinglish
        spokenText = toHinglishSpeech(text);
        resolvedLang = enInVoice.lang || 'en-IN';
        selectedVoice = enInVoice;
      } else {
        spokenText = toHinglishSpeech(text);
        resolvedLang = 'hi-IN';
      }
    } else {
      // Hinglish (en-IN) mode:
      // Prefer an en-IN voice with Roman Hinglish; if unavailable, use hi-IN voice with Devanagari
      // (never feed Roman text to a hi-IN voice or fall back to en-US when a Hindi voice exists).
      if (enInVoice) {
        spokenText = toHinglishSpeech(text);
        resolvedLang = enInVoice.lang || 'en-IN';
        selectedVoice = enInVoice;
      } else if (hiVoice) {
        spokenText = toDevanagariHindiSpeech(text);
        resolvedLang = hiVoice.lang || 'hi-IN';
        selectedVoice = hiVoice;
      } else {
        spokenText = toHinglishSpeech(text);
        resolvedLang = 'en-IN';
      }
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = resolvedLang;
    utterance.rate = 1.02;
    utterance.pitch = 1.0;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    activeUtterance = utterance;
    utterance.onend = () => {
      if (activeUtterance === utterance) activeUtterance = null;
    };
    utterance.onerror = () => {
      if (activeUtterance === utterance) activeUtterance = null;
    };

    // Short tick avoids Chrome's silent-drop bug when speak() runs synchronously after cancel()
    speakTimer = window.setTimeout(() => {
      speakTimer = null;
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        activeUtterance = null;
      }
    }, 40);
  } catch {
    // Gracefully ignore speech synthesis errors in restricted environments
  }
}

export function speakHinglish(
  text: string,
  muted: boolean,
  lang: 'en-IN' | 'hi-IN' = 'hi-IN',
  preferGeminiTts = true
): void {
  stopSpeaking();
  if (muted || typeof window === 'undefined' || !text.trim()) {
    return;
  }

  const requestId = speakRequestId;

  if (!preferGeminiTts) {
    speakWithBrowserSynthesis(text, lang);
    return;
  }

  const controller = new AbortController();
  activeAbortController = controller;

  void (async () => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
        signal: controller.signal,
      });

      if (requestId !== speakRequestId) return;
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);

      const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
      if (requestId !== speakRequestId || !data.audioBase64) return;

      const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
      activeAudio = audio;
      audio.onended = () => {
        if (activeAudio === audio) activeAudio = null;
      };
      audio.onerror = () => {
        if (activeAudio === audio) {
          activeAudio = null;
          if (requestId === speakRequestId) {
            speakWithBrowserSynthesis(text, lang);
          }
        }
      };

      await audio.play();
    } catch (err) {
      if (controller.signal.aborted || requestId !== speakRequestId) return;
      // Seamless fallback to local browser Hindi/Hinglish speech synthesis
      console.warn('[BolBahi] Falling back to browser TTS:', err instanceof Error ? err.message : err);
      speakWithBrowserSynthesis(text, lang);
    } finally {
      if (activeAbortController === controller) {
        activeAbortController = null;
      }
    }
  })();
}

function sanitizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '').slice(-10);
}

export function buildWhatsappReceiptUrl(tx: TransactionDoc): string {
  const lines = [
    `*BolBahi Kirana — Bill Receipt*`,
    `Customer: ${tx.customerName}`,
    `----------------`,
    ...tx.items.map((it) => `${it.name}: ${it.qty} ${it.unit} × ₹${it.unitPrice} = ₹${it.lineTotal}`),
    `----------------`,
    `*Total: ₹${tx.total}* (MRP incl. GST ₹${tx.gstIncluded})`,
  ];

  if (tx.cashPaid > 0) lines.push(`Cash Paid: ₹${tx.cashPaid}`);
  if (tx.upiPaid > 0) lines.push(`UPI Paid: ₹${tx.upiPaid}`);
  if (tx.newUdhaar > 0) lines.push(`Added to Udhaar: ₹${tx.newUdhaar}`);
  if (tx.changeToReturn > 0) lines.push(`Change Returned: ₹${tx.changeToReturn}`);

  const payableAmount = tx.newUdhaar > 0 ? tx.newUdhaar : tx.total;
  const upiLink = `upi://pay?pa=bolbahi.kirana@upi&pn=BolBahi%20Kirana&am=${payableAmount}&cu=INR&tn=Bill`;
  lines.push('', `Pay via UPI: ${upiLink}`, 'Dhanyavaad!');

  const encoded = encodeURIComponent(lines.join('\n'));
  const phone = sanitizePhone(tx.customerPhone);
  return phone.length === 10
    ? `https://wa.me/91${phone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function buildWhatsappKhataReminderUrl(customer: CustomerDoc): string {
  const upiLink = `upi://pay?pa=bolbahi.kirana@upi&pn=BolBahi%20Kirana&am=${customer.udhaarBalance}&cu=INR&tn=Khata`;
  const msg = [
    `Namaste ${customer.name} ji,`,
    `BolBahi Kirana ki taraf se polite reminder: aapke khate mein ₹${customer.udhaarBalance} baaki hain (pichla payment ${customer.lastPaymentDaysAgo} din pehle hua tha).`,
    `Aap UPI se aasani se bhej sakte hain: ${upiLink}`,
    `Dhanyavaad!`,
  ].join('\n');

  const phone = sanitizePhone(customer.phone);
  return phone.length === 10
    ? `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

export function buildWhatsappRestockOrderUrl(supplier: SupplierDoc, lowItems: ItemDoc[]): string {
  const lines = [
    `Namaste ${supplier.name},`,
    `BolBahi Kirana se aaj ka restock order:`,
    ...lowItems.map((it) => {
      const orderQty = Math.max(it.reorderThreshold * 2 - it.stock, it.reorderThreshold);
      return `- ${it.name}: ${orderQty} ${it.unit} (Current stock: ${it.stock} ${it.unit})`;
    }),
    `Please confirm delivery timing. Dhanyavaad!`,
  ];

  const phone = sanitizePhone(supplier.phone);
  return phone.length === 10
    ? `https://wa.me/91${phone}?text=${encodeURIComponent(lines.join('\n'))}`
    : `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}
