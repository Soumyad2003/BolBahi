import { useState } from 'react';
import { LogOut, RotateCcw, Store, Volume2, VolumeX } from 'lucide-react';

export type ActiveTab = 'counter' | 'khata' | 'galla';
export type ParserBadgeLabel =
  | 'Gemini Flash-Lite'
  | '0-Token Local'
  | 'Offline Local'
  | 'Offline Fallback';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  parserLabel: ParserBadgeLabel;
  muted: boolean;
  onToggleMute: () => void;
  onResetDemo: () => Promise<void>;
  resetting: boolean;
  onSignOut: () => void;
  lowStockCount: number;
}

export function Header({
  activeTab,
  onTabChange,
  parserLabel,
  muted,
  onToggleMute,
  onResetDemo,
  resetting,
  onSignOut,
  lowStockCount,
}: HeaderProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  const handleResetClick = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      setTimeout(() => setConfirmingReset(false), 4500);
      return;
    }
    setConfirmingReset(false);
    await onResetDemo();
  };

  const parserStyle =
    parserLabel === '0-Token Local'
      ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
      : parserLabel === 'Offline Local'
        ? 'text-blue-800 bg-blue-50 border-blue-200'
        : parserLabel === 'Offline Fallback'
          ? 'text-amber-800 bg-amber-50 border-amber-300'
          : 'text-stone-800 bg-stone-100 border-stone-200';

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
        {/* Zone 1: Brand + Parser indicator */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-stone-900 whitespace-nowrap">
              BolBahi
            </span>
          </div>
          <span
            data-testid="parser-badge"
            className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 ${parserStyle}`}
          >
            {parserLabel}
          </span>
        </div>

        {/* Zone 2: Desktop Navigation Tabs */}
        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-1 p-1 bg-stone-100 rounded-xl"
        >
          <button
            type="button"
            onClick={() => onTabChange('counter')}
            className={`min-h-[40px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'counter'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Counter
          </button>
          <button
            type="button"
            onClick={() => onTabChange('khata')}
            className={`min-h-[40px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'khata'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Khata
          </button>
          <button
            type="button"
            onClick={() => onTabChange('galla')}
            className={`min-h-[40px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === 'galla'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <span>Galla &amp; Stock</span>
            {lowStockCount > 0 && (
              <span className="text-xs font-mono font-bold text-red-600">({lowStockCount})</span>
            )}
          </button>
        </nav>

        {/* Zone 3: Mute, Reset Demo Data, Sign Out */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute voice read-back' : 'Mute voice read-back'}
            aria-pressed={muted}
            className={`min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] px-2 sm:px-3 rounded-xl border text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              muted
                ? 'bg-stone-100 border-stone-300 text-stone-600'
                : 'bg-white border-stone-200 text-stone-800 hover:bg-stone-50'
            }`}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-600" />}
            <span className="hidden lg:inline whitespace-nowrap">{muted ? 'Muted' : 'Voice On'}</span>
          </button>

          <button
            type="button"
            onClick={handleResetClick}
            disabled={resetting}
            aria-label="Reset Demo Data"
            className={`min-h-[40px] sm:min-h-[44px] px-2.5 sm:px-3 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
              confirmingReset
                ? 'bg-amber-600 border-amber-600 text-white'
                : 'bg-white border-stone-200 text-stone-800 hover:bg-stone-50'
            }`}
          >
            <RotateCcw className={`w-4 h-4 shrink-0 ${resetting ? 'animate-spin' : ''}`} />
            <span className="sm:hidden">
              {resetting ? 'Reset...' : confirmingReset ? 'Confirm?' : 'Reset'}
            </span>
            <span className="hidden sm:inline">
              {resetting
                ? 'Resetting...'
                : confirmingReset
                  ? 'Tap Again to Reset'
                  : 'Reset Demo Data'}
            </span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 hover:text-stone-900 inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile compact parser strip */}
      <div className="sm:hidden px-3 py-1.5 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
        <span className="font-medium">Parser</span>
        <span className={`px-2 py-0.5 rounded-md border font-semibold ${parserStyle}`}>
          {parserLabel}
        </span>
      </div>
    </header>
  );
}
