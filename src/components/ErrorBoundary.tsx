import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let display = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string; path?: string };
      if (parsed.error) {
        if (parsed.error.includes('Quota exceeded')) {
          display =
            'Firestore daily free-tier quota exceeded. Quota resets tomorrow — see Firebase Console for details.';
        } else {
          display = `Database ${parsed.operationType ?? 'operation'} failed on ${parsed.path ?? 'collection'}: ${parsed.error}`;
        }
      }
    } catch {
      // Plain error string
    }
    return { hasError: true, message: display };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F5F5F4] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-700">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h1 className="text-xl font-bold text-stone-900">BolBahi encountered an error</h1>
            </div>
            <p className="text-base text-stone-700 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[48px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base inline-flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
              Reload BolBahi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
