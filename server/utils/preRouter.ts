import type {
  CustomerDoc,
  DraftBill,
  ItemDoc,
  TodayStats,
  VoiceParseResponse,
} from '../../shared/types.ts';
import { matchCustomer, transliterateDevanagariToLatin } from './fuzzyMatch.ts';

const CONFIRM_EXACT_OR_COMBO =
  /^(?:(?:ha+n?|han|hnn|yes|yep|yeah|ji|ok|okay|theek\s*hai|thik\s*hai|sahi\s*hai|pakka|paka|bilkul|done|chalo|final|accha|achha)\s*)*(?:(?:bhej\s*(?:do|de|dijiye|dena)|bhejdo|bhejo|send(?:\s*(?:it|karo|kar\s*do|kardo))?|save(?:\s*(?:it|karo|kar\s*do|kardo))?|confirm(?:\s*(?:it|karo|kar\s*do|kardo))?|lock(?:\s*(?:karo|kar\s*do|kardo))?|final(?:\s*(?:karo|kar\s*do|kardo))?|kar\s*(?:do|de|dijiye)|kardo|done(?:\s*(?:karo|kar\s*do|kardo))?)\s*)*$/i;

const CONFIRM_DISQUALIFY =
  /\d|\b(nahi|nhi|mat|cancel|rupaye|rupay|rs|kilo|kg|litre|liter|packet|pkt|cash|upi|gpay|phonepe|paytm|udhaar|udhar|change|badal|hatao|hatado|remove|add|jodo|jod|aur|rate|price)\b/i;

function isConfirmUtterance(clean: string): boolean {
  if (!clean || CONFIRM_DISQUALIFY.test(clean)) {
    return false;
  }
  // Strip harmless polite/context words ("ji", "bhai", "bill", "whatsapp pe", "please")
  const stripped = clean
    .replace(/\b(ji|bhai|bhaiya|sir|please|pls|bill|bil|receipt|whatsapp|pe|par|ko|ye|yeh|isko|ab|abhi)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!stripped) return false;
  // Require at most 6 core words so long unrelated sentences never trigger confirm
  if (stripped.split(' ').length > 6) return false;
  return CONFIRM_EXACT_OR_COMBO.test(stripped);
}

const GALLA_PATTERN =
  /\b(galla|aaj ka hisaab|aaj ka hisab|aj ka hisab|today sales|today sale|kitni bikri|bikri|aaj ki bikri|day end|cash box|din bhar ka hisaab|din bhar ka hisab)\b/i;

const RESTOCK_PATTERN =
  /\b(kya mangwana|kya mangvana|mangwana hai|mangvana hai|restock|low stock|stock check|kya khatam|samaan mangwana|order list|kam stock)\b/i;

const UDHAAR_QUERY_PATTERN =
  /\b(kitna baaki|kitna baki|udhaar dikhao|udhar dikhao|purana udhaar|purana udhar|khata dikhao|balance batao|kitna udhaar|kitna udhar|kitna dena hai|baaki hai|baki hai)\b/i;

/**
 * Zero-Token Pre-Router:
 * Handles deterministic commands in Node.js for 0 LLM tokens before calling Gemini.
 */
export function runPreRouter(params: {
  utterance: string;
  activeDraft: DraftBill | null;
  items: ItemDoc[];
  customers: CustomerDoc[];
  todayStats: TodayStats;
}): VoiceParseResponse | null {
  const raw = transliterateDevanagariToLatin(params.utterance.trim());
  const clean = raw
    .replace(/[.,!?।]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Noise / empty / garbled input guard
  const alphaNumOnly = clean.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '');
  if (!clean || alphaNumOnly.length < 2 || /^(uh+|um+|hmm+|aaa+|hello|test|noise|\.+)$/i.test(clean)) {
    return {
      intent: 'NOISE',
      parserSource: 'pre-router',
      parserLabel: '0-Token Local',
      draft: params.activeDraft,
      targetTab: 'counter',
      filterCustomerId: null,
      spokenReply: 'Awaaz clear nahi aayi — phir se boliye.',
      bannerMessage: 'Awaaz clear nahi aayi — phir se boliye',
      bannerType: 'warning',
      shouldConfirmActiveDraft: false,
      editedFields: [],
    };
  }

  // 2. CONFIRM_BILL
  if (isConfirmUtterance(clean)) {
    if (!params.activeDraft) {
      return {
        intent: 'NOISE',
        parserSource: 'pre-router',
        parserLabel: '0-Token Local',
        draft: null,
        targetTab: 'counter',
        filterCustomerId: null,
        spokenReply: 'Abhi koi draft bill nahi hai. Pehle items boliye.',
        bannerMessage: 'No active draft bill to confirm yet.',
        bannerType: 'info',
        shouldConfirmActiveDraft: false,
        editedFields: [],
      };
    }

    if (params.activeDraft.ambiguousCustomers.length > 1) {
      const names = params.activeDraft.ambiguousCustomers.map((c) => c.name.split(' ')[0]).join(' ya ');
      return {
        intent: 'CONFIRM_BILL',
        parserSource: 'pre-router',
        parserLabel: '0-Token Local',
        draft: params.activeDraft,
        targetTab: 'counter',
        filterCustomerId: null,
        spokenReply: `Pehle customer select karein — ${names}?`,
        bannerMessage: 'Please select a customer before confirming the bill.',
        bannerType: 'warning',
        shouldConfirmActiveDraft: false,
        editedFields: [],
      };
    }

    const missingRate = params.activeDraft.items.find((it) => it.rateMissing);
    if (missingRate) {
      return {
        intent: 'CONFIRM_BILL',
        parserSource: 'pre-router',
        parserLabel: '0-Token Local',
        draft: params.activeDraft,
        targetTab: 'counter',
        filterCustomerId: null,
        spokenReply: `${missingRate.name} ka rate daalein pehle. Rate kitna lagana hai?`,
        bannerMessage: `Enter a rate for ${missingRate.name} before confirming.`,
        bannerType: 'warning',
        shouldConfirmActiveDraft: false,
        editedFields: [],
      };
    }

    return {
      intent: 'CONFIRM_BILL',
      parserSource: 'pre-router',
      parserLabel: '0-Token Local',
      draft: params.activeDraft,
      targetTab: 'counter',
      filterCustomerId: null,
      spokenReply: 'Bill save ho gaya. WhatsApp receipt ready hai.',
      bannerMessage: null,
      bannerType: 'success',
      shouldConfirmActiveDraft: true,
      editedFields: [],
    };
  }

  // 3. QUERY_GALLA (0 tokens)
  if (GALLA_PATTERN.test(clean)) {
    const { totalSales, cashTotal, upiTotal, udhaarTotal, billCount } = params.todayStats;
    const reply = `Aaj ka galla: ${billCount} bills, total bikri ${totalSales} rupaye. Cash ${cashTotal}, UPI ${upiTotal}, aur udhaar ${udhaarTotal} rupaye.`;
    return {
      intent: 'QUERY_GALLA',
      parserSource: 'pre-router',
      parserLabel: '0-Token Local',
      draft: params.activeDraft,
      targetTab: 'galla',
      filterCustomerId: null,
      spokenReply: reply,
      bannerMessage: null,
      bannerType: 'info',
      shouldConfirmActiveDraft: false,
      editedFields: [],
    };
  }

  // 4. QUERY_RESTOCK (0 tokens)
  if (RESTOCK_PATTERN.test(clean)) {
    const lowStock = params.items.filter((i) => i.stock <= i.reorderThreshold);
    const reply =
      lowStock.length === 0
        ? 'Sab items ka stock full hai. Kuch mangwane ki zaroorat nahi.'
        : `${lowStock.length} items kam hain: ${lowStock.map((i) => i.name).join(', ')}. WhatsApp order ready hai.`;

    return {
      intent: 'QUERY_RESTOCK',
      parserSource: 'pre-router',
      parserLabel: '0-Token Local',
      draft: params.activeDraft,
      targetTab: 'galla',
      filterCustomerId: null,
      spokenReply: reply,
      bannerMessage: null,
      bannerType: 'info',
      shouldConfirmActiveDraft: false,
      editedFields: [],
    };
  }

  // 5. QUERY_UDHAAR (0 tokens when matched directly to a known customer or general khata check)
  if (UDHAAR_QUERY_PATTERN.test(clean)) {
    const customerPart = clean
      .replace(UDHAAR_QUERY_PATTERN, '')
      .replace(/\b(hai|hain|batao|dikhao|check|karo|ka|ke|ki)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (customerPart) {
      const custMatch = matchCustomer(customerPart, params.customers);
      if (custMatch.matched) {
        const c = custMatch.matched;
        const reply =
          c.udhaarBalance > 0
            ? `${c.name} ka ${c.udhaarBalance} rupaye udhaar baaki hai.`
            : `${c.name} ka koi udhaar baaki nahi hai.`;
        return {
          intent: 'QUERY_UDHAAR',
          parserSource: 'pre-router',
          parserLabel: '0-Token Local',
          draft: params.activeDraft,
          targetTab: 'khata',
          filterCustomerId: c.id,
          spokenReply: reply,
          bannerMessage: null,
          bannerType: 'info',
          shouldConfirmActiveDraft: false,
          editedFields: [],
        };
      }
      if (custMatch.ambiguous.length > 1) {
        const summary = custMatch.ambiguous
          .map((c) => `${c.name} ka ${c.udhaarBalance} rupaye`)
          .join(' aur ');
        return {
          intent: 'QUERY_UDHAAR',
          parserSource: 'pre-router',
          parserLabel: '0-Token Local',
          draft: params.activeDraft,
          targetTab: 'khata',
          filterCustomerId: null,
          spokenReply: `${summary} udhaar baaki hai.`,
          bannerMessage: null,
          bannerType: 'info',
          shouldConfirmActiveDraft: false,
          editedFields: [],
        };
      }
    }

    const totalReceivable = params.customers.reduce((sum, c) => sum + c.udhaarBalance, 0);
    return {
      intent: 'QUERY_UDHAAR',
      parserSource: 'pre-router',
      parserLabel: '0-Token Local',
      draft: params.activeDraft,
      targetTab: 'khata',
      filterCustomerId: null,
      spokenReply: `Kul udhaar ${totalReceivable} rupaye baaki hai. Khata khol diya hai.`,
      bannerMessage: null,
      bannerType: 'info',
      shouldConfirmActiveDraft: false,
      editedFields: [],
    };
  }

  return null;
}
