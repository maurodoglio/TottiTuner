import {
  DEFAULT_MODE,
  DEFAULT_NOISE_GATE,
  DEFAULT_REACTIVITY,
  DEFAULT_REFERENCE_PITCH,
  DEFAULT_TARGET_MODE,
  STORAGE_KEYS,
  clampPercentage,
} from "./config.js";
import { DEFAULT_TUNING_IDS, normalizeCustomTuning } from "./instruments.js";

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readValue(key) {
  const storage = safeStorage();
  return storage ? storage.getItem(key) : null;
}

function writeValue(key, value) {
  const storage = safeStorage();
  if (storage) {
    storage.setItem(key, value);
  }
}

function persistCustomTuningsMap(tuningsByInstrument) {
  writeValue(STORAGE_KEYS.customTunings, JSON.stringify(tuningsByInstrument));
}

export function loadCustomTunings() {
  try {
    const rawValue = readValue(STORAGE_KEYS.customTunings);
    if (!rawValue) return {};

    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed).map(([instrumentId, tunings]) => [
        instrumentId,
        Array.isArray(tunings) ? tunings.map(normalizeCustomTuning).filter(Boolean) : [],
      ])
    );
  } catch {
    return {};
  }
}

export function saveCustomTuning(tuning) {
  const normalized = normalizeCustomTuning(tuning);
  if (!normalized) return false;

  const existing = loadCustomTunings();
  const currentList = existing[normalized.instrumentId] || [];
  const nextList = currentList.filter((item) => item.id !== normalized.id);
  nextList.push(normalized);
  existing[normalized.instrumentId] = nextList;
  persistCustomTuningsMap(existing);
  return true;
}

export function deleteCustomTuning(instrumentId, tuningId) {
  if (!instrumentId || !tuningId) return false;

  const existing = loadCustomTunings();
  const currentList = existing[instrumentId] || [];
  existing[instrumentId] = currentList.filter((item) => item.id !== tuningId);
  persistCustomTuningsMap(existing);
  return true;
}

export function getDefaultSettings(instrument = "guitar") {
  return {
    instrument,
    tuningId: DEFAULT_TUNING_IDS[instrument] || null,
    mode: DEFAULT_MODE,
    reactivity: DEFAULT_REACTIVITY,
    noiseGate: DEFAULT_NOISE_GATE,
    referencePitch: DEFAULT_REFERENCE_PITCH,
    targetMode: DEFAULT_TARGET_MODE,
    targetString: null,
    hapticEnabled: true,
    capoSemitones: 0,
    theme: null,
    onboardingDismissed: false,
  };
}

export function loadSettings() {
  const savedReferencePitch = Number(readValue(STORAGE_KEYS.referencePitch));
  const savedCapo = Number(readValue(STORAGE_KEYS.capo));

  const instrument = readValue(STORAGE_KEYS.instrument) || "guitar";
  const defaults = getDefaultSettings(instrument);

  return {
    ...defaults,
    instrument,
    tuningId: readValue(STORAGE_KEYS.tuning) || defaults.tuningId,
    mode: readValue(STORAGE_KEYS.mode) || defaults.mode,
    reactivity: clampPercentage(readValue(STORAGE_KEYS.reactivity), defaults.reactivity),
    noiseGate: clampPercentage(readValue(STORAGE_KEYS.noiseGate), defaults.noiseGate),
    referencePitch:
      Number.isFinite(savedReferencePitch) && savedReferencePitch > 0
        ? savedReferencePitch
        : defaults.referencePitch,
    targetMode: readValue(STORAGE_KEYS.targetMode) || defaults.targetMode,
    targetString: readValue(STORAGE_KEYS.targetString) || defaults.targetString,
    hapticEnabled: readValue(STORAGE_KEYS.haptic) !== "0",
    capoSemitones:
      Number.isFinite(savedCapo) && savedCapo >= 0 ? Math.max(0, Math.min(12, Math.round(savedCapo))) : defaults.capoSemitones,
    theme: readValue(STORAGE_KEYS.theme) || defaults.theme,
    onboardingDismissed: readValue(STORAGE_KEYS.onboardingDismissed) === "1",
  };
}

export function saveSetting(key, value) {
  writeValue(key, String(value));
}

const SETTINGS_KEY_MAP = {
  instrument: STORAGE_KEYS.instrument,
  tuningId: STORAGE_KEYS.tuning,
  mode: STORAGE_KEYS.mode,
  reactivity: STORAGE_KEYS.reactivity,
  noiseGate: STORAGE_KEYS.noiseGate,
  referencePitch: STORAGE_KEYS.referencePitch,
  targetMode: STORAGE_KEYS.targetMode,
  targetString: STORAGE_KEYS.targetString,
  hapticEnabled: STORAGE_KEYS.haptic,
  capoSemitones: STORAGE_KEYS.capo,
  theme: STORAGE_KEYS.theme,
  onboardingDismissed: STORAGE_KEYS.onboardingDismissed,
};

export function saveSettings(settings) {
  Object.entries(settings).forEach(([key, value]) => {
    const storageKey = SETTINGS_KEY_MAP[key];
    if (!storageKey) {
      return;
    }

    if (storageKey === STORAGE_KEYS.haptic) {
      saveSetting(storageKey, value ? "1" : "0");
      return;
    }

    if (storageKey === STORAGE_KEYS.onboardingDismissed) {
      saveSetting(storageKey, value ? "1" : "0");
      return;
    }

    if (value == null) {
      saveSetting(storageKey, "");
      return;
    }

    saveSetting(storageKey, value);
  });
}
