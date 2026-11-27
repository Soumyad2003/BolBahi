import { BarChart3, BookOpen, Mic } from 'lucide-react';
import type { ActiveTab } from './Header';

interface BottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  lowStockCount: number;
}

export function BottomNav({ activeTab, onTabChange, lowStockCount }: BottomNavProps) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200"
    >
      <div className="grid grid-cols-3 h-16">
        <button
          type="button"
          onClick={() => onTabChange('counter')}
          className={`flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors cursor-pointer ${
            activeTab === 'counter' ? 'text-emerald-700 font-bold' : 'text-stone-500 font-medium'
          }`}
        >
          <Mic className="w-5 h-5" />
          <span className="text-xs">Counter</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('khata')}
          className={`flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors cursor-pointer ${
            activeTab === 'khata' ? 'text-emerald-700 font-bold' : 'text-stone-500 font-medium'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-xs">Khata</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('galla')}
          className={`flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors cursor-pointer ${
            activeTab === 'galla' ? 'text-emerald-700 font-bold' : 'text-stone-500 font-medium'
          }`}
        >
          <div className="relative">
            <BarChart3 className="w-5 h-5" />
            {lowStockCount > 0 && (
              <span className="absolute -top-1.5 -right-3 text-[10px] font-mono font-bold text-red-600">
                {lowStockCount}
              </span>
            )}
          </div>
          <span className="text-xs">Galla &amp; Stock</span>
        </button>
      </div>
    </nav>
  );
}
