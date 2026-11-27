import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, onSnapshot, query, where, type Timestamp } from 'firebase/firestore';
import type {
  CustomerDoc,
  DraftBill,
  ItemDoc,
  ParserMode,
  SupplierDoc,
  TodayStats,
  TransactionDoc,
  VoiceParseResponse,
} from '../shared/types';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase/config';
import { getTodayDateKey, resetShopData, seedShopData } from './firebase/seedData';
import {
  addCustomerInFirestore,
  confirmDraftBillInFirestore,
  restockItemInFirestore,
  settleCustomerUdhaarInFirestore,
  undoTransactionInFirestore,
  type UndoBillPayload,
} from './firebase/shopService';
import { speakHinglish, stopSpeaking } from './utils/voiceAndWhatsapp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SignInScreen } from './components/SignInScreen';
import { Header, type ActiveTab, type ParserBadgeLabel } from './components/Header';
import { CounterTab } from './components/CounterTab';
import { KhataTab } from './components/KhataTab';
import { GallaStockTab } from './components/GallaStockTab';
import { BottomNav } from './components/BottomNav';

function BolBahiApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [items, setItems] = useState<ItemDoc[]>([]);
  const [customers, setCustomers] = useState<CustomerDoc[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDoc[]>([]);
  const [transactions, setTransactions] = useState<TransactionDoc[]>([]);
  const [loadingShop, setLoadingShop] = useState(true);
  const [resetting, setResetting] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('counter');
  const [filterCustomerId, setFilterCustomerId] = useState<string | null>(null);
  const [parserMode, setParserMode] = useState<ParserMode>(() => {
    try {
      return window.localStorage.getItem('bolbahi_parser_mode') === 'offline' ? 'offline' : 'gemini';
    } catch {
      return 'gemini';
    }
  });
  const [parserLabel, setParserLabel] = useState<ParserBadgeLabel>(() => {
    try {
      return window.localStorage.getItem('bolbahi_parser_mode') === 'offline'
        ? 'Offline Local'
        : 'Gemini Flash-Lite';
    } catch {
      return 'Gemini Flash-Lite';
    }
  });
  const [muted, setMuted] = useState(false);

  const handleParserModeChange = useCallback((mode: ParserMode) => {
    setParserMode(mode);
    setParserLabel(mode === 'offline' ? 'Offline Local' : 'Gemini Flash-Lite');
    try {
      window.localStorage.setItem('bolbahi_parser_mode', mode);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, []);

  const [draft, setDraft] = useState<DraftBill | null>(null);
  const [processingVoice, setProcessingVoice] = useState(false);
  const [confirmingBill, setConfirmingBill] = useState(false);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);
  const [lastSpokenReply, setLastSpokenReply] = useState<string | null>(null);

  const [lastSavedTx, setLastSavedTx] = useState<TransactionDoc | null>(null);
  const [undoPayload, setUndoPayload] = useState<UndoBillPayload | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);

  const seededRef = useRef(false);
  const undoIntervalRef = useRef<number | null>(null);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        seededRef.current = false;
        setItems([]);
        setCustomers([]);
        setSuppliers([]);
        setTransactions([]);
        setDraft(null);
        setLastSavedTx(null);
        setLoadingShop(false);
      }
    });
    return () => unsub();
  }, []);

  // Firestore real-time subscriptions (strictly attached only when authenticated)
  useEffect(() => {
    if (!authReady || !user) return;
    setLoadingShop(true);
    let itemsLoaded = false;

    const uid = user.uid;

    const unsubSuppliers = onSnapshot(
      query(collection(db, 'suppliers'), where('ownerId', '==', uid)),
      (snap) => {
        setSuppliers(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SupplierDoc, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers')
    );

    const unsubItems = onSnapshot(
      query(collection(db, 'items'), where('ownerId', '==', uid)),
      (snap) => {
        const loaded = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ItemDoc, 'id'>),
        }));
        setItems(loaded);

        if (!itemsLoaded) {
          itemsLoaded = true;
          if (loaded.length === 0 && !seededRef.current) {
            seededRef.current = true;
            void seedShopData(uid).finally(() => setLoadingShop(false));
          } else {
            setLoadingShop(false);
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'items')
    );

    const unsubCustomers = onSnapshot(
      query(collection(db, 'customers'), where('ownerId', '==', uid)),
      (snap) => {
        setCustomers(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<CustomerDoc, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'customers')
    );

    const unsubTransactions = onSnapshot(
      query(collection(db, 'transactions'), where('ownerId', '==', uid)),
      (snap) => {
        const loaded = snap.docs.map((d) => {
          const data = d.data() as Omit<TransactionDoc, 'id' | 'createdAtMs'> & {
            createdAt?: Timestamp | null;
          };
          return {
            id: d.id,
            ownerId: data.ownerId,
            customerId: data.customerId,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            transcript: data.transcript,
            items: data.items,
            total: data.total,
            gstIncluded: data.gstIncluded,
            cashPaid: data.cashPaid,
            upiPaid: data.upiPaid,
            newUdhaar: data.newUdhaar,
            changeToReturn: data.changeToReturn,
            parserSource: data.parserSource,
            dateKey: data.dateKey,
            status: data.status,
            createdAtMs: data.createdAt?.toMillis?.() ?? Date.now(),
          } satisfies TransactionDoc;
        });
        loaded.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
        setTransactions(loaded);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
    );

    return () => {
      unsubSuppliers();
      unsubItems();
      unsubCustomers();
      unsubTransactions();
    };
  }, [authReady, user]);

  // 5-Second Undo Countdown Timer
  useEffect(() => {
    if (undoSecondsLeft <= 0) {
      if (undoIntervalRef.current) {
        window.clearInterval(undoIntervalRef.current);
        undoIntervalRef.current = null;
      }
      return;
    }

    undoIntervalRef.current = window.setInterval(() => {
      setUndoSecondsLeft((prev) => {
        if (prev <= 1) {
          setUndoPayload(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (undoIntervalRef.current) {
        window.clearInterval(undoIntervalRef.current);
      }
    };
  }, [undoSecondsLeft]);

  const todayStats: TodayStats = useMemo(() => {
    const todayKey = getTodayDateKey();
    const todayTxs = transactions.filter((t) => t.dateKey === todayKey);
    return {
      totalSales: Math.round(todayTxs.reduce((s, t) => s + t.total, 0) * 100) / 100,
      cashTotal: Math.round(todayTxs.reduce((s, t) => s + t.cashPaid, 0) * 100) / 100,
      upiTotal: Math.round(todayTxs.reduce((s, t) => s + t.upiPaid, 0) * 100) / 100,
      udhaarTotal: Math.round(todayTxs.reduce((s, t) => s + t.newUdhaar, 0) * 100) / 100,
      billCount: todayTxs.length,
    };
  }, [transactions]);

  const lowStockCount = useMemo(
    () => items.filter((i) => i.stock <= i.reorderThreshold).length,
    [items]
  );

  const speak = useCallback(
    (msg: string) => {
      setLastSpokenReply(msg);
      speakHinglish(msg, muted, 'en-IN', parserMode === 'gemini');
    },
    [muted, parserMode]
  );

  const handleReplaySpoken = useCallback(() => {
    if (!lastSpokenReply) return;
    speakHinglish(lastSpokenReply, false, 'en-IN', parserMode === 'gemini');
  }, [lastSpokenReply, parserMode]);

  const recalculateOnServer = useCallback(
    async (nextDraft: DraftBill, announce = false) => {
      // Optimistically render draft immediately, then sync deterministic Node.js calculation
      setDraft(nextDraft);
      try {
        const res = await fetch('/api/bill/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft: nextDraft }),
        });
        if (res.ok) {
          const data = (await res.json()) as { draft: DraftBill; spokenReply: string };
          setDraft(data.draft);
          if (announce && data.spokenReply) {
            speak(data.spokenReply);
          }
        }
      } catch {
        // Keep current draft state if network momentarily drops
      }
    },
    [speak]
  );

  const handleConfirmDraft = useCallback(
    async (draftToConfirm?: DraftBill) => {
      const target = draftToConfirm ?? draft;
      if (!user || !target || confirmingBill) return;
      if (target.ambiguousCustomers.length > 1 || target.items.some((it) => it.rateMissing)) {
        return;
      }

      setConfirmingBill(true);
      setWarningBanner(null);
      try {
        const { transaction, undoPayload: nextUndo } = await confirmDraftBillInFirestore({
          uid: user.uid,
          draft: target,
          catalogItems: items,
          customers,
          suppliers,
        });
        setDraft(null);
        setLastSavedTx(transaction);
        setUndoPayload(nextUndo);
        setUndoSecondsLeft(5);
        speak('Bill save ho gaya. WhatsApp receipt ready hai.');
      } catch (err) {
        setWarningBanner(err instanceof Error ? err.message : 'Failed to save bill.');
      } finally {
        setConfirmingBill(false);
      }
    },
    [user, draft, confirmingBill, items, customers, suppliers, speak]
  );

  const handleProcessUtterance = useCallback(
    async (utterance: string) => {
      if (!utterance.trim()) return;
      setProcessingVoice(true);
      setWarningBanner(null);

      try {
        const response = await fetch('/api/voice/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            utterance,
            activeDraft: draft,
            items,
            customers,
            suppliers,
            todayStats,
            parserMode,
          }),
        });

        if (!response.ok) {
          throw new Error('Could not process voice command.');
        }

        const result = (await response.json()) as VoiceParseResponse;
        setParserLabel(result.parserLabel);

        if (result.bannerType === 'warning' && result.bannerMessage) {
          setWarningBanner(result.bannerMessage);
        }

        if (result.shouldConfirmActiveDraft && draft) {
          await handleConfirmDraft(draft);
          return;
        }

        if (result.draft !== undefined) {
          setDraft(result.draft);
        }

        if (result.targetTab !== activeTab) {
          setActiveTab(result.targetTab);
        }

        if (result.intent === 'QUERY_UDHAAR') {
          setFilterCustomerId(result.filterCustomerId);
        } else if (result.targetTab === 'khata') {
          setFilterCustomerId(result.filterCustomerId);
        }

        if (result.spokenReply) {
          speak(result.spokenReply);
        }
      } catch {
        const msg = 'Awaaz clear nahi aayi — phir se boliye';
        setWarningBanner(msg);
        speak(msg);
      } finally {
        setProcessingVoice(false);
      }
    },
    [draft, items, customers, suppliers, todayStats, parserMode, activeTab, handleConfirmDraft, speak]
  );

  const handleUndoLastBill = async () => {
    if (!undoPayload) return;
    const payload = undoPayload;
    setUndoPayload(null);
    setUndoSecondsLeft(0);
    setLastSavedTx(null);
    await undoTransactionInFirestore(payload);
    speak('Pichla bill undo ho gaya.');
  };

  const handleSelectAmbiguousCustomer = (customerId: string) => {
    if (!draft) return;
    const selected = customers.find((c) => c.id === customerId);
    if (!selected) return;
    setWarningBanner(null);
    void recalculateOnServer(
      {
        ...draft,
        customerId: selected.id,
        customerName: selected.name,
        customerPhone: selected.phone,
        prevUdhaar: selected.udhaarBalance,
        ambiguousCustomers: [],
        editedFields: ['customer'],
      },
      true
    );
  };

  const handleUpdateUnknownRate = (lineId: string, newRate: number, saveToCatalog: boolean) => {
    if (!draft) return;
    const nextItems = draft.items.map((it) =>
      it.id === lineId
        ? { ...it, unitPrice: newRate, rateMissing: newRate <= 0, saveToCatalog }
        : it
    );
    setWarningBanner(null);
    void recalculateOnServer({ ...draft, items: nextItems });
  };

  const handleUpdateLineQty = (lineId: string, newQty: number) => {
    if (!draft) return;
    const nextItems = draft.items.map((it) => (it.id === lineId ? { ...it, qty: newQty } : it));
    void recalculateOnServer({ ...draft, items: nextItems });
  };

  const handleRemoveLine = (lineId: string) => {
    if (!draft) return;
    const nextItems = draft.items.filter((it) => it.id !== lineId);
    if (nextItems.length === 0) {
      setDraft(null);
      return;
    }
    void recalculateOnServer({ ...draft, items: nextItems });
  };

  const handleUpdatePayment = (field: 'cashPaid' | 'upiPaid', amount: number) => {
    if (!draft) return;
    void recalculateOnServer({
      ...draft,
      [field]: amount,
      editedFields: [field],
    });
  };

  const handleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in was cancelled.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  };

  const handleResetDemo = async () => {
    if (!user) return;
    setResetting(true);
    try {
      setDraft(null);
      setLastSavedTx(null);
      setUndoPayload(null);
      setUndoSecondsLeft(0);
      setWarningBanner(null);
      setFilterCustomerId(null);
      await resetShopData(user.uid);
      speak('Demo data reset ho gaya.');
    } finally {
      setResetting(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F5F5F4] flex items-center justify-center p-6">
        <div className="bg-white border border-stone-200 rounded-2xl px-6 py-5 text-base font-semibold text-stone-700">
          Loading BolBahi...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <SignInScreen
        onSignIn={() => void handleSignIn()}
        signingIn={signingIn}
        errorMessage={authError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F4] pb-24 md:pb-10 overflow-x-hidden">
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'khata') setFilterCustomerId(null);
        }}
        parserLabel={parserLabel}
        muted={muted}
        onToggleMute={() =>
          setMuted((m) => {
            const next = !m;
            if (next) stopSpeaking();
            return next;
          })
        }
        onResetDemo={handleResetDemo}
        resetting={resetting}
        onSignOut={() => void signOut(auth)}
        lowStockCount={lowStockCount}
      />

      <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-4 sm:pt-7">
        {loadingShop ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-2">
            <p className="text-lg font-semibold text-stone-900">
              Syncing your kirana store with Cloud Firestore...
            </p>
            <p className="text-sm text-stone-500">
              Preparing 15 inventory items, 6 khata customers, and today&apos;s galla.
            </p>
          </div>
        ) : activeTab === 'counter' ? (
          <CounterTab
            draft={draft}
            customers={customers}
            processingVoice={processingVoice}
            confirmingBill={confirmingBill}
            warningBanner={warningBanner}
            lastSpokenReply={lastSpokenReply}
            onReplaySpoken={handleReplaySpoken}
            parserMode={parserMode}
            onParserModeChange={handleParserModeChange}
            onProcessUtterance={handleProcessUtterance}
            onSelectAmbiguousCustomer={handleSelectAmbiguousCustomer}
            onUpdateUnknownRate={handleUpdateUnknownRate}
            onUpdateLineQty={handleUpdateLineQty}
            onRemoveLine={handleRemoveLine}
            onUpdatePayment={handleUpdatePayment}
            onConfirmDraft={() => handleConfirmDraft()}
            onCancelDraft={() => {
              setDraft(null);
              setWarningBanner(null);
              speak('Draft cancel kar diya.');
            }}
            lastSavedTx={lastSavedTx}
            undoSecondsLeft={undoSecondsLeft}
            onUndoLastBill={handleUndoLastBill}
            recentTransactions={transactions}
          />
        ) : activeTab === 'khata' ? (
          <KhataTab
            customers={customers}
            transactions={transactions}
            filterCustomerId={filterCustomerId}
            onClearFilterCustomer={() => setFilterCustomerId(null)}
            onSettlePayment={async (customer, amt) => {
              await settleCustomerUdhaarInFirestore(customer, amt);
              speak(`${customer.name} ka ${amt} rupaye jama ho gaya.`);
            }}
            onAddCustomer={async (data) => {
              await addCustomerInFirestore({ uid: user.uid, ...data });
              speak(`${data.name} customer list mein save ho gaye.`);
            }}
          />
        ) : (
          <GallaStockTab
            todayStats={todayStats}
            items={items}
            suppliers={suppliers}
            onQuickRestock={async (item, qty) => {
              await restockItemInFirestore(item, qty);
              speak(`${item.name} mein ${qty} ${item.unit} stock add ho gaya.`);
            }}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'khata') setFilterCustomerId(null);
        }}
        lowStockCount={lowStockCount}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BolBahiApp />
    </ErrorBoundary>
  );
}
