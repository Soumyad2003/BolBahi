import type {
  CustomerDoc,
  DraftBill,
  ItemDoc,
  LowStockAlertItem,
  RestockDraft,
  TodayStats,
  VoiceParseResponse,
} from '../../shared/types.ts';
import {
  buildRestockDraftFromAlerts,
  buildRestockDraftFromCatalogLowStock,
  buildRestockSpokenSummary,
} from '../../shared/restockMath.ts';
import { matchCustomer, transliterateDevanagariToLatin } from './fuzzyMatch.ts';
import { matchOfflineBillingIntent } from './intentMatcher.ts';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildQuickRestockResponse(params: {
  utterance: string;
  activeDraft: DraftBill | null;
  activeRestockDraft?: RestockDraft | null;
  lowStockAlertItems?: LowStockAlertItem[];
  items: ItemDoc[];
}): VoiceParseResponse {
  const alerts = params.lowStockAlertItems ?? [];
  const nextRestockDraft =
    (alerts.length > 0
      ? buildRestockDraftFromAlerts(alerts, params.utterance, 'pre-router')
      : null) ?? buildRestockDraftFromCatalogLowStock(params.items, params.utterance, 'pre-router');

  if (!nextRestockDraft) {
    return {
      intent: 'ORDER_RESTOCK',
      parserSource: 'pre-router',
      parserLabel: '0-Token Local',
      draft: params.activeDraft,
      restockDraft: params.activeRestockDraft ?? null,
      targetTab: 'counter',
      filterCustomerId: null,
      spokenReply:
        'Abhi sab items ka stock theek hai. Kisi item ka naam bolkar restock draft bana sakte hain.',
      bannerMessage: 'All items are currently above reorder threshold.',
      bannerType: 'info',
      shouldConfirmActiveDraft: false,
      editedFields: [],
    };
  }

  return {
    intent: 'ORDER_RESTOCK',
    parserSource: 'pre-router',
    parserLabel: '0-Token Local',
    draft: params.activeDraft,
    restockDraft: nextRestockDraft,
    targetTab: 'counter',
    filterCustomerId: null,
    spokenReply: buildRestockSpokenSummary(nextRestockDraft, false),
    bannerMessage: null,
    bannerType: 'success',
    shouldConfirmActiveDraft: false,
    editedFields: [],
  };
}

/**
 * Zero-Token Pre-Router:
 * Uses the lightweight Trie + Levenshtein offline intent matcher to handle
 * deterministic commands in Node.js for 0 LLM tokens before calling Gemini.
 */
export function runPreRouter(params: {
  utterance: string;
  activeDraft: DraftBill | null;
  activeRestockDraft?: RestockDraft | null;
  lowStockAlertItems?: LowStockAlertItem[];
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

  // 2. Trie + Levenshtein Offline Keyword Intent Matching
  const matchedIntent = matchOfflineBillingIntent(clean);
  if (!matchedIntent) {
    return null;
  }

  // 3. CANCEL_BILL (discards active customer draft first, else active restock draft)
  if (matchedIntent.intent === 'CANCEL_BILL') {
    if (params.activeDraft) {
      return {
        intent: 'CANCEL_BILL',
        parserSource: 'pre-router',
        parserLabel: '0-Token Local',
        draft: null,
        targetTab: 'counter',
        filterCustomerId: null,
        spokenReply: 'Draft cancel kar diya.',
        bannerMessage: 'Draft bill cancelled.',
        bannerType: 'info',
        shouldConfirmActiveDraft: false,
        editedFields: [],
      };
    }

    if (params.activeRestockDraft) {
      return {
        intent: 'CANCEL_BILL',
        parserSource: 'pre-router',
        parserLabel: '0-Token Local',
        draft: null,
        restockDraft: null,
        shouldCancelRestockDraft: true,
        targetTab: 'counter',
        filterCustomerId: null,
        spokenReply: 'Restock order draft cancel kar diya.',
        bannerMessage: 'Restock order draft cancelled.',
        bannerType: 'info',
        shouldConfirmActiveDraft: false,
        editedFields: [],
      };
    }

    return {
      intent: 'CANCEL_BILL',
      parserSource: 'pre-router',
      parserLabel: '0-Token Local',
      draft: null,
      targetTab: 'counter',
      filterCustomerId: null,
      spokenReply: 'Abhi koi draft bill ya restock order nahi hai.',
      bannerMessage: null,
      bannerType: null,
      shouldConfirmActiveDraft: false,
      editedFields: [],
    };
  }

  // 4. ORDER_RESTOCK (quick reply like "haan mangwa lo", "order kar do", "sab mangwa lo")
  if (matchedIntent.intent === 'ORDER_RESTOCK') {
    return buildQuickRestockResponse(params);
  }

  // 5. CONFIRM_BILL
  if (matchedIntent.intent === 'CONFIRM_BILL') {
    if (!params.activeDraft) {
      // Contextual shortcut: when a post-confirm low-stock prompt just asked "Kya mangwa loon?"
      // and the shopkeeper replies with a simple affirmative ("haan", "yes", "ok", "kar do"),
      // open the Restock Draft directly from those low-stock alerts!
      const isSimpleAffirmative =
        /^(ha|haa|haan|han|yes|yep|ok|okay|theek hai|thik hai|sahi hai|kar do|kardo|ha kar do|haan kar do|bilkul|pakka)$/i.test(
          matchedIntent.matchedPhrase
        );
      if (
        isSimpleAffirmative &&
        !params.activeRestockDraft &&
        (params.lowStockAlertItems?.length ?? 0) > 0
      ) {
        return buildQuickRestockResponse(params);
      }

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

  // 6. QUERY_GALLA (0 tokens)
  if (matchedIntent.intent === 'QUERY_GALLA') {
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

  // 5. QUERY_RESTOCK (0 tokens)
  if (matchedIntent.intent === 'QUERY_RESTOCK') {
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

  // 6. QUERY_UDHAAR (0 tokens)
  if (matchedIntent.intent === 'QUERY_UDHAAR') {
    const spanPattern = new RegExp(escapeRegex(matchedIntent.matchedSpanText), 'gi');
    const customerPart = clean
      .replace(spanPattern, ' ')
      .replace(/\b(hai|hain|batao|dikhao|check|karo|ka|ke|ki|kitna|udhaar|udhar|baaki|baki|khata|purana)\b/gi, ' ')
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
