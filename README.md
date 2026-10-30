# Nepal Test Filler

A Chrome extension (Manifest V3) that fills web forms with realistic, synthetic Nepali test data: names in English or Devanagari, consistent province → district → municipality → ward addresses, NTC/Ncell mobile numbers, BS dates, citizenship/NID/PAN numbers, bank and wallet details.

All data is generated locally. An optional AI assist can classify unrecognised fields with the user's choice of AI provider (Google Gemini, OpenAI, Anthropic, OpenRouter, Groq or any OpenAI-compatible server) and their own API key. The model list is loaded live from the provider.

## Development

```bash
npm install
npm run dev        # Vite dev server with extension HMR; load dist/ unpacked in chrome://extensions
npm test           # Vitest (jsdom)
npm run typecheck
npm run build      # production build into dist/
npm run package    # fresh build + zip for the Chrome Web Store
```

`demo/index.html` is a test bench with Loksewa, banking, university, employment, multi-step and custom-control forms. Open it with the extension loaded to try changes.

## How it fits together

| Path | Role |
| :--- | :--- |
| `src/background/` | Service worker: keyboard shortcuts, context menu, AI provider calls (so the API key never enters a web page) |
| `src/content/` | Runs in every frame: `detector.ts` classifies fields, `filler.ts` fills/undoes them, `floatingBadge.ts` is the in-page button |
| `src/popup/`, `src/options/` | React UIs; shared design tokens in `src/styles/tokens.css` |
| `src/generator/` | Person generator, Nepali calendar (AD ↔ BS), Devanagari, documents, banking |
| `src/data/` | Geography, names, institutions, companies, telecom prefixes |
| `src/services/` | Settings, presets, per-site rules, AI classifier and cache, per-tab session persona |

Messages from the popup or background go to every frame of the tab. Each frame fills its own document. Only the top frame replies, and subframes report their counts with `FRAME_FILLED`.

## Releasing

Bump `version` in `package.json` (the manifest reads it), run `npm test`, then `npm run package`. Store listing text, permission justifications and privacy answers are in [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md). The privacy policy is [PRIVACY.md](PRIVACY.md).
