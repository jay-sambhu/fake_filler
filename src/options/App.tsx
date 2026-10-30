import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  GraduationCap,
  Briefcase,
  Building2,
  BookOpen,
  Wheat,
  SlidersHorizontal,
  Users,
  Globe,
  Bot,
  Keyboard,
  Database,
  Download,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Pencil,
  RefreshCw,
  RotateCcw,
  Copy,
  Sun,
  Moon,
  Laptop,
  Eye,
  EyeOff,
  Loader2,
  ExternalLink,
  Check,
} from 'lucide-react';
import {
  ThemePreference,
  applyThemeToDocument,
  loadThemePreference,
  saveThemePreference,
  setupSystemThemeListener,
} from '../utils/themeManager';
import { ProfileType, FillScript, SyntheticPerson, PersonaPreset } from '../types';
import { generateSyntheticPerson } from '../generator/personGenerator';
import { serializePersonaToJson, copyTextToClipboard } from '../utils/personaExport';
import {
  getPersonaPresets,
  savePersonaPreset,
  deletePersonaPreset,
  resetDefaultPresets,
  generatePersonFromPreset,
} from '../services/personaPresets';
import { COMMERCIAL_BANKS } from '../generator/bankingDetails';
import { NepalDataEngine } from '../generator/nepalDataEngine';
import {
  getAllDomainMappings,
  deleteDomainRule,
  deleteDomainMapping,
  saveDomainRule,
  DomainMappingConfig,
  FieldMappingRule,
} from '../services/domainMapping';
import { getCacheStats, clearClassificationCache } from '../services/classificationCache';
import {
  AI_PROVIDERS,
  AiConnectionTestResult,
  AiModelOption,
  StoredAiSettings,
  DEFAULT_AI_PROVIDER,
  DEFAULT_CUSTOM_BASE_URL,
  describeAiError,
  getProvider,
  isAiConfigReady,
  isAiProviderId,
  listModels,
  loadAiSettings,
  testAiConnection,
  toAiConfig,
} from '../services/aiProviders';
import { AiProviderId } from '../types';
import {
  DEFAULT_FILL_CATEGORIES,
  FillCategories,
  PROFILE_TYPES,
  loadFillSettings,
  saveCurrentPerson,
  saveSettings,
} from '../services/settings';
import { fieldTypeLabel } from '../utils/fieldTypeLabels';
import './App.css';

type SettingsTab = 'general' | 'personas' | 'mappings' | 'ai' | 'shortcuts' | 'backup';
type Toast = { kind: 'success' | 'error'; text: string } | null;

const NAV: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
  { id: 'general', label: 'General', icon: <SlidersHorizontal size={16} /> },
  { id: 'personas', label: 'Personas', icon: <Users size={16} /> },
  { id: 'mappings', label: 'Site rules', icon: <Globe size={16} /> },
  { id: 'ai', label: 'AI assist', icon: <Bot size={16} /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={16} /> },
  { id: 'backup', label: 'Backup', icon: <Database size={16} /> },
];

const PROFILES: Array<{ id: ProfileType; label: string; desc: string; icon: React.ReactNode }> = [
  { id: 'general', label: 'General citizen', desc: 'Full name, contact and a complete Nepali address', icon: <User size={18} /> },
  { id: 'student', label: 'Student', desc: 'Roll number, college, faculty and guardian details', icon: <GraduationCap size={18} /> },
  { id: 'employee', label: 'Employee', desc: 'Work email, staff ID, PAN and salary', icon: <Briefcase size={18} /> },
  { id: 'business', label: 'Business owner', desc: 'Registered business, PAN/VAT and office address', icon: <Building2 size={18} /> },
  { id: 'teacher', label: 'Teacher', desc: 'Subject, faculty and institution', icon: <BookOpen size={18} /> },
  { id: 'farmer', label: 'Farmer', desc: 'Rural municipality, cooperative and main crop', icon: <Wheat size={18} /> },
];

const CATEGORY_INFO: Array<{ id: keyof FillCategories; label: string; desc: string }> = [
  { id: 'personal', label: 'Personal', desc: 'Name, gender, date of birth, IDs, bank details' },
  { id: 'contact', label: 'Contact', desc: 'Mobile, landline, email' },
  { id: 'address', label: 'Address', desc: 'Province, district, municipality, ward, tole' },
  { id: 'professional', label: 'Work & study', desc: 'Occupation, company, school, PAN/VAT' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const;

const EMPTY_PRESET: Partial<PersonaPreset> = {
  name: '',
  description: '',
  baseProfile: 'employee',
  gender: 'Random',
  preferredScript: 'en',
};

function hasStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function extensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return '';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidPreset(value: unknown): value is PersonaPreset {
  return (
    isPlainObject(value) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    PROFILE_TYPES.includes(value.baseProfile as ProfileType)
  );
}

function isValidRule(value: unknown): value is FieldMappingRule {
  return isPlainObject(value) && typeof value.selectorOrName === 'string' && typeof value.targetType === 'string';
}

function Switch({
  checked,
  onChange,
  label,
  id,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  );
}

export function App() {
  const [activeTab, setActiveTabState] = useState<SettingsTab>(() => {
    const hash = typeof location !== 'undefined' ? location.hash.slice(1) : '';
    return NAV.some((n) => n.id === hash) ? (hash as SettingsTab) : 'general';
  });
  const setActiveTab = (tab: SettingsTab) => {
    setActiveTabState(tab);
    history.replaceState(null, '', `#${tab}`);
  };
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // General
  const [defaultProfile, setDefaultProfile] = useState<ProfileType>('general');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [defaultScript, setDefaultScript] = useState<FillScript>('en');
  const [fillCategories, setFillCategories] = useState<FillCategories>(DEFAULT_FILL_CATEGORIES);
  const [enableFloatingBadge, setEnableFloatingBadge] = useState(true);
  const [enableSessionPersistence, setEnableSessionPersistence] = useState(true);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');

  // Personas
  const [presets, setPresets] = useState<PersonaPreset[]>([]);
  const [editingPreset, setEditingPreset] = useState<Partial<PersonaPreset> | null>(null);
  const [previewPerson, setPreviewPerson] = useState<SyntheticPerson>(() => generateSyntheticPerson('general'));
  const [previewSource, setPreviewSource] = useState<string>('General citizen');

  // Site rules
  const [allMappings, setAllMappings] = useState<Record<string, DomainMappingConfig>>({});

  // AI
  const [aiEnabled, setAiEnabled] = useState(false);
  const [ai, setAi] = useState<StoredAiSettings>({
    enabled: false,
    provider: DEFAULT_AI_PROVIDER,
    apiKeys: {},
    models: {},
    customBaseUrl: DEFAULT_CUSTOM_BASE_URL,
  });
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_CUSTOM_BASE_URL);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [modelsState, setModelsState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [modelsError, setModelsError] = useState('');
  const [manualModel, setManualModel] = useState(false);
  const [modelDraft, setModelDraft] = useState('');
  const [cacheCount, setCacheCount] = useState(0);
  const [testStatus, setTestStatus] = useState<AiConnectionTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Shortcuts
  const [commands, setCommands] = useState<chrome.commands.Command[]>([]);

  const showToast = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ kind, text });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const loadPresets = useCallback(async () => setPresets(await getPersonaPresets()), []);
  const loadDomainMappings = useCallback(async () => setAllMappings(await getAllDomainMappings()), []);
  const refreshCacheCount = useCallback(async () => setCacheCount((await getCacheStats()).count), []);

  const loadSettings = useCallback(async () => {
    const settings = await loadFillSettings();
    setDefaultProfile(settings.profile);
    setSelectedPresetId(settings.presetId);
    setDefaultScript(settings.fillScript);
    setFillCategories(settings.fillCategories);
    setAiEnabled(settings.aiEnabled);
    setPreviewPerson(generateSyntheticPerson(settings.profile));
    setPreviewSource(PROFILES.find((p) => p.id === settings.profile)?.label || 'General citizen');

    if (hasStorage()) {
      const data = (await chrome.storage.local.get(['enableFloatingBadge', 'enableSessionPersistence'])) as Record<string, unknown>;
      setEnableFloatingBadge(data.enableFloatingBadge !== false);
      setEnableSessionPersistence(data.enableSessionPersistence !== false);
    }
    const aiSettings = await loadAiSettings();
    setAi(aiSettings);
    setApiKey(aiSettings.apiKeys[aiSettings.provider] || '');
    setBaseUrl(aiSettings.customBaseUrl);
  }, []);

  useEffect(() => {
    loadSettings();
    loadPresets();
    refreshCacheCount();
    loadDomainMappings();

    loadThemePreference().then((pref) => {
      setThemePreference(pref);
      applyThemeToDocument(pref);
    });
    const cleanupTheme = setupSystemThemeListener(() => {
      loadThemePreference().then((pref) => {
        if (pref === 'system') applyThemeToDocument('system');
      });
    });

    if (typeof chrome !== 'undefined' && chrome.commands?.getAll) {
      chrome.commands.getAll((cmds) => setCommands(cmds.filter((c) => c.name !== '_execute_action')));
    }

    // Keep this page in sync when the popup changes the same settings.
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (changes.personaPresets) loadPresets();
      if (changes.nepal_filler_domain_mappings) loadDomainMappings();
      if (changes.selectedProfile || changes.selectedPresetId || changes.fillScript || changes.fillCategories) {
        loadFillSettings().then((s) => {
          setDefaultProfile(s.profile);
          setSelectedPresetId(s.presetId);
          setDefaultScript(s.fillScript);
          setFillCategories(s.fillCategories);
        });
      }
    };
    if (hasStorage()) chrome.storage.onChanged.addListener(onChanged);

    return () => {
      cleanupTheme();
      if (hasStorage()) chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [loadSettings, loadPresets, refreshCacheCount, loadDomainMappings]);

  const persist = async (values: Record<string, unknown>, message = 'Saved') => {
    await saveSettings(values);
    showToast(message);
  };

  const handleThemeChange = async (theme: ThemePreference) => {
    setThemePreference(theme);
    applyThemeToDocument(theme);
    await saveThemePreference(theme);
  };

  // ── Personas ──────────────────────────────────────────────

  const handleProfileSelect = async (p: ProfileType) => {
    setDefaultProfile(p);
    setSelectedPresetId(null);
    const person = generateSyntheticPerson(p);
    setPreviewPerson(person);
    setPreviewSource(PROFILES.find((x) => x.id === p)?.label || p);
    await saveCurrentPerson(person);
    await persist({ selectedProfile: p, selectedPresetId: null }, 'Default persona updated');
  };

  const handleUsePreset = async (preset: PersonaPreset) => {
    setSelectedPresetId(preset.id);
    setDefaultProfile(preset.baseProfile);
    const person = generatePersonFromPreset(preset);
    setPreviewPerson(person);
    setPreviewSource(preset.name);
    await saveCurrentPerson(person);
    const values: Record<string, unknown> = { selectedProfile: preset.baseProfile, selectedPresetId: preset.id };
    if (preset.preferredScript) {
      values.fillScript = preset.preferredScript;
      setDefaultScript(preset.preferredScript);
    }
    await persist(values, `Now using "${preset.name}"`);
  };

  const handleSavePreset = async () => {
    if (!editingPreset) return;
    const name = (editingPreset.name || '').trim();
    if (!name) {
      showToast('Give the preset a name first.', 'error');
      return;
    }
    const saved = await savePersonaPreset({ ...editingPreset, name, baseProfile: editingPreset.baseProfile || 'general' });
    await loadPresets();
    setEditingPreset(null);
    showToast(`Saved "${saved.name}"`);
  };

  const handleDeletePreset = async (preset: PersonaPreset) => {
    if (!confirm(`Delete the preset "${preset.name}"?`)) return;
    if (await deletePersonaPreset(preset.id)) {
      if (selectedPresetId === preset.id) {
        setSelectedPresetId(null);
        await saveSettings({ selectedPresetId: null });
      }
      await loadPresets();
      showToast(`Deleted "${preset.name}"`);
    }
  };

  const handleRestoreBuiltins = async () => {
    if (!confirm('Restore the built-in presets to their original settings? Your own presets are kept.')) return;
    const custom = presets.filter((p) => !p.isBuiltin);
    await resetDefaultPresets();
    for (const p of custom) await savePersonaPreset(p);
    await loadPresets();
    showToast('Built-in presets restored');
  };

  const regeneratePreview = () => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    setPreviewPerson(preset ? generatePersonFromPreset(preset) : generateSyntheticPerson(defaultProfile));
  };

  const handleCopyPreviewJson = async () => {
    const ok = await copyTextToClipboard(serializePersonaToJson(previewPerson, { script: defaultScript }));
    showToast(ok ? 'Copied as JSON' : 'Could not copy to the clipboard', ok ? 'success' : 'error');
  };

  // ── Site rules ────────────────────────────────────────────

  const handleDeleteRule = async (domain: string, selectorOrName: string) => {
    await deleteDomainRule(domain, selectorOrName);
    await loadDomainMappings();
    showToast(`Removed rule from ${domain}`);
  };

  const handleDeleteDomain = async (domain: string) => {
    if (!confirm(`Remove all rules for ${domain}?`)) return;
    await deleteDomainMapping(domain);
    await loadDomainMappings();
    showToast(`Removed all rules for ${domain}`);
  };

  // ── AI ────────────────────────────────────────────────────

  const provider = getProvider(ai.provider);
  const savedApiKey = ai.apiKeys[ai.provider] || '';
  const selectedModel = ai.models[ai.provider] || '';
  const savedConfig = toAiConfig(ai);
  const aiReady = isAiConfigReady(savedConfig);
  const canListModels = provider.keyOptional || Boolean(savedApiKey);

  const updateAi = async (next: StoredAiSettings, values: Record<string, unknown>, message?: string) => {
    setAi(next);
    setTestStatus(null);
    if (message) await persist(values, message);
    else await saveSettings(values);
  };

  const handleAiToggle = async (enabled: boolean) => {
    setAiEnabled(enabled);
    await updateAi({ ...ai, enabled }, { geminiAiClassificationEnabled: enabled }, enabled ? 'AI assist turned on' : 'AI assist turned off');
  };

  const handleProviderChange = async (id: AiProviderId) => {
    setApiKey(ai.apiKeys[id] || '');
    setShowKey(false);
    setManualModel(false);
    await updateAi({ ...ai, provider: id }, { aiProvider: id }, `Provider set to ${getProvider(id).name}`);
  };

  const handleSaveKey = async () => {
    const key = apiKey.trim();
    setApiKey(key);
    const apiKeys = { ...ai.apiKeys, [ai.provider]: key };
    const next = { ...ai, apiKeys };
    // Without a key the active provider can't run, so switch AI assist off rather than fail silently.
    if (!key && !provider.keyOptional && ai.enabled) {
      setAiEnabled(false);
      await updateAi({ ...next, enabled: false }, { aiApiKeys: apiKeys, geminiAiClassificationEnabled: false }, 'API key removed, AI assist turned off');
      return;
    }
    await updateAi(next, { aiApiKeys: apiKeys }, key ? 'API key saved' : 'API key removed');
  };

  const handleSaveBaseUrl = async () => {
    const url = baseUrl.trim().replace(/\/+$/, '') || DEFAULT_CUSTOM_BASE_URL;
    setBaseUrl(url);
    if (url === ai.customBaseUrl) return;
    await updateAi({ ...ai, customBaseUrl: url }, { aiCustomBaseUrl: url }, 'Server address saved');
  };

  const handleModelChange = async (model: string) => {
    const value = model.trim();
    if (value === selectedModel) return;
    const aiModels = { ...ai.models, [ai.provider]: value };
    await updateAi({ ...ai, models: aiModels }, { aiModels }, value ? 'Model updated' : 'Model cleared');
  };

  const fetchModels = useCallback(async (config: Pick<StoredAiSettings, 'provider'> & { apiKey: string; baseUrl: string }) => {
    setModelsState('loading');
    setModelsError('');
    try {
      const list = await listModels({ provider: config.provider, apiKey: config.apiKey, baseUrl: config.baseUrl });
      setModels(list);
      setModelsState('loaded');
      if (list.length === 0) setModelsError('The provider returned no chat models for this key.');
    } catch (err) {
      setModels([]);
      setModelsState('error');
      setModelsError(describeAiError(err, getProvider(config.provider).name, '').message);
    }
  }, []);

  // Load the model list whenever the AI tab shows a provider that has a saved key.
  useEffect(() => {
    if (activeTab !== 'ai') return;
    setModels([]);
    setModelsState('idle');
    setModelsError('');
    if (canListModels) fetchModels({ provider: ai.provider, apiKey: savedApiKey, baseUrl: ai.customBaseUrl });
  }, [activeTab, ai.provider, savedApiKey, ai.customBaseUrl, canListModels, fetchModels]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestStatus(null);
    try {
      setTestStatus(await testAiConnection({ ...savedConfig, apiKey: apiKey.trim() || savedApiKey }));
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearCache = async () => {
    await clearClassificationCache();
    await refreshCacheCount();
    showToast('AI cache cleared');
  };

  // ── Backup ────────────────────────────────────────────────

  const handleExportBackup = () => {
    const backup = {
      app: 'nepal-test-filler',
      version: extensionVersion(),
      exportedAt: new Date().toISOString(),
      theme: themePreference,
      defaultProfile,
      selectedPresetId,
      fillScript: defaultScript,
      fillCategories,
      enableFloatingBadge,
      enableSessionPersistence,
      aiEnabled,
      aiProvider: ai.provider,
      aiModels: ai.models,
      aiCustomBaseUrl: ai.customBaseUrl,
      domainMappings: allMappings,
      personaPresets: presets.filter((p) => !p.isBuiltin),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `nepal-test-filler-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Backup downloaded');
  };

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isPlainObject(parsed)) throw new Error('not an object');

        const values: Record<string, unknown> = {};
        if (PROFILE_TYPES.includes(parsed.defaultProfile as ProfileType)) values.selectedProfile = parsed.defaultProfile;
        if (parsed.fillScript === 'en' || parsed.fillScript === 'np') values.fillScript = parsed.fillScript;
        if (isPlainObject(parsed.fillCategories)) {
          values.fillCategories = { ...DEFAULT_FILL_CATEGORIES, ...(parsed.fillCategories as Partial<FillCategories>) };
        }
        if (typeof parsed.enableFloatingBadge === 'boolean') values.enableFloatingBadge = parsed.enableFloatingBadge;
        if (typeof parsed.enableSessionPersistence === 'boolean') values.enableSessionPersistence = parsed.enableSessionPersistence;
        if (typeof parsed.aiEnabled === 'boolean') values.geminiAiClassificationEnabled = parsed.aiEnabled;
        if (isAiProviderId(parsed.aiProvider)) values.aiProvider = parsed.aiProvider;
        if (isPlainObject(parsed.aiModels)) {
          values.aiModels = Object.fromEntries(
            Object.entries(parsed.aiModels).filter(([id, model]) => isAiProviderId(id) && typeof model === 'string')
          );
        } else if (typeof parsed.geminiModel === 'string') {
          values.aiModels = { gemini: parsed.geminiModel };
        }
        if (typeof parsed.aiCustomBaseUrl === 'string' && /^https?:\/\//.test(parsed.aiCustomBaseUrl)) {
          values.aiCustomBaseUrl = parsed.aiCustomBaseUrl;
        }
        if (parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'system') {
          await handleThemeChange(parsed.theme);
        }

        const importedPresets = Array.isArray(parsed.personaPresets) ? parsed.personaPresets.filter(isValidPreset) : [];
        for (const p of importedPresets) {
          if (!p.isBuiltin) await savePersonaPreset(p);
        }
        const presetList = await getPersonaPresets();
        if (typeof parsed.selectedPresetId === 'string' && presetList.some((p) => p.id === parsed.selectedPresetId)) {
          values.selectedPresetId = parsed.selectedPresetId;
        }

        let ruleCount = 0;
        if (isPlainObject(parsed.domainMappings)) {
          for (const [domain, config] of Object.entries(parsed.domainMappings)) {
            const rules = isPlainObject(config) && Array.isArray(config.rules) ? config.rules : Array.isArray(config) ? config : [];
            for (const rule of rules.filter(isValidRule)) {
              await saveDomainRule(domain, rule);
              ruleCount++;
            }
          }
        }

        await saveSettings(values);
        await Promise.all([loadSettings(), loadPresets(), loadDomainMappings()]);
        showToast(`Restored settings, ${importedPresets.length} presets and ${ruleCount} site rules`);
      } catch {
        showToast('That file is not a valid Nepal Test Filler backup.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const openShortcutSettings = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  };

  const domainEntries = Object.entries(allMappings).filter(([, c]) => c.rules?.length);
  const keyDirty = apiKey.trim() !== savedApiKey;
  const modelOptions = selectedModel && !models.some((m) => m.id === selectedModel) ? [{ id: selectedModel, name: selectedModel }, ...models] : models;
  const showModelSelect = !manualModel && modelsState === 'loaded' && models.length > 0;
  const version = extensionVersion();

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">
          <img src="/icons/icon-48.png" alt="" width={36} height={36} className="brand-logo" />
          <div>
            <h1>Nepal Test Filler</h1>
            <p>Settings{version ? ` · v${version}` : ''}</p>
          </div>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {([
            ['light', <Sun size={14} key="i" />, 'Light'],
            ['dark', <Moon size={14} key="i" />, 'Dark'],
            ['system', <Laptop size={14} key="i" />, 'System'],
          ] as const).map(([id, icon, label]) => (
            <button key={id} type="button" role="radio" aria-checked={themePreference === id} className={themePreference === id ? 'on' : ''} onClick={() => handleThemeChange(id)}>
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="body">
        <nav className="sidebar" aria-label="Settings sections">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              aria-current={activeTab === item.id ? 'page' : undefined}
              onClick={() => setActiveTab(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <main className="content">
          {activeTab === 'general' && (
            <section>
              <h2>General</h2>
              <p className="lead">These settings apply to the popup, keyboard shortcuts and the in-page button. Changes save automatically.</p>

              <div className="card list">
                <div className="setting">
                  <div>
                    <div className="setting-title">Fill script</div>
                    <div className="setting-desc">Language used for names and addresses. Fields labelled in Devanagari always get Nepali text.</div>
                  </div>
                  <div className="segmented">
                    <button type="button" className={defaultScript === 'en' ? 'on' : ''} aria-pressed={defaultScript === 'en'} onClick={() => { setDefaultScript('en'); persist({ fillScript: 'en' }); }}>
                      English
                    </button>
                    <button type="button" lang="ne" className={defaultScript === 'np' ? 'on' : ''} aria-pressed={defaultScript === 'np'} onClick={() => { setDefaultScript('np'); persist({ fillScript: 'np' }); }}>
                      नेपाली
                    </button>
                  </div>
                </div>
              </div>

              <h3>Fields to fill</h3>
              <div className="card list">
                {CATEGORY_INFO.map((cat) => (
                  <div className="setting" key={cat.id}>
                    <label htmlFor={`cat-${cat.id}`}>
                      <div className="setting-title">{cat.label}</div>
                      <div className="setting-desc">{cat.desc}</div>
                    </label>
                    <Switch
                      id={`cat-${cat.id}`}
                      label={cat.label}
                      checked={fillCategories[cat.id]}
                      onChange={(v) => {
                        const updated = { ...fillCategories, [cat.id]: v };
                        setFillCategories(updated);
                        persist({ fillCategories: updated });
                      }}
                    />
                  </div>
                ))}
              </div>

              <h3>Behaviour</h3>
              <div className="card list">
                <div className="setting">
                  <label htmlFor="badge-toggle">
                    <div className="setting-title">In-page quick-fill button</div>
                    <div className="setting-desc">Show a small button next to the focused field to fill the form, fill one field, or undo.</div>
                  </label>
                  <Switch
                    id="badge-toggle"
                    label="In-page quick-fill button"
                    checked={enableFloatingBadge}
                    onChange={(v) => { setEnableFloatingBadge(v); persist({ enableFloatingBadge: v }); }}
                  />
                </div>
                <div className="setting">
                  <label htmlFor="session-toggle">
                    <div className="setting-title">Keep the same person per tab</div>
                    <div className="setting-desc">Multi-step forms get the same person on every step instead of a new one each page.</div>
                  </label>
                  <Switch
                    id="session-toggle"
                    label="Keep the same person per tab"
                    checked={enableSessionPersistence}
                    onChange={(v) => { setEnableSessionPersistence(v); persist({ enableSessionPersistence: v }); }}
                  />
                </div>
              </div>
            </section>
          )}

          {activeTab === 'personas' && (
            <section>
              <h2>Personas</h2>
              <p className="lead">Pick who the extension fills forms as. Use a preset to lock details like location, employer or bank.</p>

              <h3>Archetypes</h3>
              <div className="profile-grid">
                {PROFILES.map((p) => {
                  const active = !selectedPresetId && defaultProfile === p.id;
                  return (
                    <button key={p.id} type="button" className={`profile-card ${active ? 'selected' : ''}`} aria-pressed={active} onClick={() => handleProfileSelect(p.id)}>
                      <span className="profile-icon">{p.icon}</span>
                      <span className="profile-text">
                        <span className="profile-name">{p.label}</span>
                        <span className="profile-desc">{p.desc}</span>
                      </span>
                      {active && <Check size={16} className="profile-check" />}
                    </button>
                  );
                })}
              </div>

              <div className="section-head">
                <h3>Presets</h3>
                <div className="row">
                  <button type="button" className="btn ghost" onClick={handleRestoreBuiltins}>
                    <RotateCcw size={14} /> Restore built-ins
                  </button>
                  <button type="button" className="btn primary" onClick={() => setEditingPreset({ ...EMPTY_PRESET })}>
                    <Plus size={15} /> New preset
                  </button>
                </div>
              </div>

              {editingPreset && (
                <PresetEditor
                  preset={editingPreset}
                  onChange={setEditingPreset}
                  onSave={handleSavePreset}
                  onCancel={() => setEditingPreset(null)}
                />
              )}

              <div className="preset-grid">
                {presets.map((preset) => {
                  const active = selectedPresetId === preset.id;
                  const details = [
                    ['Location', [preset.municipality, preset.district, preset.province].filter(Boolean).join(', ')],
                    ['Role', preset.designation || preset.jobTitle],
                    ['Company', preset.companyName],
                    ['School', preset.school],
                    ['Business', preset.businessName],
                    ['Bank', preset.bankName],
                    ['Email', preset.emailDomain ? `@${preset.emailDomain}` : ''],
                  ].filter(([, v]) => v);
                  return (
                    <article key={preset.id} className={`preset-card ${active ? 'selected' : ''}`}>
                      <div className="preset-top">
                        <h4>{preset.name}</h4>
                        <span className="tag">{PROFILES.find((p) => p.id === preset.baseProfile)?.label || preset.baseProfile}</span>
                      </div>
                      {preset.description && <p className="preset-desc">{preset.description}</p>}
                      {details.length > 0 && (
                        <dl className="preset-details">
                          {details.map(([k, v]) => (
                            <React.Fragment key={k}>
                              <dt>{k}</dt>
                              <dd>{v}</dd>
                            </React.Fragment>
                          ))}
                        </dl>
                      )}
                      <div className="preset-actions">
                        <button type="button" className={`btn ${active ? 'success' : 'secondary'} grow`} onClick={() => handleUsePreset(preset)} disabled={active}>
                          {active ? <><Check size={14} /> In use</> : 'Use this preset'}
                        </button>
                        <button type="button" className="icon-btn" title="Edit" aria-label={`Edit ${preset.name}`} onClick={() => setEditingPreset({ ...preset })}>
                          <Pencil size={14} />
                        </button>
                        {!preset.isBuiltin && (
                          <button type="button" className="icon-btn danger" title="Delete" aria-label={`Delete ${preset.name}`} onClick={() => handleDeletePreset(preset)}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="section-head">
                <h3>Preview · {previewSource}</h3>
                <div className="row">
                  <button type="button" className="btn ghost" onClick={handleCopyPreviewJson}>
                    <Copy size={14} /> Copy JSON
                  </button>
                  <button type="button" className="btn ghost" onClick={regeneratePreview}>
                    <RefreshCw size={14} /> New person
                  </button>
                </div>
              </div>
              <PersonPreview person={previewPerson} />
            </section>
          )}

          {activeTab === 'mappings' && (
            <section>
              <h2>Site rules</h2>
              <p className="lead">Rules tell the extension exactly what to put in a field on a specific site. Create them from the popup's “Site rules” tab while on that site.</p>

              {domainEntries.length === 0 ? (
                <div className="empty">
                  <Globe size={28} />
                  <p>No site rules yet.</p>
                </div>
              ) : (
                <div className="stack">
                  {domainEntries.map(([domain, config]) => (
                    <div key={domain} className="card">
                      <div className="domain-head">
                        <Globe size={15} />
                        <h4>{domain}</h4>
                        <span className="tag">{config.rules.length} rule{config.rules.length === 1 ? '' : 's'}</span>
                        <button type="button" className="btn ghost small danger-text" onClick={() => handleDeleteDomain(domain)}>
                          Remove all
                        </button>
                      </div>
                      <ul className="rule-list">
                        {config.rules.map((rule) => (
                          <li key={rule.selectorOrName}>
                            <code>{rule.selectorOrName}</code>
                            <span className="muted" aria-hidden="true">→</span>
                            <span className="rule-target">{fieldTypeLabel(rule.targetType)}</span>
                            <button type="button" className="icon-btn danger" title="Delete rule" aria-label={`Delete rule ${rule.selectorOrName}`} onClick={() => handleDeleteRule(domain, rule.selectorOrName)}>
                              <Trash2 size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === 'ai' && (
            <section>
              <h2>AI assist</h2>
              <p className="lead">
                Optional. When the built-in rules can't recognise a field, an AI model of your choice can classify it. Everything else stays on your device.
              </p>

              <div className="card list">
                <div className="setting">
                  <label htmlFor="ai-toggle">
                    <div className="setting-title">Classify unknown fields with AI</div>
                    <div className="setting-desc">
                      {aiReady
                        ? `Uses ${provider.name} · ${selectedModel}`
                        : provider.keyOptional || savedApiKey
                          ? 'Choose a model below to turn this on.'
                          : `Add your ${provider.name} API key below to turn this on.`}
                    </div>
                  </label>
                  <Switch
                    id="ai-toggle"
                    label="Classify unknown fields with AI"
                    checked={aiEnabled && aiReady}
                    onChange={handleAiToggle}
                    disabled={!aiReady}
                  />
                </div>

                <div className="setting">
                  <label htmlFor="ai-provider">
                    <div className="setting-title">Provider</div>
                    <div className="setting-desc">Each provider keeps its own key and model.</div>
                  </label>
                  <select id="ai-provider" className="select" value={ai.provider} onChange={(e) => handleProviderChange(e.target.value as AiProviderId)}>
                    {AI_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {provider.id === 'custom' && (
                  <div className="setting column">
                    <label htmlFor="ai-base-url" className="setting-title">Server address</label>
                    <input
                      id="ai-base-url"
                      type="url"
                      className="input mono"
                      placeholder={DEFAULT_CUSTOM_BASE_URL}
                      value={baseUrl}
                      spellCheck={false}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      onBlur={handleSaveBaseUrl}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveBaseUrl()}
                    />
                    <div className="setting-desc">
                      Any OpenAI-compatible API, such as Ollama, LM Studio, DeepSeek or Mistral. Include the version path, for example <code>/v1</code>.
                    </div>
                  </div>
                )}

                <div className="setting column">
                  <label htmlFor="api-key" className="setting-title">
                    API key{provider.keyOptional ? ' (optional)' : ''}
                  </label>
                  <div className="row">
                    <div className="input-wrap grow">
                      <input
                        id="api-key"
                        type={showKey ? 'text' : 'password'}
                        className="input"
                        placeholder={provider.keyPlaceholder}
                        value={apiKey}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => { setApiKey(e.target.value); setTestStatus(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && keyDirty && handleSaveKey()}
                      />
                      <button type="button" className="input-icon" onClick={() => setShowKey(!showKey)} aria-label={showKey ? 'Hide key' : 'Show key'}>
                        {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    <button type="button" className="btn primary" onClick={handleSaveKey} disabled={!keyDirty}>
                      Save
                    </button>
                  </div>
                  <div className="setting-desc">
                    Stored only in this browser and sent only to {provider.name}.
                    {provider.keyUrl && (
                      <>
                        {' '}Get a key at{' '}
                        <a href={provider.keyUrl} target="_blank" rel="noreferrer">
                          {new URL(provider.keyUrl).hostname} <ExternalLink size={11} />
                        </a>
                      </>
                    )}
                  </div>
                </div>

                <div className="setting column">
                  <div className="row">
                    <label htmlFor="ai-model" className="setting-title grow">Model</label>
                    {canListModels && (
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => fetchModels({ provider: ai.provider, apiKey: savedApiKey, baseUrl: ai.customBaseUrl })}
                        disabled={modelsState === 'loading'}
                      >
                        <RefreshCw size={13} className={modelsState === 'loading' ? 'spin' : ''} /> Refresh list
                      </button>
                    )}
                    {modelsState === 'loaded' && models.length > 0 && (
                      <button type="button" className="btn ghost small" onClick={() => { setManualModel(!manualModel); setModelDraft(selectedModel); }}>
                        {manualModel ? 'Pick from list' : 'Type a model ID'}
                      </button>
                    )}
                  </div>
                  <div className="row">
                    {showModelSelect ? (
                      <select id="ai-model" className="select wide" value={selectedModel} onChange={(e) => handleModelChange(e.target.value)}>
                        <option value="" disabled>Choose a model ({models.length} available)</option>
                        {modelOptions.map((m) => (
                          <option key={m.id} value={m.id}>{m.name === m.id ? m.id : `${m.name} (${m.id})`}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="ai-model"
                        className="input mono grow"
                        placeholder={modelsState === 'loading' ? 'Loading models…' : 'Model ID'}
                        value={manualModel ? modelDraft : selectedModel}
                        disabled={!manualModel && modelsState === 'loading'}
                        spellCheck={false}
                        onFocus={() => { if (!manualModel) { setManualModel(true); setModelDraft(selectedModel); } }}
                        onChange={(e) => setModelDraft(e.target.value)}
                        onBlur={() => handleModelChange(modelDraft)}
                        onKeyDown={(e) => e.key === 'Enter' && handleModelChange(modelDraft)}
                      />
                    )}
                    <button type="button" className="btn secondary" onClick={handleTestConnection} disabled={isTesting || !selectedModel || (!provider.keyOptional && !apiKey.trim() && !savedApiKey)}>
                      {isTesting ? <Loader2 size={14} className="spin" /> : null}
                      {isTesting ? 'Testing…' : 'Test'}
                    </button>
                  </div>
                  <div className="setting-desc">
                    {!canListModels
                      ? 'Save your API key to load the models it can use.'
                      : modelsState === 'loading'
                        ? `Loading models from ${provider.name}…`
                        : 'The list comes live from the provider. A small, fast model is plenty for classifying fields.'}
                  </div>
                  {modelsError && (
                    <div className="notice error" role="status">
                      <AlertCircle size={16} />
                      <span>{modelsError} You can still type a model ID.</span>
                    </div>
                  )}
                  {testStatus && (
                    <div className={`notice ${testStatus.success ? 'success' : 'error'}`} role="status">
                      {testStatus.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      <span>{testStatus.message}</span>
                    </div>
                  )}
                </div>

                <div className="setting">
                  <div>
                    <div className="setting-title">Cached answers</div>
                    <div className="setting-desc">{cacheCount} field{cacheCount === 1 ? '' : 's'} remembered so the same field is never sent twice.</div>
                  </div>
                  <button type="button" className="btn secondary" onClick={handleClearCache} disabled={cacheCount === 0}>
                    <Trash2 size={14} /> Clear
                  </button>
                </div>
              </div>

              <div className="notice info">
                <AlertCircle size={16} />
                <span>
                  What is sent to {provider.name}: the site's hostname and the unknown field's name, id, placeholder, label and input type. Never what you or the
                  page typed, and never the generated test data.
                </span>
              </div>
            </section>
          )}

          {activeTab === 'shortcuts' && (
            <section>
              <h2>Shortcuts</h2>
              <p className="lead">Fill forms without opening the popup.</p>

              <div className="card list">
                {commands.length > 0 ? (
                  commands.map((cmd) => (
                    <div className="setting" key={cmd.name}>
                      <div className="setting-title">{cmd.description}</div>
                      {cmd.shortcut ? <kbd>{cmd.shortcut}</kbd> : <span className="muted">Not set</span>}
                    </div>
                  ))
                ) : (
                  <div className="setting">
                    <div className="setting-title">Fill the current page</div>
                    <kbd>Alt+Shift+F</kbd>
                  </div>
                )}
                <div className="setting">
                  <div className="setting-title">Right-click menu</div>
                  <span className="muted">Right-click a page → Fill form with Nepali test data</span>
                </div>
              </div>

              <button type="button" className="btn secondary" onClick={openShortcutSettings}>
                <Keyboard size={14} /> Change shortcuts
              </button>
            </section>
          )}

          {activeTab === 'backup' && (
            <section>
              <h2>Backup</h2>
              <p className="lead">Move your presets, site rules and preferences to another browser. Your API key is never included.</p>

              <div className="backup-grid">
                <div className="card backup">
                  <Download size={22} />
                  <h4>Export</h4>
                  <p>Download a JSON file with your settings, presets and site rules.</p>
                  <button type="button" className="btn primary" onClick={handleExportBackup}>
                    Download backup
                  </button>
                </div>
                <div className="card backup">
                  <Upload size={22} />
                  <h4>Import</h4>
                  <p>Restore from a backup file. Existing presets and rules are kept; matching ones are updated.</p>
                  <label className="btn secondary file-btn">
                    Choose file…
                    <input type="file" accept="application/json,.json" onChange={handleImportBackup} />
                  </label>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {toast && (
        <div className={`toast ${toast.kind}`} role="status" aria-live="polite">
          {toast.kind === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  );
}

function PresetEditor({
  preset,
  onChange,
  onSave,
  onCancel,
}: {
  preset: Partial<PersonaPreset>;
  onChange: (p: Partial<PersonaPreset>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<PersonaPreset>) => onChange({ ...preset, ...patch });
  const districts = preset.province ? NepalDataEngine.getDistrictsByProvince(preset.province) : NepalDataEngine.districts;
  const text = (key: keyof PersonaPreset, label: string, placeholder: string) => (
    <label className="form-field">
      <span>{label}</span>
      <input className="input" type="text" placeholder={placeholder} value={(preset[key] as string) || ''} onChange={(e) => set({ [key]: e.target.value } as Partial<PersonaPreset>)} />
    </label>
  );

  return (
    <div className="card editor">
      <h4>{preset.id ? `Edit “${preset.name}”` : 'New preset'}</h4>
      <div className="form-grid">
        <label className="form-field">
          <span>Name *</span>
          <input className="input" type="text" placeholder="e.g. QA admin, Pokhara student" value={preset.name || ''} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </label>
        <label className="form-field">
          <span>Archetype</span>
          <select className="select" value={preset.baseProfile || 'general'} onChange={(e) => set({ baseProfile: e.target.value as ProfileType })}>
            {PROFILES.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="form-field wide">
          <span>Description</span>
          <input className="input" type="text" placeholder="What this persona is for" value={preset.description || ''} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <label className="form-field">
          <span>Gender</span>
          <select className="select" value={preset.gender || 'Random'} onChange={(e) => set({ gender: e.target.value as PersonaPreset['gender'] })}>
            <option value="Random">Random</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="form-field">
          <span>Script</span>
          <select className="select" value={preset.preferredScript || 'en'} onChange={(e) => set({ preferredScript: e.target.value as FillScript })}>
            <option value="en">English</option>
            <option value="np">नेपाली (Devanagari)</option>
          </select>
        </label>
        <label className="form-field">
          <span>Province</span>
          <select className="select" value={preset.province || ''} onChange={(e) => set({ province: e.target.value, district: '', municipality: '' })}>
            <option value="">Any</option>
            {NepalDataEngine.provinces.map((pr) => (
              <option key={pr.name} value={pr.name}>{pr.name} ({pr.nepaliName})</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>District</span>
          <select className="select" value={preset.district || ''} onChange={(e) => set({ district: e.target.value, municipality: '' })}>
            <option value="">Any</option>
            {districts.map((d) => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </select>
        </label>
        {text('municipality', 'Municipality', 'e.g. Biratnagar Metropolitan City')}
        {text('designation', 'Designation', 'e.g. QA Lead')}
        {text('companyName', 'Company', 'e.g. Himalayan Test Labs')}
        {text('school', 'School / college', 'e.g. Prithvi Narayan Campus')}
        {text('faculty', 'Faculty', 'e.g. Science & Technology')}
        {text('businessName', 'Business name', 'e.g. Birat Traders')}
        {text('emailDomain', 'Email domain', 'e.g. example.test')}
        <label className="form-field">
          <span>Blood group</span>
          <select className="select" value={preset.bloodGroup || ''} onChange={(e) => set({ bloodGroup: (e.target.value || undefined) as PersonaPreset['bloodGroup'] })}>
            <option value="">Any</option>
            {BLOOD_GROUPS.map((bg) => (
              <option key={bg} value={bg}>{bg}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Bank</span>
          <select className="select" value={preset.bankName || ''} onChange={(e) => set({ bankName: e.target.value })}>
            <option value="">Any</option>
            {COMMERCIAL_BANKS.map((b) => (
              <option key={b.shortName} value={b.nameEn}>{b.nameEn}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row end">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" onClick={onSave}>Save preset</button>
      </div>
    </div>
  );
}

function PersonPreview({ person }: { person: SyntheticPerson }) {
  const rows: Array<[string, string | undefined]> = [
    ['Name', `${person.fullName} (${person.gender}, ${person.age})`],
    ['नाम', person.devanagari?.fullName],
    ['Date of birth', `${person.dateOfBirth} AD · ${person.dateOfBirthBS} BS`],
    ['Mobile', person.phone],
    ['Email', person.workEmail || person.email],
    ['Address', person.address.fullAddress],
    ['Citizenship', person.citizenshipNumber],
    ['National ID', person.nationalId],
    ['Occupation', [person.designation || person.occupation, person.companyName].filter(Boolean).join(' · ')],
    ['Student', person.studentId ? `${person.studentId} · ${person.school} (${person.faculty})` : undefined],
    ['Guardian', person.guardianName ? `${person.guardianName} · ${person.guardianPhone}` : undefined],
    ['Business', person.businessName ? `${person.businessName} (${person.businessType}) · VAT ${person.vatNumber}` : undefined],
    ['PAN', person.panNumber],
    ['Farm', person.cropType ? `${person.cropType} · ${person.cooperative}` : undefined],
    ['Bank', person.bankName ? `${person.bankName}, ${person.bankBranch} · ${person.bankAccountNumber}` : undefined],
    ['Blood group', person.bloodGroup],
  ];
  return (
    <dl className="card preview">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div className="preview-row" key={k}>
            <dt>{k}</dt>
            <dd lang={k === 'नाम' ? 'ne' : undefined}>{v}</dd>
          </div>
        ))}
    </dl>
  );
}
