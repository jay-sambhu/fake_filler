import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { FillScript, PageFieldInspection, ProfileType, SupportedFieldType, SyntheticPerson } from '../types';
import {
  Check,
  RefreshCw,
  RotateCcw,
  Zap,
  MapPin,
  Phone,
  Mail,
  Briefcase,
  Settings,
  Trash2,
  Globe,
  Copy,
  Sun,
  Moon,
  Laptop,
  Loader2,
  ShieldCheck,
  Bot,
  Link2,
} from 'lucide-react';
import {
  ThemePreference,
  applyThemeToDocument,
  loadThemePreference,
  saveThemePreference,
  setupSystemThemeListener,
} from '../utils/themeManager';
import {
  deleteDomainRule,
  FieldMappingRule,
  getDomainMapping,
  normalizeDomain,
  saveDomainRule,
} from '../services/domainMapping';
import { PersonaPreset, getPersonaPresets } from '../services/personaPresets';
import {
  DEFAULT_FILL_CATEGORIES,
  FillCategories,
  FillSettings,
  generatePersonForSettings,
  loadCurrentPerson,
  loadFillSettings,
  saveCurrentPerson,
  saveSettings,
  toFillOptions,
} from '../services/settings';
import { serializePersonaToJson, copyTextToClipboard } from '../utils/personaExport';
import { sendToTab } from '../services/tabMessaging';
import { getProvider, isAiConfigReady, loadAiConfig } from '../services/aiProviders';
import { fieldTypeLabel, MAPPABLE_FIELD_TYPES } from '../utils/fieldTypeLabels';

type Status = { type: 'success' | 'warning' | 'error'; message: string } | null;

const ARCHETYPES: Array<{ id: ProfileType; label: string }> = [
  { id: 'general', label: 'General citizen' },
  { id: 'student', label: 'Student' },
  { id: 'employee', label: 'Employee' },
  { id: 'business', label: 'Business owner' },
  { id: 'teacher', label: 'Teacher' },
  { id: 'farmer', label: 'Farmer' },
];

const CATEGORIES: Array<{ id: keyof FillCategories; label: string }> = [
  { id: 'personal', label: 'Personal' },
  { id: 'contact', label: 'Contact' },
  { id: 'address', label: 'Address' },
  { id: 'professional', label: 'Work' },
];

const RESTRICTED_URL = /^(chrome|chrome-extension|edge|about|devtools|view-source):|^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/;

function plural(count: number, noun = 'field'): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function hasChrome(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.tabs);
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  if (!hasChrome()) return undefined;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function describeWork(person: SyntheticPerson, np: boolean): string {
  if (np && person.devanagari) return `${person.devanagari.occupation} · ${person.devanagari.companyName}`;
  if (person.school && person.profileType === 'student') return `${person.grade || 'Student'} · ${person.school}`;
  if (person.businessName) return `${person.jobTitle} · ${person.businessName}`;
  if (person.cropType) return `${person.occupation} · ${person.cropType}`;
  return `${person.occupation} · ${person.companyName}`;
}

export const App: React.FC = () => {
  const [person, setPerson] = useState<SyntheticPerson | null>(null);
  const [profile, setProfile] = useState<ProfileType>('general');
  const [presetId, setPresetId] = useState<string | null>(null);
  const [script, setScript] = useState<FillScript>('en');
  const [categories, setCategories] = useState<FillCategories>(DEFAULT_FILL_CATEGORIES);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [aiProviderName, setAiProviderName] = useState('');
  const [presets, setPresets] = useState<PersonaPreset[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [isFilling, setIsFilling] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [isSessionSynced, setIsSessionSynced] = useState(false);
  const [copied, setCopied] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [tabId, setTabId] = useState<number | null>(null);
  const [tabUrl, setTabUrl] = useState<string>('');
  const [fillShortcut, setFillShortcut] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'fill' | 'mappings'>('fill');
  const [activeDomain, setActiveDomain] = useState<string>('');
  const [inspectedFields, setInspectedFields] = useState<PageFieldInspection[]>([]);
  const [domainRules, setDomainRules] = useState<FieldMappingRule[]>([]);
  const [isInspecting, setIsInspecting] = useState(false);
  const [selectedOverrides, setSelectedOverrides] = useState<Record<string, SupportedFieldType>>({});

  // Iframes fill independently and report their counts; only the top frame replies directly.
  const fillCounts = useRef<{ top: number; frames: number } | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRestricted = !tabUrl || RESTRICTED_URL.test(tabUrl);
  const np = script === 'np' && Boolean(person?.devanagari);

  const flash = useCallback((next: Status, ms = 0) => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setStatus(next);
    if (ms > 0) statusTimer.current = setTimeout(() => setStatus(null), ms);
  }, []);

  const showFillCount = useCallback(() => {
    const counts = fillCounts.current;
    if (!counts) return;
    const total = counts.top + counts.frames;
    flash(
      total > 0
        ? { type: 'success', message: `Filled ${plural(total)}.` }
        : { type: 'warning', message: 'No fillable fields found on this page.' }
    );
  }, [flash]);

  useEffect(() => {
    loadThemePreference().then((pref) => {
      setThemePreference(pref);
      applyThemeToDocument(pref);
    });
    const cleanupTheme = setupSystemThemeListener(() => {
      loadThemePreference().then((pref) => {
        if (pref === 'system') applyThemeToDocument('system');
      });
    });

    const onMessage = (message: { action?: string; count?: number }) => {
      if (message?.action === 'FRAME_FILLED' && fillCounts.current) {
        fillCounts.current.frames += message.count || 0;
        showFillCount();
      }
    };
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) chrome.runtime.onMessage.addListener(onMessage);

    (async () => {
      const [settings, presetList, tab] = await Promise.all([loadFillSettings(), getPersonaPresets(), getActiveTab()]);

      const validPresetId = settings.presetId && presetList.some((p) => p.id === settings.presetId) ? settings.presetId : null;
      const effective: FillSettings = { ...settings, presetId: validPresetId };

      setPresets(presetList);
      setProfile(settings.profile);
      setPresetId(validPresetId);
      setScript(settings.fillScript);
      setCategories(settings.fillCategories);
      setAiEnabled(settings.aiEnabled);
      const aiConfig = await loadAiConfig();
      setAiReady(isAiConfigReady(aiConfig));
      setAiProviderName(getProvider(aiConfig.provider).name);

      if (tab?.id !== undefined) {
        setTabId(tab.id);
        setTabUrl(tab.url || '');
        if (tab.url) setActiveDomain(normalizeDomain(tab.url));
      }

      // Prefer the persona retained by this tab (multi-step wizards), then the one last shown here.
      if (tab?.id !== undefined && tab.url && !RESTRICTED_URL.test(tab.url)) {
        const res = await chrome.tabs
          .sendMessage(tab.id, { action: 'GET_SESSION_PERSONA' }, { frameId: 0 })
          .catch(() => undefined);
        if (res?.status === 'ok' && res.person) {
          setPerson(res.person);
          setIsSessionSynced(true);
          return;
        }
      }

      const current = await loadCurrentPerson();
      const matchesSelection = current && (validPresetId || current.profileType === settings.profile);
      if (current && matchesSelection) {
        setPerson(current);
      } else {
        const fresh = await generatePersonForSettings(effective);
        setPerson(fresh);
        await saveCurrentPerson(fresh);
      }
    })();

    if (typeof chrome !== 'undefined' && chrome.commands?.getAll) {
      chrome.commands.getAll((cmds) => {
        setFillShortcut(cmds.find((c) => c.name === 'quick-fill')?.shortcut || '');
      });
    }

    return () => {
      cleanupTheme();
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [showFillCount]);

  const currentSettings = (): FillSettings => ({ profile, presetId, fillScript: script, fillCategories: categories, aiEnabled });

  /** Makes a new person the active one everywhere: popup, shortcuts, badge, and this tab's wizard session. */
  const adoptPerson = async (next: SyntheticPerson, settings: FillSettings) => {
    setPerson(next);
    setIsSessionSynced(false);
    await saveCurrentPerson(next);
    if (tabId !== null && !isRestricted) {
      chrome.tabs
        .sendMessage(tabId, { action: 'SET_SESSION_PERSONA', person: next, options: toFillOptions(settings) })
        .catch(() => undefined);
    }
  };

  const handleCycleTheme = async () => {
    const next: ThemePreference = themePreference === 'system' ? 'light' : themePreference === 'light' ? 'dark' : 'system';
    setThemePreference(next);
    applyThemeToDocument(next);
    await saveThemePreference(next);
  };

  const handlePersonaChange = async (value: string) => {
    let settings: FillSettings;
    if (value.startsWith('archetype:')) {
      const nextProfile = value.slice('archetype:'.length) as ProfileType;
      settings = { ...currentSettings(), profile: nextProfile, presetId: null };
      setProfile(nextProfile);
      setPresetId(null);
      await saveSettings({ selectedProfile: nextProfile, selectedPresetId: null });
    } else {
      const preset = presets.find((p) => p.id === value);
      if (!preset) return;
      const nextScript = preset.preferredScript || script;
      settings = { ...currentSettings(), profile: preset.baseProfile, presetId: preset.id, fillScript: nextScript };
      setProfile(preset.baseProfile);
      setPresetId(preset.id);
      setScript(nextScript);
      await saveSettings({ selectedProfile: preset.baseProfile, selectedPresetId: preset.id, fillScript: nextScript });
    }
    flash(null);
    await adoptPerson(await generatePersonForSettings(settings), settings);
  };

  const handleScript = (next: FillScript) => {
    setScript(next);
    saveSettings({ fillScript: next });
  };

  const toggleCategory = (cat: keyof FillCategories) => {
    const updated = { ...categories, [cat]: !categories[cat] };
    setCategories(updated);
    saveSettings({ fillCategories: updated });
  };

  const handleRegenerate = async () => {
    flash(null);
    const settings = currentSettings();
    await adoptPerson(await generatePersonForSettings(settings), settings);
  };

  const handleCopyJson = async () => {
    if (!person) return;
    const ok = await copyTextToClipboard(serializePersonaToJson(person, { script }));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else {
      flash({ type: 'error', message: 'Could not copy to the clipboard.' }, 3000);
    }
  };

  const handleFillPage = async () => {
    if (!person || tabId === null) return;
    setIsFilling(true);
    flash(null);
    fillCounts.current = { top: 0, frames: 0 };

    const response = await sendToTab(tabId, { action: 'FILL_PAGE', person, options: toFillOptions(currentSettings()) });
    setIsFilling(false);

    if (response?.status === 'ok') {
      fillCounts.current.top = response.result?.fieldsFilledCount ?? 0;
      setIsSessionSynced(true);
      showFillCount();
    } else if (response?.status === 'error') {
      flash({ type: 'error', message: 'Something went wrong while filling this page.' });
    } else {
      flash({ type: 'error', message: 'This page cannot be filled. Try reloading it.' });
    }
  };

  const handleUndoFill = async () => {
    if (tabId === null) return;
    setIsReverting(true);
    flash(null);
    const response = await sendToTab(tabId, { action: 'UNDO_FILL' });
    setIsReverting(false);

    if (response?.status === 'ok') {
      const count = response.result?.revertedCount ?? 0;
      const verb = response.result?.action === 'reverted' ? 'Restored' : 'Cleared';
      flash(
        count > 0
          ? { type: 'success', message: `${verb} ${plural(count)}.` }
          : { type: 'warning', message: 'Nothing to undo on this page.' },
        3000
      );
    } else {
      flash({ type: 'error', message: 'Could not reach this page. Try reloading it.' }, 3000);
    }
  };

  const loadMappings = useCallback(async () => {
    if (tabId === null || !activeDomain) return;
    setIsInspecting(true);
    const mapping = await getDomainMapping(activeDomain);
    setDomainRules(mapping?.rules || []);
    const res = await sendToTab(tabId, { action: 'GET_PAGE_FIELDS' }, true);
    setInspectedFields(res?.status === 'ok' ? res.fields || [] : []);
    setSelectedOverrides({});
    setIsInspecting(false);
  }, [tabId, activeDomain]);

  useEffect(() => {
    if (activeTab === 'mappings' && !isRestricted) loadMappings();
  }, [activeTab, isRestricted, loadMappings]);

  const handleSaveOverride = async (fieldKey: string, targetType: SupportedFieldType) => {
    await saveDomainRule(activeDomain, {
      selectorOrName: fieldKey,
      targetType,
      matchType: 'name_or_id',
      description: `Mapped on ${activeDomain}`,
    });
    await loadMappings();
  };

  const handleDeleteRule = async (selectorOrName: string) => {
    await deleteDomainRule(activeDomain, selectorOrName);
    await loadMappings();
  };

  const openSettings = (section?: string) => {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;
    if (section) {
      chrome.tabs.create({ url: chrome.runtime.getURL(`src/options/index.html#${section}`) });
      window.close();
    } else {
      chrome.runtime.openOptionsPage();
    }
  };

  const themeLabel = themePreference === 'system' ? 'System theme' : themePreference === 'light' ? 'Light theme' : 'Dark theme';
  const personaValue = presetId || `archetype:${profile}`;
  const builtinPresets = presets.filter((p) => p.isBuiltin);
  const customPresets = presets.filter((p) => !p.isBuiltin);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img className="brand-logo" src="/icons/icon-48.png" alt="" width={28} height={28} />
          <div>
            <div className="brand-title">Nepal Test Filler</div>
            <div className="brand-subtitle">Synthetic Nepali test data</div>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" className="icon-btn" onClick={handleCycleTheme} title={`${themeLabel} (click to change)`} aria-label={themeLabel}>
            {themePreference === 'dark' ? <Moon size={16} /> : themePreference === 'light' ? <Sun size={16} /> : <Laptop size={16} />}
          </button>
          <button type="button" className="icon-btn" onClick={() => openSettings()} title="Settings" aria-label="Open settings">
            <Settings size={16} />
          </button>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Popup sections">
        <button type="button" role="tab" aria-selected={activeTab === 'fill'} className={`tab ${activeTab === 'fill' ? 'active' : ''}`} onClick={() => setActiveTab('fill')}>
          <Zap size={14} /> Fill
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'mappings'} className={`tab ${activeTab === 'mappings' ? 'active' : ''}`} onClick={() => setActiveTab('mappings')}>
          <Globe size={14} /> Site rules
        </button>
      </nav>

      {activeTab === 'fill' ? (
        <main className="panel">
          <div className="field">
            <div className="field-label-row">
              <label htmlFor="persona-select" className="field-label">Persona</label>
              <button type="button" className="link-btn" onClick={() => openSettings('personas')}>Manage presets</button>
            </div>
            <select id="persona-select" className="select" value={personaValue} onChange={(e) => handlePersonaChange(e.target.value)}>
              <optgroup label="Archetypes">
                {ARCHETYPES.map((a) => (
                  <option key={a.id} value={`archetype:${a.id}`}>{a.label}</option>
                ))}
              </optgroup>
              {builtinPresets.length > 0 && (
                <optgroup label="Presets">
                  {builtinPresets.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              )}
              {customPresets.length > 0 && (
                <optgroup label="My presets">
                  {customPresets.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="field">
            <span className="field-label" id="script-label">Script</span>
            <div className="segmented" role="radiogroup" aria-labelledby="script-label">
              <button type="button" role="radio" aria-checked={script === 'en'} className={script === 'en' ? 'on' : ''} onClick={() => handleScript('en')}>
                English
              </button>
              <button type="button" role="radio" aria-checked={script === 'np'} className={script === 'np' ? 'on' : ''} onClick={() => handleScript('np')} lang="ne">
                नेपाली
              </button>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Fill these fields</span>
            <div className="chips">
              {CATEGORIES.map((c) => (
                <button key={c.id} type="button" className={`chip ${categories[c.id] ? 'on' : ''}`} aria-pressed={categories[c.id]} onClick={() => toggleCategory(c.id)}>
                  {categories[c.id] && <Check size={12} strokeWidth={3} />}
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <section className="card" aria-label="Persona preview">
            {person ? (
              <>
                <div className="card-head">
                  <div className="card-title-wrap">
                    <div className="card-title" lang={np ? 'ne' : undefined}>
                      {np ? person.devanagari!.fullName : person.fullName}
                    </div>
                    <div className="card-meta">
                      <span>{np ? person.devanagari!.gender : person.gender}</span>
                      <span aria-hidden="true">·</span>
                      <span>{person.age} yrs</span>
                      {isSessionSynced && (
                        <span className="synced" title="This tab keeps the same person across form steps">
                          <Link2 size={11} /> Kept for this tab
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="card-actions">
                    <button type="button" className="icon-btn small" onClick={handleCopyJson} title="Copy as JSON" aria-label="Copy person as JSON">
                      {copied ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
                    </button>
                    <button type="button" className="icon-btn small" onClick={handleRegenerate} title="New person" aria-label="Generate a new person">
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
                <ul className="card-rows">
                  <li><Phone size={13} /><span>{person.phone}</span></li>
                  <li><Mail size={13} /><span>{person.workEmail || person.email}</span></li>
                  <li lang={np ? 'ne' : undefined}>
                    <MapPin size={13} />
                    <span>{np ? person.devanagari!.fullAddress : person.address.fullAddress}</span>
                  </li>
                  <li lang={np ? 'ne' : undefined}><Briefcase size={13} /><span>{describeWork(person, np)}</span></li>
                </ul>
              </>
            ) : (
              <div className="card-skeleton" aria-hidden="true">
                <div /><div /><div /><div />
              </div>
            )}
          </section>

          {isRestricted && (
            <div className="status warning" role="status">Chrome doesn't allow extensions on this page. Open a website with a form.</div>
          )}
          {status && !isRestricted && (
            <div className={`status ${status.type}`} role="status" aria-live="polite">{status.message}</div>
          )}

          <div className="actions">
            <button type="button" className="btn primary" onClick={handleFillPage} disabled={isFilling || !person || isRestricted}>
              {isFilling ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
              {isFilling ? 'Filling…' : 'Fill page'}
            </button>
            <button type="button" className="btn secondary" onClick={handleUndoFill} disabled={isReverting || isRestricted} title="Restore the values the fields had before filling">
              {isReverting ? <Loader2 size={15} className="spin" /> : <RotateCcw size={15} />}
              Undo
            </button>
          </div>
        </main>
      ) : (
        <main className="panel">
          {isRestricted ? (
            <div className="empty">Site rules work on regular web pages. Open a website with a form to map its fields.</div>
          ) : (
            <>
              <div className="domain-bar">
                <span className="domain"><Globe size={13} /> {activeDomain}</span>
                <button type="button" className="btn ghost small" onClick={loadMappings} disabled={isInspecting}>
                  <RefreshCw size={12} className={isInspecting ? 'spin' : ''} /> Rescan
                </button>
              </div>

              <p className="hint">Rules override automatic detection for this site. Choose what each field should receive.</p>

              {domainRules.length > 0 && (
                <div className="field">
                  <span className="field-label">Saved rules</span>
                  <ul className="rule-list">
                    {domainRules.map((rule) => (
                      <li key={rule.selectorOrName} className="rule">
                        <code>{rule.selectorOrName}</code>
                        <span className="rule-arrow" aria-hidden="true">→</span>
                        <span className="rule-target">{fieldTypeLabel(rule.targetType)}</span>
                        <button type="button" className="icon-btn small danger" onClick={() => handleDeleteRule(rule.selectorOrName)} aria-label={`Delete rule for ${rule.selectorOrName}`} title="Delete rule">
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="field">
                <span className="field-label">Fields on this page ({inspectedFields.length})</span>
                {isInspecting ? (
                  <div className="empty">Scanning…</div>
                ) : inspectedFields.length === 0 ? (
                  <div className="empty">No form fields found. Reload the page and rescan if the form loaded late.</div>
                ) : (
                  <ul className="field-list">
                    {inspectedFields.map((field) => {
                      const fieldKey = field.name || field.id || '';
                      const selected = selectedOverrides[fieldKey] ?? field.detectedType;
                      const changed = selected !== field.detectedType || field.source === 'unmapped';
                      return (
                        <li key={`${fieldKey}-${field.index}`} className="field-item">
                          <div className="field-item-head">
                            <span className="field-name" title={field.label || fieldKey}>
                              {field.label || fieldKey || `Unnamed ${field.type} field`}
                            </span>
                            <span className={`source ${field.source}`}>
                              {field.source === 'domain_override' ? 'Rule' : field.source === 'unmapped' ? 'Unknown' : 'Auto'}
                            </span>
                          </div>
                          {fieldKey ? (
                            <div className="field-item-row">
                              <select
                                className="select small"
                                value={selected}
                                aria-label={`Data for ${field.label || fieldKey}`}
                                onChange={(e) => setSelectedOverrides({ ...selectedOverrides, [fieldKey]: e.target.value as SupportedFieldType })}
                              >
                                {MAPPABLE_FIELD_TYPES.map((ft) => (
                                  <option key={ft} value={ft}>{fieldTypeLabel(ft)}</option>
                                ))}
                                {!MAPPABLE_FIELD_TYPES.includes(selected) && <option value={selected}>{fieldTypeLabel(selected)}</option>}
                              </select>
                              <button type="button" className="btn secondary small" disabled={!changed} onClick={() => handleSaveOverride(fieldKey, selected)}>
                                Save
                              </button>
                            </div>
                          ) : (
                            <div className="hint">This field has no name or id, so a rule can't target it.</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </main>
      )}

      <footer className="footer">
        <span className="footer-mode" title={aiEnabled && aiReady ? `Unknown fields are classified with ${aiProviderName}` : 'All data is generated on your device'}>
          {aiEnabled && aiReady ? <Bot size={12} /> : <ShieldCheck size={12} />}
          {aiEnabled && aiReady ? 'AI assist on' : 'Offline'}
        </span>
        {fillShortcut && (
          <span className="footer-shortcut">
            Fill: <kbd>{fillShortcut}</kbd>
          </span>
        )}
      </footer>
    </div>
  );
};
