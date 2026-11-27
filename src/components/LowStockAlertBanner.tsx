import { AlertTriangle, PackagePlus, X } from 'lucide-react';
import type { LowStockAlertItem } from '../../shared/types';

interface LowStockAlertBannerProps {
  alerts: LowStockAlertItem[];
  onDraftRestock: () => void;
  onDismiss: () => void;
}

export function LowStockAlertBanner({
  alerts,
  onDraftRestock,
  onDismiss,
}: LowStockAlertBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <section
      aria-label="Low stock notice"
      data-testid="low-stock-alert-banner"
      className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-bold text-amber-950">
              Low Stock Notice · {alerts.length} {alerts.length === 1 ? 'item' : 'items'} at or below threshold
            </h2>
            <p className="text-sm text-amber-900/90">
              Say <span className="font-semibold text-amber-950">&ldquo;Haan mangwa lo&rdquo;</span> or{' '}
              <span className="font-semibold text-amber-950">&ldquo;20 kilo atta mangwa lo&rdquo;</span> to draft a supplier order.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss low stock notice"
          className="min-h-[44px] min-w-[44px] rounded-xl text-amber-800 hover:bg-amber-100 inline-flex items-center justify-center shrink-0 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ul className="divide-y divide-amber-200/70 border-t border-amber-200/70">
        {alerts.map((item) => (
          <li
            key={item.itemId}
            className="py-2 flex flex-wrap items-baseline justify-between gap-2 text-sm"
          >
            <span className="font-semibold text-stone-900">{item.name}</span>
            <span className="font-mono tabular-nums text-amber-900">
              {item.remainingStock} {item.unit} left · Threshold {item.reorderThreshold} {item.unit} · Suggested +{item.suggestedOrderQty} {item.unit}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onDraftRestock}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-semibold text-sm inline-flex items-center gap-2 transition-colors cursor-pointer"
        >
          <PackagePlus className="w-4 h-4" />
          <span>Draft Restock Order</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[44px] px-3.5 py-2 rounded-xl text-amber-900 hover:bg-amber-100 font-medium text-sm transition-colors cursor-pointer"
        >
          Later
        </button>
      </div>
    </section>
  );
}
