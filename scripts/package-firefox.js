#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const pkgPath = path.resolve(rootDir, 'package.json');
const firefoxUploadDir = path.resolve(rootDir, 'firefox-upload');
const firefoxStagingDir = path.resolve(rootDir, '.firefox-staging');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const version = pkg.version;
const name = pkg.name || 'nepal-test-filler';

console.log(`🦊 Packaging ${name} v${version} for Mozilla Firefox Add-ons (AMO)...`);

// 1. Build extension fresh
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

// 2. Validate manifest exists in dist
const manifestPath = path.resolve(distDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('❌ dist/manifest.json not found!');
  process.exit(1);
}

// 3. Ensure target directory exists and is clean
if (fs.existsSync(firefoxUploadDir)) {
  fs.rmSync(firefoxUploadDir, { recursive: true, force: true });
}
fs.mkdirSync(firefoxUploadDir, { recursive: true });

if (fs.existsSync(firefoxStagingDir)) {
  fs.rmSync(firefoxStagingDir, { recursive: true, force: true });
}

// 4. Create Firefox-specific staging folder with compliant manifest
fs.cpSync(distDir, firefoxStagingDir, { recursive: true });

const firefoxManifestPath = path.resolve(firefoxStagingDir, 'manifest.json');
const firefoxManifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf-8'));

// Firefox MV3 requires background.scripts (not standalone background.service_worker)
const backgroundWorker = firefoxManifest.background?.service_worker || 'service-worker-loader.js';
firefoxManifest.background = {
  scripts: [backgroundWorker],
  type: 'module'
};

// Ensure Firefox Gecko ID, strict_min_version >= 121.0, and data_collection_permissions
firefoxManifest.browser_specific_settings = {
  gecko: {
    id: firefoxManifest.browser_specific_settings?.gecko?.id || 'nepal-test-filler@aashishpokhrel.info.np',
    strict_min_version: '121.0',
    data_collection_permissions: {
      required: ['none']
    }
  }
};

// Remove Chrome-specific fields that trigger AMO warnings
delete firefoxManifest.minimum_chrome_version;

fs.writeFileSync(firefoxManifestPath, JSON.stringify(firefoxManifest, null, 2), 'utf-8');

// 5. Create Extension Binary ZIP for AMO upload
const addonZipName = `${name}-v${version}-firefox.zip`;
const addonZipPath = path.resolve(firefoxUploadDir, addonZipName);

try {
  execSync(`zip -r -9 -X "${addonZipPath}" . -x "*.map" -x ".DS_Store"`, {
    cwd: firefoxStagingDir,
    stdio: 'pipe'
  });
} catch (err) {
  console.error('❌ Failed to create Firefox addon zip:', err);
  process.exit(1);
} finally {
  // Clean up staging directory
  if (fs.existsSync(firefoxStagingDir)) {
    fs.rmSync(firefoxStagingDir, { recursive: true, force: true });
  }
}

// 6. Create Source Code ZIP (nepal-test-filler-source-vX.X.X.zip) required by AMO
const sourceZipName = `${name}-v${version}-source.zip`;
const sourceZipPath = path.resolve(firefoxUploadDir, sourceZipName);

try {
  execSync(`git archive --format=zip --output="${sourceZipPath}" HEAD`, {
    cwd: rootDir,
    stdio: 'pipe'
  });
} catch (err) {
  console.warn('⚠️ git archive failed, falling back to zip command...');
  execSync(`zip -r -9 "${sourceZipPath}" . -x "node_modules/*" -x "dist/*" -x ".git/*" -x "firefox-upload/*" -x "*.zip"`, {
    cwd: rootDir,
    stdio: 'pipe'
  });
}

// 7. Write BUILD_INSTRUCTIONS.txt for AMO reviewers
const buildInstructions = `BUILD INSTRUCTIONS FOR MOZILLA ADD-ONS (AMO) REVIEWERS
Project: ${firefoxManifest.name}
Version: v${version}
Gecko ID: ${firefoxManifest.browser_specific_settings.gecko.id}

Prerequisites:
- Node.js version 18 or newer
- npm version 9 or newer

Steps to build the add-on from source:
1. Extract the source code zip into an empty folder.
2. In the project root, install dependencies:
   npm install
3. Build the production extension:
   npm run package:firefox
4. The output add-on files are placed in 'firefox-upload/':
   The package '${addonZipName}' matches the submitted extension archive exactly.
`;
fs.writeFileSync(path.resolve(firefoxUploadDir, 'BUILD_INSTRUCTIONS.txt'), buildInstructions, 'utf-8');

// 8. Copy store assets (icons and screenshots)
const assetsDir = path.resolve(firefoxUploadDir, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const storeAssetsSrc = path.resolve(rootDir, 'store-assets');
if (fs.existsSync(storeAssetsSrc)) {
  const assetFiles = fs.readdirSync(storeAssetsSrc);
  for (const file of assetFiles) {
    fs.copyFileSync(path.resolve(storeAssetsSrc, file), path.resolve(assetsDir, file));
  }
}
const iconSrc = path.resolve(rootDir, 'public/icons/icon-128.png');
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.resolve(assetsDir, 'icon-128.png'));
}

// 9. Write AMO_SUBMISSION_GUIDE.md
const submissionGuide = `# Mozilla Firefox Add-ons (AMO) Submission Guide

Everything needed to submit **${firefoxManifest.name}** to Mozilla Add-ons (AMO) is in this folder (\`firefox-upload/\`).

## 1. Files to Upload

| Step in Mozilla Developer Hub | What to upload |
| :--- | :--- |
| **Step 1: Upload Add-on** | \`${addonZipName}\` |
| **Step 2: Source Code** | \`${sourceZipName}\` (Select "Yes" when asked if you have minified/compiled code) |
| **Step 2: Build Instructions** | Copy and paste the text from \`BUILD_INSTRUCTIONS.txt\` |

---

## 2. Listing Information (Copy & Paste)

* **Name:** \`${firefoxManifest.name}\`
* **Gecko ID:** \`${firefoxManifest.browser_specific_settings.gecko.id}\`
* **Summary (max 250 chars):**
  > Fill web forms with realistic, synthetic Nepali test data: names, addresses, phone numbers, citizenship IDs and BS dates.
* **Categories:** Developer Tools
* **Description:**
  (Copy full description from CHROMEWEBSTORE.md)
* **Privacy Policy URL:**
  \`https://github.com/jay-sambhu/Chrome-extension/blob/main/PRIVACY.md\`
* **Support Email:**
  \`dellizulter@gmail.com\`

---

## 3. Media & Assets

In the \`assets/\` folder:
- **Add-on Icon:** \`assets/icon-128.png\`
- **Screenshots:**
  - \`assets/screenshot-1-fill.png\`
  - \`assets/screenshot-2-devanagari.png\`
  - \`assets/screenshot-3-banking.png\`
  - \`assets/screenshot-4-inline-button.png\`
  - \`assets/screenshot-5-personas.png\`
`;
fs.writeFileSync(path.resolve(firefoxUploadDir, 'AMO_SUBMISSION_GUIDE.md'), submissionGuide, 'utf-8');

console.log(`\n🎉 Firefox upload package created successfully in:`);
console.log(`📂 ${firefoxUploadDir}`);
console.log(`   ├── 📦 ${addonZipName} (Extension Binary for AMO upload)`);
console.log(`   ├── 📦 ${sourceZipName} (Source Code for Reviewers)`);
console.log(`   ├── 📄 BUILD_INSTRUCTIONS.txt (Copy into build instructions box)`);
console.log(`   ├── 📋 AMO_SUBMISSION_GUIDE.md (Copy & paste store text)`);
console.log(`   └── 🖼️ assets/ (Icon and screenshots for AMO listing)\n`);
