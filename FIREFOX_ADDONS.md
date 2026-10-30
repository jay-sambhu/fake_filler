# Firefox Add-ons (AMO) Submission Guide

Reference copy and step-by-step instructions for publishing **Nepal Test Filler** on the [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/).

---

## 📁 Pre-packaged Upload Files

Everything required has been prepared in the `firefox-upload/` folder:

| Step in Mozilla Developer Hub | File to Select / Upload | Location |
| :--- | :--- | :--- |
| **1. Upload Add-on** | `nepal-test-filler-v1.0.0-firefox.zip` | `firefox-upload/nepal-test-filler-v1.0.0-firefox.zip` |
| **2. Source Code** | `nepal-test-filler-v1.0.0-source.zip` | `firefox-upload/nepal-test-filler-v1.0.0-source.zip` |
| **3. Icon** | `icon-128.png` | `firefox-upload/assets/icon-128.png` |
| **4. Screenshots** | 5 PNG files | `firefox-upload/assets/screenshot-*.png` |

---

## 🚀 Step-by-Step Submission Process

### Step 1: Start New Add-on
1. Log in to [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/).
2. Click the button **"Submit a New Add-on"** (or **"Submit a New Version"** if updating).
3. Under **Distribution Channel**, select:
   * `◉ On this site` (Allows users to find and install your add-on from addons.mozilla.org).

---

### Step 2: Upload File & Compatibility Validation
1. Click **"Select a file..."** and upload:
   ```
   firefox-upload/nepal-test-filler-v1.0.0-firefox.zip
   ```
2. The automated linter will validate the package:
   * **Add-on ID:** `nepal-test-filler@aashishpokhrel.info.np`
   * **Minimum Firefox Version:** `121.0`
   * **Background Script:** Configured as `background.scripts` with ES Module support.
   * **Data Collection:** Declared as `required: ["none"]`.
3. Click **"Continue"**.

---

### Step 3: Source Code Submission (Mandatory for Vite/React)
Because this project uses TypeScript, React, and Vite to generate bundled/minified JavaScript, Mozilla requires the uncompiled source code and build instructions so reviewers can verify the bundle.

1. When asked:
   > *"Does your add-on have minified, concatenated, or generated code?"*
   👉 Select **"Yes"**.
2. **Upload Source Code:**
   * Select: `firefox-upload/nepal-test-filler-v1.0.0-source.zip`
3. **Build Instructions Box:**
   Copy and paste this exact text into the instructions box:

```text
Build Environment:
- OS: Linux / macOS / Windows
- Node.js: version 18.x or 20.x
- Package Manager: npm (v9+)

Steps to Reproduce the Submitted Add-on:
1. Extract the uploaded source zip into an empty folder.
2. Open a terminal in the extracted project root.
3. Install dependencies:
   npm install
4. Run the Firefox packaging command:
   npm run package:firefox
5. The generated extension binary is placed at:
   firefox-upload/nepal-test-filler-v1.0.0-firefox.zip
   Its contents match the submitted add-on binary file.
```

---

### Step 4: Describe Add-on (Listing Information)

Copy and paste the following metadata into the respective fields:

#### Name
```text
Nepal Test Filler
```

#### Summary (max 250 characters)
```text
Fill web forms with realistic, synthetic Nepali test data: names, addresses, phone numbers, citizenship IDs and BS dates.
```

#### Categories
* **Primary:** `Developer Tools`
* **Secondary:** `Other` (or leave empty)

#### Full Description
```markdown
Nepal Test Filler fills web forms with realistic, synthetic Nepali data so developers and QA testers can stop typing "test test" into registration, KYC, and checkout forms.

Every generated person is internally consistent:
• Name in English or Devanagari (नेपाली), with matching gender
• Province → district → municipality → ward that actually belong together
• Permanent and temporary addresses, including "same as permanent" sync
• Mobile numbers with real NTC / Ncell prefixes and landlines with district area codes
• Date of birth in Gregorian (AD) and Bikram Sambat (BS) with matching age
• Citizenship number, National ID, PAN/VAT, passport and driving licence numbers in authentic formats
• Bank, branch and account numbers, eSewa / Khalti IDs, blood group
• Student, employee, business owner, teacher, and farmer profiles

Compatibility:
• Plain HTML forms, React, Vue, Angular, Svelte apps
• Custom dropdowns, open Shadow DOM roots, and embedded iframes
• Split BS date dropdowns and popular Nepali date pickers

How to use it:
• Click the toolbar icon and press "Fill page"
• Or press Alt+Shift+F, or right-click the page
• Or click the small floating badge next to a focused field
• "Undo" restores the exact values the form had before filling

Privacy by Default:
All data is generated 100% on your device. An optional AI assist (using your own API key for Gemini, OpenAI, Claude, OpenRouter, Groq, or a local model) can classify custom fields; it is completely disabled unless you turn it on.
```

#### Tags / Keywords (Optional)
```text
nepal, form filler, test data, fake data, devtools, qa testing, bikram sambat, citizenship, pan, esewa
```

#### License
* Select: `MIT License` (or `All Rights Reserved`)

#### Privacy Policy URL
```text
https://github.com/jay-sambhu/Chrome-extension/blob/main/PRIVACY.md
```

#### Support Email
```text
dellizulter@gmail.com
```

#### Support Website / Repository (Optional)
```text
https://github.com/jay-sambhu/Chrome-extension
```

---

### Step 5: Images & Media

1. **Add-on Icon (128×128):**
   * Upload: `firefox-upload/assets/icon-128.png`
2. **Screenshots:**
   * Upload from `firefox-upload/assets/`:
     - `screenshot-1-fill.png` (Core Form Filling)
     - `screenshot-2-devanagari.png` (Devanagari Unicode & Loksewa Form)
     - `screenshot-3-banking.png` (FinTech & Banking)
     - `screenshot-4-inline-button.png` (In-Page Floating Action Button)
     - `screenshot-5-personas.png` (Persona Management & Settings)

---

### Step 6: Reviewer Notes (Notes to AMO Admins)

If there is a **"Notes to Reviewers"** text box, paste:

```text
Nepal Test Filler is a developer utility designed to speed up form testing for Nepali applications.

Permissions Justification:
- "<all_urls>": Developers test forms on localhost, staging, and production domains. Form filling only occurs upon explicit user action (button click or shortcut).
- "storage": Saves user custom personas, per-site field rules, and local preferences in the browser profile.
- "activeTab": Enables toolbar clicks and shortcuts to interact with the current active tab.
- "scripting": Injects content scripts into tabs opened prior to extension installation so users do not need to reload their pages.
- "contextMenus": Adds right-click shortcuts for "Fill form with Nepali test data" and "Undo".

All generation logic is local. No user data, form values, or telemetry are collected or sent anywhere.
```

---

### Step 7: Submit Version
Click **"Submit Version"**. Reviewers typically approve the extension within **24 to 72 hours**.
