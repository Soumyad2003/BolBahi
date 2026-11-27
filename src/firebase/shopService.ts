import {
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type {
  CustomerDoc,
  DraftBill,
  ItemDoc,
  SupplierDoc,
  TransactionDoc,
  TransactionLineItem,
} from '../../shared/types';
import { db, handleFirestoreError, OperationType } from './config';
import { getTodayDateKey, makeDocId } from './seedData';

export interface UndoBillPayload {
  transactionId: string;
  customerId: string;
  prevUdhaarBalance: number;
  prevLastPaymentDaysAgo: number;
  stockRestores: Array<{
    itemId: string;
    prevStock: number;
  }>;
  createdItemIds: string[];
}

function roundMoney(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export async function confirmDraftBillInFirestore(params: {
  uid: string;
  draft: DraftBill;
  catalogItems: ItemDoc[];
  customers: CustomerDoc[];
  suppliers: SupplierDoc[];
}): Promise<{
  transaction: TransactionDoc;
  undoPayload: UndoBillPayload;
}> {
  const { uid, draft, catalogItems, customers, suppliers } = params;

  const customer =
    customers.find((c) => c.id === draft.customerId) ||
    customers.find((c) => c.slug === 'walk-in');

  if (!customer) {
    throw new Error('Customer record not found in Firestore.');
  }

  const defaultSupplierId = suppliers[0]?.id ?? makeDocId(uid, 'agarwal');
  const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const dateKey = getTodayDateKey();

  const stockRestores: UndoBillPayload['stockRestores'] = [];
  const createdItemIds: string[] = [];

  const batch = writeBatch(db);

  // Build normalized transaction line items & decrement stock (or save new catalog item)
  const txItems: TransactionLineItem[] = [];

  for (const row of draft.items.slice(0, 30)) {
    let resolvedItemId = row.itemId;
    const cleanSlug =
      row.slug.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || `item-${Date.now()}`;

    if (row.isUnknown && row.saveToCatalog && row.unitPrice > 0) {
      const newDocId = makeDocId(uid, `${cleanSlug}_${Date.now().toString(36).slice(-4)}`);
      resolvedItemId = newDocId;
      createdItemIds.push(newDocId);
      batch.set(doc(db, 'items', newDocId), {
        ownerId: uid,
        slug: cleanSlug,
        name: row.name.slice(0, 120),
        aliases: [row.rawName.toLowerCase().slice(0, 60), cleanSlug].slice(0, 15),
        unit: row.unit.slice(0, 24) || 'pc',
        price: roundMoney(row.unitPrice),
        gstPercent: 0,
        stock: 10,
        reorderThreshold: 5,
        supplierId: defaultSupplierId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (row.itemId) {
      const catalogItem = catalogItems.find((ci) => ci.id === row.itemId);
      if (catalogItem) {
        stockRestores.push({
          itemId: catalogItem.id,
          prevStock: catalogItem.stock,
        });
        const nextStock = Math.max(0, roundMoney(catalogItem.stock - row.qty));
        batch.update(doc(db, 'items', catalogItem.id), {
          stock: nextStock,
          updatedAt: serverTimestamp(),
        });
      }
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

  // Update customer's udhaar balance and last payment days
  const nextUdhaar = Math.max(0, roundMoney(customer.udhaarBalance + draft.newUdhaar));
  const nextLastPaymentDaysAgo =
    draft.cashPaid > 0 || draft.upiPaid > 0 ? 0 : customer.lastPaymentDaysAgo;

  batch.update(doc(db, 'customers', customer.id), {
    udhaarBalance: nextUdhaar,
    lastPaymentDaysAgo: nextLastPaymentDaysAgo,
    updatedAt: serverTimestamp(),
  });

  const cleanTranscript = (draft.transcript || 'Counter bill').trim().slice(0, 1000);
  const safePhone = /^[0-9]{10,15}$/.test(customer.phone) ? customer.phone : '';

  const txPayload = {
    ownerId: uid,
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
    status: 'confirmed' as const,
    createdAt: serverTimestamp(),
  };

  batch.set(doc(db, 'transactions', txId), txPayload);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `transactions/${txId}`);
  }

  return {
    transaction: {
      id: txId,
      ...txPayload,
      createdAtMs: Date.now(),
    },
    undoPayload: {
      transactionId: txId,
      customerId: customer.id,
      prevUdhaarBalance: customer.udhaarBalance,
      prevLastPaymentDaysAgo: customer.lastPaymentDaysAgo,
      stockRestores,
      createdItemIds,
    },
  };
}

export async function undoTransactionInFirestore(payload: UndoBillPayload): Promise<void> {
  const batch = writeBatch(db);

  batch.delete(doc(db, 'transactions', payload.transactionId));
  batch.update(doc(db, 'customers', payload.customerId), {
    udhaarBalance: Math.max(0, roundMoney(payload.prevUdhaarBalance)),
    lastPaymentDaysAgo: payload.prevLastPaymentDaysAgo,
    updatedAt: serverTimestamp(),
  });

  for (const restore of payload.stockRestores) {
    batch.update(doc(db, 'items', restore.itemId), {
      stock: Math.max(0, roundMoney(restore.prevStock)),
      updatedAt: serverTimestamp(),
    });
  }

  for (const createdId of payload.createdItemIds) {
    batch.delete(doc(db, 'items', createdId));
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `transactions/${payload.transactionId}`);
  }
}

export async function settleCustomerUdhaarInFirestore(
  customer: CustomerDoc,
  amountReceived: number
): Promise<void> {
  const nextBalance = Math.max(0, roundMoney(customer.udhaarBalance - amountReceived));
  try {
    await updateDoc(doc(db, 'customers', customer.id), {
      udhaarBalance: nextBalance,
      lastPaymentDaysAgo: 0,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `customers/${customer.id}`);
  }
}

export async function restockItemInFirestore(item: ItemDoc, addedQty: number): Promise<void> {
  const nextStock = Math.min(100000, roundMoney(item.stock + addedQty));
  try {
    await updateDoc(doc(db, 'items', item.id), {
      stock: nextStock,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `items/${item.id}`);
  }
}

export async function addCustomerInFirestore(params: {
  uid: string;
  name: string;
  phone: string;
  aliases: string[];
}): Promise<void> {
  const cleanName = params.name.trim().slice(0, 120);
  const digitsOnly = params.phone.replace(/[^0-9]/g, '').slice(0, 15);
  const safePhone = digitsOnly.length >= 10 ? digitsOnly : '';

  const baseSlug =
    cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'customer';
  const uniqueSlug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;
  const docId = makeDocId(params.uid, uniqueSlug);

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

  const batch = writeBatch(db);
  batch.set(doc(db, 'customers', docId), {
    ownerId: params.uid,
    slug: uniqueSlug,
    name: cleanName,
    aliases: normalizedAliases,
    phone: safePhone,
    udhaarBalance: 0,
    lastPaymentDaysAgo: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `customers/${docId}`);
  }
}
