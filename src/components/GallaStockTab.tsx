import { useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, PackagePlus, Truck } from 'lucide-react';
import type { ItemDoc, SupplierDoc, TodayStats } from '../../shared/types';
import { buildWhatsappRestockOrderUrl, formatINR } from '../utils/voiceAndWhatsapp';

interface GallaStockTabProps {
  todayStats: TodayStats;
  items: ItemDoc[];
  suppliers: SupplierDoc[];
  onQuickRestock: (item: ItemDoc, addedQty: number) => Promise<void>;
}

export function GallaStockTab({
  todayStats,
  items,
  suppliers,
  onQuickRestock,
}: GallaStockTabProps) {
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'low'>('all');

  const lowStockItems = useMemo(
    () => items.filter((it) => it.stock <= it.reorderThreshold),
    [items]
  );

  const groupedLowStock = useMemo(() => {
    return suppliers
      .map((supplier) => ({
        supplier,
        items: lowStockItems.filter((it) => it.supplierId === supplier.id),
      }))
      .filter((group) => group.items.length > 0);
  }, [suppliers, lowStockItems]);

  const sortedInventory = useMemo(() => {
    const base = inventoryFilter === 'low' ? lowStockItems : items;
    return [...base].sort((a, b) => {
      const aLow = a.stock <= a.reorderThreshold ? 0 : 1;
      const bLow = b.stock <= b.reorderThreshold ? 0 : 1;
      if (aLow !== bLow) return aLow - bLow;
      return a.name.localeCompare(b.name);
    });
  }, [items, lowStockItems, inventoryFilter]);

  const handleRestock = async (item: ItemDoc) => {
    setRestockingId(item.id);
    try {
      await onQuickRestock(item, 10);
    } finally {
      setRestockingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Today's Galla KPI Cards */}
      <section aria-label="Today's Galla Summary" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold text-stone-900">Aaj Ka Galla (Today&apos;s Summary)</h1>
          <span className="text-sm font-mono tabular-nums text-stone-600">
            {todayStats.billCount} {todayStats.billCount === 1 ? 'bill' : 'bills'} today
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-1">
            <span className="text-sm font-medium text-stone-600">Total Sales</span>
            <p
              data-testid="galla-total-sales"
              className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-stone-900"
            >
              {formatINR(todayStats.totalSales)}
            </p>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-1">
            <span className="text-sm font-medium text-stone-600">Cash in Galla</span>
            <p
              data-testid="galla-cash"
              className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-700"
            >
              {formatINR(todayStats.cashTotal)}
            </p>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-1">
            <span className="text-sm font-medium text-stone-600">UPI / Online</span>
            <p
              data-testid="galla-upi"
              className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-700"
            >
              {formatINR(todayStats.upiTotal)}
            </p>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-1">
            <span className="text-sm font-medium text-stone-600">New Udhaar Today</span>
            <p
              data-testid="galla-udhaar"
              className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-amber-700"
            >
              {formatINR(todayStats.udhaarTotal)}
            </p>
          </div>
        </div>
      </section>

      {/* Low-Stock Restock Queue Grouped by Supplier */}
      <section
        aria-label="Low-Stock Restock Queue"
        className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Truck className="w-5 h-5 text-red-600 shrink-0" />
            <h2 className="text-lg font-bold text-stone-900">
              Low-Stock Restock Queue ({lowStockItems.length})
            </h2>
          </div>
          <span className="text-sm text-stone-600">
            Items where stock ≤ reorder threshold, grouped by wholesale supplier
          </span>
        </div>

        {groupedLowStock.length === 0 ? (
          <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-base font-medium">
            All {items.length} items are above their reorder thresholds. No restock needed right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {groupedLowStock.map(({ supplier, items: groupItems }) => (
              <div
                key={supplier.id}
                className="rounded-2xl border border-red-200 bg-red-50/40 p-4 sm:p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-bold text-stone-900">{supplier.name}</h3>
                    <p className="text-sm text-stone-600 font-mono tabular-nums">
                      WhatsApp: +91 {supplier.phone}
                    </p>
                  </div>

                  <ul className="divide-y divide-red-200/70">
                    {groupItems.map((it) => (
                      <li key={it.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <span className="text-base font-semibold text-stone-900 block">
                            {it.name}
                          </span>
                          <span className="text-xs text-stone-600">
                            Reorder at ≤ {it.reorderThreshold} {it.unit}
                          </span>
                        </div>
                        <span className="text-sm font-bold font-mono tabular-nums text-red-700 shrink-0">
                          {it.stock} {it.unit} left
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  href={buildWhatsappRestockOrderUrl(supplier, groupItems)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  <span>Send Order on WhatsApp</span>
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Full 15-Item Shop Inventory (Mobile-First Card Rows + Desktop Table) */}
      <section
        aria-label="Full Inventory Table"
        className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-stone-900">
              Shop Inventory ({items.length} Items)
            </h2>
            <p className="text-sm text-stone-500">All prices are MRP-inclusive</p>
          </div>

          <div
            role="group"
            aria-label="Filter inventory"
            className="flex items-center p-1 bg-stone-100 rounded-xl"
          >
            <button
              type="button"
              onClick={() => setInventoryFilter('all')}
              className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                inventoryFilter === 'all'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              All ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setInventoryFilter('low')}
              className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                inventoryFilter === 'low'
                  ? 'bg-white text-red-700 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Low Stock ({lowStockItems.length})
            </button>
          </div>
        </div>

        {/* Mobile Clear Inventory List (Zero Horizontal Scroll, Every Field Visible) */}
        <ul className="md:hidden divide-y divide-stone-200 border-t border-stone-200">
          {sortedInventory.map((item) => {
            const isLow = item.stock <= item.reorderThreshold;
            return (
              <li
                key={item.id}
                className={`py-4 space-y-3 ${isLow ? 'bg-red-50/35 -mx-4 px-4' : ''}`}
              >
                {/* Row 1: Item Name + Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-stone-900 leading-snug">
                      {item.name}
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {item.slug} · per {item.unit} · Incl. {item.gstPercent}% GST
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {isLow ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Low Stock</span>
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-700">In Stock</span>
                    )}
                  </div>
                </div>

                {/* Row 2: Price + Live Stock + Restock CTA */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-[11px] font-medium text-stone-500 block">MRP</span>
                      <span className="text-base font-bold font-mono tabular-nums text-stone-900">
                        {formatINR(item.price)}
                      </span>
                    </div>
                    <div className="h-7 w-px bg-stone-200" aria-hidden="true" />
                    <div>
                      <span className="text-[11px] font-medium text-stone-500 block">
                        Live Stock
                      </span>
                      <span className="text-base font-bold font-mono tabular-nums">
                        <span className={isLow ? 'text-red-600' : 'text-stone-900'}>
                          {item.stock}
                        </span>
                        <span className="text-xs font-normal text-stone-500">
                          {' '}
                          / {item.reorderThreshold} {item.unit}
                        </span>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={restockingId === item.id}
                    onClick={() => void handleRestock(item)}
                    aria-label={`Add 10 ${item.unit} to ${item.name}`}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-stone-900 font-semibold text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <PackagePlus className="w-4 h-4 text-emerald-600" />
                    <span>+10</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Desktop Full Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 text-xs font-semibold text-stone-500">
                <th className="py-3 px-3">Item</th>
                <th className="py-3 px-3 text-right">MRP Price</th>
                <th className="py-3 px-3 text-right">Incl. GST</th>
                <th className="py-3 px-3 text-right">Live Stock</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Restock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-base">
              {sortedInventory.map((item) => {
                const isLow = item.stock <= item.reorderThreshold;
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-stone-50/80 transition-colors ${
                      isLow ? 'bg-red-50/25' : ''
                    }`}
                  >
                    <td className="py-3.5 px-3">
                      <div className="font-semibold text-stone-900">{item.name}</div>
                      <div className="text-xs text-stone-500">
                        {item.slug} · per {item.unit}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-stone-900">
                      {formatINR(item.price)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-stone-600 text-sm">
                      {item.gstPercent}%
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums font-bold text-stone-900">
                      <span className={isLow ? 'text-red-600' : 'text-stone-900'}>
                        {item.stock}
                      </span>
                      <span className="text-xs font-normal text-stone-500">
                        {' '}
                        / {item.reorderThreshold} {item.unit}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 text-sm font-bold text-red-700">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Low Stock</span>
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-emerald-700">In Stock</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <button
                        type="button"
                        disabled={restockingId === item.id}
                        onClick={() => void handleRestock(item)}
                        aria-label={`Add 10 ${item.unit} to ${item.name}`}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-stone-800 font-semibold text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <PackagePlus className="w-4 h-4 text-emerald-600" />
                        <span>+10</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
