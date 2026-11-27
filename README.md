# BolBahi — Voice-First Kirana Billing, Khata & Restock Copilot

BolBahi is a voice-first Hinglish billing, *khata* (credit ledger), and smart restock assistant designed for Indian *kirana* shopkeepers. It combines a 0-token local Hinglish pre-router, deterministic MRP-inclusive GST & cash/UPI/udhaar math, low-stock soft alerts, supplier-grouped WhatsApp restock ordering, local browser persistence (`localStorage`), and optional Gemini Flash-Lite parsing.

## Quick Start (Docker — 1 Command, No API Keys or Login Needed)

```bash
docker compose up --build
```

Then open **http://localhost:3000** in your browser.

- **Zero secrets or database setup required:** Starts immediately without a `.env` file, API keys, or sign-in.
- **Instant Local Prototype Mode:** Opens directly into the main Counter screen pre-seeded with 15 *kirana* items, 6 *khata* customers, 2 wholesale suppliers, and 3 sample bills saved locally in `localStorage`.
- **Offline Local Hinglish Parser:** Full voice/text billing, edits, cancel commands, *udhaar* checks, *galla* summaries, and voice restock ordering work out of the box without any external API key.

## Optional Configuration (`.env`)

If you want to enable Gemini Flash-Lite parsing and Gemini TTS read-back, copy `.env.example` to `.env` and add your key:

```bash
cp .env.example .env
# Edit .env and set GEMINI_API_KEY
docker compose up --build
```

If `GEMINI_API_KEY` is not set and you select **Gemini LLM** in the UI, BolBahi displays a non-blocking `"GEMINI_API_KEY not set"` notice and seamlessly continues using the Offline Local parser and browser speech.

## Local Development (Without Docker)

```bash
npm install
npm run dev
```

App runs on **http://localhost:3000**.

## Tests & Build Verification

```bash
npm run build
npm run lint
npx tsx --test server/utils/bolbahi.test.ts
```
