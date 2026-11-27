import type {
  CustomerDoc,
  DraftBill,
  DraftLineItem,
  ExtractedItem,
  ItemDoc,
  ParserSource,
} from '../../shared/types.ts';
import { matchCatalogItem, matchCustomer } from './fuzzyMatch.ts';

export function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * MRP-Inclusive GST Back-Calculation (CRITICAL INDIAN KIRANA RULE):
 * gstIncluded = price - price / (1 + gstPercent / 100)
 * GST is NEVER added on top of the item price or bill total.
 */
export function calculateMrpInclusiveGst(mrpAmount: number, gstPercent: number): number {
  if (!Number.isFinite(mrpAmount) || mrpAmount <= 0 || !Number.isFinite(gstPercent) || gstPercent <= 0) {
    return 0;
  }
  return roundMoney(mrpAmount - mrpAmount / (1 + gstPercent / 100));
}

export function buildDraftLineItem(
  extracted: ExtractedItem,
  catalog: ItemDoc[],
  existingId?: string,
  justUpdated = false
): DraftLineItem {
  const matched = matchCatalogItem(extracted.rawName, extracted.matchedSlug, catalog);
  const qty = Number.isFinite(extracted.qty) && extracted.qty > 0 ? roundMoney(extracted.qty) : 1;

  if (matched) {
    const unitPrice =
      extracted.overridePrice !== null &&
      extracted.overridePrice !== undefined &&
      Number.isFinite(extracted.overridePrice) &&
      extracted.overridePrice >= 0
        ? roundMoney(extracted.overridePrice)
        : matched.price;
    const lineTotal = roundMoney(qty * unitPrice);
    const gstIncluded = calculateMrpInclusiveGst(lineTotal, matched.gstPercent);

    return {
      id: existingId ?? `line_${matched.slug}_${Math.random().toString(36).slice(2, 7)}`,
      itemId: matched.id,
      slug: matched.slug,
      rawName: extracted.rawName || matched.name,
      name: matched.name,
      qty,
      unit: matched.unit,
      unitPrice,
      gstPercent: matched.gstPercent,
      lineTotal,
      gstIncluded,
      isUnknown: false,
      rateMissing: unitPrice <= 0,
      justUpdated,
    };
  }

  // Unknown item not in catalog -> Rate Missing (₹0) unless explicit overridePrice was given
  const unitPrice =
    extracted.overridePrice !== null &&
    extracted.overridePrice !== undefined &&
    Number.isFinite(extracted.overridePrice) &&
    extracted.overridePrice > 0
      ? roundMoney(extracted.overridePrice)
      : 0;
  const lineTotal = roundMoney(qty * unitPrice);
  const cleanName = extracted.rawName
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const generatedSlug =
    extracted.rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'custom-item';

  return {
    id: existingId ?? `line_unknown_${Math.random().toString(36).slice(2, 7)}`,
    itemId: null,
    slug: generatedSlug,
    rawName: extracted.rawName,
    name: cleanName || 'Unknown Item',
    qty,
    unit: extracted.unit?.trim() || 'pc',
    unitPrice,
    gstPercent: 0,
    lineTotal,
    gstIncluded: 0,
    isUnknown: true,
    rateMissing: unitPrice <= 0,
    saveToCatalog: true,
    justUpdated,
  };
}

export function recalculateDraftTotals(draft: DraftBill): DraftBill {
  const recalculatedItems: DraftLineItem[] = draft.items.map((row) => {
    const qty = Number.isFinite(row.qty) && row.qty > 0 ? roundMoney(row.qty) : 1;
    const unitPrice = Number.isFinite(row.unitPrice) && row.unitPrice >= 0 ? roundMoney(row.unitPrice) : 0;
    const lineTotal = roundMoney(qty * unitPrice);
    const gstIncluded = calculateMrpInclusiveGst(lineTotal, row.gstPercent);
    return {
      ...row,
      qty,
      unitPrice,
      lineTotal,
      gstIncluded,
      rateMissing: unitPrice <= 0,
    };
  });

  const total = roundMoney(recalculatedItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const gstIncluded = roundMoney(recalculatedItems.reduce((sum, item) => sum + item.gstIncluded, 0));

  const cashPaid = Math.max(0, roundMoney(Number.isFinite(draft.cashPaid) ? draft.cashPaid : 0));
  const upiPaid = Math.max(0, roundMoney(Number.isFinite(draft.upiPaid) ? draft.upiPaid : 0));
  const totalPaid = roundMoney(cashPaid + upiPaid);

  const newUdhaar = roundMoney(Math.max(0, total - totalPaid));
  const changeToReturn = roundMoney(Math.max(0, totalPaid - total));

  return {
    ...draft,
    items: recalculatedItems,
    total,
    gstIncluded,
    cashPaid,
    upiPaid,
    newUdhaar,
    changeToReturn,
    isUdhaar: newUdhaar > 0,
  };
}

export function buildNewDraftBill(params: {
  customerQuery: string | null;
  extractedItems: ExtractedItem[];
  cashPaid: number | null;
  upiPaid: number | null;
  isUdhaar: boolean;
  transcript: string;
  parserSource: ParserSource;
  catalog: ItemDoc[];
  customers: CustomerDoc[];
}): DraftBill {
  const { customerQuery, extractedItems, isUdhaar, transcript, parserSource, catalog, customers } = params;

  const custMatch = matchCustomer(customerQuery, customers);
  const walkIn = customers.find((c) => c.slug === 'walk-in') ?? null;

  let customerId: string | null = null;
  let customerName = 'Walk-in Cash Customer';
  let customerPhone = '';
  let prevUdhaar = 0;
  let ambiguousCustomers: DraftBill['ambiguousCustomers'] = [];

  if (custMatch.ambiguous.length > 1) {
    ambiguousCustomers = custMatch.ambiguous.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      udhaarBalance: c.udhaarBalance,
    }));
    customerName = customerQuery?.trim() || 'Select Customer';
  } else if (custMatch.matched) {
    customerId = custMatch.matched.id;
    customerName = custMatch.matched.name;
    customerPhone = custMatch.matched.phone;
    prevUdhaar = custMatch.matched.udhaarBalance;
  } else if (walkIn) {
    customerId = walkIn.id;
    customerName = walkIn.name;
    customerPhone = walkIn.phone;
    prevUdhaar = walkIn.udhaarBalance;
  }

  // Merge duplicate matched catalog items cleanly
  const lineItems: DraftLineItem[] = [];
  for (const ext of extractedItems) {
    const built = buildDraftLineItem(ext, catalog);
    const existingIdx = lineItems.findIndex((li) => li.slug === built.slug && !li.isUnknown);
    if (existingIdx >= 0) {
      const existing = lineItems[existingIdx];
      const mergedQty = roundMoney(existing.qty + built.qty);
      const mergedPrice = ext.overridePrice !== null ? built.unitPrice : existing.unitPrice;
      lineItems[existingIdx] = {
        ...existing,
        qty: mergedQty,
        unitPrice: mergedPrice,
      };
    } else {
      lineItems.push(built);
    }
  }

  // Payment logic:
  // If user didn't mention cash, UPI, or udhaar on a Walk-in sale, default to Cash = total;
  // If user explicitly mentioned udhaar or gave partial cash/UPI, respect exact cashPaid & upiPaid.
  const subtotal = roundMoney(lineItems.reduce((sum, li) => sum + roundMoney(li.qty * li.unitPrice), 0));
  let cashPaid = params.cashPaid !== null && Number.isFinite(params.cashPaid) ? Math.max(0, params.cashPaid) : 0;
  let upiPaid = params.upiPaid !== null && Number.isFinite(params.upiPaid) ? Math.max(0, params.upiPaid) : 0;

  const noPaymentSpecified = params.cashPaid === null && params.upiPaid === null;
  if (noPaymentSpecified && !isUdhaar && customerId === walkIn?.id && ambiguousCustomers.length === 0) {
    cashPaid = subtotal;
  }

  return recalculateDraftTotals({
    customerId,
    customerName,
    customerPhone,
    prevUdhaar,
    customerQuery: customerQuery ?? '',
    ambiguousCustomers,
    items: lineItems,
    total: 0,
    gstIncluded: 0,
    cashPaid,
    upiPaid,
    newUdhaar: 0,
    changeToReturn: 0,
    isUdhaar,
    transcript,
    parserSource,
    editedFields: [],
  });
}

export function applyEditToDraftBill(params: {
  activeDraft: DraftBill;
  extractedItems: ExtractedItem[];
  customerQuery: string | null;
  cashPaid: number | null;
  upiPaid: number | null;
  isUdhaar: boolean;
  transcript: string;
  parserSource: ParserSource;
  catalog: ItemDoc[];
  customers: CustomerDoc[];
}): { draft: DraftBill; editedFields: string[] } {
  const { activeDraft, extractedItems, customerQuery, cashPaid, upiPaid, transcript, parserSource, catalog, customers } =
    params;

  const editedFields: string[] = [];
  let updatedDraft: DraftBill = {
    ...activeDraft,
    items: activeDraft.items.map((item) => ({ ...item, justUpdated: false })),
    transcript: `${activeDraft.transcript} | Edit: ${transcript}`,
    parserSource,
  };

  if (customerQuery) {
    const custMatch = matchCustomer(customerQuery, customers);
    if (custMatch.ambiguous.length > 1) {
      updatedDraft.customerId = null;
      updatedDraft.customerName = customerQuery;
      updatedDraft.ambiguousCustomers = custMatch.ambiguous.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        udhaarBalance: c.udhaarBalance,
      }));
      editedFields.push('customer');
    } else if (custMatch.matched) {
      updatedDraft.customerId = custMatch.matched.id;
      updatedDraft.customerName = custMatch.matched.name;
      updatedDraft.customerPhone = custMatch.matched.phone;
      updatedDraft.prevUdhaar = custMatch.matched.udhaarBalance;
      updatedDraft.ambiguousCustomers = [];
      editedFields.push('customer');
    }
  }

  for (const ext of extractedItems) {
    const matchedCatalog = matchCatalogItem(ext.rawName, ext.matchedSlug, catalog);
    const targetSlug = matchedCatalog?.slug ?? ext.matchedSlug ?? ext.rawName.toLowerCase();
    const existingIdx = updatedDraft.items.findIndex(
      (row) =>
        row.slug.toLowerCase() === targetSlug.toLowerCase() ||
        row.name.toLowerCase().includes(ext.rawName.toLowerCase()) ||
        (matchedCatalog && row.itemId === matchedCatalog.id)
    );

    if (existingIdx >= 0) {
      const prev = updatedDraft.items[existingIdx];
      const nextQty = ext.qty > 0 ? ext.qty : prev.qty;
      const nextPrice =
        ext.overridePrice !== null && ext.overridePrice !== undefined && ext.overridePrice >= 0
          ? ext.overridePrice
          : prev.unitPrice;
      updatedDraft.items[existingIdx] = {
        ...prev,
        qty: nextQty,
        unitPrice: nextPrice,
        justUpdated: true,
      };
      editedFields.push(`item:${prev.id}`);
    } else {
      const added = buildDraftLineItem(ext, catalog, undefined, true);
      updatedDraft.items.push(added);
      editedFields.push(`item:${added.id}`);
    }
  }

  if (cashPaid !== null && Number.isFinite(cashPaid)) {
    updatedDraft.cashPaid = Math.max(0, cashPaid);
    editedFields.push('cashPaid');
  }

  if (upiPaid !== null && Number.isFinite(upiPaid)) {
    updatedDraft.upiPaid = Math.max(0, upiPaid);
    editedFields.push('upiPaid');
  }

  const finalDraft = recalculateDraftTotals(updatedDraft);
  finalDraft.editedFields = editedFields;
  return { draft: finalDraft, editedFields };
}

export function buildSpokenBillSummary(draft: DraftBill, isEdit = false): string {
  if (draft.ambiguousCustomers.length > 1) {
    const firstNames = draft.ambiguousCustomers.map((c) => c.name.split(' ')[0]);
    const surname = draft.ambiguousCustomers[0].name.split(' ').slice(1).join(' ') || 'customer';
    return `Do ${surname} ji hain — ${firstNames.join(' ya ')}?`;
  }

  const missingRateItem = draft.items.find((i) => i.rateMissing);
  if (missingRateItem) {
    return `${missingRateItem.name} ka rate missing hai. Rate kitna lagana hai?`;
  }

  const paymentParts: string[] = [];
  if (draft.cashPaid > 0) paymentParts.push(`${draft.cashPaid} cash`);
  if (draft.upiPaid > 0) paymentParts.push(`${draft.upiPaid} UPI`);
  if (draft.newUdhaar > 0) paymentParts.push(`${draft.newUdhaar} udhaar`);
  if (draft.changeToReturn > 0) paymentParts.push(`${draft.changeToReturn} rupaye wapas dene hain`);

  const paymentSummary = paymentParts.length > 0 ? paymentParts.join(', ') : `${draft.total} cash`;

  if (isEdit) {
    return `Bill update ho gaya. Naya total ${draft.total} rupaye. ${paymentSummary}. Confirm karein?`;
  }

  return `${draft.customerName}: ${draft.items.length} ${draft.items.length === 1 ? 'item' : 'items'}, total ${draft.total} rupaye. ${paymentSummary}. Confirm karein?`;
}
