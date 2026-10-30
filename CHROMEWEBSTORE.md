# Chrome Web Store listing

Reference copy for the Developer Dashboard. Keep it in sync with `manifest.config.ts`.

## Store listing

**Name:** Nepal Test Filler

**Summary (≤132 chars):**
Fill web forms with realistic, synthetic Nepali test data: names, addresses, phone numbers, citizenship IDs and BS dates.

**Category:** Developer Tools

**Language:** English

**Description:**

Nepal Test Filler fills web forms with realistic, made-up Nepali data so developers and QA testers stop typing "test test" into registration, KYC and checkout forms.

Every generated person is internally consistent:
• Name in English or Devanagari (नेपाली), with matching gender
• Province → district → municipality → ward that actually belong together
• Permanent and temporary addresses, including "same as permanent" checkboxes
• Mobile numbers with real NTC / Ncell prefixes and landlines with the right district area code
• Date of birth in AD and Bikram Sambat (BS), with an age that matches
• Citizenship number, National ID, PAN/VAT, passport and driving licence numbers in the expected formats
• Bank, branch and account number, eSewa / Khalti IDs, blood group
• Student, employee, business owner, teacher and farmer profiles

It works with plain HTML forms and with React, Vue and Angular apps, custom dropdowns, open shadow DOM and embedded iframes. Split BS date dropdowns and popular Nepali date pickers are supported.

How to use it:
• Click the toolbar icon and press "Fill page"
• Or press Alt+Shift+F, or right-click the page
• Or use the small button that appears next to a focused field
• Undo restores the values the form had before filling

Save your own personas (for example "Pokhara student" or "Biratnagar merchant"), and add per-site rules when a field is not recognised automatically.

Private by default: all data is generated on your device. An optional AI assist (your own API key for Gemini, OpenAI, Claude, OpenRouter, Groq or a local model) can classify fields the built-in rules don't recognise; it is off unless you turn it on.

All generated data is synthetic. Emails use reserved test domains that cannot receive mail. Use it only on forms you are allowed to test.

## Single purpose

Fill web forms with synthetic Nepali test data for software development and QA testing.

## Permission justifications

| Permission | Why it is needed |
| :--- | :--- |
| Content script on all sites (`<all_urls>`) | Forms can be on any site the developer is testing (localhost, staging, production). The script detects form fields and fills them only when the user acts (toolbar button, shortcut, context menu or the in-page button next to a focused field). It reads field labels and attributes, not page content in general, and sends nothing anywhere. |
| `storage` | Saves preferences, custom personas, per-site field rules and the optional API key on the device. |
| `activeTab` | Lets the toolbar button and shortcuts act on the current tab. |
| `scripting` | Injects the form filler into tabs that were already open before the extension was installed or updated, so the user does not have to reload them. |
| `contextMenus` | Adds "Fill form with Nepali test data" and "Undo fill" to the right-click menu. |

**Remote code:** None. All code ships in the package. The optional AI assist sends a JSON request to the AI provider the user selected and receives a field category name back; no code is downloaded.

## Privacy practices (Dashboard → Privacy tab)

**Data collected:** Website content. This applies only when the user turns on AI assist and provides their own API key: for form fields the built-in rules cannot recognise, the field's name, id, placeholder, label text, input type and the site's hostname are sent to the AI provider the user selected (Google Gemini, OpenAI, Anthropic, OpenRouter, Groq, or a server the user enters) to classify the field. Values typed by the user and the generated test data are never sent.

Certifications to tick:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/jay-sambhu/Chrome-extension/blob/main/PRIVACY.md

## Assets

| Asset | Size | Notes |
| :--- | :--- | :--- |
| Icon | 128×128 | `public/icons/icon-128.png` (source: `store-assets/icon.svg`) |
| Screenshots | 1280×800 | `store-assets/screenshot-1-fill.png`, `-2-devanagari`, `-3-banking`, `-4-inline-button`, `-5-personas`. Real captures of the built extension; retake them if the UI changes. |
| Small promo tile | 440×280 | `store-assets/promo-small-440x280.png` |
| Marquee promo tile | 1400×560 | Optional, not included |

## Release

```bash
npm run package
```

This builds from scratch, checks that the manifest, pages and icons are present, and writes `nepal-test-filler-v<version>.zip` with `manifest.json` at the root. Upload that zip in the Developer Dashboard.

Before each release: bump `version` in `package.json` (the manifest reads it), run `npm test`, then load `dist/` unpacked in Chrome and try `demo/index.html`.
