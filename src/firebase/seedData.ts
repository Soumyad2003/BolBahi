import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './config';

export function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function makeDocId(uid: string, slug: string): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return `${safeUid}_${safeSlug}`;
}

export const SEED_SUPPLIERS = [
  {
    slug: 'agarwal',
    name: 'Agarwal Wholesale Traders',
    phone: '9876500001',
  },
  {
    slug: 'metro',
    name: 'Metro FMCG Distributors',
    phone: '9876500002',
  },
] as const;

export const SEED_ITEMS = [
  {
    slug: 'atta',
    name: 'Aashirvaad Atta',
    aliases: ['atta', 'aata', 'aashirvaad atta', 'ashirwad atta', 'wheat flour'],
    unit: 'kg',
    price: 52,
    gstPercent: 0,
    stock: 12,
    reorderThreshold: 10,
    supplierSlug: 'agarwal',
  },
  {
    slug: 'tel',
    name: 'Fortune Refined Oil',
    aliases: ['tel', 'oil', 'fortune tel', 'fortune oil', 'refined oil'],
    unit: 'L',
    price: 160,
    gstPercent: 5,
    stock: 6,
    reorderThreshold: 8,
    supplierSlug: 'agarwal',
  },
  {
    slug: 'namak',
    name: 'Tata Salt',
    aliases: ['namak', 'salt', 'tata namak', 'tata salt'],
    unit: 'pkt',
    price: 28,
    gstPercent: 0,
    stock: 25,
    reorderThreshold: 10,
    supplierSlug: 'metro',
  },
  {
    slug: 'chawal',
    name: 'India Gate Basmati Rice',
    aliases: ['chawal', 'rice', 'basmati', 'india gate'],
    unit: 'kg',
    price: 95,
    gstPercent: 5,
    stock: 18,
    reorderThreshold: 10,
    supplierSlug: 'agarwal',
  },
  {
    slug: 'dal',
    name: 'Toor Dal',
    aliases: ['dal', 'toor dal', 'arhar dal', 'tuvar dal'],
    unit: 'kg',
    price: 150,
    gstPercent: 0,
    stock: 9,
    reorderThreshold: 10,
    supplierSlug: 'agarwal',
  },
  {
    slug: 'doodh',
    name: 'Amul Taaza Milk',
    aliases: ['doodh', 'milk', 'amul doodh', 'amul milk', 'taaza'],
    unit: 'pkt',
    price: 27,
    gstPercent: 0,
    stock: 15,
    reorderThreshold: 10,
    supplierSlug: 'metro',
  },
  {
    slug: 'cheeni',
    name: 'Sugar / Cheeni',
    aliases: ['cheeni', 'chini', 'sugar', 'shakkar'],
    unit: 'kg',
    price: 46,
    gstPercent: 5,
    stock: 20,
    reorderThreshold: 10,
    supplierSlug: 'agarwal',
  },
  {
    slug: 'chai',
    name: 'Tata Tea Gold',
    aliases: ['chai', 'tea', 'chai patti', 'tata tea', 'tata chai'],
    unit: 'pkt',
    price: 140,
    gstPercent: 5,
    stock: 11,
    reorderThreshold: 6,
    supplierSlug: 'metro',
  },
  {
    slug: 'maggi',
    name: 'Maggi Noodles',
    aliases: ['maggi', 'maggie', 'noodles', 'choti maggi'],
    unit: 'pkt',
    price: 14,
    gstPercent: 12,
    stock: 5,
    reorderThreshold: 12,
    supplierSlug: 'metro',
  },
  {
    slug: 'parle',
    name: 'Parle-G Biscuit',
    aliases: ['parle', 'parle g', 'parle-g', 'biscuit', 'biskut'],
    unit: 'pkt',
    price: 10,
    gstPercent: 18,
    stock: 30,
    reorderThreshold: 10,
    supplierSlug: 'metro',
  },
  {
    slug: 'surf',
    name: 'Surf Excel Small',
    aliases: ['surf', 'chota surf', 'surf excel', 'detergent', 'washing powder'],
    unit: 'pkt',
    price: 20,
    gstPercent: 18,
    stock: 14,
    reorderThreshold: 8,
    supplierSlug: 'metro',
  },
  {
    slug: 'colgate',
    name: 'Colgate Toothpaste',
    aliases: ['colgate', 'paste', 'toothpaste', 'manjan'],
    unit: 'tube',
    price: 65,
    gstPercent: 18,
    stock: 10,
    reorderThreshold: 5,
    supplierSlug: 'metro',
  },
  {
    slug: 'pyaaz',
    name: 'Onion / Pyaaz',
    aliases: ['pyaaz', 'pyaz', 'kanda', 'onion'],
    unit: 'kg',
    price: 40,
    gstPercent: 0,
    stock: 16,
    reorderThreshold: 8,
    supplierSlug: 'agarwal',
  },
  {
    slug: 'aloo',
    name: 'Potato / Aloo',
    aliases: ['aloo', 'alu', 'batata', 'potato'],
    unit: 'kg',
    price: 32,
    gstPercent: 0,
    stock: 22,
    reorderThreshold: 8,
    supplierSlug: 'agarwal',
  },
  {
    slug: 'anda',
    name: 'Eggs',
    aliases: ['anda', 'ande', 'egg', 'eggs'],
    unit: 'pc',
    price: 7,
    gstPercent: 0,
    stock: 36,
    reorderThreshold: 12,
    supplierSlug: 'agarwal',
  },
] as const;

export const SEED_CUSTOMERS = [
  {
    slug: 'rajesh-sharma',
    name: 'Rajesh Sharma',
    aliases: ['sharma ji', 'sharma', 'rajesh'],
    phone: '9876543210',
    udhaarBalance: 420,
    lastPaymentDaysAgo: 18,
  },
  {
    slug: 'vikram-sharma',
    name: 'Vikram Sharma',
    aliases: ['sharma ji', 'sharma', 'vikram'],
    phone: '9876543214',
    udhaarBalance: 150,
    lastPaymentDaysAgo: 10,
  },
  {
    slug: 'sunita-verma',
    name: 'Sunita Verma',
    aliases: ['sunita didi', 'verma ji', 'sunita'],
    phone: '9876543211',
    udhaarBalance: 185,
    lastPaymentDaysAgo: 6,
  },
  {
    slug: 'raju-yadav',
    name: 'Raju Yadav',
    aliases: ['raju bhai', 'raju'],
    phone: '9876543212',
    udhaarBalance: 650,
    lastPaymentDaysAgo: 22,
  },
  {
    slug: 'meena-nair',
    name: 'Meena Nair',
    aliases: ['meena aunty', 'meena'],
    phone: '9876543213',
    udhaarBalance: 0,
    lastPaymentDaysAgo: 2,
  },
  {
    slug: 'walk-in',
    name: 'Walk-in Cash Customer',
    aliases: ['cash', 'walk-in', 'customer'],
    phone: '',
    udhaarBalance: 0,
    lastPaymentDaysAgo: 0,
  },
] as const;

export async function seedShopData(uid: string): Promise<void> {
  const dateKey = getTodayDateKey();

  // Batch 1: Suppliers (must exist before items reference supplierId)
  try {
    const supplierBatch = writeBatch(db);
    for (const s of SEED_SUPPLIERS) {
      const id = makeDocId(uid, s.slug);
      supplierBatch.set(doc(db, 'suppliers', id), {
        ownerId: uid,
        slug: s.slug,
        name: s.name,
        phone: s.phone,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await supplierBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'suppliers');
  }

  // Batch 2: Items + Customers
  try {
    const catalogBatch = writeBatch(db);
    for (const item of SEED_ITEMS) {
      const id = makeDocId(uid, item.slug);
      catalogBatch.set(doc(db, 'items', id), {
        ownerId: uid,
        slug: item.slug,
        name: item.name,
        aliases: [...item.aliases],
        unit: item.unit,
        price: item.price,
        gstPercent: item.gstPercent,
        stock: item.stock,
        reorderThreshold: item.reorderThreshold,
        supplierId: makeDocId(uid, item.supplierSlug),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const c of SEED_CUSTOMERS) {
      const id = makeDocId(uid, c.slug);
      catalogBatch.set(doc(db, 'customers', id), {
        ownerId: uid,
        slug: c.slug,
        name: c.name,
        aliases: [...c.aliases],
        phone: c.phone,
        udhaarBalance: c.udhaarBalance,
        lastPaymentDaysAgo: c.lastPaymentDaysAgo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await catalogBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'items');
  }

  // Batch 3: 3 Pre-seeded today's transactions (Cash, UPI, Udhaar)
  try {
    const txBatch = writeBatch(db);
    const seedTransactions = [
      {
        id: makeDocId(uid, 'tx-seed-1'),
        customerId: makeDocId(uid, 'walk-in'),
        customerName: 'Walk-in Cash Customer',
        customerPhone: '',
        transcript: 'Do Amul doodh, teen Parle-G, aur ek Tata namak — cash mila',
        items: [
          {
            itemId: makeDocId(uid, 'doodh'),
            slug: 'doodh',
            name: 'Amul Taaza Milk',
            qty: 2,
            unit: 'pkt',
            unitPrice: 27,
            gstPercent: 0,
            lineTotal: 54,
            gstIncluded: 0,
          },
          {
            itemId: makeDocId(uid, 'parle'),
            slug: 'parle',
            name: 'Parle-G Biscuit',
            qty: 3,
            unit: 'pkt',
            unitPrice: 10,
            gstPercent: 18,
            lineTotal: 30,
            gstIncluded: 4.58,
          },
          {
            itemId: makeDocId(uid, 'namak'),
            slug: 'namak',
            name: 'Tata Salt',
            qty: 1,
            unit: 'pkt',
            unitPrice: 28,
            gstPercent: 0,
            lineTotal: 28,
            gstIncluded: 0,
          },
        ],
        total: 112,
        gstIncluded: 4.58,
        cashPaid: 112,
        upiPaid: 0,
        newUdhaar: 0,
        changeToReturn: 0,
        parserSource: 'seed',
      },
      {
        id: makeDocId(uid, 'tx-seed-2'),
        customerId: makeDocId(uid, 'meena-nair'),
        customerName: 'Meena Nair',
        customerPhone: '9876543213',
        transcript: 'Meena aunty ko ek Tata chai aur do kilo cheeni, 232 UPI kiya',
        items: [
          {
            itemId: makeDocId(uid, 'chai'),
            slug: 'chai',
            name: 'Tata Tea Gold',
            qty: 1,
            unit: 'pkt',
            unitPrice: 140,
            gstPercent: 5,
            lineTotal: 140,
            gstIncluded: 6.67,
          },
          {
            itemId: makeDocId(uid, 'cheeni'),
            slug: 'cheeni',
            name: 'Sugar / Cheeni',
            qty: 2,
            unit: 'kg',
            unitPrice: 46,
            gstPercent: 5,
            lineTotal: 92,
            gstIncluded: 4.38,
          },
        ],
        total: 232,
        gstIncluded: 11.05,
        cashPaid: 0,
        upiPaid: 232,
        newUdhaar: 0,
        changeToReturn: 0,
        parserSource: 'seed',
      },
      {
        id: makeDocId(uid, 'tx-seed-3'),
        customerId: makeDocId(uid, 'sunita-verma'),
        customerName: 'Sunita Verma',
        customerPhone: '9876543211',
        transcript: 'Sunita didi ko do kilo pyaaz, do kilo aloo, ek Colgate, 100 cash baaki udhaar',
        items: [
          {
            itemId: makeDocId(uid, 'pyaaz'),
            slug: 'pyaaz',
            name: 'Onion / Pyaaz',
            qty: 2,
            unit: 'kg',
            unitPrice: 40,
            gstPercent: 0,
            lineTotal: 80,
            gstIncluded: 0,
          },
          {
            itemId: makeDocId(uid, 'aloo'),
            slug: 'aloo',
            name: 'Potato / Aloo',
            qty: 2,
            unit: 'kg',
            unitPrice: 32,
            gstPercent: 0,
            lineTotal: 64,
            gstIncluded: 0,
          },
          {
            itemId: makeDocId(uid, 'colgate'),
            slug: 'colgate',
            name: 'Colgate Toothpaste',
            qty: 1,
            unit: 'tube',
            unitPrice: 65,
            gstPercent: 18,
            lineTotal: 65,
            gstIncluded: 9.92,
          },
        ],
        total: 209,
        gstIncluded: 9.92,
        cashPaid: 100,
        upiPaid: 0,
        newUdhaar: 109,
        changeToReturn: 0,
        parserSource: 'seed',
      },
    ];

    for (const tx of seedTransactions) {
      const { id, ...data } = tx;
      txBatch.set(doc(db, 'transactions', id), {
        ownerId: uid,
        ...data,
        dateKey,
        status: 'confirmed',
        createdAt: serverTimestamp(),
      });
    }
    await txBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'transactions');
  }
}

export async function resetShopData(uid: string): Promise<void> {
  const collectionsToClear = ['transactions', 'items', 'customers', 'suppliers'] as const;

  for (const colName of collectionsToClear) {
    try {
      const q = query(collection(db, colName), where('ownerId', '==', uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, colName);
    }
  }

  await seedShopData(uid);
}
