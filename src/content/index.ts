import { scanFormFields } from './detector';
import { clearForm, fillPageAsync, inspectPageFields, revertForm } from './filler';
import { classifyViaBackground } from './backgroundClassifier';
import { ExtensionMessage, UndoResult } from '../types';
import { getDomainMapping } from '../services/domainMapping';
import { initFloatingBadge } from './floatingBadge';
import {
  getSessionPersona,
  setSessionPersona,
  clearSessionPersona,
  getSessionOptions,
  setSessionOptions,
  setSessionPersistenceEnabled,
} from '../services/sessionPersona';

// The content script runs in every frame (all_frames). chrome.tabs.sendMessage without a
// frameId reaches all of them, but only the first sendResponse is delivered, so the top
// frame owns the reply and subframes act silently.
const isTopFrame = (() => {
  try {
    return window.top === window;
  } catch {
    return false;
  }
})();

function plural(count: number, noun = 'field'): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function showInPageFeedback(text: string) {
  if (!document.body) return;
  const id = '__nepal_filler_toast';
  document.getElementById(id)?.remove();

  const toast = document.createElement('div');
  toast.id = id;
  toast.setAttribute('data-nepal-filler-ui', '');
  toast.setAttribute('role', 'status');
  toast.textContent = text;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '2147483647',
    background: 'linear-gradient(160deg, rgba(48, 30, 44, 0.8), rgba(22, 20, 34, 0.8))',
    backdropFilter: 'blur(18px) saturate(180%)',
    color: '#faf7fb',
    padding: '10px 16px 10px 14px',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    borderLeft: '3px solid #f0435f',
    fontSize: '13px',
    lineHeight: '1.4',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 12px 32px rgba(0,0,0,0.32)',
    pointerEvents: 'none',
    transition: 'opacity 0.25s ease, transform 0.25s ease',
    opacity: '0',
    transform: 'translateY(8px)',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 2400);
}

function describeUndo(result: UndoResult): string {
  return result.action === 'reverted'
    ? `Nepal Test Filler: reverted ${plural(result.revertedCount)}`
    : `Nepal Test Filler: cleared ${plural(result.revertedCount)}`;
}

/** Lets the popup add up fields filled inside iframes (their replies are not delivered). */
function reportFrameFill(count: number) {
  if (isTopFrame || count === 0) return;
  chrome.runtime.sendMessage({ action: 'FRAME_FILLED', count }).catch(() => {
    // Popup closed; nothing is listening.
  });
}

// Guard against double registration when the script is injected again into a tab
// (e.g. by the popup's fallback after the page had no responsive content script).
const loadedFlag = '__nepalTestFillerContentLoaded';
const scope = globalThis as typeof globalThis & { [loadedFlag]?: boolean };

if (!scope[loadedFlag]) {
  scope[loadedFlag] = true;
  initFloatingBadge(document);

  chrome.storage.local.get(['enableSessionPersistence'], (res: Record<string, unknown>) => {
    if (typeof res.enableSessionPersistence === 'boolean') {
      setSessionPersistenceEnabled(res.enableSessionPersistence);
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enableSessionPersistence) {
      setSessionPersistenceEnabled(changes.enableSessionPersistence.newValue !== false);
    }
  });

  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      const reply = (response: unknown) => {
        if (isTopFrame) sendResponse(response);
      };

      switch (message.action) {
        case 'PING':
          reply({ status: 'ok', version: chrome.runtime.getManifest().version });
          return false;

        case 'SCAN_PAGE': {
          if (!isTopFrame) return false;
          try {
            const detected = scanFormFields();
            reply({ status: 'ok', count: detected.length, types: detected.map((f) => f.type) });
          } catch (err) {
            reply({ status: 'error', message: String(err) });
          }
          return false;
        }

        case 'GET_PAGE_FIELDS': {
          if (!isTopFrame) return false;
          (async () => {
            try {
              const domain = window.location.hostname || 'localhost';
              const domainConfig = await getDomainMapping(domain);
              const fields = inspectPageFields(document, domainConfig?.rules || []);
              reply({ status: 'ok', domain, fields });
            } catch (err) {
              reply({ status: 'error', message: String(err) });
            }
          })();
          return true;
        }

        case 'UNDO_FILL':
        case 'CLEAR_FORM': {
          try {
            const result = message.action === 'UNDO_FILL' ? revertForm(document) : clearForm(document);
            if (result.revertedCount > 0) showInPageFeedback(describeUndo(result));
            reply({ status: 'ok', result });
          } catch (err) {
            reply({ status: 'error', message: String(err) });
          }
          return false;
        }

        case 'GET_SESSION_PERSONA': {
          if (!isTopFrame) return false;
          try {
            reply({ status: 'ok', person: getSessionPersona(), options: getSessionOptions() });
          } catch (err) {
            reply({ status: 'error', message: String(err) });
          }
          return false;
        }

        case 'SET_SESSION_PERSONA': {
          try {
            setSessionPersona(message.person);
            if (message.options) setSessionOptions(message.options);
            reply({ status: 'ok' });
          } catch (err) {
            reply({ status: 'error', message: String(err) });
          }
          return false;
        }

        case 'CLEAR_SESSION_PERSONA': {
          try {
            clearSessionPersona();
            reply({ status: 'ok' });
          } catch (err) {
            reply({ status: 'error', message: String(err) });
          }
          return false;
        }

        case 'FILL_PAGE': {
          (async () => {
            try {
              // Retain this persona for later steps of multi-step wizards / SPAs
              if (message.person) setSessionPersona(message.person);
              if (message.options) setSessionOptions(message.options);

              const domainConfig = await getDomainMapping(window.location.hostname || 'localhost');
              const result = await fillPageAsync(
                message.person,
                message.options,
                undefined,
                document,
                domainConfig?.rules || [],
                message.options?.enableAiClassification ? classifyViaBackground : undefined
              );

              if (result.fieldsFilledCount > 0) {
                showInPageFeedback(`Nepal Test Filler: filled ${plural(result.fieldsFilledCount)}`);
              }
              reportFrameFill(result.fieldsFilledCount);
              reply({ status: 'ok', result });
            } catch (err) {
              reply({ status: 'error', message: String(err) });
            }
          })();
          return isTopFrame;
        }

        default:
          return false;
      }
    }
  );
}
