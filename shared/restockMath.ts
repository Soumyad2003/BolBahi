import type {
  ExtractedItem,
  ItemDoc,
  LowStockAlertItem,
  ParserSource,
  RestockDraft,
  RestockDraftLine,
  SupplierDoc,
} from './types.ts';

function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Smart default order quantity formula:
 * Brings inventory back to 2x reorderThreshold, guaranteeing at least 1x reorderThreshold (min 1).
 */
export function computeSuggestedRestockQty(currentStock: number, reorderThreshold: number): number {
  const safeStock = Math.max(0, Number.isFinite(currentStock) ? currentStock : 0);
  const safeThreshold = Math.max(1, Number.isFinite(reorderThreshold) ? reorderThreshold : 5);
  const rawTarget = Math.max(safeThreshold * 2 - safeStock, safeThreshold);
  return Math.max(1, Math.ceil(rawTarget));
}

/**
 * Computes projected stock after a draft bill line is confirmed (pure, non-blocking).
 */
export function getProjectedStockAfterDraft(
  item: Pick<ItemDoc, 'stock' | 'reorderThreshold'>,
  draftQty: number
): {
  projectedStock: number;
  isLowStock: boolean;
  dropsBelowThreshold: boolean;
} {
  const safeQty = Math.max(0, Number.isFinite(draftQty) ? draftQty : 0);
  const projectedStock = Math.max(0, roundQty(item.stock - safeQty));
  const isLowStock = projectedStock <= item.reorderThreshold;
  const dropsBelowThreshold = item.stock > item.reorderThreshold && isLowStock;
  return { projectedStock, isLowStock, dropsBelowThreshold };
}

/**
 * Given sold lines from a confirmed bill and the pre-sale catalog items,
 * returns all sold catalog items whose remaining stock is at or below reorderThreshold.
 */
export function computeLowStockAlertsAfterSale(
  soldLines: Array<{ itemId: string | null; qty: number }>,
  catalogItems: ItemDoc[]
): LowStockAlertItem[] {
  const qtyByItemId = new Map<string, number>();
  for (const line of soldLines) {
    if (!line.itemId) continue;
    const prev = qtyByItemId.get(line.itemId) ?? 0;
    qtyByItemId.set(line.itemId, roundQty(prev + Math.max(0, line.qty)));
  }

  const alerts: LowStockAlertItem[] = [];
  for (const [itemId, totalSold] of qtyByItemId.entries()) {
    if (totalSold <= 0) continue;
    const catalogItem = catalogItems.find((ci) => ci.id === itemId);
    if (!catalogItem) continue;

    const remainingStock = Math.max(0, roundQty(catalogItem.stock - totalSold));
    if (remainingStock <= catalogItem.reorderThreshold) {
      alerts.push({
        itemId: catalogItem.id,
        slug: catalogItem.slug,
        name: catalogItem.name,
        unit: catalogItem.unit,
        previousStock: catalogItem.stock,
        remainingStock,
        reorderThreshold: catalogItem.reorderThreshold,
        suggestedOrderQty: computeSuggestedRestockQty(remainingStock, catalogItem.reorderThreshold),
        supplierId: catalogItem.supplierId,
      });
    }
  }

  return alerts;
}

/**
 * Builds a concise Hinglish voice heads-up appended after bill confirmation.
 */
export function buildPostConfirmLowStockSpeech(lowStockItems: LowStockAlertItem[]): string {
  if (lowStockItems.length === 0) return '';
  const summary = lowStockItems
    .slice(0, 3)
    .map((it) => `${it.name} ${it.remainingStock} ${it.unit}`)
    .join(', ');
  const extra = lowStockItems.length > 3 ? ` aur ${lowStockItems.length - 3} aur items` : '';
  return `Dhyan dein: ${summary}${extra} kam ho gaye hain. Kya mangwa loon?`;
}

/**
 * Creates a RestockDraft from a list of LowStockAlertItem entries using smart defaults.
 */
export function buildRestockDraftFromAlerts(
  alerts: LowStockAlertItem[],
  sourceTranscript: string,
  parserSource: ParserSource
): RestockDraft | null {
  if (alerts.length === 0) return null;
  const lines: RestockDraftLine[] = alerts.map((a) => ({
    itemId: a.itemId,
    slug: a.slug,
    name: a.name,
    unit: a.unit,
    currentStock: a.remainingStock,
    reorderThreshold: a.reorderThreshold,
    orderQty: a.suggestedOrderQty,
    supplierId: a.supplierId,
  }));

  return {
    items: lines,
    sourceTranscript,
    parserSource,
    sentSupplierIds: [],
    createdAtMs: Date.now(),
  };
}

/**
 * Creates a RestockDraft from catalog items currently at or below threshold.
 */
export function buildRestockDraftFromCatalogLowStock(
  catalogItems: ItemDoc[],
  sourceTranscript: string,
  parserSource: ParserSource
): RestockDraft | null {
  const lowItems = catalogItems.filter((it) => it.stock <= it.reorderThreshold);
  if (lowItems.length === 0) return null;

  return {
    items: lowItems.map((it) => ({
      itemId: it.id,
      slug: it.slug,
      name: it.name,
      unit: it.unit,
      currentStock: it.stock,
      reorderThreshold: it.reorderThreshold,
      orderQty: computeSuggestedRestockQty(it.stock, it.reorderThreshold),
      supplierId: it.supplierId,
    })),
    sourceTranscript,
    parserSource,
    sentSupplierIds: [],
    createdAtMs: Date.now(),
  };
}

export interface SupplierRestockGroup {
  groupKey: string;
  supplier: SupplierDoc | null;
  lines: RestockDraftLine[];
}

/**
 * Groups RestockDraft lines by wholesale supplierId (with an unassigned bucket if needed).
 */
export function groupRestockLinesBySupplier(
  lines: RestockDraftLine[],
  suppliers: SupplierDoc[]
): SupplierRestockGroup[] {
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const grouped = new Map<string, RestockDraftLine[]>();

  for (const line of lines) {
    const key = line.supplierId && supplierMap.has(line.supplierId) ? line.supplierId : 'unassigned';
    const arr = grouped.get(key) ?? [];
    arr.push(line);
    grouped.set(key, arr);
  }

  const result: SupplierRestockGroup[] = [];
  for (const [groupKey, groupLines] of grouped.entries()) {
    result.push({
      groupKey,
      supplier: groupKey === 'unassigned' ? null : (supplierMap.get(groupKey) ?? null),
      lines: groupLines,
    });
  }

  // Known suppliers first, unassigned last
  result.sort((a, b) => {
    if (!a.supplier && b.supplier) return 1;
    if (a.supplier && !b.supplier) return -1;
    return (a.supplier?.name ?? '').localeCompare(b.supplier?.name ?? '');
  });

  return result;
}

/**
 * Builds a concise spoken Hinglish summary for an editable RestockDraft.
 */
export function buildRestockSpokenSummary(draft: RestockDraft, isEdit = false): string {
  const itemsText = draft.items
    .slice(0, 4)
    .map((it) => `${it.orderQty} ${it.unit} ${it.name}`)
    .join(', ');
  const extra = draft.items.length > 4 ? ` aur ${draft.items.length - 4} items` : '';
  return isEdit
    ? `Restock order update ho gaya: ${itemsText}${extra}. WhatsApp par bhej sakte hain.`
    : `Restock order draft ready hai: ${itemsText}${extra}. Quantity change kar sakte hain ya WhatsApp par bhej dein.`;
}

/**
 * Applies extracted restock items (add / set / remove) to an active RestockDraft
 * or builds a fresh RestockDraft. Matches catalog items using the supplied resolver.
 */
export function applyRestockCommandToDraft(params: {
  activeRestockDraft: RestockDraft | null;
  lowStockAlertItems: LowStockAlertItem[];
  extractedItems: ExtractedItem[];
  useAlertDefaults: boolean;
  transcript: string;
  parserSource: ParserSource;
  catalog: ItemDoc[];
  resolveItem: (rawName: string, matchedSlug: string | null, catalog: ItemDoc[]) => ItemDoc | null;
}): {
  draft: RestockDraft | null;
  spokenReply: string;
  unmatchedNames: string[];
} {
  const {
    activeRestockDraft,
    lowStockAlertItems,
    extractedItems,
    useAlertDefaults,
    transcript,
    parserSource,
    catalog,
    resolveItem,
  } = params;

  // Quick affirmative without specific items: build from post-confirm low-stock alerts or catalog low stock
  if (useAlertDefaults || extractedItems.length === 0) {
    const baseDraft =
      (lowStockAlertItems.length > 0
        ? buildRestockDraftFromAlerts(lowStockAlertItems, transcript, parserSource)
        : null) ?? buildRestockDraftFromCatalogLowStock(catalog, transcript, parserSource);

    if (!baseDraft) {
      return {
        draft: activeRestockDraft,
        spokenReply:
          'Abhi sab items ka stock theek hai. Kisi item ka naam bolkar order draft bana sakte hain.',
        unmatchedNames: [],
      };
    }

    return {
      draft: baseDraft,
      spokenReply: buildRestockSpokenSummary(baseDraft, false),
      unmatchedNames: [],
    };
  }

  const nextLines: RestockDraftLine[] = activeRestockDraft
    ? activeRestockDraft.items.map((it) => ({ ...it, justUpdated: false }))
    : [];
  const unmatchedNames: string[] = [];
  let touched = false;

  for (const ext of extractedItems) {
    const matched = resolveItem(ext.rawName, ext.matchedSlug, catalog);
    if (!matched) {
      if (ext.rawName.trim()) {
        unmatchedNames.push(ext.rawName.trim());
      }
      continue;
    }

    const action = ext.restockAction ?? (activeRestockDraft ? 'set' : 'add');
    const existingIdx = nextLines.findIndex((l) => l.itemId === matched.id || l.slug === matched.slug);

    if (action === 'remove') {
      if (existingIdx >= 0) {
        nextLines.splice(existingIdx, 1);
        touched = true;
      }
      continue;
    }

    const alertOverride = lowStockAlertItems.find((a) => a.itemId === matched.id);
    const currentStock = alertOverride ? alertOverride.remainingStock : matched.stock;
    const resolvedQty =
      ext.qty > 0
        ? Math.max(1, roundQty(ext.qty))
        : computeSuggestedRestockQty(currentStock, matched.reorderThreshold);

    if (existingIdx >= 0) {
      nextLines[existingIdx] = {
        ...nextLines[existingIdx],
        orderQty: resolvedQty,
        currentStock,
        justUpdated: true,
      };
      touched = true;
    } else {
      nextLines.push({
        itemId: matched.id,
        slug: matched.slug,
        name: matched.name,
        unit: matched.unit,
        currentStock,
        reorderThreshold: matched.reorderThreshold,
        orderQty: resolvedQty,
        supplierId: matched.supplierId,
        justUpdated: true,
      });
      touched = true;
    }
  }

  if (nextLines.length === 0) {
    return {
      draft: null,
      spokenReply: touched
        ? 'Restock order draft khali ho gaya.'
        : 'Item catalog mein nahi mila — dobara naam boliye.',
      unmatchedNames,
    };
  }

  const draft: RestockDraft = {
    items: nextLines,
    sourceTranscript: transcript,
    parserSource,
    sentSupplierIds: activeRestockDraft?.sentSupplierIds ?? [],
    createdAtMs: activeRestockDraft?.createdAtMs ?? Date.now(),
  };

  return {
    draft,
    spokenReply: buildRestockSpokenSummary(draft, Boolean(activeRestockDraft)),
    unmatchedNames,
  };
}
