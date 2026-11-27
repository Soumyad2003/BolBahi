import test from 'node:test';
import assert from 'node:assert/strict';
import type { CustomerDoc, ItemDoc, TodayStats } from '../../shared/types.ts';
import {
  levenshteinSimilarity,
  matchCatalogItem,
  matchCustomer,
  normalizeHinglishNumbers,
  resolveSelfCorrections,
  transliterateDevanagariToLatin,
} from './fuzzyMatch.ts';
import {
  applyEditToDraftBill,
  buildNewDraftBill,
  buildSpokenBillSummary,
  calculateMrpInclusiveGst,
  recalculateDraftTotals,
} from './billMath.ts';
import { runPreRouter } from './preRouter.ts';
import { parseWithLocalFallback } from './localFallbackParser.ts';
import { parseVoiceWithGeminiOrFallback } from '../services/geminiParser.ts';
import { toDevanagariHindiSpeech, toHinglishSpeech } from '../../shared/hindiSpeech.ts';

const MOCK_ITEMS: ItemDoc[] = [
  { id: 'u_atta', ownerId: 'u', slug: 'atta', name: 'Aashirvaad Atta', aliases: ['atta', 'aata', 'aashirvaad atta', 'ashirwad atta'], unit: 'kg', price: 52, gstPercent: 0, stock: 12, reorderThreshold: 10, supplierId: 'u_agarwal' },
  { id: 'u_tel', ownerId: 'u', slug: 'tel', name: 'Fortune Refined Oil', aliases: ['tel', 'oil', 'fortune tel', 'refined oil'], unit: 'L', price: 160, gstPercent: 5, stock: 6, reorderThreshold: 8, supplierId: 'u_agarwal' },
  { id: 'u_namak', ownerId: 'u', slug: 'namak', name: 'Tata Salt', aliases: ['namak', 'salt', 'tata namak', 'tata salt'], unit: 'pkt', price: 28, gstPercent: 0, stock: 25, reorderThreshold: 10, supplierId: 'u_metro' },
  { id: 'u_chawal', ownerId: 'u', slug: 'chawal', name: 'India Gate Basmati Rice', aliases: ['chawal', 'rice', 'basmati'], unit: 'kg', price: 95, gstPercent: 5, stock: 18, reorderThreshold: 10, supplierId: 'u_agarwal' },
  { id: 'u_surf', ownerId: 'u', slug: 'surf', name: 'Surf Excel Small', aliases: ['surf', 'chota surf', 'surf excel'], unit: 'pkt', price: 20, gstPercent: 18, stock: 14, reorderThreshold: 8, supplierId: 'u_metro' },
  { id: 'u_maggi', ownerId: 'u', slug: 'maggi', name: 'Maggi Noodles', aliases: ['maggi', 'maggie', 'noodles'], unit: 'pkt', price: 14, gstPercent: 12, stock: 5, reorderThreshold: 12, supplierId: 'u_metro' },
];

const MOCK_CUSTOMERS: CustomerDoc[] = [
  { id: 'u_rajesh', ownerId: 'u', slug: 'rajesh-sharma', name: 'Rajesh Sharma', aliases: ['sharma ji', 'sharma', 'rajesh'], phone: '9876543210', udhaarBalance: 420, lastPaymentDaysAgo: 18 },
  { id: 'u_vikram', ownerId: 'u', slug: 'vikram-sharma', name: 'Vikram Sharma', aliases: ['sharma ji', 'sharma', 'vikram'], phone: '9876543214', udhaarBalance: 150, lastPaymentDaysAgo: 10 },
  { id: 'u_walkin', ownerId: 'u', slug: 'walk-in', name: 'Walk-in Cash Customer', aliases: ['cash', 'walk-in', 'customer'], phone: '', udhaarBalance: 0, lastPaymentDaysAgo: 0 },
];

const MOCK_TODAY: TodayStats = {
  totalSales: 553,
  cashTotal: 212,
  upiTotal: 232,
  udhaarTotal: 109,
  billCount: 3,
};

test('Hinglish number normalization handles fractions, hundreds, and verbs correctly', () => {
  assert.equal(normalizeHinglishNumbers('panch kilo atta'), '5 kilo atta');
  assert.equal(normalizeHinglishNumbers('dhai sau cash diye'), '250 cash diye');
  assert.equal(normalizeHinglishNumbers('dedh kilo chawal'), '1.5 kilo chawal');
  assert.equal(normalizeHinglishNumbers('tel 155 rupaye kar do'), 'tel 155 rupaye kar do');
});

test('Levenshtein fuzzy matcher resolves Ashirwad aata -> Aashirvaad Atta (>= 0.72)', () => {
  assert.ok(levenshteinSimilarity('aata', 'atta') >= 0.72);
  const matched = matchCatalogItem('Ashirwad aata', null, MOCK_ITEMS);
  assert.equal(matched?.slug, 'atta');
});

test('Mid-sentence self-correction keeps last stated value', () => {
  const norm = normalizeHinglishNumbers('Atta 5 nahi 3 kilo hai');
  assert.equal(resolveSelfCorrections(norm), 'atta 3 kilo hai');
});

test('MRP-inclusive GST back-calculation never adds GST on top of bill total', () => {
  // Fortune oil: 2 * 160 = 320 at 5% MRP-inclusive => 320 - 320/1.05 = 15.24
  assert.equal(calculateMrpInclusiveGst(320, 5), 15.24);
  const draft = buildNewDraftBill({
    customerQuery: 'Rajesh Sharma',
    extractedItems: [
      { rawName: 'Aashirvaad atta', matchedSlug: 'atta', qty: 5, unit: 'kg', overridePrice: null },
      { rawName: 'Fortune tel', matchedSlug: 'tel', qty: 2, unit: 'L', overridePrice: null },
      { rawName: 'Tata namak', matchedSlug: 'namak', qty: 1, unit: 'pkt', overridePrice: null },
    ],
    cashPaid: 300,
    upiPaid: 0,
    isUdhaar: true,
    transcript: 'test',
    parserSource: 'fallback',
    catalog: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });

  assert.equal(draft.total, 608);
  assert.equal(draft.gstIncluded, 15.24);
  assert.equal(draft.cashPaid, 300);
  assert.equal(draft.upiPaid, 0);
  assert.equal(draft.newUdhaar, 308);
  assert.equal(draft.changeToReturn, 0);
  assert.equal(draft.customerId, 'u_rajesh');
});

test('Overpayment calculates Baaki Wapas (changeToReturn) instead of negative udhaar', () => {
  const draft = buildNewDraftBill({
    customerQuery: 'Walk-in',
    extractedItems: [{ rawName: 'Tata namak', matchedSlug: 'namak', qty: 2, unit: 'pkt', overridePrice: null }],
    cashPaid: 100,
    upiPaid: 0,
    isUdhaar: false,
    transcript: '2 namak 100 cash',
    parserSource: 'fallback',
    catalog: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });
  assert.equal(draft.total, 56);
  assert.equal(draft.newUdhaar, 0);
  assert.equal(draft.changeToReturn, 44);
});

test('Ambiguous Sharma ji returns both Rajesh Sharma and Vikram Sharma', () => {
  const res = matchCustomer('Sharma ji', MOCK_CUSTOMERS);
  assert.equal(res.matched, null);
  assert.equal(res.ambiguous.length, 2);

  const fallback = parseWithLocalFallback({
    utterance: 'Sharma ji ko 2 kilo chawal aur 1 Tata namak, 100 UPI kiya',
    activeDraft: null,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });
  assert.equal(fallback.upiPaid, 100);
  assert.equal(fallback.items.length, 2);

  const draft = buildNewDraftBill({
    customerQuery: fallback.customerQuery,
    extractedItems: fallback.items,
    cashPaid: fallback.cashPaid,
    upiPaid: fallback.upiPaid,
    isUdhaar: fallback.isUdhaar,
    transcript: 'Sharma ji ko 2 kilo chawal aur 1 Tata namak, 100 UPI kiya',
    parserSource: 'fallback',
    catalog: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });
  assert.equal(draft.ambiguousCustomers.length, 2);
  assert.equal(draft.total, 218);
  assert.equal(draft.upiPaid, 100);
  assert.equal(draft.newUdhaar, 118);
  assert.match(buildSpokenBillSummary(draft), /Do Sharma ji hain/i);
});

test('Flow B voice edit updates price and recalculates total deterministically', () => {
  const baseDraft = buildNewDraftBill({
    customerQuery: 'Rajesh Sharma',
    extractedItems: [
      { rawName: 'Aashirvaad atta', matchedSlug: 'atta', qty: 5, unit: 'kg', overridePrice: null },
      { rawName: 'Fortune tel', matchedSlug: 'tel', qty: 2, unit: 'L', overridePrice: null },
      { rawName: 'Tata namak', matchedSlug: 'namak', qty: 1, unit: 'pkt', overridePrice: null },
    ],
    cashPaid: 300,
    upiPaid: 0,
    isUdhaar: true,
    transcript: 'initial',
    parserSource: 'fallback',
    catalog: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });

  const editPayload = parseWithLocalFallback({
    utterance: 'Tel 155 rupaye kar do',
    activeDraft: baseDraft,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });
  assert.equal(editPayload.intent, 'EDIT_BILL');
  assert.equal(editPayload.items[0]?.overridePrice, 155);

  const { draft: edited } = applyEditToDraftBill({
    activeDraft: baseDraft,
    extractedItems: editPayload.items,
    customerQuery: editPayload.customerQuery,
    cashPaid: editPayload.cashPaid,
    upiPaid: editPayload.upiPaid,
    isUdhaar: editPayload.isUdhaar,
    transcript: 'Tel 155 rupaye kar do',
    parserSource: 'fallback',
    catalog: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });
  assert.equal(edited.total, 598);
  assert.equal(edited.newUdhaar, 298);
});

test('Unknown item gets Rate Missing ₹0 flag and recalculates once rate entered', () => {
  const draft = buildNewDraftBill({
    customerQuery: 'Rajesh Sharma',
    extractedItems: [{ rawName: 'Organic Ghee', matchedSlug: null, qty: 1, unit: 'jar', overridePrice: null }],
    cashPaid: 0,
    upiPaid: 0,
    isUdhaar: true,
    transcript: '1 organic ghee',
    parserSource: 'fallback',
    catalog: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });
  assert.equal(draft.items[0].rateMissing, true);
  assert.equal(draft.items[0].unitPrice, 0);
  assert.match(buildSpokenBillSummary(draft), /Rate kitna lagana hai/i);

  const updated = recalculateDraftTotals({
    ...draft,
    items: [{ ...draft.items[0], unitPrice: 450 }],
  });
  assert.equal(updated.items[0].rateMissing, false);
  assert.equal(updated.total, 450);
});

test('0-Token Pre-Router handles CONFIRM_BILL, QUERY_GALLA, QUERY_RESTOCK, QUERY_UDHAAR, and NOISE', () => {
  const galla = runPreRouter({
    utterance: 'Aaj ka galla batao',
    activeDraft: null,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
    todayStats: MOCK_TODAY,
  });
  assert.equal(galla?.intent, 'QUERY_GALLA');
  assert.equal(galla?.parserSource, 'pre-router');
  assert.equal(galla?.targetTab, 'galla');

  const restock = runPreRouter({
    utterance: 'Aaj kya mangwana hai?',
    activeDraft: null,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
    todayStats: MOCK_TODAY,
  });
  assert.equal(restock?.intent, 'QUERY_RESTOCK');
  assert.match(restock?.spokenReply ?? '', /Fortune Refined Oil/);
  assert.match(restock?.spokenReply ?? '', /Maggi Noodles/);

  const udhaar = runPreRouter({
    utterance: 'Rajesh Sharma ka kitna baaki hai?',
    activeDraft: null,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
    todayStats: MOCK_TODAY,
  });
  assert.equal(udhaar?.intent, 'QUERY_UDHAAR');
  assert.equal(udhaar?.filterCustomerId, 'u_rajesh');
  assert.match(udhaar?.spokenReply ?? '', /420/);

  const noise = runPreRouter({
    utterance: '...',
    activeDraft: null,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
    todayStats: MOCK_TODAY,
  });
  assert.equal(noise?.intent, 'NOISE');
  assert.match(noise?.bannerMessage ?? '', /Awaaz clear nahi aayi/);
});

test('Demo Pill 1 multi-item Hinglish utterance parses into all 3 items with exact ₹608 total', () => {
  const utterance =
    'Rajesh Sharma ke khate mein 5 kilo Aashirvaad atta, 2 litre Fortune tel, aur 1 Tata namak likho, 300 cash diye baaki udhaar';
  const parsed = parseWithLocalFallback({
    utterance,
    activeDraft: null,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });
  assert.equal(parsed.intent, 'LOG_SALE');
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.cashPaid, 300);
  assert.equal(parsed.upiPaid, null);
  assert.equal(parsed.isUdhaar, true);

  const draft = buildNewDraftBill({
    customerQuery: parsed.customerQuery,
    extractedItems: parsed.items,
    cashPaid: parsed.cashPaid,
    upiPaid: parsed.upiPaid,
    isUdhaar: parsed.isUdhaar,
    transcript: utterance,
    parserSource: 'fallback',
    catalog: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });
  assert.equal(draft.customerName, 'Rajesh Sharma');
  assert.equal(draft.items.length, 3);
  assert.equal(draft.total, 608);
  assert.equal(draft.gstIncluded, 15.24);
  assert.equal(draft.cashPaid, 300);
  assert.equal(draft.upiPaid, 0);
  assert.equal(draft.newUdhaar, 308);
  assert.equal(draft.changeToReturn, 0);
});

test('Devanagari (hi-IN) mic transcript resolves Rajesh Sharma, items, and ₹300 cash accurately', () => {
  const hindiUtterance = 'राजेश शर्मा को 5 किलो आटा 3 लीटर तेल 300 कैश';
  const roman = transliterateDevanagariToLatin(hindiUtterance);
  assert.match(roman, /rajesh/i);
  assert.match(roman, /sharma/i);
  assert.match(roman, /cash/i);

  // Direct customer match from Devanagari name
  const custRes = matchCustomer('राजेश शर्मा', MOCK_CUSTOMERS);
  assert.equal(custRes.matched?.id, 'u_rajesh');
  assert.equal(custRes.ambiguous.length, 0);

  // Full fallback parse & draft calculation on exact reported mic transcript
  const parsed = parseWithLocalFallback({
    utterance: hindiUtterance,
    activeDraft: null,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });
  assert.equal(parsed.intent, 'LOG_SALE');
  assert.equal(parsed.cashPaid, 300);

  const draft = buildNewDraftBill({
    customerQuery: parsed.customerQuery,
    extractedItems: parsed.items,
    cashPaid: parsed.cashPaid,
    upiPaid: parsed.upiPaid,
    isUdhaar: parsed.isUdhaar,
    transcript: hindiUtterance,
    parserSource: 'fallback',
    catalog: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });
  assert.equal(draft.customerId, 'u_rajesh');
  assert.equal(draft.customerName, 'Rajesh Sharma');
  assert.equal(draft.items.length, 2);
  assert.equal(draft.total, 740);
  assert.equal(draft.cashPaid, 300);
  assert.equal(draft.newUdhaar, 440);
});

test('Devanagari ambiguous Sharma ji and 0-token commands resolve accurately', () => {
  const ambig = matchCustomer('शर्मा जी', MOCK_CUSTOMERS);
  assert.equal(ambig.matched, null);
  assert.equal(ambig.ambiguous.length, 2);

  const gallaHi = runPreRouter({
    utterance: 'आज का गल्ला बताओ',
    activeDraft: null,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
    todayStats: MOCK_TODAY,
  });
  assert.equal(gallaHi?.intent, 'QUERY_GALLA');
  assert.equal(gallaHi?.targetTab, 'galla');

  const udhaarHi = runPreRouter({
    utterance: 'राजेश शर्मा का कितना बाकी है?',
    activeDraft: null,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
    todayStats: MOCK_TODAY,
  });
  assert.equal(udhaarHi?.intent, 'QUERY_UDHAAR');
  assert.equal(udhaarHi?.filterCustomerId, 'u_rajesh');

  const activeDraft = buildNewDraftBill({
    customerQuery: 'राजेश शर्मा',
    extractedItems: [{ rawName: 'आटा', matchedSlug: null, qty: 2, unit: 'kg', overridePrice: null }],
    cashPaid: 100,
    upiPaid: 0,
    isUdhaar: true,
    transcript: 'राजेश शर्मा को 2 किलो आटा',
    parserSource: 'fallback',
    catalog: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });
  const confirmHi = runPreRouter({
    utterance: 'हां, भेज दो',
    activeDraft,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
    todayStats: MOCK_TODAY,
  });
  assert.equal(confirmHi?.intent, 'CONFIRM_BILL');
  assert.equal(confirmHi?.shouldConfirmActiveDraft, true);
});

test('Explicit parserMode="offline" bypasses Gemini LLM and parses locally', async () => {
  const res = await parseVoiceWithGeminiOrFallback({
    utterance: 'Rajesh Sharma ko 5 kilo atta, 2 litre tel, 300 cash diye baaki udhaar',
    activeDraft: null,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
    parserMode: 'offline',
  });
  assert.equal(res.source, 'fallback');
  assert.equal(res.modelUsed, undefined);
  assert.equal(res.payload.intent, 'LOG_SALE');
  assert.equal(res.payload.items.length, 2);
  assert.equal(res.payload.cashPaid, 300);
});

test('Hindi and Hinglish talkback speech formatters produce clean Devanagari and Hinglish text', () => {
  const billReply = 'Rajesh Sharma: 3 items, total 608 rupaye. 300 cash, 308 udhaar. Confirm karein?';
  const hi = toDevanagariHindiSpeech(billReply);
  assert.match(hi, /राजेश शर्मा/);
  assert.match(hi, /608 रुपये/);
  assert.match(hi, /300 कैश/);
  assert.match(hi, /308 उधार/);
  assert.match(hi, /कन्फर्म करें\?/);

  const gallaReply = 'Aaj ka galla: 3 bills, total bikri 553 rupaye. Cash 212, UPI 232, aur udhaar 109 rupaye.';
  const hiGalla = toDevanagariHindiSpeech(gallaReply);
  assert.match(hiGalla, /आज का गल्ला/);
  assert.match(hiGalla, /यूपीआई 232/);

  const hinglish = toHinglishSpeech('Rajesh Sharma — total ₹608');
  assert.equal(hinglish, 'Rajesh Sharma, total 608 rupees');
});

test('Natural Hinglish confirm phrases including "ha bhej do" confirm active drafts without false positives', () => {
  const activeDraft = buildNewDraftBill({
    customerQuery: 'Rajesh Sharma',
    extractedItems: [{ rawName: 'Aashirvaad atta', matchedSlug: 'atta', qty: 5, unit: 'kg', overridePrice: null }],
    cashPaid: 100,
    upiPaid: 0,
    isUdhaar: true,
    transcript: 'Rajesh Sharma 5 kilo atta 100 cash',
    parserSource: 'fallback',
    catalog: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
  });

  for (const phrase of [
    'ha bhej do',
    'Ha, bhej do.',
    'haa bhej do',
    'ha bhejdo',
    'ha bill bhej do',
    'ji ha bhej dijiye',
    'ok bhej do',
    'sahi hai bhej do',
    'ha save kar do',
    'whatsapp par bhej do',
  ]) {
    const res = runPreRouter({
      utterance: phrase,
      activeDraft,
      items: MOCK_ITEMS,
      customers: MOCK_CUSTOMERS,
      todayStats: MOCK_TODAY,
    });
    assert.equal(res?.intent, 'CONFIRM_BILL', `Expected CONFIRM_BILL for "${phrase}"`);
    assert.equal(res?.shouldConfirmActiveDraft, true, `Expected shouldConfirmActiveDraft for "${phrase}"`);
  }

  // Must NOT falsely confirm an edit utterance
  const editRes = runPreRouter({
    utterance: 'Ha tel 155 rupaye kar do',
    activeDraft,
    items: MOCK_ITEMS,
    customers: MOCK_CUSTOMERS,
    todayStats: MOCK_TODAY,
  });
  assert.equal(editRes, null);
});




