import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest(() => ({
  manifest_version: 3,
  name: 'Nepal Test Filler',
  version: pkg.version,
  description: 'Fill web forms with realistic, synthetic Nepali test data: names, addresses, phone numbers, citizenship IDs and BS dates.',
  homepage_url: pkg.homepage,
  author: typeof pkg.author === 'object' && pkg.author?.email ? { email: pkg.author.email } : undefined,
  minimum_chrome_version: '116',
  browser_specific_settings: {
    gecko: {
      id: 'nepal-test-filler@aashishpokhrel.info.np',
      strict_min_version: '121.0',
      data_collection_permissions: {
        required: ['none'],
      },
    },
  },
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Nepal Test Filler',
    default_icon: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      all_frames: true,
      match_about_blank: true,
      // Ready as soon as the DOM is parsed, so "Fill" works before heavy pages finish loading
      run_at: 'document_end',
    },
  ],
  permissions: ['storage', 'activeTab', 'scripting', 'contextMenus'],
  commands: {
    'quick-fill': {
      suggested_key: {
        default: 'Alt+Shift+F',
        mac: 'Alt+Shift+F',
      },
      description: 'Fill the current page',
    },
    'regenerate-fill': {
      suggested_key: {
        default: 'Alt+Shift+R',
        mac: 'Alt+Shift+R',
      },
      description: 'Fill the current page with a new person',
    },
    'undo-fill': {
      suggested_key: {
        default: 'Alt+Shift+U',
        mac: 'Alt+Shift+U',
      },
      description: 'Undo the last fill',
    },
  },
  web_accessible_resources: [
    {
      // Shown by the in-page quick-fill badge; emoji flags render as "NP" on Windows.
      resources: ['icons/icon-32.png'],
      matches: ['<all_urls>'],
    },
  ],
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
}));
