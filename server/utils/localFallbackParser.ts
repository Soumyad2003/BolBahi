import type {
  CustomerDoc,
  DraftBill,
  ExtractedItem,
  ExtractedPayload,
  ItemDoc,
} from '../../shared/types.ts';
import {
  matchCatalogItem,
  normalizeHinglishNumbers,
  resolveSelfCorrections,
  transliterateDevanagariToLatin,
} from './fuzzyMatch.ts';

const PAYMENT_STRIP_REGEX =
  /\b\d+(?:\.\d+)?\s*(?:rupaye|rupay|rs|inr)?\s*(?:cash|nakad|naqad|upi|gpay|google\s*pay|phonepe|phone\s*pe|paytm|online|bheja|diye|diya|kiya|kiye|mila|mile)\b/gi;

const UNIT_WORDS = '(?:kilo|kg|kgs|litre|liter|litres|liters|ltr|l|packet|packets|pkt|pkts|piece|pieces|pc|pcs|tube|tubes|bottle|bottles|dabba|pouch|pack|packs)';

function extractPayments(normalized: string): {
  cashPaid: number | null;
  upiPaid: number | null;
  isUdhaar: boolean;
} {
  let cashPaid: number | null = null;
  let upiPaid: number | null = null;
  const isUdhaar = /\b(udhaar|udhar|baaki|baki|khate|khata|credit)\b/i.test(normalized);

  // UPI / GPay / PhonePe / Paytm / Online
  const upiMatch =
    normalized.match(/\b(\d+(?:\.\d+)?)\s*(?:rupaye|rupay|rs)?\s*(?:upi|gpay|google\s*pay|phonepe|phone\s*pe|paytm|online)\b/i) ||
    normalized.match(/\b(?:upi|gpay|google\s*pay|phonepe|phone\s*pe|paytm|online)\s*(?:se|mein|me|kiya|kiye|hua)?\s*(\d+(?:\.\d+)?)\b/i);
  if (upiMatch) {
    upiPaid = Number(upiMatch[1]);
  }

  // Cash / Nakad / "300 diye"
  const cashMatch =
    normalized.match(/\b(\d+(?:\.\d+)?)\s*(?:rupaye|rupay|rs)?\s*(?:cash|nakad|naqad)\b/i) ||
    normalized.match(/\b(?:cash|nakad|naqad)\s*(?:diya|diye|mila|mile)?\s*(\d+(?:\.\d+)?)\b/i);
  if (cashMatch) {
    cashPaid = Number(cashMatch[1]);
  } else if (upiPaid === null) {
    const genericPaid = normalized.match(/\b(\d+(?:\.\d+)?)\s*(?:rupaye|rupay|rs)?\s*(?:diye|diya|mila|mile|de\s+diye)\b/i);
    if (genericPaid) {
      cashPaid = Number(genericPaid[1]);
    }
  }

  return { cashPaid, upiPaid, isUdhaar };
}

function extractCustomerQuery(rawUtterance: string, customers: CustomerDoc[]): string | null {
  const latinUtterance = transliterateDevanagariToLatin(rawUtterance);
  // Pattern 1: "<Name> ke khate mein ..." or "<Name> ko ..."
  const leadingMatch = latinUtterance.match(
    /^([a-zA-Z\s]{2,40}?)\s+(?:ke\s+khate\s+mein|ke\s+khate\s+me|ke\s+khata\s+mein|ke\s+account\s+mein|ko|ka\s+bill|ke\s+naam)\b/i
  );
  if (leadingMatch) {
    const candidate = leadingMatch[1].trim();
    if (candidate && !/^(aaj|kal|ek|do|teen|char|panch|\d+)/i.test(candidate)) {
      return candidate;
    }
  }

  // Pattern 2: Check direct mentions of known customer names or aliases
  const lower = latinUtterance.toLowerCase();
  // Prefer full names first
  for (const c of customers) {
    if (c.slug === 'walk-in') continue;
    if (lower.includes(c.name.toLowerCase())) {
      return c.name;
    }
  }
  // Then aliases (e.g. "sharma ji", "sunita didi", "raju bhai")
  for (const c of customers) {
    if (c.slug === 'walk-in') continue;
    for (const alias of c.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
        return alias;
      }
    }
  }

  return null;
}

function isEditUtterance(normalized: string, activeDraft: DraftBill | null): boolean {
  if (!activeDraft) return false;
  if (/\b(kar\s+do|karo|change|badal|update|nahi|nhi|sorry|actually|rupaye\s+kar|rate|kam\s+kar|zyada\s+kar)\b/i.test(normalized)) {
    return true;
  }
  // Short payment-only update like "200 upi kiya" or "300 cash"
  if (/^\s*\d+(?:\.\d+)?\s*(?:rupaye|rupay|rs)?\s*(?:cash|upi|gpay|phonepe|paytm|online)(?:\s+(?:kiya|kiye|diye|diya|hai|kar\s+do))?\s*$/i.test(normalized)) {
    return true;
  }
  return false;
}

function parseEditItems(normalized: string, catalog: ItemDoc[], activeDraft: DraftBill): ExtractedItem[] {
  const results: ExtractedItem[] = [];

  // Pattern A: Price override: "<item> <price> rupaye/rs kar do" or "<item> ka rate <price>"
  const priceMatch = normalized.match(
    /\b([a-z][a-z\s-]{1,30}?)\s+(?:ka\s+rate\s+|ka\s+price\s+|rate\s+|price\s+)?(\d+(?:\.\d+)?)\s*(?:rupaye|rupay|rs|ka)\b/i
  );
  if (priceMatch) {
    const rawItem = priceMatch[1].replace(/\b(aur|ab|isko|uska|ka|ke|ki)\b/gi, '').trim();
    const newPrice = Number(priceMatch[2]);
    const matched = matchCatalogItem(rawItem, null, catalog);
    const draftMatch = activeDraft.items.find(
      (it) =>
        (matched && it.slug === matched.slug) ||
        it.name.toLowerCase().includes(rawItem.toLowerCase()) ||
        it.slug.toLowerCase() === rawItem.toLowerCase()
    );
    if (matched || draftMatch) {
      results.push({
        rawName: matched?.name ?? draftMatch?.name ?? rawItem,
        matchedSlug: matched?.slug ?? draftMatch?.slug ?? null,
        qty: draftMatch?.qty ?? 1,
        unit: matched?.unit ?? draftMatch?.unit ?? null,
        overridePrice: newPrice,
      });
      return results;
    }
  }

  // Pattern B: Quantity change with self-correction already resolved: "atta 3 kilo hai" or "3 kilo atta"
  const afterQtyMatch = normalized.match(
    new RegExp(`\\b([a-z][a-z\\s-]{1,25}?)\\s+(\\d+(?:\\.\\d+)?)\\s*(${UNIT_WORDS})?\\b`, 'i')
  );
  if (afterQtyMatch) {
    const rawItem = afterQtyMatch[1].replace(/\b(aur|ab|isko|ka|ke|ki|hai)\b/gi, '').trim();
    const newQty = Number(afterQtyMatch[2]);
    const unit = afterQtyMatch[3] ?? null;
    const matched = matchCatalogItem(rawItem, null, catalog);
    if (matched && newQty > 0 && !/\b(rupaye|rupay|rs|cash|upi|gpay|phonepe)\b/i.test(normalized)) {
      results.push({
        rawName: matched.name,
        matchedSlug: matched.slug,
        qty: newQty,
        unit: unit ?? matched.unit,
        overridePrice: null,
      });
      return results;
    }
  }

  return parseSaleItems(normalized, catalog);
}

function parseSaleItems(normalized: string, catalog: ItemDoc[]): ExtractedItem[] {
  // Strip leading customer clause and trailing payment clause
  let body = normalized
    .replace(/^[a-z\s]{2,40}?\b(?:ke\s+khate\s+mein|ke\s+khate\s+me|ke\s+khata\s+mein|ko)\b/i, ' ')
    .replace(PAYMENT_STRIP_REGEX, ' , ')
    .replace(
      /\b(baaki|baki|udhaar|udhar|likho|likh\s+do|dena|de\s+do|chahiye|bill\s+banao|kar\s+do|hai|hain|mein|me|ke|ka|ki|khate|khata|diye|diya|kiya|kiye|mila|mile)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  // Also insert comma separators before subsequent "<qty> <unit>" patterns when user omitted commas
  body = body.replace(
    new RegExp(`([a-z])\\s+(?=\\d+(?:\\.\\d+)?\\s+${UNIT_WORDS}\\b)`, 'gi'),
    '$1 , '
  );

  // Split by commas or "aur" / "and"
  const chunks = body
    .split(/\s*(?:,|\baur\b|\band\b|\bplus\b)\s*/i)
    .map((c) => c.trim())
    .filter((c) => c.length >= 2);

  const items: ExtractedItem[] = [];

  for (const chunk of chunks) {
    // Match "<qty> [unit] <item name>"
    const m = chunk.match(
      new RegExp(`^(?:(\\d+(?:\\.\\d+)?)\\s*(?:(${UNIT_WORDS})\\s+)?)?([a-z][a-z0-9\\s-]{1,45})$`, 'i')
    );
    if (!m) continue;

    const qty = m[1] ? Number(m[1]) : 1;
    const unit = m[2] ? m[2].toLowerCase() : null;
    const rawName = m[3]
      .replace(new RegExp(`\\b${UNIT_WORDS}\\b`, 'gi'), '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!rawName || rawName.length < 2) continue;
    // Skip pure payment or customer leftovers
    if (/^(cash|upi|gpay|phonepe|paytm|udhaar|udhar|baaki|rupaye|rs|sharma|ji|bhai|didi)$/i.test(rawName)) {
      continue;
    }

    const matched = matchCatalogItem(rawName, null, catalog);
    items.push({
      rawName,
      matchedSlug: matched?.slug ?? null,
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unit: unit ?? matched?.unit ?? null,
      overridePrice: null,
    });
  }

  return items;
}

/**
 * Local Offline / Rate-Limit Hinglish Fallback Parser.
 * Used automatically whenever Gemini returns HTTP 429, times out (>4s), or errors.
 */
export function parseWithLocalFallback(params: {
  utterance: string;
  activeDraft: DraftBill | null;
  items: ItemDoc[];
  customers: CustomerDoc[];
}): ExtractedPayload {
  const normalized = resolveSelfCorrections(normalizeHinglishNumbers(params.utterance));
  const { cashPaid, upiPaid, isUdhaar } = extractPayments(normalized);
  const customerQuery = extractCustomerQuery(params.utterance, params.customers);

  if (isEditUtterance(normalized, params.activeDraft) && params.activeDraft) {
    const editedItems = parseEditItems(normalized, params.items, params.activeDraft);
    return {
      intent: 'EDIT_BILL',
      customerQuery,
      items: editedItems,
      cashPaid,
      upiPaid,
      isUdhaar,
      confidence: 0.85,
      ambiguityNote: null,
    };
  }

  const parsedItems = parseSaleItems(normalized, params.items);
  if (parsedItems.length === 0 && cashPaid === null && upiPaid === null) {
    return {
      intent: 'NOISE',
      customerQuery: null,
      items: [],
      cashPaid: null,
      upiPaid: null,
      isUdhaar: false,
      confidence: 0.2,
      ambiguityNote: 'Could not extract items from utterance',
    };
  }

  return {
    intent: 'LOG_SALE',
    customerQuery,
    items: parsedItems,
    cashPaid,
    upiPaid,
    isUdhaar,
    confidence: 0.82,
    ambiguityNote: null,
  };
}
