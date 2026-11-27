import type {
  CustomerDoc,
  DraftBill,
  ItemDoc,
  LowStockAlertItem,
  SupplierDoc,
  TransactionDoc,
  TransactionLineItem,
  UndoBillPayload,
} from '../../shared/types';
import {
  buildSeedTransactions,
  getTodayDateKey,
  makeDocId,
  SEED_CUSTOMERS,
  SEED_ITEMS,
  SEED_SUPPLIERS,
} from '../../shared/seedCatalog';
import { computeLowStockAlertsAfterSale } from '../../shared/restockMath';

export const DEMO_OWNER_ID = 'demo_shopkeeper';
export const DEMO_STORAGE_KEY = 'bolbahi_local_demo_v1';

export interface LocalDemoState {
  items: ItemDoc[];
  customers: CustomerDoc[];
  suppliers: SupplierDoc[];
  transactions: TransactionDoc[];
}

function roundMoney(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function createSeedDemoState(nowMs: number = Date.now()): LocalDemoState {
  const dateKey = getTodayDateKey(new Date(nowMs));

  const suppliers: SupplierDoc[] = SEED_SUPPLIERS.map((s) => ({
    id: makeDocId(DEMO_OWNER_ID, s.slug),
    ownerId: DEMO_OWNER_ID,
    slug: s.slug,
    name: s.name,
    phone: s.phone,
  }));

  const items: ItemDoc[] = SEED_ITEMS.map((item) => ({
    id: makeDocId(DEMO_OWNER_ID, item.slug),
    ownerId: DEMO_OWNER_ID,
    slug: item.slug,
    name: item.name,
    aliases: [...item.aliases],
    unit: item.unit,
    price: item.price,
    gstPercent: item.gstPercent,
    stock: item.stock,
    reorderThreshold: item.reorderThreshold,
    supplierId: makeDocId(DEMO_OWNER_ID, item.supplierSlug),
  }));

  const customers: CustomerDoc[] = SEED_CUSTOMERS.map((c) => ({
    id: makeDocId(DEMO_OWNER_ID, c.slug),
    ownerId: DEMO_OWNER_ID,
    slug: c.slug,
    name: c.name,
    aliases: [...c.aliases],
    phone: c.phone,
    udhaarBalance: c.udhaarBalance,
    lastPaymentDaysAgo: c.lastPaymentDaysAgo,
  }));

  const transactions = buildSeedTransactions(DEMO_OWNER_ID, dateKey, nowMs);

  return { items, customers, suppliers, transactions };
}

export function loadLocalDemoState(): LocalDemoState {
  if (typeof window === 'undefined') {
    return createSeedDemoState();
  }
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) {
      const fresh = createSeedDemoState();
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<LocalDemoState>;
    if (
      !Array.isArray(parsed.items) ||
      !Array.isArray(parsed.customers) ||
      !Array.isArray(parsed.suppliers) ||
      !Array.isArray(parsed.transactions) ||
      parsed.items.length === 0
    ) {
      const fresh = createSeedDemoState();
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return {
      items: parsed.items,
      customers: parsed.customers,
      suppliers: parsed.suppliers,
      transactions: parsed.transactions,
    };
  } catch {
    return createSeedDemoState();
  }
}

export function saveLocalDemoState(state: LocalDemoState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function resetLocalDemoState(): LocalDemoState {
  const fresh = createSeedDemoState();
  saveLocalDemoState(fresh);
  return fresh;
}

export function confirmDraftBillLocal(
  state: LocalDemoState,
  draft: DraftBill,
  nowMs: number = Date.now()
): {
  nextState: LocalDemoState;
  transaction: TransactionDoc;
  undoPayload: UndoBillPayload;
  lowStockAlerts: LowStockAlertItem[];
} {
  const customer =
    state.customers.find((c) => c.id === draft.customerId) ||
    state.customers.find((c) => c.slug === 'walk-in');

  if (!customer) {
    throw new Error('Customer record not found in local demo store.');
  }

  const defaultSupplierId = state.suppliers[0]?.id ?? makeDocId(DEMO_OWNER_ID, 'agarwal');
  const txId = `tx_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
  const dateKey = getTodayDateKey(new Date(nowMs));

  const stockRestores: UndoBillPayload['stockRestores'] = [];
  const createdItemIds: string[] = [];
  const newCatalogItems: ItemDoc[] = [];
  const txItems: TransactionLineItem[] = [];
  const stockDeductionById = new Map<string, number>();

  for (const row of draft.items.slice(0, 30)) {
    let resolvedItemId = row.itemId;
    const cleanSlug =
      row.slug.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || `item-${nowMs}`;

    if (row.isUnknown && row.saveToCatalog && row.unitPrice > 0) {
      const newDocId = makeDocId(DEMO_OWNER_ID, `${cleanSlug}_${nowMs.toString(36).slice(-4)}`);
      resolvedItemId = newDocId;
      createdItemIds.push(newDocId);
      newCatalogItems.push({
        id: newDocId,
        ownerId: DEMO_OWNER_ID,
        slug: cleanSlug,
        name: row.name.slice(0, 120),
        aliases: [row.rawName.toLowerCase().slice(0, 60), cleanSlug].slice(0, 15),
        unit: row.unit.slice(0, 24) || 'pc',
        price: roundMoney(row.unitPrice),
        gstPercent: 0,
        stock: 10,
        reorderThreshold: 5,
        supplierId: defaultSupplierId,
      });
    } else if (row.itemId) {
      const prevDeducted = stockDeductionById.get(row.itemId) ?? 0;
      stockDeductionById.set(row.itemId, roundMoney(prevDeducted + row.qty));
    }

    txItems.push({
      itemId: resolvedItemId,
      slug: cleanSlug,
      name: row.name.slice(0, 120),
      qty: roundMoney(row.qty),
      unit: row.unit.slice(0, 24),
      unitPrice: roundMoney(row.unitPrice),
      gstPercent: row.gstPercent,
      lineTotal: roundMoney(row.lineTotal),
      gstIncluded: roundMoney(row.gstIncluded),
    });
  }

  const nextItems = state.items.map((catalogItem) => {
    const deducted = stockDeductionById.get(catalogItem.id);
    if (!deducted) return catalogItem;
    stockRestores.push({
      itemId: catalogItem.id,
      prevStock: catalogItem.stock,
    });
    return {
      ...catalogItem,
      stock: Math.max(0, roundMoney(catalogItem.stock - deducted)),
    };
  });

  const lowStockAlerts = computeLowStockAlertsAfterSale(
    draft.items.slice(0, 30).map((row) => ({ itemId: row.itemId, qty: row.qty })),
    state.items
  );

  const nextUdhaar = Math.max(0, roundMoney(customer.udhaarBalance + draft.newUdhaar));
  const nextLastPaymentDaysAgo =
    draft.cashPaid > 0 || draft.upiPaid > 0 ? 0 : customer.lastPaymentDaysAgo;

  const nextCustomers = state.customers.map((c) =>
    c.id === customer.id
      ? {
          ...c,
          udhaarBalance: nextUdhaar,
          lastPaymentDaysAgo: nextLastPaymentDaysAgo,
        }
      : c
  );

  const cleanTranscript = (draft.transcript || 'Counter bill').trim().slice(0, 1000);
  const safePhone = /^[0-9]{10,15}$/.test(customer.phone) ? customer.phone : '';

  const transaction: TransactionDoc = {
    id: txId,
    ownerId: DEMO_OWNER_ID,
    customerId: customer.id,
    customerName: customer.name.slice(0, 120),
    customerPhone: safePhone,
    transcript: cleanTranscript,
    items: txItems,
    total: roundMoney(draft.total),
    gstIncluded: roundMoney(draft.gstIncluded),
    cashPaid: roundMoney(draft.cashPaid),
    upiPaid: roundMoney(draft.upiPaid),
    newUdhaar: roundMoney(draft.newUdhaar),
    changeToReturn: roundMoney(draft.changeToReturn),
    parserSource: draft.parserSource,
    dateKey,
    status: 'confirmed',
    createdAtMs: nowMs,
  };

  return {
    nextState: {
      ...state,
      items: [...nextItems, ...newCatalogItems],
      customers: nextCustomers,
      transactions: [transaction, ...state.transactions],
    },
    transaction,
    undoPayload: {
      transactionId: txId,
      customerId: customer.id,
      prevUdhaarBalance: customer.udhaarBalance,
      prevLastPaymentDaysAgo: customer.lastPaymentDaysAgo,
      stockRestores,
      createdItemIds,
    },
    lowStockAlerts,
  };
}

export function undoTransactionLocal(
  state: LocalDemoState,
  payload: UndoBillPayload
): LocalDemoState {
  const restoreMap = new Map(payload.stockRestores.map((r) => [r.itemId, r.prevStock]));
  const createdSet = new Set(payload.createdItemIds);

  const nextItems = state.items
    .filter((item) => !createdSet.has(item.id))
    .map((item) => {
      const prevStock = restoreMap.get(item.id);
      if (prevStock === undefined) return item;
      return {
        ...item,
        stock: Math.max(0, roundMoney(prevStock)),
      };
    });

  const nextCustomers = state.customers.map((c) =>
    c.id === payload.customerId
      ? {
          ...c,
          udhaarBalance: Math.max(0, roundMoney(payload.prevUdhaarBalance)),
          lastPaymentDaysAgo: payload.prevLastPaymentDaysAgo,
        }
      : c
  );

  const nextTransactions = state.transactions.filter((tx) => tx.id !== payload.transactionId);

  return {
    ...state,
    items: nextItems,
    customers: nextCustomers,
    transactions: nextTransactions,
  };
}

export function settleCustomerUdhaarLocal(
  state: LocalDemoState,
  customerId: string,
  amountReceived: number
): LocalDemoState {
  return {
    ...state,
    customers: state.customers.map((c) =>
      c.id === customerId
        ? {
            ...c,
            udhaarBalance: Math.max(0, roundMoney(c.udhaarBalance - amountReceived)),
            lastPaymentDaysAgo: 0,
          }
        : c
    ),
  };
}

export function restockItemLocal(
  state: LocalDemoState,
  itemId: string,
  addedQty: number
): LocalDemoState {
  if (addedQty <= 0) return state;
  return {
    ...state,
    items: state.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            stock: Math.min(100000, roundMoney(item.stock + addedQty)),
          }
        : item
    ),
  };
}

export function restockItemsBatchLocal(
  state: LocalDemoState,
  entries: Array<{ item: ItemDoc; addedQty: number }>
): LocalDemoState {
  if (entries.length === 0) return state;
  const addById = new Map<string, number>();
  for (const { item, addedQty } of entries) {
    if (addedQty <= 0) continue;
    addById.set(item.id, roundMoney((addById.get(item.id) ?? 0) + addedQty));
  }
  return {
    ...state,
    items: state.items.map((item) => {
      const added = addById.get(item.id);
      if (!added) return item;
      return {
        ...item,
        stock: Math.min(100000, roundMoney(item.stock + added)),
      };
    }),
  };
}

export function addCustomerLocal(
  state: LocalDemoState,
  params: { name: string; phone: string; aliases: string[] },
  nowMs: number = Date.now()
): LocalDemoState {
  const cleanName = params.name.trim().slice(0, 120);
  const digitsOnly = params.phone.replace(/[^0-9]/g, '').slice(0, 15);
  const safePhone = digitsOnly.length >= 10 ? digitsOnly : '';

  const baseSlug =
    cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'customer';
  const uniqueSlug = `${baseSlug}-${nowMs.toString(36).slice(-4)}`;
  const docId = makeDocId(DEMO_OWNER_ID, uniqueSlug);

  const normalizedAliases = Array.from(
    new Set(
      [
        ...params.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean),
        cleanName.toLowerCase(),
        cleanName.toLowerCase().split(' ')[0] ?? '',
      ]
        .filter((a) => a.length >= 1)
        .map((a) => a.slice(0, 60))
    )
  ).slice(0, 15);

  const nextCustomer: CustomerDoc = {
    id: docId,
    ownerId: DEMO_OWNER_ID,
    slug: uniqueSlug,
    name: cleanName,
    aliases: normalizedAliases,
    phone: safePhone,
    udhaarBalance: 0,
    lastPaymentDaysAgo: 0,
  };

  return {
    ...state,
    customers: [...state.customers, nextCustomer],
  };
}
