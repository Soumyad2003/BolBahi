import { CheckCircle2, ExternalLink, Receipt, RotateCcw } from 'lucide-react';
import type {
  CustomerDoc,
  DraftBill,
  ItemDoc,
  LowStockAlertItem,
  ParserMode,
  RestockDraft,
  SupplierDoc,
  TransactionDoc,
} from '../../shared/types';
import { buildWhatsappReceiptUrl, formatINR } from '../utils/voiceAndWhatsapp';
import { DraftBillCard } from './DraftBillCard';
import { LowStockAlertBanner } from './LowStockAlertBanner';
import { RestockDraftCard } from './RestockDraftCard';
import { VoiceScratchpad } from './VoiceScratchpad';

interface CounterTabProps {
  draft: DraftBill | null;
  catalogItems: ItemDoc[];
  customers: CustomerDoc[];
  suppliers: SupplierDoc[];
  lowStockAlerts: LowStockAlertItem[];
  restockDraft: RestockDraft | null;
  receivingGroupKey: string | null;
  processingVoice: boolean;
  confirmingBill: boolean;
  warningBanner: string | null;
  lastSpokenReply: string | null;
  onReplaySpoken: () => void;
  parserMode: ParserMode;
  onParserModeChange: (mode: ParserMode) => void;
  onProcessUtterance: (utterance: string) => Promise<void>;
  onSelectAmbiguousCustomer: (customerId: string) => void;
  onUpdateUnknownRate: (lineId: string, newRate: number, saveToCatalog: boolean) => void;
  onUpdateLineQty: (lineId: string, newQty: number) => void;
  onRemoveLine: (lineId: string) => void;
  onUpdatePayment: (field: 'cashPaid' | 'upiPaid', amount: number) => void;
  onConfirmDraft: () => Promise<void>;
  onCancelDraft: () => void;
  onDraftRestockFromAlerts: () => void;
  onDismissLowStockAlerts: () => void;
  onUpdateRestockOrderQty: (itemId: string, nextQty: number) => void;
  onRemoveRestockItem: (itemId: string) => void;
  onAssignRestockSupplier: (itemId: string, supplierId: string) => void;
  onMarkRestockSupplierSent: (groupKey: string) => void;
  onReceiveRestockSupplierGroup: (groupKey: string, itemIds: string[]) => Promise<void>;
  onCancelRestockDraft: () => void;
  lastSavedTx: TransactionDoc | null;
  undoSecondsLeft: number;
  onUndoLastBill: () => Promise<void>;
  recentTransactions: TransactionDoc[];
  hasGeminiKey?: boolean | null;
}

function formatTime(ms?: number): string {
  if (!ms) return 'Today';
  return new Date(ms).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CounterTab({
  draft,
  catalogItems,
  customers,
  suppliers,
  lowStockAlerts,
  restockDraft,
  receivingGroupKey,
  processingVoice,
  confirmingBill,
  warningBanner,
  lastSpokenReply,
  onReplaySpoken,
  parserMode,
  onParserModeChange,
  onProcessUtterance,
  onSelectAmbiguousCustomer,
  onUpdateUnknownRate,
  onUpdateLineQty,
  onRemoveLine,
  onUpdatePayment,
  onConfirmDraft,
  onCancelDraft,
  onDraftRestockFromAlerts,
  onDismissLowStockAlerts,
  onUpdateRestockOrderQty,
  onRemoveRestockItem,
  onAssignRestockSupplier,
  onMarkRestockSupplierSent,
  onReceiveRestockSupplierGroup,
  onCancelRestockDraft,
  lastSavedTx,
  undoSecondsLeft,
  onUndoLastBill,
  recentTransactions,
  hasGeminiKey = null,
}: CounterTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Main Counter Workspace */}
      <div className="lg:col-span-7 space-y-6">
        <VoiceScratchpad
          onProcessUtterance={onProcessUtterance}
          processing={processingVoice}
          warningBanner={warningBanner}
          lastSpokenReply={lastSpokenReply}
          onReplaySpoken={onReplaySpoken}
          parserMode={parserMode}
          onParserModeChange={onParserModeChange}
          hasGeminiKey={hasGeminiKey}
          hasActiveDraft={Boolean(draft)}
          hasLowStockAlert={lowStockAlerts.length > 0}
          hasActiveRestockDraft={Boolean(restockDraft)}
        />

        {/* 5-Second Undo Toast + 1-Click WhatsApp Receipt Banner */}
        {lastSavedTx && (
          <section
            aria-label="Bill saved confirmation"
            className="bg-emerald-50 border border-emerald-300 rounded-2xl p-5 space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-bold text-emerald-950">
                    Bill Saved · {lastSavedTx.customerName}
                  </h2>
                  <p className="text-sm text-emerald-900 font-mono tabular-nums mt-0.5">
                    Total {formatINR(lastSavedTx.total)} · Cash {formatINR(lastSavedTx.cashPaid)} ·
                    UPI {formatINR(lastSavedTx.upiPaid)}
                    {lastSavedTx.newUdhaar > 0
                      ? ` · Udhaar +${formatINR(lastSavedTx.newUdhaar)}`
                      : ''}
                    {lastSavedTx.changeToReturn > 0
                      ? ` · Change ${formatINR(lastSavedTx.changeToReturn)}`
                      : ''}
                  </p>
                </div>
              </div>

              {undoSecondsLeft > 0 && (
                <button
                  type="button"
                  onClick={() => void onUndoLastBill()}
                  className="min-h-[48px] px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-sm inline-flex items-center gap-2 transition-colors cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Undo ({undoSecondsLeft}s)</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href={buildWhatsappReceiptUrl(lastSavedTx)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base inline-flex items-center gap-2 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open WhatsApp Receipt</span>
              </a>
              <span className="text-xs text-emerald-800">
                Includes UPI link: bolbahi.kirana@upi
              </span>
            </div>
          </section>
        )}

        {/* Soft Post-Confirm Low-Stock Alert Banner */}
        {lowStockAlerts.length > 0 && !restockDraft && (
          <LowStockAlertBanner
            alerts={lowStockAlerts}
            onDraftRestock={onDraftRestockFromAlerts}
            onDismiss={onDismissLowStockAlerts}
          />
        )}

        {/* Editable Supplier-Grouped Restock Draft Card */}
        {restockDraft && (
          <RestockDraftCard
            restockDraft={restockDraft}
            suppliers={suppliers}
            receivingGroupKey={receivingGroupKey}
            onUpdateOrderQty={onUpdateRestockOrderQty}
            onRemoveItem={onRemoveRestockItem}
            onAssignSupplier={onAssignRestockSupplier}
            onMarkSupplierSent={onMarkRestockSupplierSent}
            onReceiveSupplierGroup={onReceiveRestockSupplierGroup}
            onCancel={onCancelRestockDraft}
          />
        )}

        {/* Active Unconfirmed Draft Bill */}
        {draft ? (
          <DraftBillCard
            draft={draft}
            customers={customers}
            catalogItems={catalogItems}
            confirming={confirmingBill}
            onSelectAmbiguousCustomer={onSelectAmbiguousCustomer}
            onUpdateUnknownRate={onUpdateUnknownRate}
            onUpdateLineQty={onUpdateLineQty}
            onRemoveLine={onRemoveLine}
            onUpdatePayment={onUpdatePayment}
            onConfirm={onConfirmDraft}
            onCancel={onCancelDraft}
          />
        ) : !restockDraft ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-2">
            <Receipt className="w-8 h-8 text-stone-400 mx-auto" />
            <h2 className="text-lg font-semibold text-stone-900">Counter Ready for Next Bill</h2>
            <p className="text-base text-stone-600 max-w-md mx-auto">
              Dictate a sale above or tap any Quick-Speak test utterance. Every sale stays in
              Unconfirmed Draft until you confirm.
            </p>
          </div>
        ) : null}
      </div>

      {/* Recent Bills Feed */}
      <aside aria-label="Recent Bills" className="lg:col-span-5 bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900">Recent Bills</h2>
          <span className="text-sm text-stone-500 font-mono tabular-nums">
            {recentTransactions.length} saved
          </span>
        </div>

        {recentTransactions.length === 0 ? (
          <p className="text-base text-stone-500 py-6 text-center">No bills recorded yet today.</p>
        ) : (
          <ul className="divide-y divide-stone-200">
            {recentTransactions.slice(0, 10).map((tx) => (
              <li key={tx.id} className="py-4 first:pt-1 last:pb-1 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-stone-900 truncate">
                      {tx.customerName}
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {formatTime(tx.createdAtMs)} · {tx.items.length}{' '}
                      {tx.items.length === 1 ? 'item' : 'items'} · {tx.dateKey}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold font-mono tabular-nums text-stone-900">
                      {formatINR(tx.total)}
                    </div>
                    <div className="text-xs font-mono tabular-nums text-stone-600">
                      {tx.cashPaid > 0 && (
                        <span className="text-emerald-700 font-semibold">
                          Cash {formatINR(tx.cashPaid)}
                        </span>
                      )}
                      {tx.upiPaid > 0 && (
                        <span className="text-emerald-700 font-semibold">
                          {tx.cashPaid > 0 ? ' · ' : ''}UPI {formatINR(tx.upiPaid)}
                        </span>
                      )}
                      {tx.newUdhaar > 0 && (
                        <span className="text-amber-700 font-semibold">
                          {tx.cashPaid > 0 || tx.upiPaid > 0 ? ' · ' : ''}Udhaar{' '}
                          {formatINR(tx.newUdhaar)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-stone-600 line-clamp-2 italic">
                  &ldquo;{tx.transcript}&rdquo;
                </p>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-stone-500 truncate max-w-[60%]">
                    {tx.items.map((it) => `${it.qty} ${it.unit} ${it.name}`).join(', ')}
                  </span>
                  <a
                    href={buildWhatsappReceiptUrl(tx)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <span>WhatsApp</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
