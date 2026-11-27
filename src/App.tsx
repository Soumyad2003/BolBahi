import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CustomerDoc,
  DraftBill,
  ItemDoc,
  LowStockAlertItem,
  ParserMode,
  RestockDraft,
  SupplierDoc,
  TodayStats,
  TransactionDoc,
  UndoBillPayload,
  VoiceParseResponse,
} from '../shared/types';
import { getTodayDateKey } from '../shared/seedCatalog';
import {
  buildPostConfirmLowStockSpeech,
  buildRestockDraftFromAlerts,
  buildRestockSpokenSummary,
} from '../shared/restockMath';
import {
  addCustomerLocal,
  confirmDraftBillLocal,
  loadLocalDemoState,
  resetLocalDemoState,
  restockItemLocal,
  restockItemsBatchLocal,
  saveLocalDemoState,
  settleCustomerUdhaarLocal,
  undoTransactionLocal,
  type LocalDemoState,
} from './utils/localDemoStore';
import { speakHinglish, stopSpeaking } from './utils/voiceAndWhatsapp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header, type ActiveTab, type ParserBadgeLabel } from './components/Header';
import { CounterTab } from './components/CounterTab';
import { KhataTab } from './components/KhataTab';
import { GallaStockTab } from './components/GallaStockTab';
import { BottomNav } from './components/BottomNav';

function BolBahiApp() {
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null);

  const initialDemo = useMemo(() => loadLocalDemoState(), []);
  const [items, setItems] = useState<ItemDoc[]>(initialDemo.items);
  const [customers, setCustomers] = useState<CustomerDoc[]>(initialDemo.customers);
  const [suppliers, setSuppliers] = useState<SupplierDoc[]>(initialDemo.suppliers);
  const [transactions, setTransactions] = useState<TransactionDoc[]>(initialDemo.transactions);
  const [resetting, setResetting] = useState(false);

  const applyLocalDemoState = useCallback((next: LocalDemoState) => {
    setItems(next.items);
    setCustomers(next.customers);
    setSuppliers(next.suppliers);
    setTransactions(next.transactions);
    saveLocalDemoState(next);
  }, []);

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

  const handleParserModeChange = useCallback(
    (mode: ParserMode) => {
      setParserMode(mode);
      setParserLabel(
        mode === 'offline'
          ? 'Offline Local'
          : hasGeminiKey === false
            ? 'Offline Fallback'
            : 'Gemini Flash-Lite'
      );
      try {
        window.localStorage.setItem('bolbahi_parser_mode', mode);
      } catch {
        // Ignore storage errors in restricted contexts
      }
    },
    [hasGeminiKey]
  );

  const [draft, setDraft] = useState<DraftBill | null>(null);
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlertItem[]>([]);
  const [restockDraft, setRestockDraft] = useState<RestockDraft | null>(null);
  const [receivingGroupKey, setReceivingGroupKey] = useState<string | null>(null);
  const [processingVoice, setProcessingVoice] = useState(false);
  const [confirmingBill, setConfirmingBill] = useState(false);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);
  const [lastSpokenReply, setLastSpokenReply] = useState<string | null>(null);

  const [lastSavedTx, setLastSavedTx] = useState<TransactionDoc | null>(null);
  const [undoPayload, setUndoPayload] = useState<UndoBillPayload | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);

  const undoIntervalRef = useRef<number | null>(null);

  // Check backend health / optional GEMINI_API_KEY availability
  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { hasGeminiKey?: boolean } | null) => {
        if (!active || !data) return;
        const keyAvailable = Boolean(data.hasGeminiKey);
        setHasGeminiKey(keyAvailable);
        if (!keyAvailable) {
          let storedMode: string | null = null;
          try {
            storedMode = window.localStorage.getItem('bolbahi_parser_mode');
          } catch {
            storedMode = null;
          }
          if (!storedMode) {
            setParserMode('offline');
            setParserLabel('Offline Local');
          } else if (storedMode !== 'offline') {
            setParserLabel('Offline Fallback');
          }
        }
      })
      .catch(() => {
        // Non-blocking health check
      });
    return () => {
      active = false;
    };
  }, []);

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
      const useGeminiTts = parserMode === 'gemini' && hasGeminiKey !== false;
      speakHinglish(msg, muted, 'en-IN', useGeminiTts);
    },
    [muted, parserMode, hasGeminiKey]
  );

  const handleReplaySpoken = useCallback(() => {
    if (!lastSpokenReply) return;
    const useGeminiTts = parserMode === 'gemini' && hasGeminiKey !== false;
    speakHinglish(lastSpokenReply, false, 'en-IN', useGeminiTts);
  }, [lastSpokenReply, parserMode, hasGeminiKey]);

  const recalculateOnServer = useCallback(
    async (nextDraft: DraftBill, announce = false) => {
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
      if (!target || confirmingBill) return;
      if (target.ambiguousCustomers.length > 1 || target.items.some((it) => it.rateMissing)) {
        return;
      }

      setConfirmingBill(true);
      setWarningBanner(null);
      try {
        const localRes = confirmDraftBillLocal(
          { items, customers, suppliers, transactions },
          target
        );
        applyLocalDemoState(localRes.nextState);

        setDraft(null);
        setLastSavedTx(localRes.transaction);
        setUndoPayload(localRes.undoPayload);
        setUndoSecondsLeft(5);
        setLowStockAlerts(localRes.lowStockAlerts);
        if (localRes.lowStockAlerts.length > 0) {
          speak(
            `Bill save ho gaya. ${buildPostConfirmLowStockSpeech(localRes.lowStockAlerts)}`
          );
        } else {
          speak('Bill save ho gaya. WhatsApp receipt ready hai.');
        }
      } catch (err) {
        setWarningBanner(err instanceof Error ? err.message : 'Failed to save bill.');
      } finally {
        setConfirmingBill(false);
      }
    },
    [
      draft,
      confirmingBill,
      items,
      customers,
      suppliers,
      transactions,
      applyLocalDemoState,
      speak,
    ]
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
            activeRestockDraft: restockDraft,
            lowStockAlertItems: lowStockAlerts,
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
        if (parserMode === 'offline') {
          setParserLabel('Offline Local');
        } else if (result.parserSource === 'fallback' || hasGeminiKey === false) {
          setParserLabel('Offline Fallback');
        } else {
          setParserLabel('Gemini Flash-Lite');
        }

        if (result.bannerType === 'warning' && result.bannerMessage) {
          setWarningBanner(result.bannerMessage);
        }

        if (result.shouldConfirmActiveDraft && draft) {
          await handleConfirmDraft(draft);
          return;
        }

        if (result.shouldCancelRestockDraft) {
          setRestockDraft(null);
        }

        if (result.intent === 'ORDER_RESTOCK' && result.restockDraft !== undefined) {
          setRestockDraft(result.restockDraft);
          if (result.restockDraft) {
            setLowStockAlerts([]);
          }
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
    [
      draft,
      restockDraft,
      lowStockAlerts,
      items,
      customers,
      suppliers,
      todayStats,
      parserMode,
      hasGeminiKey,
      activeTab,
      handleConfirmDraft,
      speak,
    ]
  );

  const handleUndoLastBill = async () => {
    if (!undoPayload) return;
    const payload = undoPayload;
    setUndoPayload(null);
    setUndoSecondsLeft(0);
    setLastSavedTx(null);
    setLowStockAlerts([]);
    const restored = undoTransactionLocal(
      { items, customers, suppliers, transactions },
      payload
    );
    applyLocalDemoState(restored);
    speak('Pichla bill undo ho gaya.');
  };

  const handleDraftRestockFromAlerts = () => {
    if (lowStockAlerts.length === 0) return;
    const nextRestock = buildRestockDraftFromAlerts(
      lowStockAlerts,
      'Low stock alert order',
      'pre-router'
    );
    if (!nextRestock) return;
    setRestockDraft(nextRestock);
    setLowStockAlerts([]);
    speak(buildRestockSpokenSummary(nextRestock, false));
  };

  const handleUpdateRestockOrderQty = (itemId: string, nextQty: number) => {
    setRestockDraft((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        items: prev.items.map((it) =>
          it.itemId === itemId ? { ...it, orderQty: Math.max(1, nextQty), justUpdated: false } : it
        ),
      };
    });
  };

  const handleRemoveRestockItem = (itemId: string) => {
    setRestockDraft((prev) => {
      if (!prev) return null;
      const remaining = prev.items.filter((it) => it.itemId !== itemId);
      return remaining.length > 0 ? { ...prev, items: remaining } : null;
    });
  };

  const handleAssignRestockSupplier = (itemId: string, supplierId: string) => {
    setRestockDraft((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        items: prev.items.map((it) => (it.itemId === itemId ? { ...it, supplierId } : it)),
      };
    });
  };

  const handleMarkRestockSupplierSent = (groupKey: string) => {
    setRestockDraft((prev) => {
      if (!prev) return null;
      if (prev.sentSupplierIds.includes(groupKey)) return prev;
      return {
        ...prev,
        sentSupplierIds: [...prev.sentSupplierIds, groupKey],
      };
    });
  };

  const handleReceiveRestockSupplierGroup = async (groupKey: string, itemIds: string[]) => {
    if (!restockDraft || receivingGroupKey) return;
    const linesToReceive = restockDraft.items.filter((l) => itemIds.includes(l.itemId));
    const entries = linesToReceive
      .map((line) => {
        const catalogItem = items.find((ci) => ci.id === line.itemId);
        return catalogItem ? { item: catalogItem, addedQty: line.orderQty } : null;
      })
      .filter((entry): entry is { item: ItemDoc; addedQty: number } => Boolean(entry));

    if (entries.length === 0) return;

    setReceivingGroupKey(groupKey);
    try {
      const nextLocal = restockItemsBatchLocal(
        { items, customers, suppliers, transactions },
        entries
      );
      applyLocalDemoState(nextLocal);
      setRestockDraft((prev) => {
        if (!prev) return null;
        const remaining = prev.items.filter((l) => !itemIds.includes(l.itemId));
        return remaining.length > 0 ? { ...prev, items: remaining } : null;
      });
      setLowStockAlerts((prev) => prev.filter((a) => !itemIds.includes(a.itemId)));
      speak(
        `${entries.map((e) => `${e.addedQty} ${e.item.unit} ${e.item.name}`).join(', ')} stock mein add ho gaya.`
      );
    } catch (err) {
      setWarningBanner(err instanceof Error ? err.message : 'Failed to update stock.');
    } finally {
      setReceivingGroupKey(null);
    }
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

  const handleResetDemo = async () => {
    setResetting(true);
    try {
      setDraft(null);
      setLowStockAlerts([]);
      setRestockDraft(null);
      setLastSavedTx(null);
      setUndoPayload(null);
      setUndoSecondsLeft(0);
      setWarningBanner(null);
      setFilterCustomerId(null);
      setParserLabel(
        parserMode === 'offline'
          ? 'Offline Local'
          : hasGeminiKey === false
            ? 'Offline Fallback'
            : 'Gemini Flash-Lite'
      );
      const fresh = resetLocalDemoState();
      setItems(fresh.items);
      setCustomers(fresh.customers);
      setSuppliers(fresh.suppliers);
      setTransactions(fresh.transactions);
      speak('Demo data reset ho gaya.');
    } finally {
      setResetting(false);
    }
  };

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
        lowStockCount={lowStockCount}
      />

      <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-4 sm:pt-7">
        {activeTab === 'counter' ? (
          <CounterTab
            draft={draft}
            catalogItems={items}
            customers={customers}
            suppliers={suppliers}
            lowStockAlerts={lowStockAlerts}
            restockDraft={restockDraft}
            receivingGroupKey={receivingGroupKey}
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
            onDraftRestockFromAlerts={handleDraftRestockFromAlerts}
            onDismissLowStockAlerts={() => setLowStockAlerts([])}
            onUpdateRestockOrderQty={handleUpdateRestockOrderQty}
            onRemoveRestockItem={handleRemoveRestockItem}
            onAssignRestockSupplier={handleAssignRestockSupplier}
            onMarkRestockSupplierSent={handleMarkRestockSupplierSent}
            onReceiveRestockSupplierGroup={handleReceiveRestockSupplierGroup}
            onCancelRestockDraft={() => {
              setRestockDraft(null);
              speak('Restock order draft cancel kar diya.');
            }}
            lastSavedTx={lastSavedTx}
            undoSecondsLeft={undoSecondsLeft}
            onUndoLastBill={handleUndoLastBill}
            recentTransactions={transactions}
            hasGeminiKey={hasGeminiKey}
          />
        ) : activeTab === 'khata' ? (
          <KhataTab
            customers={customers}
            transactions={transactions}
            filterCustomerId={filterCustomerId}
            onClearFilterCustomer={() => setFilterCustomerId(null)}
            onSettlePayment={async (customer, amt) => {
              const nextLocal = settleCustomerUdhaarLocal(
                { items, customers, suppliers, transactions },
                customer.id,
                amt
              );
              applyLocalDemoState(nextLocal);
              speak(`${customer.name} ka ${amt} rupaye jama ho gaya.`);
            }}
            onAddCustomer={async (data) => {
              const nextLocal = addCustomerLocal(
                { items, customers, suppliers, transactions },
                data
              );
              applyLocalDemoState(nextLocal);
              speak(`${data.name} customer list mein save ho gaye.`);
            }}
          />
        ) : (
          <GallaStockTab
            todayStats={todayStats}
            items={items}
            suppliers={suppliers}
            onQuickRestock={async (item, qty) => {
              const nextLocal = restockItemLocal(
                { items, customers, suppliers, transactions },
                item.id,
                qty
              );
              applyLocalDemoState(nextLocal);
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
