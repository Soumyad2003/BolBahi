import { AlertTriangle, CheckCircle2, Trash2, UserCheck, X } from 'lucide-react';
import type { CustomerDoc, DraftBill } from '../../shared/types';
import { formatINR } from '../utils/voiceAndWhatsapp';

interface DraftBillCardProps {
  draft: DraftBill;
  customers: CustomerDoc[];
  confirming: boolean;
  onSelectAmbiguousCustomer: (customerId: string) => void;
  onUpdateUnknownRate: (lineId: string, newRate: number, saveToCatalog: boolean) => void;
  onUpdateLineQty: (lineId: string, newQty: number) => void;
  onRemoveLine: (lineId: string) => void;
  onUpdatePayment: (field: 'cashPaid' | 'upiPaid', amount: number) => void;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function DraftBillCard({
  draft,
  customers,
  confirming,
  onSelectAmbiguousCustomer,
  onUpdateUnknownRate,
  onUpdateLineQty,
  onRemoveLine,
  onUpdatePayment,
  onConfirm,
  onCancel,
}: DraftBillCardProps) {
  const hasAmbiguity = draft.ambiguousCustomers.length > 1;
  const hasMissingRate = draft.items.some((it) => it.rateMissing);
  const canConfirm = !hasAmbiguity && !hasMissingRate && draft.items.length > 0 && !confirming;
  const editedSet = new Set(draft.editedFields ?? []);
  const sortedCustomers = [...customers].sort((a, b) => {
    if (a.slug === 'walk-in') return 1;
    if (b.slug === 'walk-in') return -1;
    return a.name.localeCompare(b.name);
  });

  return (
    <section
      aria-label="Unconfirmed Draft Bill"
      data-testid="draft-bill-card"
      className="bg-white border-2 border-amber-500 rounded-2xl p-5 sm:p-6 space-y-5"
    >
      {/* Top Banner: Hard Money Safety Label */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200">
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-amber-700 tracking-wide">
            UNCONFIRMED DRAFT BILL · NOT SAVED YET
          </p>
          <p className="text-sm text-stone-600">
            Say <span className="font-semibold text-stone-900">&ldquo;Haan, bhej do&rdquo;</span> or
            tap Confirm to save to Firestore
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel draft bill"
          className="min-h-[44px] min-w-[44px] rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 inline-flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Customer Block (with Ambiguous Disambiguation Chips when triggered) */}
      <div
        className={`rounded-xl p-4 border ${
          hasAmbiguity
            ? 'bg-amber-50 border-amber-400'
            : editedSet.has('customer')
              ? 'bg-stone-50 border-stone-200 animate-flash-blue'
              : 'bg-stone-50 border-stone-200'
        }`}
      >
        {hasAmbiguity ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-amber-900 font-semibold text-base">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>
                Multiple customers match &ldquo;{draft.customerQuery || draft.customerName}&rdquo; —
                select customer:
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {draft.ambiguousCustomers.map((cand) => (
                <button
                  key={cand.id}
                  type="button"
                  onClick={() => onSelectAmbiguousCustomer(cand.id)}
                  className="min-h-[56px] p-3.5 rounded-xl bg-white border-2 border-amber-400 hover:border-emerald-600 hover:bg-emerald-50 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer"
                >
                  <div>
                    <div className="font-bold text-base text-stone-900">{cand.name}</div>
                    <div className="text-sm text-stone-600 font-mono tabular-nums">
                      Phone: ••••{cand.phone.slice(-4)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-stone-500">Prev Udhaar</div>
                    <div className="text-base font-bold font-mono tabular-nums text-amber-700">
                      {formatINR(cand.udhaarBalance)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-stone-900 truncate">{draft.customerName}</h2>
                  {draft.customerPhone && (
                    <p className="text-sm text-stone-500 font-mono tabular-nums">
                      +91 {draft.customerPhone}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-medium text-stone-500 block">Prev Udhaar</span>
                <span className="text-base font-bold font-mono tabular-nums text-amber-700">
                  {formatINR(draft.prevUdhaar)}
                </span>
              </div>
            </div>

            {sortedCustomers.length > 1 && (
              <div className="pt-2 border-t border-stone-200/80 flex items-center justify-between gap-3">
                <label
                  htmlFor="draft-customer-select"
                  className="text-xs font-semibold text-stone-600 shrink-0"
                >
                  Change Customer
                </label>
                <select
                  id="draft-customer-select"
                  value={draft.customerId ?? ''}
                  onChange={(e) => {
                    if (e.target.value) onSelectAmbiguousCustomer(e.target.value);
                  }}
                  className="flex-1 max-w-[240px] min-h-[40px] px-3 rounded-lg border border-stone-300 bg-white text-sm font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 cursor-pointer"
                >
                  {sortedCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` (${c.phone.slice(-4)})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Itemized Rows */}
      <div className="divide-y divide-stone-200 border-t border-b border-stone-200">
        {draft.items.map((item) => {
          const isFlashing = item.justUpdated || editedSet.has(`item:${item.id}`);
          return (
            <div
              key={item.id}
              className={`py-3.5 space-y-2.5 ${isFlashing ? 'animate-flash-blue' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-stone-900">{item.name}</span>
                    {item.rateMissing && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-xs font-bold">
                        Rate Missing
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-stone-600 font-mono tabular-nums mt-0.5">
                    {item.qty} {item.unit} × {formatINR(item.unitPrice)}
                    {item.gstPercent > 0 && (
                      <span className="text-stone-500">
                        {' '}
                        · MRP incl. {item.gstPercent}% GST ({formatINR(item.gstIncluded)})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-lg font-bold font-mono tabular-nums text-stone-900">
                    {formatINR(item.lineTotal)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveLine(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="min-h-[44px] min-w-[44px] rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Inline Rate Input for Unknown / Missing-Rate Items */}
              {(item.isUnknown || item.rateMissing) && (
                <div className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                    <span>Rate (₹/{item.unit}):</span>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={item.unitPrice || ''}
                      placeholder="Enter ₹"
                      onChange={(e) =>
                        onUpdateUnknownRate(
                          item.id,
                          Math.max(0, Number(e.target.value) || 0),
                          Boolean(item.saveToCatalog)
                        )
                      }
                      className="w-28 min-h-[44px] px-3 rounded-lg border border-amber-400 bg-white font-mono text-base font-bold text-stone-900"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-amber-950 min-h-[44px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(item.saveToCatalog)}
                      onChange={(e) =>
                        onUpdateUnknownRate(item.id, item.unitPrice, e.target.checked)
                      }
                      className="w-5 h-5 accent-emerald-600 rounded"
                    />
                    <span>Save to Catalog</span>
                  </label>
                </div>
              )}

              {/* Quick Qty Stepper */}
              <div className="flex items-center gap-2 text-sm text-stone-600">
                <span>Qty:</span>
                <button
                  type="button"
                  onClick={() => onUpdateLineQty(item.id, Math.max(0.5, item.qty - 1))}
                  aria-label={`Decrease quantity for ${item.name}`}
                  className="min-h-[36px] min-w-[36px] rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 font-bold text-stone-800 cursor-pointer"
                >
                  −
                </button>
                <span className="font-mono tabular-nums font-semibold text-stone-900 min-w-[44px] text-center">
                  {item.qty} {item.unit}
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateLineQty(item.id, item.qty + 1)}
                  aria-label={`Increase quantity for ${item.name}`}
                  className="min-h-[36px] min-w-[36px] rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 font-bold text-stone-800 cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Deterministic Totals & Split Payment Breakdown */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-base font-bold text-stone-900">Bill Total (MRP Inclusive)</span>
            <p className="text-xs text-stone-500 font-mono tabular-nums">
              Included GST: {formatINR(draft.gstIncluded)} (not added on top)
            </p>
          </div>
          <span
            data-testid="draft-total"
            className="text-3xl font-bold font-mono tabular-nums text-stone-900"
          >
            {formatINR(draft.total)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div
            className={`p-3 rounded-xl border border-stone-200 bg-stone-50 ${
              editedSet.has('cashPaid') ? 'animate-flash-blue' : ''
            }`}
          >
            <label
              htmlFor="draft-cash-input"
              className="text-xs font-semibold text-stone-600 block mb-1"
            >
              Cash Paid (₹)
            </label>
            <input
              id="draft-cash-input"
              type="number"
              min={0}
              value={draft.cashPaid}
              onChange={(e) => onUpdatePayment('cashPaid', Math.max(0, Number(e.target.value) || 0))}
              className="w-full min-h-[40px] px-2.5 rounded-lg border border-stone-300 bg-white font-mono tabular-nums text-base font-bold text-emerald-700"
            />
          </div>

          <div
            className={`p-3 rounded-xl border border-stone-200 bg-stone-50 ${
              editedSet.has('upiPaid') ? 'animate-flash-blue' : ''
            }`}
          >
            <label
              htmlFor="draft-upi-input"
              className="text-xs font-semibold text-stone-600 block mb-1"
            >
              UPI Paid (₹)
            </label>
            <input
              id="draft-upi-input"
              type="number"
              min={0}
              value={draft.upiPaid}
              onChange={(e) => onUpdatePayment('upiPaid', Math.max(0, Number(e.target.value) || 0))}
              className="w-full min-h-[40px] px-2.5 rounded-lg border border-stone-300 bg-white font-mono tabular-nums text-base font-bold text-emerald-700"
            />
          </div>

          {draft.changeToReturn > 0 ? (
            <div className="col-span-2 sm:col-span-1 p-3 rounded-xl border border-blue-300 bg-blue-50 flex flex-col justify-center">
              <span className="text-xs font-bold text-blue-800">Baaki Wapas (Change)</span>
              <span
                data-testid="draft-change"
                className="text-xl font-bold font-mono tabular-nums text-blue-700 mt-1"
              >
                {formatINR(draft.changeToReturn)}
              </span>
            </div>
          ) : (
            <div className="col-span-2 sm:col-span-1 p-3 rounded-xl border border-amber-300 bg-amber-50 flex flex-col justify-center">
              <span className="text-xs font-bold text-amber-900">New Udhaar</span>
              <span
                data-testid="draft-udhaar"
                className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1"
              >
                +{formatINR(draft.newUdhaar)}
              </span>
            </div>
          )}
        </div>

        {/* Raw Voice Transcript Preview */}
        <p className="text-xs text-stone-500">
          Voice transcript: <span className="italic text-stone-700">&ldquo;{draft.transcript}&rdquo;</span>
        </p>

        {/* Primary Confirm & Cancel Actions (>= 48px) */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => void onConfirm()}
            className="flex-1 min-h-[54px] px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:text-stone-500 text-white font-bold text-base inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{confirming ? 'Saving to Firestore...' : 'Confirm & Send WhatsApp'}</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="sm:w-36 min-h-[54px] px-5 py-3 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 font-semibold text-base transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}
