import type { VoiceIntent } from '../../shared/types.ts';
import { levenshteinSimilarity, transliterateDevanagariToLatin } from './fuzzyMatch.ts';

export type OfflineCommandIntent =
  | 'CONFIRM_BILL'
  | 'CANCEL_BILL'
  | 'ORDER_RESTOCK'
  | 'QUERY_GALLA'
  | 'QUERY_RESTOCK'
  | 'QUERY_UDHAAR';

export interface IntentMatchResult {
  intent: OfflineCommandIntent;
  strategy: 'trie-exact' | 'trie-subphrase' | 'levenshtein';
  matchedPhrase: string;
  matchedSpanText: string;
  score: number;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  intent?: OfflineCommandIntent;
  phrase?: string;
}

const CONFIRM_POLITE_FILLERS =
  /\b(ji|bhai|bhaiya|sir|please|pls|bill|bil|receipt|whatsapp|pe|par|ko|ye|yeh|isko|ab|abhi)\b/gi;

const CANCEL_POLITE_FILLERS =
  /\b(ji|bhai|bhaiya|sir|please|pls|bill|bil|draft|order|restock|ye|yeh|isko|ab|abhi|pura|poora|sab)\b/gi;

const ORDER_RESTOCK_POLITE_FILLERS =
  /\b(ji|bhai|bhaiya|sir|please|pls|ab|abhi|ye|yeh|kam|low|stock|wala|wale|items|item|samaan|saman|stock)\b/gi;

const CONFIRM_DISQUALIFY =
  /\d|\b(nahi|nhi|no|na|mat|cancel|mangwa|mangwana|mangva|mangvana|mangwao|restock|supplier|order|rupaye|rupay|rs|kilo|kg|litre|liter|packet|pkt|cash|upi|gpay|phonepe|paytm|udhaar|udhar|change|badal|hatao|hatado|remove|add|jodo|jod|aur|rate|price)\b/i;

const CANCEL_DISQUALIFY =
  /\d|\b(kilo|kg|litre|liter|packet|pkt|piece|pc|cash|upi|gpay|phonepe|paytm|rupaye|rupay|rs|atta|aata|tel|oil|namak|salt|chawal|rice|dal|doodh|milk|cheeni|sugar|chai|tea|maggi|parle|surf|colgate|pyaaz|onion|aloo|potato|anda|egg|eggs)\b/i;

const ORDER_RESTOCK_DISQUALIFY =
  /\d|\b(nahi|nhi|no|na|mat|cancel|kya|kitna|kilo|kg|litre|liter|packet|pkt|piece|pc|cash|upi|gpay|phonepe|paytm|rupaye|rupay|rs|hata|hatao|hatado|remove|atta|aata|tel|oil|namak|salt|chawal|rice|dal|doodh|milk|cheeni|sugar|chai|tea|maggi|maggie|parle|surf|colgate|pyaaz|onion|aloo|potato|anda|egg|eggs|aashirvaad|ashirwad|fortune|tata|amul|haldiram|britannia)\b/i;

const INTENT_PHRASES: Record<OfflineCommandIntent, string[]> = {
  CONFIRM_BILL: [
    'ha bhej do',
    'haa bhej do',
    'haan bhej do',
    'han bhej do',
    'ha bhejdo',
    'haan bhejdo',
    'ha bhej de',
    'haan bhej de',
    'ha bhej dijiye',
    'haan bhej dijiye',
    'ha bhejo',
    'haan bhejo',
    'bhej do',
    'bhejdo',
    'bhej de',
    'bhej dijiye',
    'bhej dena',
    'bhejo',
    'ha save kar do',
    'haan save kar do',
    'ha save karo',
    'save kar do',
    'save kardo',
    'save karo',
    'save it',
    'save',
    'ha confirm kar do',
    'haan confirm kar do',
    'ha confirm',
    'haan confirm',
    'confirm kar do',
    'confirm kardo',
    'confirm karo',
    'confirm',
    'ha kar do',
    'haan kar do',
    'kar do',
    'kardo',
    'ok bhej do',
    'okay bhej do',
    'theek hai bhej do',
    'thik hai bhej do',
    'sahi hai bhej do',
    'yes send',
    'yes confirm',
    'send kar do',
    'send karo',
    'send it',
    'send',
    'lock kar do',
    'lock karo',
    'final kar do',
    'final karo',
    'done kar do',
    'haan',
    'haa',
    'ha',
    'han',
    'yes',
    'yep',
    'ok',
    'okay',
    'theek hai',
    'thik hai',
    'sahi hai',
    'pakka',
    'paka',
    'bilkul',
    'done',
  ],
  CANCEL_BILL: [
    'cancel kar do',
    'cancel kardo',
    'cancel karo',
    'cancel kar de',
    'cancel kar dijiye',
    'cancel it',
    'cancel',
    'mat bhejo',
    'mat banao',
    'mat karo',
    'mat mangwao',
    'nahi mangwana',
    'nahi bhejna',
    'nahi bhejo',
    'nahi bhej do',
    'nahi chahiye',
    'na bhejo',
    'rehne do',
    'rehn do',
    'chhod do',
    'chhodo',
    'hata do',
    'hatado',
    'hatao',
    'clear kar do',
    'clear karo',
    'delete kar do',
    'delete karo',
    'discard',
    'radd kar do',
    'radd karo',
    'band kar do',
    'band karo',
  ],
  ORDER_RESTOCK: [
    'haan mangwa lo',
    'ha mangwa lo',
    'haa mangwa lo',
    'han mangwa lo',
    'haan mangwalo',
    'ha mangwalo',
    'haan mangva lo',
    'ha mangva lo',
    'haan mangwa do',
    'ha mangwa do',
    'haan mangwa dijiye',
    'ha mangwa dijiye',
    'mangwa lo',
    'mangwalo',
    'mangva lo',
    'mangwa do',
    'mangwa dijiye',
    'mangwao',
    'sab mangwa lo',
    'sab mangwa do',
    'sab order kar do',
    'sab order karo',
    'haan order kar do',
    'ha order kar do',
    'haan order karo',
    'ha order karo',
    'order kar do',
    'order kardo',
    'order karo',
    'order bana do',
    'order banao',
    'order bhej do',
    'restock kar do',
    'restock kardo',
    'restock karo',
    'restock order banao',
    'restock draft banao',
    'supplier ko bhej do',
    'supplier ko order kar do',
    'supplier ko order bhej do',
    'supplier order banao',
  ],
  QUERY_GALLA: [
    'aaj ka galla batao',
    'aaj ka galla',
    'galla batao',
    'galla dikhao',
    'galla',
    'aaj ka hisaab batao',
    'aaj ka hisaab',
    'aaj ka hisab',
    'aj ka hisab',
    'din bhar ka hisaab',
    'din bhar ka hisab',
    'aaj ki bikri',
    'kitni bikri hui',
    'kitni bikri',
    'bikri batao',
    'bikri',
    'today sales',
    'today sale',
    'day end',
    'cash box',
  ],
  QUERY_RESTOCK: [
    'aaj kya mangwana hai',
    'kya mangwana hai',
    'kya mangwana',
    'kya mangvana hai',
    'kya mangvana',
    'mangwana hai',
    'mangvana hai',
    'samaan mangwana',
    'kya khatam hai',
    'kya khatam',
    'kam stock',
    'low stock',
    'stock check',
    'restock',
    'order list',
  ],
  QUERY_UDHAAR: [
    'kitna baaki hai',
    'kitna baki hai',
    'kitna baaki',
    'kitna baki',
    'udhaar dikhao',
    'udhar dikhao',
    'purana udhaar',
    'purana udhar',
    'khata dikhao',
    'balance batao',
    'kitna udhaar hai',
    'kitna udhaar',
    'kitna udhar',
    'kitna dena hai',
    'baaki hai',
    'baki hai',
  ],
};

function tokenizeNormalized(text: string): string[] {
  return transliterateDevanagariToLatin(text)
    .toLowerCase()
    .replace(/[.,!?।]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Lightweight word-level Trie + Levenshtein fuzzy matcher for offline billing intents.
 */
export class OfflineIntentTrie {
  private readonly root: TrieNode = { children: new Map() };
  private readonly entriesByIntent: Record<OfflineCommandIntent, Array<{ phrase: string; tokens: string[] }>> = {
    CONFIRM_BILL: [],
    CANCEL_BILL: [],
    ORDER_RESTOCK: [],
    QUERY_GALLA: [],
    QUERY_RESTOCK: [],
    QUERY_UDHAAR: [],
  };

  constructor(phraseMap: Record<OfflineCommandIntent, string[]>) {
    for (const [intent, phrases] of Object.entries(phraseMap) as Array<[OfflineCommandIntent, string[]]>) {
      for (const rawPhrase of phrases) {
        this.insert(rawPhrase, intent);
      }
    }
  }

  insert(phrase: string, intent: OfflineCommandIntent): void {
    const tokens = tokenizeNormalized(phrase);
    if (tokens.length === 0) return;

    const normalizedPhrase = tokens.join(' ');
    let node = this.root;
    for (const token of tokens) {
      let next = node.children.get(token);
      if (!next) {
        next = { children: new Map() };
        node.children.set(token, next);
      }
      node = next;
    }
    node.intent = intent;
    node.phrase = normalizedPhrase;
    this.entriesByIntent[intent].push({ phrase: normalizedPhrase, tokens });
  }

  /**
   * Exact full-utterance O(L) Trie lookup.
   */
  matchExact(tokens: string[], allowedIntents?: OfflineCommandIntent[]): IntentMatchResult | null {
    if (tokens.length === 0) return null;
    let node: TrieNode | undefined = this.root;
    for (const token of tokens) {
      node = node.children.get(token);
      if (!node) return null;
    }
    if (node.intent && node.phrase && (!allowedIntents || allowedIntents.includes(node.intent))) {
      return {
        intent: node.intent,
        strategy: 'trie-exact',
        matchedPhrase: node.phrase,
        matchedSpanText: tokens.join(' '),
        score: 1,
      };
    }
    return null;
  }

  /**
   * Contiguous sub-phrase scan using the Trie (picks longest matching phrase).
   */
  scanSubphrases(tokens: string[], allowedIntents: OfflineCommandIntent[]): IntentMatchResult | null {
    let best: IntentMatchResult | null = null;

    for (let start = 0; start < tokens.length; start++) {
      let node: TrieNode | undefined = this.root;
      for (let end = start; end < tokens.length; end++) {
        node = node.children.get(tokens[end]);
        if (!node) break;
        if (node.intent && node.phrase && allowedIntents.includes(node.intent)) {
          const spanText = tokens.slice(start, end + 1).join(' ');
          if (!best || spanText.length > best.matchedSpanText.length) {
            best = {
              intent: node.intent,
              strategy: 'trie-subphrase',
              matchedPhrase: node.phrase,
              matchedSpanText: spanText,
              score: 1,
            };
          }
        }
      }
    }

    return best;
  }

  /**
   * Levenshtein fuzzy matcher over full utterances and sliding n-gram windows
   * to catch offline speech/dictation typos (e.g. "ha behj do", "aaj ka gala batao").
   */
  matchFuzzy(
    tokens: string[],
    allowedIntents: OfflineCommandIntent[],
    minSimilarity = 0.78
  ): IntentMatchResult | null {
    if (tokens.length === 0) return null;

    let best: IntentMatchResult | null = null;
    const fullText = tokens.join(' ');

    for (const intent of allowedIntents) {
      for (const entry of this.entriesByIntent[intent]) {
        // Short phrases (< 5 chars like "ha", "ok", "yes") must match via exact Trie only,
        // preventing false positives from short negations like "na" or "no".
        if (entry.phrase.length < 5) continue;

        if (intent === 'CONFIRM_BILL' || intent === 'CANCEL_BILL' || intent === 'ORDER_RESTOCK') {
          // Command intents must match the whole core utterance (never a fragment of a sale)
          if (Math.abs(tokens.length - entry.tokens.length) > 1) continue;
          const sim = levenshteinSimilarity(fullText, entry.phrase);
          if (sim >= minSimilarity && (!best || sim > best.score)) {
            best = {
              intent,
              strategy: 'levenshtein',
              matchedPhrase: entry.phrase,
              matchedSpanText: fullText,
              score: sim,
            };
          }
          continue;
        }

        // For query intents (galla/restock/udhaar), evaluate sliding n-gram windows
        const targetLen = entry.tokens.length;
        const minWin = Math.max(1, targetLen - 1);
        const maxWin = Math.min(tokens.length, targetLen + 1);

        for (let winSize = minWin; winSize <= maxWin; winSize++) {
          for (let start = 0; start <= tokens.length - winSize; start++) {
            const windowText = tokens.slice(start, start + winSize).join(' ');
            if (windowText.length < 4) continue;
            const sim = levenshteinSimilarity(windowText, entry.phrase);
            if (sim >= minSimilarity && (!best || sim > best.score)) {
              best = {
                intent,
                strategy: 'levenshtein',
                matchedPhrase: entry.phrase,
                matchedSpanText: windowText,
                score: sim,
              };
            }
          }
        }
      }
    }

    return best;
  }
}

export const OFFLINE_INTENT_TRIE = new OfflineIntentTrie(INTENT_PHRASES);

/**
 * Matches offline billing command intents using the Trie (O(L) exact & sub-phrase)
 * with Levenshtein fuzzy fallback for ASR/Wispr Flow misspellings.
 */
export function matchOfflineBillingIntent(rawUtterance: string): IntentMatchResult | null {
  const tokens = tokenizeNormalized(rawUtterance);
  if (tokens.length === 0) return null;

  const clean = tokens.join(' ');

  // 1. Check CANCEL_BILL first (strictly guarded against item-level edits/sales)
  if (!CANCEL_DISQUALIFY.test(clean)) {
    const strippedCancel = clean
      .replace(CANCEL_POLITE_FILLERS, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (strippedCancel) {
      const cancelTokens = strippedCancel.split(' ');
      if (cancelTokens.length <= 5) {
        const exactCancel = OFFLINE_INTENT_TRIE.matchExact(cancelTokens, ['CANCEL_BILL']);
        if (exactCancel) return exactCancel;

        const fuzzyCancel = OFFLINE_INTENT_TRIE.matchFuzzy(cancelTokens, ['CANCEL_BILL'], 0.78);
        if (fuzzyCancel) return fuzzyCancel;
      }
    }
  }

  // 2. Check quick ORDER_RESTOCK replies (e.g. "haan mangwa lo", "order kar do", "sab mangwa lo")
  // Strictly guarded against specific item names & quantities so itemized orders go to the itemized parser.
  if (!ORDER_RESTOCK_DISQUALIFY.test(clean)) {
    const strippedRestock = clean
      .replace(ORDER_RESTOCK_POLITE_FILLERS, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (strippedRestock) {
      const restockTokens = strippedRestock.split(' ');
      if (restockTokens.length <= 6) {
        const exactRestock = OFFLINE_INTENT_TRIE.matchExact(restockTokens, ['ORDER_RESTOCK']);
        if (exactRestock) return exactRestock;

        const fuzzyRestock = OFFLINE_INTENT_TRIE.matchFuzzy(restockTokens, ['ORDER_RESTOCK'], 0.8);
        if (fuzzyRestock) return fuzzyRestock;
      }
    }
  }

  // 3. Check CONFIRM_BILL safely (strictly guard against numbers, negations, restock, and item/edit terms)
  if (!CONFIRM_DISQUALIFY.test(clean)) {
    const strippedConfirm = clean
      .replace(CONFIRM_POLITE_FILLERS, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (strippedConfirm) {
      const confirmTokens = strippedConfirm.split(' ');
      if (confirmTokens.length <= 6) {
        const exactConfirm = OFFLINE_INTENT_TRIE.matchExact(confirmTokens, ['CONFIRM_BILL']);
        if (exactConfirm) return exactConfirm;

        // Also catch compositional confirm combos like "ji haan pakka bhej do"
        const subConfirm = OFFLINE_INTENT_TRIE.scanSubphrases(confirmTokens, ['CONFIRM_BILL']);
        if (subConfirm && confirmTokens.every((t) => OFFLINE_INTENT_TRIE.matchExact([t], ['CONFIRM_BILL']) || subConfirm.matchedSpanText.includes(t))) {
          return {
            ...subConfirm,
            matchedSpanText: strippedConfirm,
          };
        }

        const fuzzyConfirm = OFFLINE_INTENT_TRIE.matchFuzzy(confirmTokens, ['CONFIRM_BILL'], 0.78);
        if (fuzzyConfirm) return fuzzyConfirm;
      }
    }
  }

  // 4. Guard against sale/edit/itemized-restock utterances before query intent matching
  const hasSaleOrItemizedOrderSignal =
    /\b\d+(?:\.\d+)?\s*(?:kilo|kg|litre|liter|l|packet|pkt|piece|pc|cash|upi|gpay|phonepe|paytm|rupaye|rupay|rs)\b/i.test(
      clean
    ) ||
    /\b(?:likho|likh\s+do|ke\s+khate\s+mein|ke\s+khate\s+me)\b/i.test(clean) ||
    (/\b(?:mangwa|mangwana|mangva|mangwao|order|restock)\b/i.test(clean) &&
      /\b(?:atta|aata|tel|oil|namak|salt|chawal|rice|dal|doodh|milk|cheeni|sugar|chai|tea|maggi|maggie|parle|surf|colgate|pyaaz|onion|aloo|potato|anda|egg|eggs)\b/i.test(
        clean
      ));
  if (hasSaleOrItemizedOrderSignal) {
    return null;
  }

  // 5. Check deterministic query intents (GALLA, RESTOCK, UDHAAR) via Trie exact/sub-phrase first
  const queryIntents: OfflineCommandIntent[] = ['QUERY_GALLA', 'QUERY_RESTOCK', 'QUERY_UDHAAR'];
  const exactQuery = OFFLINE_INTENT_TRIE.matchExact(tokens, queryIntents);
  if (exactQuery) return exactQuery;

  const subQuery = OFFLINE_INTENT_TRIE.scanSubphrases(tokens, queryIntents);
  if (subQuery) return subQuery;

  // 6. Levenshtein fuzzy fallback for minor misspellings in query commands (e.g. "aaj ka gala batao")
  return OFFLINE_INTENT_TRIE.matchFuzzy(tokens, queryIntents, 0.8);
}

export function isOfflineCommandIntent(intent: VoiceIntent): intent is OfflineCommandIntent {
  return (
    intent === 'CONFIRM_BILL' ||
    intent === 'CANCEL_BILL' ||
    intent === 'ORDER_RESTOCK' ||
    intent === 'QUERY_GALLA' ||
    intent === 'QUERY_RESTOCK' ||
    intent === 'QUERY_UDHAAR'
  );
}
