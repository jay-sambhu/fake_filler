# Privacy Policy — Nepal Test Filler

_Last updated: 14 October 2026_

Nepal Test Filler is a browser extension that fills web forms with synthetic (made-up) Nepali test data for software development and testing.

## What the extension does on your device

- **Generates test data locally.** Names, addresses, phone numbers, ID numbers and dates are created on your device from data bundled with the extension. They do not describe real people.
- **Reads form fields only when you ask it to fill.** To decide what to put in a field, it looks at that field's attributes (name, id, placeholder, type) and its label. It does not read, store or send the rest of the page.
- **Stores your settings in your browser** using Chrome's extension storage: preferences, your custom personas, per-site field rules, cached AI answers and, if you add them, your AI provider API keys. This data stays in your browser profile. Removing the extension deletes it.
- **Keeps the current test person per tab** in the page's session storage, so multi-step forms receive the same person on every step. You can turn this off in Settings.

## Optional AI assist (off by default)

If you turn on AI assist, choose an AI provider and enter your own API key, then for form fields the built-in rules cannot recognise, the extension sends this to the provider you chose (Google Gemini, OpenAI, Anthropic, OpenRouter, Groq, or a server address you enter yourself):

- the website's hostname
- the field's name, id, placeholder text, label text and input type

It never sends values you typed, values on the page, or the generated test data. Answers are cached on your device so the same field is not sent twice. The request goes from the extension's background process directly to that provider using your key, and is subject to that provider's API terms and privacy policy. Only the provider selected in Settings receives requests.

## What we do not do

- We do not run any server, and we do not collect analytics, telemetry or crash reports.
- We do not sell, share or transfer data to anyone.
- We do not use data for advertising, profiling or creditworthiness.

## Contact

Questions about this policy: dellizulter@gmail.com
