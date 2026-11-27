import type { CustomerDoc, ItemDoc } from '../../shared/types.ts';

const HINGLISH_NUMBERS: Record<string, string> = {
  aadha: '0.5',
  adha: '0.5',
  half: '0.5',
  paav: '0.25',
  pao: '0.25',
  dedh: '1.5',
  derh: '1.5',
  dhai: '2.5',
  dhaai: '2.5',
  ek: '1',
  aik: '1',
  one: '1',
  do: '2',
  two: '2',
  teen: '3',
  three: '3',
  char: '4',
  chaar: '4',
  four: '4',
  panch: '5',
  paanch: '5',
  five: '5',
  chhe: '6',
  cheh: '6',
  six: '6',
  saat: '7',
  seven: '7',
  aath: '8',
  eight: '8',
  nau: '9',
  nine: '9',
  das: '10',
  ten: '10',
  gyarah: '11',
  barah: '12',
  darjan: '12',
  dozen: '12',
  bees: '20',
  pachas: '50',
  pachaas: '50',
  sau: '100',
  so: '100',
  hazaar: '1000',
  hazar: '1000',
};

const DEVANAGARI_DIGITS: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

const DEVANAGARI_VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e',
};

const DEVANAGARI_MATRAS: Record<string, string> = {
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e',
};

const DEVANAGARI_CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'ळ': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
};

const NUKTA_MAP: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'ज': 'z', 'ड': 'r', 'ढ': 'rh', 'फ': 'f', 'य': 'y',
};

const HINGLISH_LOANWORD_FIXES: Array<[RegExp, string]> = [
  [/\bkaish\b/gi, 'cash'],
  [/\bkesh\b/gi, 'cash'],
  [/\blitar\b/gi, 'litre'],
  [/\bliter\b/gi, 'litre'],
  [/\byupiai\b/gi, 'upi'],
  [/\byupi\b/gi, 'upi'],
  [/\bjipe\b/gi, 'gpay'],
  [/\bphonpe\b/gi, 'phonepe'],
  [/\bfonpe\b/gi, 'phonepe'],
  [/\bpetiam\b/gi, 'paytm'],
  [/\bpeket\b/gi, 'packet'],
  [/\bpaiket\b/gi, 'packet'],
  [/\bmina\b/gi, 'meena'],
  [/\baanti\b/gi, 'aunty'],
  [/\banti\b/gi, 'aunty'],
  [/\bsalt\b/gi, 'salt'],
  [/\bsolt\b/gi, 'salt'],
  [/\boil\b/gi, 'oil'],
  [/\boyl\b/gi, 'oil'],
  [/\baayal\b/gi, 'oil'],
  [/\bphorchun\b/gi, 'fortune'],
  [/\bforchun\b/gi, 'fortune'],
  [/\baashirvad\b/gi, 'aashirvaad'],
  [/\bashirvad\b/gi, 'aashirvaad'],
  [/\bsarph\b/gi, 'surf'],
  [/\bsarf\b/gi, 'surf'],
  [/\bmaigi\b/gi, 'maggi'],
  [/\bkolget\b/gi, 'colgate'],
  [/\bparleji\b/gi, 'parle g'],
  [/\brupaiye\b/gi, 'rupaye'],
  [/\brupai\b/gi, 'rupaye'],
  [/\brupay\b/gi, 'rupaye'],
];

/**
 * Deterministically transliterates Devanagari (hi-IN Web Speech API output)
 * into clean Roman/Hinglish text so customer names, items, and commands match reliably.
 */
export function transliterateDevanagariToLatin(input: string): string {
  if (!/[\u0900-\u097F]/.test(input)) {
    return input;
  }

  let out = '';
  const chars = Array.from(input);

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (DEVANAGARI_DIGITS[ch]) {
      out += DEVANAGARI_DIGITS[ch];
      continue;
    }

    if (DEVANAGARI_VOWELS[ch]) {
      out += DEVANAGARI_VOWELS[ch];
      continue;
    }

    if (DEVANAGARI_CONSONANTS[ch]) {
      let base = DEVANAGARI_CONSONANTS[ch];
      // Handle nukta (़) immediately following consonant
      if (chars[i + 1] === '़') {
        base = NUKTA_MAP[ch] ?? base;
        i++;
      }

      const next = chars[i + 1];
      if (next === '्') {
        // Virama / halant suppresses inherent 'a'
        out += base;
        i++;
      } else if (next && DEVANAGARI_MATRAS[next]) {
        out += base + DEVANAGARI_MATRAS[next];
        i++;
      } else {
        // Suppress trailing inherent schwa at end of word (e.g., राजेश -> rajesh, तेल -> tel)
        const isWordEnd =
          !next ||
          !/[\u0900-\u097F]/.test(next) ||
          next === '।' ||
          next === '॥';
        const isFollowedByNasalAtEnd =
          (next === 'ं' || next === 'ँ') &&
          (!chars[i + 2] || !/[\u0900-\u097F]/.test(chars[i + 2]));

        out += isWordEnd && !isFollowedByNasalAtEnd ? base : `${base}a`;
      }
      continue;
    }

    if (ch === 'ं' || ch === 'ँ') {
      const next = chars[i + 1];
      const nextBase = next ? DEVANAGARI_CONSONANTS[next] : '';
      out += nextBase && /^[pbm]/.test(nextBase) ? 'm' : 'n';
      continue;
    }

    if (ch === 'ः') {
      out += 'h';
      continue;
    }

    if (ch === '।' || ch === '॥') {
      out += ' ';
      continue;
    }

    out += ch;
  }

  let normalized = out.replace(/\s+/g, ' ').trim();
  for (const [pattern, replacement] of HINGLISH_LOANWORD_FIXES) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

/**
 * Normalizes spoken Hinglish number phrases ("dhai sau" -> "250", "panch kilo" -> "5 kilo").
 */
export function normalizeHinglishNumbers(input: string): string {
  let text = transliterateDevanagariToLatin(input)
    .toLowerCase()
    // Convert line breaks (with optional bullets like "-", "*", "•", "–", "—" or numbered lists like "1." / "1)") into comma separators
    .replace(/\r?\n+\s*(?:[-*•–—]+\s*|\d+[.)]\s+)?/g, ' , ')
    // Strip any leading bullet or list marker at start of input
    .replace(/^\s*(?:[-*•–—]+\s*|\d+[.)]\s+)/, '')
    // Convert colons and semicolons (e.g. "Rajesh Sharma ko:") into comma separators
    .replace(/[:;]+/g, ' , ')
    // Convert spaced dash/bullet separators (" - ", " • ", " — ") into commas while preserving intra-word hyphens like "parle-g"
    .replace(/\s+[-*•–—]+\s+/g, ' , ')
    // Separate attached metric units like "5kg" -> "5 kg", "2l" -> "2 l"
    .replace(
      /\b(\d+(?:\.\d+)?)(kg|kgs|kilo|g|gm|gms|l|ltr|litre|liter|litres|liters|ml|pkt|pkts|pc|pcs)\b/gi,
      '$1 $2'
    )
    .replace(/₹/g, ' rs ')
    .replace(/,/g, ' , ')
    // Preserve decimal points between digits (e.g. "1.5"), strip other sentence punctuation
    .replace(/(?<!\d)\.(?!\d)|[!?।]+/g, ' ')
    .replace(/(?:\s*,\s*)+/g, ' , ')
    .replace(/^\s*,\s*|\s*,\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Compound hundreds like "dhai sau" = 250, "dedh sau" = 150, "do sau" = 200, "teen sau" = 300
  text = text.replace(/\b(dhai|dhaai)\s+(sau|so)\b/g, '250');
  text = text.replace(/\b(dedh|derh)\s+(sau|so)\b/g, '150');
  text = text.replace(/\b(ek|do|teen|char|chaar|panch|paanch|chhe|saat|aath|nau)\s+(sau|so)\b/g, (_, mult: string) => {
    const val = Number(HINGLISH_NUMBERS[mult] ?? 1);
    return String(val * 100);
  });
  text = text.replace(/\b(ek|do|teen|char|chaar|panch|paanch)\s+(hazaar|hazar)\b/g, (_, mult: string) => {
    const val = Number(HINGLISH_NUMBERS[mult] ?? 1);
    return String(val * 1000);
  });

  // Replace standalone Hinglish number words carefully (avoid replacing "so" unless preceded/followed by unit/currency)
  const tokens = text.split(' ');
  const normalized = tokens.map((tok, idx) => {
    if (tok === 'so') {
      const next = tokens[idx + 1] ?? '';
      if (/^(rupay|rupaye|rs|cash|upi|gpay|phonepe|baaki|udhaar|diya|diye|kiya)/.test(next)) {
        return '100';
      }
      return tok;
    }
    if (tok === 'do') {
      // Avoid converting verb "kar do" or "bhej do" or "de do"
      const prev = tokens[idx - 1] ?? '';
      if (/^(kar|bhej|de|likh|bata|rakh|hata|nikal|joda|jod)$/.test(prev)) {
        return tok;
      }
    }
    return HINGLISH_NUMBERS[tok] ?? tok;
  });

  return normalized.join(' ');
}

export function levenshteinDistance(a: string, b: string): number {
  const s = a.toLowerCase().trim();
  const t = b.toLowerCase().trim();
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const dp: number[] = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const temp = dp[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[t.length];
}

export function levenshteinSimilarity(a: string, b: string): number {
  const s = a.toLowerCase().trim();
  const t = b.toLowerCase().trim();
  if (!s || !t) return 0;
  const maxLen = Math.max(s.length, t.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(s, t) / maxLen;
}

/**
 * Resolves a spoken item name or slug against the catalog using exact, alias, token, and Levenshtein >= 0.72 fuzzy matching.
 */
export function matchCatalogItem(
  rawQuery: string,
  slugHint: string | null | undefined,
  catalog: ItemDoc[],
  threshold = 0.72
): ItemDoc | null {
  const cleanHint = transliterateDevanagariToLatin(slugHint ?? '').toLowerCase().trim();
  if (cleanHint) {
    const bySlug = catalog.find((it) => it.slug.toLowerCase() === cleanHint);
    if (bySlug) return bySlug;
  }

  const cleanQuery = transliterateDevanagariToLatin(rawQuery)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanQuery) return null;

  // 1. Exact match on slug, name, or alias
  for (const item of catalog) {
    const candidates = [item.slug, item.name, ...item.aliases].map((c) => c.toLowerCase().trim());
    if (candidates.some((c) => c === cleanQuery)) {
      return item;
    }
  }

  // 2. Substring / multi-token match & Levenshtein similarity >= 0.72
  const queryWords = cleanQuery.split(' ').filter((w) => w.length >= 2);
  let bestItem: ItemDoc | null = null;
  let bestScore = 0;

  for (const item of catalog) {
    const candidates = [item.slug, item.name, ...item.aliases].map((c) => c.toLowerCase().trim());
    for (const cand of candidates) {
      // Whole phrase similarity
      let score = levenshteinSimilarity(cleanQuery, cand);

      // Direct word containment for brand + generic like "Aashirvaad atta" or "chota surf"
      if (cleanQuery.includes(cand) && cand.length >= 3) {
        score = Math.max(score, 0.92);
      } else if (cand.includes(cleanQuery) && cleanQuery.length >= 3) {
        score = Math.max(score, 0.88);
      }

      // Per-word fuzzy match (e.g., "Ashirwad aata" vs "Aashirvaad Atta" or "aata" vs "atta")
      const candWords = cand.split(/\s+/).filter((w) => w.length >= 2);
      for (const qw of queryWords) {
        for (const cw of candWords) {
          const wSim = levenshteinSimilarity(qw, cw);
          if (wSim >= threshold) {
            // Boost slightly if both words are distinctive (>= 3 chars)
            const weighted = qw.length >= 3 && cw.length >= 3 ? wSim : wSim * 0.9;
            if (weighted > score) {
              score = weighted;
            }
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }
  }

  return bestScore >= threshold ? bestItem : null;
}

export interface CustomerMatchResult {
  matched: CustomerDoc | null;
  ambiguous: CustomerDoc[];
}

/**
 * Resolves a spoken customer query (Latin or Devanagari, e.g. "राजेश शर्मा" or "Sharma ji").
 */
export function matchCustomer(query: string | null | undefined, customers: CustomerDoc[]): CustomerMatchResult {
  const transliterated = transliterateDevanagariToLatin(query ?? '');
  const clean = transliterated
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) {
    return { matched: null, ambiguous: [] };
  }

  // Strip trailing postpositions ("ke khate mein", "ko", "ka")
  const stripped = clean
    .replace(/\b(ke khate mein|ke khate me|ke khata mein|ka hisaab|ka baaki|ka udhaar|ka|ke|ki|ko)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const searchTerm = stripped || clean;

  // 1. Exact full name match (highest priority: "Rajesh Sharma" beats alias "sharma")
  const exactName = customers.filter((c) => c.name.toLowerCase() === searchTerm);
  if (exactName.length === 1) {
    return { matched: exactName[0], ambiguous: [] };
  }

  // 2. Check if full name is contained inside searchTerm (e.g. "rajesh sharma ji")
  const fullNameContained = customers.filter((c) => searchTerm.includes(c.name.toLowerCase()));
  if (fullNameContained.length === 1) {
    return { matched: fullNameContained[0], ambiguous: [] };
  }

  // 3. Exact alias match (e.g. "sharma ji" matches BOTH Rajesh Sharma and Vikram Sharma!)
  const exactAliasMatches = customers.filter((c) =>
    c.aliases.some((a) => a.toLowerCase() === searchTerm || searchTerm.includes(a.toLowerCase()))
  );

  // If query has a specific first name ("rajesh sharma"), narrow down alias matches
  if (exactAliasMatches.length > 1) {
    const narrowed = exactAliasMatches.filter((c) => {
      const firstWord = c.name.toLowerCase().split(' ')[0];
      return searchTerm.includes(firstWord) || levenshteinSimilarity(searchTerm, c.name.toLowerCase()) >= 0.78;
    });
    if (narrowed.length === 1) {
      return { matched: narrowed[0], ambiguous: [] };
    }
    return { matched: null, ambiguous: exactAliasMatches };
  }
  if (exactAliasMatches.length === 1) {
    return { matched: exactAliasMatches[0], ambiguous: [] };
  }

  // 4. Fuzzy match across customer names and aliases (Levenshtein >= 0.72)
  const coreTerm = searchTerm.replace(/\b(ji|bhai|didi|aunty|uncle)\b/g, '').trim();
  const scored: Array<{ customer: CustomerDoc; score: number }> = [];

  for (const c of customers) {
    if (c.slug === 'walk-in' && !/\b(cash|walk|walk-in|customer)\b/.test(searchTerm)) {
      continue;
    }
    let best = levenshteinSimilarity(searchTerm, c.name.toLowerCase());
    if (coreTerm) {
      for (const part of c.name.toLowerCase().split(' ')) {
        best = Math.max(best, levenshteinSimilarity(coreTerm, part));
      }
      for (const alias of c.aliases) {
        best = Math.max(best, levenshteinSimilarity(searchTerm, alias.toLowerCase()));
        best = Math.max(best, levenshteinSimilarity(coreTerm, alias.toLowerCase()));
      }
    }
    if (best >= 0.72) {
      scored.push({ customer: c, score: best });
    }
  }

  if (scored.length === 0) {
    return { matched: null, ambiguous: [] };
  }

  scored.sort((a, b) => b.score - a.score);
  const topScore = scored[0].score;
  const nearTies = scored.filter((s) => topScore - s.score <= 0.08).map((s) => s.customer);

  if (nearTies.length > 1) {
    return { matched: null, ambiguous: nearTies };
  }

  return { matched: scored[0].customer, ambiguous: [] };
}

/**
 * Resolves mid-sentence Hinglish quantity/value self-corrections like
 * "5 nahi 3 kilo atta" -> "3 kilo atta", "160 sorry 155" -> "155".
 */
export function resolveSelfCorrections(normalizedText: string): string {
  // Pattern: "<oldNum> (nahi|sorry|actually|matlab|nhi) <newNum>" -> "<newNum>"
  return normalizedText.replace(
    /\b\d+(?:\.\d+)?\s*(?:kilo|kg|litre|liter|l|packet|pkt|piece|pc|rupaye|rupay|rs)?\s*(?:nahi|nhi|sorry|actually|matlab)\s+(\d+(?:\.\d+)?)/gi,
    '$1'
  );
}
