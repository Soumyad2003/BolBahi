import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  IndianRupee,
  Phone,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { CustomerDoc, TransactionDoc } from '../../shared/types';
import { buildWhatsappKhataReminderUrl, formatINR } from '../utils/voiceAndWhatsapp';

interface KhataTabProps {
  customers: CustomerDoc[];
  transactions: TransactionDoc[];
  filterCustomerId: string | null;
  onClearFilterCustomer: () => void;
  onSettlePayment: (customer: CustomerDoc, amount: number) => Promise<void>;
  onAddCustomer: (data: { name: string; phone: string; aliases: string[] }) => Promise<void>;
}

export function KhataTab({
  customers,
  transactions,
  filterCustomerId,
  onClearFilterCustomer,
  onSettlePayment,
  onAddCustomer,
}: KhataTabProps) {
  const [viewMode, setViewMode] = useState<'ledger' | 'directory'>('ledger');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(filterCustomerId);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [settleAmount, setSettleAmount] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);

  const activeMode = filterCustomerId ? 'ledger' : viewMode;

  const visibleLedgerCustomers = useMemo(() => {
    const nonWalkIn = customers.filter((c) => c.slug !== 'walk-in');
    let list = nonWalkIn;

    if (filterCustomerId) {
      list = list.filter((c) => c.id === filterCustomerId);
    } else if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.aliases.some((a) => a.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => b.udhaarBalance - a.udhaarBalance);
  }, [customers, filterCustomerId, searchQuery]);

  const directoryCustomers = useMemo(() => {
    let list = [...customers];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.aliases.some((a) => a.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => {
      if (a.slug === 'walk-in') return 1;
      if (b.slug === 'walk-in') return -1;
      return a.name.localeCompare(b.name);
    });
  }, [customers, searchQuery]);

  const totalReceivable = useMemo(
    () => customers.reduce((sum, c) => sum + c.udhaarBalance, 0),
    [customers]
  );

  const customersWithUdhaarCount = useMemo(
    () => customers.filter((c) => c.udhaarBalance > 0).length,
    [customers]
  );

  const customersWithPhoneCount = useMemo(
    () => customers.filter((c) => c.phone.trim().length >= 10).length,
    [customers]
  );

  const handleConfirmSettle = async (customer: CustomerDoc) => {
    const amt = Number(settleAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setBusyId(customer.id);
    try {
      await onSettlePayment(customer, amt);
      setSettlingId(null);
      setSettleAmount('');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyPhone = async (customer: CustomerDoc) => {
    if (!customer.phone) return;
    try {
      await navigator.clipboard.writeText(customer.phone);
      setCopiedId(customer.id);
      window.setTimeout(() => setCopiedId((prev) => (prev === customer.id ? null : prev)), 2000);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    const trimmedName = newName.trim();
    const digits = newPhone.replace(/[^0-9]/g, '');

    if (trimmedName.length < 2) {
      setAddError('Please enter a customer name.');
      return;
    }
    if (digits.length > 0 && (digits.length < 10 || digits.length > 15)) {
      setAddError('Phone number must be 10 to 15 digits (or left blank).');
      return;
    }

    setAddingCustomer(true);
    try {
      const aliasList = newAliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      await onAddCustomer({ name: trimmedName, phone: digits, aliases: aliasList });
      setNewName('');
      setNewPhone('');
      setNewAliases('');
      setShowAddForm(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to save customer.');
    } finally {
      setAddingCustomer(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Summary + View Switcher + Search */}
      <section className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-stone-600">
              Total Khata Receivable (Kul Udhaar)
            </p>
            <p
              data-testid="total-receivable"
              className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-amber-700"
            >
              {formatINR(totalReceivable)}
            </p>
            <p className="text-sm text-stone-500">
              {customersWithUdhaarCount} pending udhaar · {customersWithPhoneCount} saved phone
              numbers
            </p>
          </div>

          {/* Segmented View Toggle: Khata Ledger vs All Customers & Phones */}
          <div className="flex flex-col sm:items-end gap-2.5">
            <div
              role="group"
              aria-label="Khata view mode"
              className="grid grid-cols-2 sm:inline-flex items-center p-1 bg-stone-100 rounded-xl"
            >
              <button
                type="button"
                onClick={() => {
                  onClearFilterCustomer();
                  setViewMode('ledger');
                }}
                className={`min-h-[42px] px-3.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  activeMode === 'ledger'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Khata Ledger
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearFilterCustomer();
                  setViewMode('directory');
                }}
                className={`min-h-[42px] px-3.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-1.5 ${
                  activeMode === 'directory'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>All Customers ({customers.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Search + Add Customer Trigger */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <div className="flex-1 relative">
            <label htmlFor="khata-search" className="sr-only">
              Search customer by name, alias, or phone number
            </label>
            <Search className="w-5 h-5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="khata-search"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                if (filterCustomerId) onClearFilterCustomer();
                setSearchQuery(e.target.value);
              }}
              placeholder="Search name, alias, or phone number..."
              className="w-full min-h-[48px] pl-11 pr-4 rounded-xl border border-stone-300 bg-stone-50 focus:bg-white focus:border-emerald-600 focus:outline-none text-base text-stone-900"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setViewMode('directory');
              setShowAddForm((prev) => !prev);
            }}
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            <span>{showAddForm ? 'Close Form' : 'Add Customer'}</span>
          </button>
        </div>

        {/* Add Customer Inline Form */}
        {showAddForm && (
          <form
            onSubmit={(e) => void handleCreateCustomer(e)}
            className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3"
          >
            <h2 className="text-base font-bold text-stone-900">Save New Customer to Firestore</h2>
            {addError && (
              <p role="alert" className="text-sm font-medium text-red-700">
                {addError}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="new-customer-name"
                  className="text-xs font-semibold text-stone-700 block mb-1"
                >
                  Customer Name *
                </label>
                <input
                  id="new-customer-name"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Amit Gupta"
                  className="w-full min-h-[44px] px-3 rounded-lg border border-stone-300 bg-white text-base text-stone-900"
                />
              </div>
              <div>
                <label
                  htmlFor="new-customer-phone"
                  className="text-xs font-semibold text-stone-700 block mb-1"
                >
                  Phone Number (10 digits)
                </label>
                <input
                  id="new-customer-phone"
                  type="tel"
                  inputMode="numeric"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="9876543219"
                  className="w-full min-h-[44px] px-3 rounded-lg border border-stone-300 bg-white font-mono text-base text-stone-900"
                />
              </div>
              <div>
                <label
                  htmlFor="new-customer-aliases"
                  className="text-xs font-semibold text-stone-700 block mb-1"
                >
                  Voice Aliases (comma separated)
                </label>
                <input
                  id="new-customer-aliases"
                  type="text"
                  value={newAliases}
                  onChange={(e) => setNewAliases(e.target.value)}
                  placeholder="gupta ji, amit bhai"
                  className="w-full min-h-[44px] px-3 rounded-lg border border-stone-300 bg-white text-base text-stone-900"
                />
              </div>
            </div>
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="submit"
                disabled={addingCustomer}
                className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm cursor-pointer disabled:opacity-50"
              >
                {addingCustomer ? 'Saving...' : 'Save Customer'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setAddError(null);
                }}
                className="min-h-[44px] px-4 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 font-semibold text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Active Voice Filter Banner */}
      {filterCustomerId && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <span className="text-sm font-semibold text-emerald-900">
            Filtered by voice command to{' '}
            {customers.find((c) => c.id === filterCustomerId)?.name ?? 'customer'}
          </span>
          <button
            type="button"
            onClick={onClearFilterCustomer}
            className="min-h-[40px] px-3 rounded-lg bg-white border border-emerald-300 text-emerald-900 text-sm font-semibold inline-flex items-center gap-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Show All Customers</span>
          </button>
        </div>
      )}

      {activeMode === 'directory' ? (
        /* ALL STORED CUSTOMERS & PHONE NUMBERS DIRECTORY */
        <section
          aria-label="Customer Directory with Phone Numbers"
          className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-stone-900">
                Saved Customer Directory ({directoryCustomers.length})
              </h2>
              <p className="text-sm text-stone-500">
                All customers stored in Firestore with phone numbers and voice aliases
              </p>
            </div>
          </div>

          {directoryCustomers.length === 0 ? (
            <p className="text-base text-stone-500 py-8 text-center">
              No matching customers found.
            </p>
          ) : (
            <>
              {/* Mobile Directory List (Zero Horizontal Scroll) */}
              <ul className="md:hidden divide-y divide-stone-200 border-t border-stone-200">
                {directoryCustomers.map((customer) => (
                  <li key={customer.id} className="py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-stone-900">{customer.name}</h3>
                        <p className="text-xs text-stone-500 mt-0.5">
                          Aliases: {customer.aliases.join(', ')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[11px] text-stone-500 block">Udhaar</span>
                        <span
                          className={`text-base font-bold font-mono tabular-nums ${
                            customer.udhaarBalance > 0 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatINR(customer.udhaarBalance)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-base font-bold font-mono tabular-nums text-stone-900 truncate">
                          {customer.phone ? `+91 ${customer.phone}` : 'No phone stored'}
                        </span>
                      </div>

                      {customer.phone && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleCopyPhone(customer)}
                            aria-label={`Copy phone number for ${customer.name}`}
                            className="min-h-[40px] min-w-[40px] rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 inline-flex items-center justify-center cursor-pointer"
                          >
                            {copiedId === customer.id ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                          <a
                            href={`tel:+91${customer.phone}`}
                            aria-label={`Call ${customer.name}`}
                            className="min-h-[40px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Call</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop Full Directory Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 text-xs font-semibold text-stone-500">
                      <th className="py-3 px-3">Customer Name</th>
                      <th className="py-3 px-3">Phone Number</th>
                      <th className="py-3 px-3">Voice Aliases</th>
                      <th className="py-3 px-3 text-right">Udhaar Balance</th>
                      <th className="py-3 px-3 text-right">Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 text-base">
                    {directoryCustomers.map((customer) => (
                      <tr key={customer.id} className="hover:bg-stone-50/80 transition-colors">
                        <td className="py-3.5 px-3 font-semibold text-stone-900">
                          {customer.name}
                        </td>
                        <td className="py-3.5 px-3 font-mono tabular-nums font-semibold text-stone-900">
                          {customer.phone ? `+91 ${customer.phone}` : '—'}
                        </td>
                        <td className="py-3.5 px-3 text-sm text-stone-600">
                          {customer.aliases.join(', ')}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums font-bold">
                          <span
                            className={
                              customer.udhaarBalance > 0 ? 'text-amber-700' : 'text-emerald-700'
                            }
                          >
                            {formatINR(customer.udhaarBalance)}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          {customer.phone ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleCopyPhone(customer)}
                                aria-label={`Copy phone number for ${customer.name}`}
                                className="min-h-[38px] px-3 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                {copiedId === customer.id ? (
                                  <>
                                    <Check className="w-4 h-4 text-emerald-600" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-4 h-4" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                              <a
                                href={`tel:+91${customer.phone}`}
                                className="min-h-[38px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                <span>Call</span>
                              </a>
                            </div>
                          ) : (
                            <span className="text-xs text-stone-400">Walk-in</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : (
        /* KHATA CREDIT LEDGER CARDS */
        <section aria-label="Khata Customers" className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {visibleLedgerCustomers.length === 0 ? (
            <div className="md:col-span-2 bg-white border border-stone-200 rounded-2xl p-8 text-center text-base text-stone-500">
              No matching customers found.
            </div>
          ) : (
            visibleLedgerCustomers.map((customer) => {
              const customerTxs = transactions.filter((t) => t.customerId === customer.id);
              const isExpanded = expandedId === customer.id || filterCustomerId === customer.id;
              const isSettling = settlingId === customer.id;

              return (
                <article
                  key={customer.id}
                  className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Card Top Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-xl font-bold text-stone-900 truncate">
                          {customer.name}
                        </h2>
                        <p className="text-sm text-stone-500 mt-0.5 font-mono tabular-nums">
                          {customer.phone ? `+91 ${customer.phone}` : 'No phone'} · Last paid{' '}
                          {customer.lastPaymentDaysAgo === 0
                            ? 'today'
                            : `${customer.lastPaymentDaysAgo}d ago`}
                        </p>
                        <p className="text-xs text-stone-500 mt-1">
                          Aliases: {customer.aliases.join(', ')}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-semibold text-stone-500 block">
                          Udhaar Balance
                        </span>
                        <span
                          className={`text-2xl font-bold font-mono tabular-nums ${
                            customer.udhaarBalance > 0 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatINR(customer.udhaarBalance)}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2.5">
                      {customer.udhaarBalance > 0 && (
                        <>
                          <a
                            href={buildWhatsappKhataReminderUrl(customer)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                          >
                            <ExternalLink className="w-4 h-4 shrink-0" />
                            <span>Send Polite WhatsApp Reminder</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => {
                              if (isSettling) {
                                setSettlingId(null);
                              } else {
                                setSettlingId(customer.id);
                                setSettleAmount(String(customer.udhaarBalance));
                              }
                            }}
                            className="min-h-[48px] px-4 py-2.5 rounded-xl border border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-900 font-semibold text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <IndianRupee className="w-4 h-4" />
                            <span>Record Payment</span>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Inline Settle Payment Box */}
                    {isSettling && (
                      <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 flex flex-wrap items-center gap-2.5">
                        <label className="text-sm font-semibold text-stone-700">
                          Received (₹):
                          <input
                            type="number"
                            min={1}
                            max={customer.udhaarBalance}
                            value={settleAmount}
                            onChange={(e) => setSettleAmount(e.target.value)}
                            className="ml-2 w-28 min-h-[44px] px-3 rounded-lg border border-stone-300 bg-white font-mono font-bold text-stone-900"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={busyId === customer.id}
                          onClick={() => void handleConfirmSettle(customer)}
                          className="min-h-[44px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm cursor-pointer disabled:opacity-50"
                        >
                          {busyId === customer.id ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettlingId(null)}
                          className="min-h-[44px] px-3 rounded-lg bg-stone-200 text-stone-700 font-semibold text-sm cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expandable Timestamped Voice Transcript History */}
                  <div className="pt-3 border-t border-stone-200">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId(isExpanded ? null : customer.id)}
                      className="w-full min-h-[44px] flex items-center justify-between text-sm font-semibold text-stone-700 hover:text-stone-900 cursor-pointer"
                    >
                      <span>Voice Transcript History ({customerTxs.length})</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-2.5">
                        {customerTxs.length === 0 ? (
                          <p className="text-sm text-stone-500 py-2">
                            No recorded counter bills yet. Opening udhaar balance carried forward.
                          </p>
                        ) : (
                          customerTxs.map((tx) => (
                            <div
                              key={tx.id}
                              className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1"
                            >
                              <div className="flex items-center justify-between text-xs text-stone-500 font-mono tabular-nums">
                                <span>
                                  {tx.dateKey}{' '}
                                  {tx.createdAtMs
                                    ? new Date(tx.createdAtMs).toLocaleTimeString('en-IN', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })
                                    : ''}
                                </span>
                                <span className="font-bold text-stone-900">
                                  {formatINR(tx.total)}
                                </span>
                              </div>
                              <p className="text-sm text-stone-800 italic">
                                &ldquo;{tx.transcript}&rdquo;
                              </p>
                              <p className="text-xs text-stone-600 font-mono tabular-nums">
                                Cash {formatINR(tx.cashPaid)} · UPI {formatINR(tx.upiPaid)} · Udhaar
                                +{formatINR(tx.newUdhaar)}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}
