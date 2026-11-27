import { BookOpenCheck, Mic, ShieldCheck, Store } from 'lucide-react';

interface SignInScreenProps {
  onSignIn: () => void;
  signingIn: boolean;
  errorMessage: string | null;
}

export function SignInScreen({ onSignIn, signingIn, errorMessage }: SignInScreenProps) {
  return (
    <div className="min-h-screen bg-[#F5F5F4] flex flex-col justify-between p-4 sm:p-8">
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-stone-900 whitespace-nowrap">
            BolBahi
          </span>
        </div>
        <span className="text-sm font-medium text-stone-500">Kirana Voice Copilot</span>
      </header>

      <main className="max-w-5xl w-full mx-auto my-auto py-4 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
        <section className="lg:col-span-7 space-y-5">
          <div className="space-y-2.5">
            <p className="text-sm font-semibold text-emerald-700">
              Hinglish Voice Billing · Khata Ledger · Restock Copilot
            </p>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-stone-900 leading-tight text-balance">
              Hands-free counter billing built for busy kirana shops.
            </h1>
            <p className="text-base sm:text-lg text-stone-600 leading-relaxed max-w-xl">
              Speak naturally in Hinglish while weighing grains or packing bags. BolBahi drafts bills
              with MRP-inclusive GST, tracks customer udhaar in Cloud Firestore, and prepares 1-tap
              WhatsApp receipts and supplier restock orders.
            </p>
          </div>

          <div className="hidden lg:grid grid-cols-3 gap-4 pt-2">
            <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-1.5">
              <Mic className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-semibold text-stone-900">Wispr &amp; Mic First</h2>
              <p className="text-sm text-stone-600">
                Dictate multi-item bills, cash/UPI splits, and quick price edits hands-free.
              </p>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-1.5">
              <BookOpenCheck className="w-5 h-5 text-amber-600" />
              <h2 className="text-base font-semibold text-stone-900">Safe Draft Khata</h2>
              <p className="text-sm text-stone-600">
                Every sale stays unconfirmed until you say &ldquo;Haan, bhej do&rdquo; with 5s Undo.
              </p>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-1.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-semibold text-stone-900">Cloud Firestore Sync</h2>
              <p className="text-sm text-stone-600">
                Real-time inventory, customer udhaar, and voice transcript audit trails.
              </p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-5">
          <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-8 space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-bold text-stone-900">Open Your Shop Counter</h2>
              <p className="text-sm sm:text-base text-stone-600">
                Sign in with Google to sync your kirana inventory, khata ledger, and daily galla to
                Firestore. First launch auto-seeds 15 items, 6 customers, and today&apos;s galla.
              </p>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm font-medium"
              >
                {errorMessage}
              </div>
            )}

            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn}
              className="w-full min-h-[54px] px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60 text-white font-semibold text-base flex items-center justify-center gap-3 transition-all cursor-pointer"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.24-.92 2.29-1.96 2.99v2.48h3.17c1.86-1.71 2.93-4.23 2.93-7.21 0-.69-.06-1.36-.23-1.18z"
                />
                <path
                  fill="currentColor"
                  d="M12.17 22c2.65 0 4.88-.88 6.51-2.38l-3.17-2.48c-.88.59-2.01.94-3.34.94-2.57 0-4.74-1.73-5.52-4.06H3.38v2.56C5 19.8 8.33 22 12.17 22z"
                />
                <path
                  fill="currentColor"
                  d="M6.65 14.02a5.88 5.88 0 0 1 0-3.74V7.72H3.38a9.83 9.83 0 0 0 0 8.86l3.27-2.56z"
                />
                <path
                  fill="currentColor"
                  d="M12.17 6.22c1.44 0 2.74.5 3.76 1.47l2.82-2.82C17.04 3.29 14.82 2.3 12.17 2.3 8.33 2.3 5 4.5 3.38 7.72l3.27 2.56c.78-2.33 2.95-4.06 5.52-4.06z"
                />
              </svg>
              <span>{signingIn ? 'Opening shop counter...' : 'Sign in with Google'}</span>
            </button>

            <p className="text-sm text-stone-500">
              Private shop ledger · Data belongs strictly to your Google account.
            </p>
          </div>
        </section>

        {/* Mobile Feature Highlights (below primary Sign-In CTA so thumb CTA sits above fold) */}
        <section className="lg:hidden grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-1">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-emerald-600" />
              <h2 className="text-base font-semibold text-stone-900">Wispr &amp; Mic First</h2>
            </div>
            <p className="text-sm text-stone-600">
              Dictate multi-item bills, cash/UPI splits, and quick price edits hands-free.
            </p>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-1">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="w-4 h-4 text-amber-600" />
              <h2 className="text-base font-semibold text-stone-900">Safe Draft Khata</h2>
            </div>
            <p className="text-sm text-stone-600">
              Every sale stays unconfirmed until you say &ldquo;Haan, bhej do&rdquo; with 5s Undo.
            </p>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h2 className="text-base font-semibold text-stone-900">Cloud Firestore Sync</h2>
            </div>
            <p className="text-sm text-stone-600">
              Real-time inventory, customer udhaar, and voice transcript audit trails.
            </p>
          </div>
        </section>
      </main>

      <footer className="max-w-5xl w-full mx-auto pt-4 text-sm text-stone-500">
        BolBahi Kirana Copilot · Voice-first counter billing
      </footer>
    </div>
  );
}
