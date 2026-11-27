export type ParserSource = 'gemini' | 'pre-router' | 'fallback' | 'seed';
export type ParserMode = 'gemini' | 'offline';

export type VoiceIntent =
  | 'LOG_SALE'
  | 'EDIT_BILL'
  | 'CONFIRM_BILL'
  | 'QUERY_GALLA'
  | 'QUERY_RESTOCK'
  | 'QUERY_UDHAAR'
  | 'NOISE';

export interface SupplierDoc {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  phone: string;
}

export interface ItemDoc {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  aliases: string[];
  unit: string;
  price: number;
  gstPercent: number;
  stock: number;
  reorderThreshold: number;
  supplierId: string;
}

export interface CustomerDoc {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  aliases: string[];
  phone: string;
  udhaarBalance: number;
  lastPaymentDaysAgo: number;
}

export interface DraftLineItem {
  id: string;
  itemId: string | null;
  slug: string;
  rawName: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  gstPercent: number;
  lineTotal: number;
  gstIncluded: number;
  isUnknown: boolean;
  rateMissing: boolean;
  saveToCatalog?: boolean;
  justUpdated?: boolean;
}

export interface DraftBill {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  prevUdhaar: number;
  customerQuery: string;
  ambiguousCustomers: Array<{
    id: string;
    name: string;
    phone: string;
    udhaarBalance: number;
  }>;
  items: DraftLineItem[];
  total: number;
  gstIncluded: number;
  cashPaid: number;
  upiPaid: number;
  newUdhaar: number;
  changeToReturn: number;
  isUdhaar: boolean;
  transcript: string;
  parserSource: ParserSource;
  editedFields?: string[];
}

export interface TransactionLineItem {
  itemId: string | null;
  slug: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  gstPercent: number;
  lineTotal: number;
  gstIncluded: number;
}

export interface TransactionDoc {
  id: string;
  ownerId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  transcript: string;
  items: TransactionLineItem[];
  total: number;
  gstIncluded: number;
  cashPaid: number;
  upiPaid: number;
  newUdhaar: number;
  changeToReturn: number;
  parserSource: ParserSource;
  dateKey: string;
  status: 'confirmed';
  createdAtMs?: number;
}

export interface ExtractedItem {
  rawName: string;
  matchedSlug: string | null;
  qty: number;
  unit: string | null;
  overridePrice: number | null;
}

export interface ExtractedPayload {
  intent: VoiceIntent;
  customerQuery: string | null;
  items: ExtractedItem[];
  cashPaid: number | null;
  upiPaid: number | null;
  isUdhaar: boolean;
  confidence: number;
  ambiguityNote: string | null;
}

export interface TodayStats {
  totalSales: number;
  cashTotal: number;
  upiTotal: number;
  udhaarTotal: number;
  billCount: number;
}

export interface VoiceParseRequest {
  utterance: string;
  activeDraft: DraftBill | null;
  items: ItemDoc[];
  customers: CustomerDoc[];
  suppliers: SupplierDoc[];
  todayStats: TodayStats;
  parserMode?: ParserMode;
}

export interface VoiceParseResponse {
  intent: VoiceIntent;
  parserSource: ParserSource;
  parserLabel: 'Gemini Flash-Lite' | '0-Token Local' | 'Offline Local' | 'Offline Fallback';
  draft: DraftBill | null;
  targetTab: 'counter' | 'khata' | 'galla';
  filterCustomerId: string | null;
  spokenReply: string;
  bannerMessage: string | null;
  bannerType: 'warning' | 'info' | 'success' | null;
  shouldConfirmActiveDraft: boolean;
  editedFields: string[];
  modelUsed?: string;
}
