import { SyntheticPerson } from '../types';
import { classifyUnknownField } from '../services/aiClassifier';
import { loadAiConfig } from '../services/aiProviders';
import {
  generatePersonForSettings,
  loadCurrentPerson,
  loadFillSettings,
  saveCurrentPerson,
  saveSettings,
  toFillOptions,
} from '../services/settings';
import { sendToTab } from '../services/tabMessaging';

const MENU_FILL = 'nepal-test-filler-quick-fill';
const MENU_REGENERATE = 'nepal-test-filler-regenerate-fill';
const MENU_UNDO = 'nepal-test-filler-undo-fill';

function isScriptableUrl(url?: string): boolean {
  return Boolean(url && /^(https?|file):/.test(url) && !url.startsWith('https://chromewebstore.google.com'));
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id !== undefined && isScriptableUrl(tab.url) ? tab : undefined;
}

async function fillActiveTab(regenerate: boolean) {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const settings = await loadFillSettings();
  let person: SyntheticPerson | null = null;

  if (!regenerate) {
    const session = await sendToTab<{ status: string; person?: SyntheticPerson }>(
      tab.id,
      { action: 'GET_SESSION_PERSONA' },
      true
    );
    person = session?.status === 'ok' && session.person ? session.person : await loadCurrentPerson();
  }

  if (!person) {
    person = await generatePersonForSettings(settings);
    await saveCurrentPerson(person);
  }

  await sendToTab(tab.id, { action: 'FILL_PAGE', person, options: toFillOptions(settings) });
}

async function undoActiveTab() {
  const tab = await getActiveTab();
  if (tab?.id) await sendToTab(tab.id, { action: 'UNDO_FILL' });
}

function runCommand(command: string) {
  const task =
    command === 'quick-fill' || command === MENU_FILL
      ? fillActiveTab(false)
      : command === 'regenerate-fill' || command === MENU_REGENERATE
        ? fillActiveTab(true)
        : command === 'undo-fill' || command === MENU_UNDO
          ? undoActiveTab()
          : Promise.resolve();
  task.catch(() => {
    // Restricted page or tab closed mid-action; nothing useful to report.
  });
}

chrome.commands.onCommand.addListener(runCommand);
chrome.contextMenus.onClicked.addListener((info) => runCommand(String(info.menuItemId)));

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await saveSettings({
      selectedProfile: 'general',
      fillScript: 'en',
      fillCategories: { personal: true, contact: true, address: true, professional: true },
      geminiAiClassificationEnabled: false,
      enableFloatingBadge: true,
      enableSessionPersistence: true,
    });
  } else if (details.reason === 'update') {
    // Older builds stored the AI toggle under two keys; keep only the canonical one.
    const legacy = (await chrome.storage.local.get(['aiEnabled', 'geminiAiClassificationEnabled'])) as Record<
      string,
      unknown
    >;
    if (legacy.geminiAiClassificationEnabled === undefined && typeof legacy.aiEnabled === 'boolean') {
      await saveSettings({ geminiAiClassificationEnabled: legacy.aiEnabled });
    }
    await chrome.storage.local.remove('aiEnabled');
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_FILL, title: 'Fill form with Nepali test data', contexts: ['editable', 'page'] });
    chrome.contextMenus.create({ id: MENU_REGENERATE, title: 'Fill with a new person', contexts: ['editable', 'page'] });
    chrome.contextMenus.create({ id: MENU_UNDO, title: 'Undo fill', contexts: ['editable', 'page'] });
  });
});

// AI classification runs here, not in the content script, so the API key and the
// request never appear in the page's context or network log.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action !== 'CLASSIFY_FIELD' || sender.id !== chrome.runtime.id) return false;

  (async () => {
    try {
      const result = await classifyUnknownField(message.payload, await loadAiConfig());
      sendResponse({ status: 'ok', result });
    } catch (err) {
      sendResponse({ status: 'error', message: String(err) });
    }
  })();
  return true;
});
