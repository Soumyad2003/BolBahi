import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DraftBill,
  VoiceParseRequest,
  VoiceParseResponse,
} from './shared/types.ts';
import { runPreRouter } from './server/utils/preRouter.ts';
import { parseVoiceWithGeminiOrFallback } from './server/services/geminiParser.ts';
import { synthesizeKiranaSpeech } from './server/services/geminiTts.ts';
import {
  applyEditToDraftBill,
  buildNewDraftBill,
  buildSpokenBillSummary,
  recalculateDraftTotals,
} from './server/utils/billMath.ts';
import { matchCatalogItem } from './server/utils/fuzzyMatch.ts';
import { applyRestockCommandToDraft } from './shared/restockMath.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'BolBahi API',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
  });
});

app.post('/api/voice/parse', async (req, res) => {
  try {
    const body = req.body as Partial<VoiceParseRequest> | undefined;
    if (!body || typeof body.utterance !== 'string') {
      res.status(400).json({ error: 'utterance string is required' });
      return;
    }

    const utterance = body.utterance.slice(0, 600).trim();
    const activeDraft = body.activeDraft ?? null;
    const activeRestockDraft = body.activeRestockDraft ?? null;
    const lowStockAlertItems = Array.isArray(body.lowStockAlertItems)
      ? body.lowStockAlertItems.slice(0, 30)
      : [];
    const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    const customers = Array.isArray(body.customers) ? body.customers.slice(0, 100) : [];
    const todayStats = body.todayStats ?? {
      totalSales: 0,
      cashTotal: 0,
      upiTotal: 0,
      udhaarTotal: 0,
      billCount: 0,
    };

    const parserMode = body.parserMode === 'offline' ? 'offline' : 'gemini';

    // Step 1: 0-Token Deterministic Pre-Router
    const preRouted = runPreRouter({
      utterance,
      activeDraft,
      activeRestockDraft,
      lowStockAlertItems,
      items,
      customers,
      todayStats,
    });
    if (preRouted) {
      res.json(preRouted);
      return;
    }

    // Step 2: Token-Efficient Gemini Flash-Lite or user-selected Offline Local parser
    const { payload, source, modelUsed } = await parseVoiceWithGeminiOrFallback({
      utterance,
      activeDraft,
      activeRestockDraft,
      items,
      customers,
      parserMode,
    });

    const parserLabel: VoiceParseResponse['parserLabel'] =
      source === 'gemini'
        ? 'Gemini Flash-Lite'
        : parserMode === 'offline'
          ? 'Offline Local'
          : 'Offline Fallback';

    if (payload.intent === 'ORDER_RESTOCK') {
      const restockResult = applyRestockCommandToDraft({
        activeRestockDraft,
        lowStockAlertItems,
        extractedItems: payload.items,
        useAlertDefaults: Boolean(payload.useAlertDefaults),
        transcript: utterance,
        parserSource: source,
        catalog: items,
        resolveItem: matchCatalogItem,
      });

      const restockResponse: VoiceParseResponse = {
        intent: 'ORDER_RESTOCK',
        parserSource: source,
        parserLabel,
        draft: activeDraft,
        restockDraft: restockResult.draft,
        targetTab: 'counter',
        filterCustomerId: null,
        spokenReply: restockResult.spokenReply,
        bannerMessage:
          restockResult.unmatchedNames.length > 0
            ? `Not found in catalog: ${restockResult.unmatchedNames.join(', ')}`
            : null,
        bannerType: restockResult.unmatchedNames.length > 0 ? 'warning' : 'success',
        shouldConfirmActiveDraft: false,
        editedFields: [],
        modelUsed,
      };
      res.json(restockResponse);
      return;
    }

    if (payload.intent === 'NOISE' || (payload.items.length === 0 && payload.intent !== 'EDIT_BILL')) {
      const noiseResponse: VoiceParseResponse = {
        intent: 'NOISE',
        parserSource: source,
        parserLabel,
        draft: activeDraft,
        targetTab: 'counter',
        filterCustomerId: null,
        spokenReply: 'Awaaz clear nahi aayi — phir se boliye.',
        bannerMessage: 'Awaaz clear nahi aayi — phir se boliye',
        bannerType: 'warning',
        shouldConfirmActiveDraft: false,
        editedFields: [],
        modelUsed,
      };
      res.json(noiseResponse);
      return;
    }

    // Step 3: Deterministic Math in Node.js (MRP-inclusive GST, Cash/UPI/Udhaar/Change)
    if (payload.intent === 'EDIT_BILL' && activeDraft) {
      const { draft, editedFields } = applyEditToDraftBill({
        activeDraft,
        extractedItems: payload.items,
        customerQuery: payload.customerQuery,
        cashPaid: payload.cashPaid,
        upiPaid: payload.upiPaid,
        isUdhaar: payload.isUdhaar,
        transcript: utterance,
        parserSource: source,
        catalog: items,
        customers,
      });

      const response: VoiceParseResponse = {
        intent: 'EDIT_BILL',
        parserSource: source,
        parserLabel,
        draft,
        targetTab: 'counter',
        filterCustomerId: null,
        spokenReply: buildSpokenBillSummary(draft, true),
        bannerMessage: null,
        bannerType: 'info',
        shouldConfirmActiveDraft: false,
        editedFields,
        modelUsed,
      };
      res.json(response);
      return;
    }

    const newDraft = buildNewDraftBill({
      customerQuery: payload.customerQuery,
      extractedItems: payload.items,
      cashPaid: payload.cashPaid,
      upiPaid: payload.upiPaid,
      isUdhaar: payload.isUdhaar,
      transcript: utterance,
      parserSource: source,
      catalog: items,
      customers,
    });

    const saleResponse: VoiceParseResponse = {
      intent: 'LOG_SALE',
      parserSource: source,
      parserLabel,
      draft: newDraft,
      targetTab: 'counter',
      filterCustomerId: null,
      spokenReply: buildSpokenBillSummary(newDraft, false),
      bannerMessage:
        newDraft.ambiguousCustomers.length > 1
          ? `Do customers match "${newDraft.customerQuery || 'Sharma ji'}" — please select below.`
          : newDraft.items.some((it) => it.rateMissing)
            ? 'Rate missing for an item — enter rate below.'
            : null,
      bannerType:
        newDraft.ambiguousCustomers.length > 1 || newDraft.items.some((it) => it.rateMissing)
          ? 'warning'
          : null,
      shouldConfirmActiveDraft: false,
      editedFields: [],
      modelUsed,
    };

    res.json(saleResponse);
  } catch (err) {
    console.error('[BolBahi] /api/voice/parse error:', err);
    res.status(500).json({ error: 'Voice processing failed. Please try again.' });
  }
});

app.post('/api/bill/calculate', (req, res) => {
  try {
    const body = req.body as { draft?: DraftBill } | undefined;
    if (!body?.draft || !Array.isArray(body.draft.items)) {
      res.status(400).json({ error: 'Valid draft object is required' });
      return;
    }
    const recalculated = recalculateDraftTotals(body.draft);
    res.json({
      draft: recalculated,
      spokenReply: buildSpokenBillSummary(recalculated, true),
    });
  } catch (err) {
    console.error('[BolBahi] /api/bill/calculate error:', err);
    res.status(500).json({ error: 'Failed to recalculate bill' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const body = req.body as { text?: string; lang?: 'en-IN' | 'hi-IN' } | undefined;
    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
      res.status(400).json({ error: 'text string is required' });
      return;
    }

    const text = body.text.slice(0, 400).trim();
    const lang: 'en-IN' | 'hi-IN' = body.lang === 'hi-IN' ? 'hi-IN' : 'en-IN';
    const result = await synthesizeKiranaSpeech({ text, lang });

    res.json(result);
  } catch {
    res.json({ fallback: 'browser', reason: 'unavailable' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BolBahi server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
