import { fillPageAsync, fillSingleField, revertForm } from './filler';
import { FillOptions, SyntheticPerson } from '../types';
import { classifyViaBackground } from './backgroundClassifier';
import { getDomainMapping } from '../services/domainMapping';
import {
  getSessionPersona,
  setSessionPersona,
  getSessionOptions,
  setSessionOptions,
} from '../services/sessionPersona';

let isBadgeEnabled = true;
let activeTargetElement: HTMLElement | null = null;
let badgeContainer: HTMLElement | null = null;
let menuContainer: HTMLElement | null = null;
let styleTag: HTMLStyleElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let isInteractingWithBadge = false;
let repositionFrame = 0;
let storageListener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | null = null;

const BADGE_ID = '__nepal_filler_floating_badge';
const MENU_ID = '__nepal_filler_floating_menu';
const STYLE_ID = '__nepal_filler_floating_style';
const BADGE_SIZE = 22;
const MENU_WIDTH = 220;

// Types where an overlay would cover browser or page affordances (password reveal,
// search clear, pickers) or where "test data" makes no sense.
const SKIPPED_INPUT_TYPES = [
  'hidden', 'submit', 'reset', 'button', 'image', 'file',
  'password', 'search', 'range', 'color', 'checkbox', 'radio',
];

/**
 * Checks whether an element is a text-like form field that should get the badge.
 */
function isFillableField(element: Element | null): element is HTMLElement {
  if (!element || !(element instanceof HTMLElement)) return false;
  if (element.closest('[data-nepal-filler-ui]')) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'textarea' || tagName === 'select') {
    return !element.hasAttribute('disabled') && !element.hasAttribute('readonly');
  }

  if (tagName === 'input') {
    const input = element as HTMLInputElement;
    const type = (input.type || 'text').toLowerCase();
    return !SKIPPED_INPUT_TYPES.includes(type) && !input.disabled && !input.readOnly;
  }

  if (element.getAttribute('role') === 'combobox') {
    return element.getAttribute('aria-disabled') !== 'true';
  }

  return false;
}

/**
 * Resolves the persona to use: the one retained for this tab's wizard, else the one
 * shown in the popup, else a freshly generated one for the user's active preset.
 */
async function getStoredOptions(): Promise<{ options: FillOptions; person: SyntheticPerson }> {
  // Loaded on demand: the generator and its datasets are large, and the content script
  // runs on every page and frame, so they must not be part of the initial bundle.
  const { generatePersonForSettings, loadCurrentPerson, loadFillSettings, saveCurrentPerson, toFillOptions } =
    await import('../services/settings');
  const settings = await loadFillSettings().catch(() => null);
  const options = getSessionOptions() || (settings ? toFillOptions(settings) : null) || {
    profile: 'general' as const,
    fillScript: 'en' as const,
    fillCategories: { personal: true, contact: true, address: true, professional: true },
  };
  // Re-read the live AI toggle; the retained session options may predate it.
  options.enableAiClassification = settings?.aiEnabled ?? false;

  let person = getSessionPersona() || (await loadCurrentPerson().catch(() => null));
  if (!person) {
    person = await generatePersonForSettings(settings || (await loadFillSettings()));
    await saveCurrentPerson(person).catch(() => undefined);
  }
  setSessionPersona(person);
  setSessionOptions(options);
  return { options, person };
}

// Lucide icons (same set as the popup), inlined so the content script doesn't load React.
const ICON_PATHS = {
  zap: '<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',
  pencilLine:
    '<path d="M13 21h8"/><path d="m15 5 4 4"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  rotateCcw: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};

function svgIcon(name: keyof typeof ICON_PATHS, size = 15): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

function badgeIconHtml(): string {
  const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('icons/icon-32.png') : '';
  return url ? `<img src="${url}" alt="" width="16" height="16" style="display:block;width:16px;height:16px">` : 'NP';
}

function injectStyles() {
  if (styleTag?.isConnected) return;
  styleTag = document.createElement('style');
  styleTag.id = STYLE_ID;
  styleTag.textContent = `
    #${BADGE_ID}, #${MENU_ID} { all: initial; box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    #${BADGE_ID} *:not(svg, svg *), #${MENU_ID} *:not(svg, svg *) { all: unset; box-sizing: border-box; font-family: inherit; }
    #${BADGE_ID} svg, #${MENU_ID} svg {
      display: block; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 2;
      stroke-linecap: round; stroke-linejoin: round; overflow: visible;
    }
    #${BADGE_ID} {
      position: fixed; z-index: 2147483646; width: ${BADGE_SIZE}px; height: ${BADGE_SIZE}px;
      display: none; align-items: center; justify-content: center; cursor: pointer; user-select: none;
      border-radius: 7px; color: #fff; font-size: 10px; font-weight: 700; line-height: 1;
      background: rgba(28, 22, 30, 0.62); -webkit-backdrop-filter: blur(10px) saturate(160%); backdrop-filter: blur(10px) saturate(160%);
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px rgba(0,0,0,0.25), 0 0 0 1px rgba(217,38,68,0.35);
      opacity: 0.92; transition: transform .12s ease, opacity .12s ease, background-color .2s ease, box-shadow .2s ease;
    }
    #${BADGE_ID}:hover { opacity: 1; transform: scale(1.08); box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 18px rgba(217,38,68,0.4), 0 0 0 1px rgba(217,38,68,0.7); }
    #${BADGE_ID}[data-state="done"] { background: rgba(22, 163, 74, 0.85); box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 14px rgba(22,163,74,0.4); }
    #${MENU_ID} {
      position: fixed; z-index: 2147483647; width: ${MENU_WIDTH}px; display: none; flex-direction: column;
      padding: 5px; border-radius: 14px; color: #faf7fb; font-size: 12px;
      background: linear-gradient(160deg, rgba(48, 30, 44, 0.78), rgba(22, 20, 34, 0.78));
      -webkit-backdrop-filter: blur(20px) saturate(180%); backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 16px 40px rgba(0,0,0,0.38);
    }
    #${MENU_ID} .__nepal_menu_header {
      display: flex; align-items: center; gap: 7px; padding: 6px 8px 8px; margin-bottom: 3px;
      font-size: 11px; font-weight: 600; color: #b9aebb; border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    #${MENU_ID} .__nepal_menu_item {
      display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px; border-radius: 9px;
      cursor: pointer; color: #faf7fb; text-align: left; transition: background-color .12s ease;
    }
    #${MENU_ID} .__nepal_menu_item:hover, #${MENU_ID} .__nepal_menu_item:focus-visible { background: rgba(255,255,255,0.1); }
    #${MENU_ID} .__nepal_menu_icon {
      display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; flex-shrink: 0;
      border-radius: 8px; color: #ff8095; background: rgba(240, 67, 95, 0.16);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    }
    #${MENU_ID} .__nepal_menu_item:hover .__nepal_menu_icon {
      color: #fff; background: linear-gradient(135deg, #f0435f, #c81e4a);
    }
    #${MENU_ID} .__nepal_menu_text { display: flex; flex-direction: column; gap: 1px; line-height: 1.3; }
    #${MENU_ID} .__nepal_menu_text strong { font-size: 12px; font-weight: 600; }
    #${MENU_ID} .__nepal_menu_text small { font-size: 10.5px; color: #b9aebb; }
  `;
  (document.head || document.documentElement).appendChild(styleTag);
}

/**
 * Creates the floating badge DOM element.
 */
function createBadgeElement(): HTMLElement {
  const existing = document.getElementById(BADGE_ID);
  if (existing) return existing;
  injectStyles();

  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.setAttribute('data-nepal-filler-ui', '');
  badge.setAttribute('role', 'button');
  badge.setAttribute('aria-label', 'Nepal Test Filler quick actions');
  badge.title = 'Nepal Test Filler';
  badge.innerHTML = `<span class="__nepal_badge_icon">${badgeIconHtml()}</span>`;

  // Keep focus on the page's field; a focus change would fire its blur/validation handlers.
  badge.addEventListener('mousedown', (e) => e.preventDefault());
  badge.addEventListener('mouseenter', () => {
    isInteractingWithBadge = true;
    cancelHide();
  });
  badge.addEventListener('mouseleave', () => {
    isInteractingWithBadge = false;
    if (!isMenuOpen()) scheduleHide();
  });
  badge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  });

  (document.body || document.documentElement).appendChild(badge);
  return badge;
}

/**
 * Creates the floating quick-action popup menu.
 */
function createMenuElement(): HTMLElement {
  const existing = document.getElementById(MENU_ID);
  if (existing) return existing;
  injectStyles();

  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.setAttribute('data-nepal-filler-ui', '');
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <div class="__nepal_menu_header">${badgeIconHtml()}<span>Nepal Test Filler</span></div>
    <button type="button" role="menuitem" class="__nepal_menu_item" data-action="fill-form">
      <span class="__nepal_menu_icon">${svgIcon('zap')}</span>
      <span class="__nepal_menu_text"><strong>Fill entire form</strong><small>All detected fields</small></span>
    </button>
    <button type="button" role="menuitem" class="__nepal_menu_item" data-action="fill-field">
      <span class="__nepal_menu_icon">${svgIcon('pencilLine')}</span>
      <span class="__nepal_menu_text"><strong>Fill this field</strong><small>Only the selected input</small></span>
    </button>
    <button type="button" role="menuitem" class="__nepal_menu_item" data-action="revert-form">
      <span class="__nepal_menu_icon">${svgIcon('rotateCcw')}</span>
      <span class="__nepal_menu_text"><strong>Undo fill</strong><small>Restore previous values</small></span>
    </button>
  `;

  menu.addEventListener('mousedown', (e) => e.preventDefault());
  menu.addEventListener('mouseenter', () => {
    isInteractingWithBadge = true;
    cancelHide();
  });
  menu.addEventListener('mouseleave', () => {
    isInteractingWithBadge = false;
  });

  menu.addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = (e.target as HTMLElement).closest('.__nepal_menu_item');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    const target = activeTargetElement;
    hideMenu();

    const targetRoot =
      target?.closest('form') ||
      ((target?.getRootNode ? target.getRootNode() : null) as ShadowRoot | Document | null) ||
      document;

    try {
      if (action === 'revert-form') {
        revertForm(targetRoot);
        flashBadgeSuccess();
        return;
      }

      const { options, person } = await getStoredOptions();
      const domainConfig = await getDomainMapping(window.location.hostname || 'localhost').catch(() => null);
      const rules = domainConfig?.rules || [];

      if (action === 'fill-form') {
        await fillPageAsync(person, options, undefined, targetRoot, rules, options.enableAiClassification ? classifyViaBackground : undefined);
        flashBadgeSuccess();
      } else if (action === 'fill-field' && target) {
        fillSingleField(target, person, options, rules);
        flashBadgeSuccess();
      }
    } catch {
      // A page-specific failure must never surface as an uncaught error on the host page.
    }
  });

  (document.body || document.documentElement).appendChild(menu);
  return menu;
}

/**
 * Briefly turns the badge green to confirm the action.
 */
function flashBadgeSuccess() {
  if (!badgeContainer) return;
  const icon = badgeContainer.querySelector('.__nepal_badge_icon');
  if (icon) icon.innerHTML = svgIcon('check', 13);
  badgeContainer.setAttribute('data-state', 'done');

  setTimeout(() => {
    if (!badgeContainer) return;
    const ic = badgeContainer.querySelector('.__nepal_badge_icon');
    if (ic) ic.innerHTML = badgeIconHtml();
    badgeContainer.removeAttribute('data-state');
  }, 1200);
}

/**
 * Positions the badge just outside the right edge of the field, in viewport coordinates,
 * so it never covers the page's own in-field icons.
 */
function positionBadge(element: HTMLElement) {
  if (!badgeContainer) badgeContainer = createBadgeElement();

  const rect = element.getBoundingClientRect();
  const viewportW = window.innerWidth || document.documentElement.clientWidth;
  const viewportH = window.innerHeight || document.documentElement.clientHeight;
  const offscreen = rect.bottom < 0 || rect.top > viewportH;
  if ((rect.width === 0 && rect.height === 0) || rect.height < 12 || offscreen) {
    badgeContainer.style.display = 'none';
    hideMenu();
    return;
  }

  let left = rect.right + 4;
  if (left + BADGE_SIZE > viewportW - 2) left = rect.right - BADGE_SIZE - 4;
  const top = rect.top + Math.min(rect.height, 40) / 2 - BADGE_SIZE / 2;

  badgeContainer.style.top = `${Math.round(Math.max(0, top))}px`;
  badgeContainer.style.left = `${Math.round(Math.max(0, left))}px`;
  badgeContainer.style.display = 'flex';
}

function isMenuOpen(): boolean {
  return menuContainer?.style.display === 'flex';
}

function toggleMenu() {
  if (isMenuOpen()) hideMenu();
  else showMenu();
}

function showMenu() {
  if (!menuContainer) menuContainer = createMenuElement();
  if (!badgeContainer) return;

  menuContainer.style.display = 'flex';
  const badgeRect = badgeContainer.getBoundingClientRect();
  const menuHeight = menuContainer.offsetHeight || 150;
  const viewportW = window.innerWidth || document.documentElement.clientWidth;
  const viewportH = window.innerHeight || document.documentElement.clientHeight;

  let left = badgeRect.right - MENU_WIDTH;
  left = Math.min(Math.max(8, left), Math.max(8, viewportW - MENU_WIDTH - 8));
  let top = badgeRect.bottom + 6;
  if (top + menuHeight > viewportH - 8 && badgeRect.top - menuHeight - 6 > 8) {
    top = badgeRect.top - menuHeight - 6;
  }

  menuContainer.style.top = `${Math.round(top)}px`;
  menuContainer.style.left = `${Math.round(left)}px`;
}

function hideMenu() {
  if (menuContainer) menuContainer.style.display = 'none';
}

function cancelHide() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}

function scheduleHide() {
  cancelHide();
  hideTimeout = setTimeout(() => {
    if (!isInteractingWithBadge && !isMenuOpen()) hideBadge();
  }, 250);
}

export function hideBadge() {
  if (badgeContainer) badgeContainer.style.display = 'none';
  hideMenu();
  activeTargetElement = null;
}

/**
 * Keeps the badge attached to its field on scroll (including inner scroll containers)
 * and resize, at most once per animation frame.
 */
function handleViewportChange() {
  if (repositionFrame) return;
  repositionFrame = requestAnimationFrame(() => {
    repositionFrame = 0;
    if (activeTargetElement?.isConnected && isFillableField(activeTargetElement)) {
      positionBadge(activeTargetElement);
      if (isMenuOpen()) showMenu();
    } else if (activeTargetElement) {
      hideBadge();
    }
  });
}

function eventTarget(e: Event): Element | null {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  return (path[0] || e.target) as Element | null;
}

/**
 * After the extension is updated or reloaded, content scripts already in open tabs are
 * orphaned and every chrome.* call throws. Remove the stale badge instead of erroring.
 */
function isExtensionContextAlive(): boolean {
  try {
    return typeof chrome === 'undefined' || !chrome.runtime || Boolean(chrome.runtime.id);
  } catch {
    return false;
  }
}

function handleFocusIn(e: FocusEvent) {
  if (!isExtensionContextAlive()) {
    destroyFloatingBadge();
    return;
  }
  if (!isBadgeEnabled) return;
  const target = eventTarget(e);
  if (isFillableField(target)) {
    cancelHide();
    if (target !== activeTargetElement) hideMenu();
    activeTargetElement = target;
    positionBadge(target);
  }
}

function handleFocusOut(e: FocusEvent) {
  const next = e.relatedTarget as Element | null;
  if (next && (isFillableField(next) || next.closest?.('[data-nepal-filler-ui]'))) return;
  if (!isMenuOpen()) scheduleHide();
}

function handlePointerDown(e: Event) {
  const target = eventTarget(e);
  if (target?.closest?.('[data-nepal-filler-ui]')) return;
  if (isMenuOpen()) hideMenu();
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isMenuOpen()) hideMenu();
}

/**
 * Sets badge enabled/disabled state dynamically.
 */
export function setFloatingBadgeEnabled(enabled: boolean): void {
  isBadgeEnabled = enabled;
  if (!enabled) hideBadge();
}

export function isFloatingBadgeActive(): boolean {
  return isBadgeEnabled;
}

/**
 * Initializes floating badge event listeners on the active document.
 * The badge appears on focus only, never on hover, so browsing a page is not disturbed.
 */
export function initFloatingBadge(root: Document | HTMLElement = document): void {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(['enableFloatingBadge'], (res: Record<string, unknown>) => {
      if (typeof res?.enableFloatingBadge === 'boolean') setFloatingBadgeEnabled(res.enableFloatingBadge);
    });

    storageListener = (changes, area) => {
      if (area !== undefined && area !== 'local') return;
      if (changes.enableFloatingBadge !== undefined) {
        setFloatingBadgeEnabled(changes.enableFloatingBadge.newValue !== false);
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
  }

  root.addEventListener('focusin', handleFocusIn as EventListener, true);
  root.addEventListener('focusout', handleFocusOut as EventListener, true);
  root.addEventListener('pointerdown', handlePointerDown, true);
  root.addEventListener('keydown', handleKeyDown as EventListener, true);
  document.addEventListener('scroll', handleViewportChange, { capture: true, passive: true });
  window.addEventListener('resize', handleViewportChange, { passive: true });
}

/**
 * Destroys floating badge and removes elements and listeners.
 */
export function destroyFloatingBadge(): void {
  hideBadge();
  cancelHide();
  badgeContainer?.remove();
  badgeContainer = null;
  menuContainer?.remove();
  menuContainer = null;
  styleTag?.remove();
  styleTag = null;
  if (repositionFrame) cancelAnimationFrame(repositionFrame);
  repositionFrame = 0;

  if (storageListener && typeof chrome !== 'undefined') {
    chrome.storage?.onChanged?.removeListener(storageListener);
    storageListener = null;
  }

  document.removeEventListener('focusin', handleFocusIn as EventListener, true);
  document.removeEventListener('focusout', handleFocusOut as EventListener, true);
  document.removeEventListener('pointerdown', handlePointerDown, true);
  document.removeEventListener('keydown', handleKeyDown as EventListener, true);
  document.removeEventListener('scroll', handleViewportChange, { capture: true });
  window.removeEventListener('resize', handleViewportChange);
}
