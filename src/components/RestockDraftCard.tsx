import { CheckCircle2, ExternalLink, PackageCheck, Trash2, Truck, X } from 'lucide-react';
import type { RestockDraft, SupplierDoc } from '../../shared/types';
import { groupRestockLinesBySupplier } from '../../shared/restockMath';
import { buildWhatsappRestockDraftUrl } from '../utils/voiceAndWhatsapp';

interface RestockDraftCardProps {
  restockDraft: RestockDraft;
  suppliers: SupplierDoc[];
  receivingGroupKey: string | null;
  onUpdateOrderQty: (itemId: string, nextQty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onAssignSupplier: (itemId: string, supplierId: string) => void;
  onMarkSupplierSent: (groupKey: string) => void;
  onReceiveSupplierGroup: (groupKey: string, itemIds: string[]) => Promise<void>;
  onCancel: () => void;
}

export function RestockDraftCard({
  restockDraft,
  suppliers,
  receivingGroupKey,
  onUpdateOrderQty,
  onRemoveItem,
  onAssignSupplier,
  onMarkSupplierSent,
  onReceiveSupplierGroup,
  onCancel,
}: RestockDraftCardProps) {
  const groups = groupRestockLinesBySupplier(restockDraft.items, suppliers);

  return (
    <section
      aria-label="Restock Order Draft"
      data-testid="restock-draft-card"
      className="bg-white border border-emerald-300 rounded-2xl p-5 sm:p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-200">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-emerald-800">
            <Truck className="w-4 h-4 shrink-0" />
            <p className="text-xs font-bold tracking-wide uppercase">
              Editable Restock Order Draft · {restockDraft.items.length}{' '}
              {restockDraft.items.length === 1 ? 'Item' : 'Items'}
            </p>
          </div>
          <p className="text-sm text-stone-600">
            Say <span className="font-semibold text-stone-900">&ldquo;Atta 25 kilo kar do&rdquo;</span>,{' '}
            <span className="font-semibold text-stone-900">&ldquo;Tel hata do&rdquo;</span>, or{' '}
            <span className="font-semibold text-stone-900">&ldquo;Cancel kar do&rdquo;</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel restock order draft"
          className="min-h-[44px] min-w-[44px] rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 inline-flex items-center justify-center shrink-0 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Supplier-Grouped Sections */}
      <div className="space-y-4">
        {groups.map((group) => {
          const isSent = restockDraft.sentSupplierIds.includes(group.groupKey);
          const isReceiving = receivingGroupKey === group.groupKey;
          const whatsappUrl = buildWhatsappRestockDraftUrl(group.supplier, group.lines);

          return (
            <div
              key={group.groupKey}
              data-testid={`restock-supplier-group-${group.groupKey}`}
              className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 space-y-3"
            >
              {/* Supplier Title Row */}
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2 border-b border-stone-200/80">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-stone-900">
                    {group.supplier ? group.supplier.name : 'Unassigned Supplier'}
                  </h3>
                  <p className="text-xs text-stone-500 font-mono tabular-nums mt-0.5">
                    {group.supplier?.phone
                      ? `+91 ${group.supplier.phone}`
                      : 'Select a wholesale supplier below or share directly'}
                  </p>
                </div>

                {isSent && (
                  <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>WhatsApp opened</span>
                  </span>
                )}
              </div>

              {/* Line Items */}
              <div className="divide-y divide-stone-200/80">
                {group.lines.map((line) => (
                  <div
                    key={line.itemId}
                    className={`py-3 first:pt-1 last:pb-1 space-y-2.5 ${
                      line.justUpdated ? 'animate-flash-blue' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-stone-900">{line.name}</p>
                        <p className="text-xs text-stone-600 font-mono tabular-nums mt-0.5">
                          Current: {line.currentStock} {line.unit} · Threshold:{' '}
                          {line.reorderThreshold} {line.unit}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(line.itemId)}
                        aria-label={`Remove ${line.name} from restock draft`}
                        className="min-h-[44px] min-w-[44px] rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {/* Order Qty Steppers (>= 44px touch targets) */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-stone-600">Order Qty:</span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateOrderQty(line.itemId, Math.max(1, line.orderQty - 1))
                          }
                          aria-label={`Decrease restock quantity for ${line.name}`}
                          className="min-h-[44px] min-w-[44px] rounded-lg border border-stone-300 bg-white hover:bg-stone-100 font-bold text-stone-800 text-base cursor-pointer"
                        >
                          −
                        </button>
                        <span
                          data-testid={`restock-qty-${line.slug}`}
                          className="font-mono tabular-nums font-bold text-stone-900 min-w-[68px] text-center text-base"
                        >
                          {line.orderQty} {line.unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateOrderQty(line.itemId, line.orderQty + 1)}
                          aria-label={`Increase restock quantity for ${line.name}`}
                          className="min-h-[44px] min-w-[44px] rounded-lg border border-stone-300 bg-white hover:bg-stone-100 font-bold text-stone-800 text-base cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      {/* Quick supplier assignment dropdown for unassigned items */}
                      {!group.supplier && suppliers.length > 0 && (
                        <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
                          <span>Supplier:</span>
                          <select
                            aria-label={`Assign supplier for ${line.name}`}
                            value=""
                            onChange={(e) => {
                              if (e.target.value) onAssignSupplier(line.itemId, e.target.value);
                            }}
                            className="min-h-[44px] px-2.5 rounded-lg border border-stone-300 bg-white text-sm font-medium text-stone-900 cursor-pointer"
                          >
                            <option value="">Choose supplier...</option>
                            {suppliers.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Supplier Group Primary & Secondary Actions (>= 48px) */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-stone-200/80">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onMarkSupplierSent(group.groupKey)}
                  className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm sm:text-base inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  <span>
                    {group.supplier
                      ? `Send WhatsApp to ${group.supplier.name.split(' ')[0]}`
                      : 'Send Order on WhatsApp'}
                  </span>
                </a>

                <button
                  type="button"
                  disabled={isReceiving}
                  onClick={() =>
                    void onReceiveSupplierGroup(
                      group.groupKey,
                      group.lines.map((l) => l.itemId)
                    )
                  }
                  className="min-h-[48px] px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-50 text-stone-800 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <PackageCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{isReceiving ? 'Updating Stock...' : 'Mark Received (+Stock)'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Transcript footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-stone-500">
        <span>
          Voice command:{' '}
          <span className="italic text-stone-700">&ldquo;{restockDraft.sourceTranscript}&rdquo;</span>
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] px-3 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 font-semibold transition-colors cursor-pointer"
        >
          Close Draft
        </button>
      </div>
    </section>
  );
}
