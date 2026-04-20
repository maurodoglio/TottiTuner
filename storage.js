import {
  DEFAULT_MODE,
  DEFAULT_NOISE_GATE,
  DEFAULT_REACTIVITY,
  DEFAULT_REFERENCE_PITCH,
  DEFAULT_TARGET_MODE,
  STORAGE_KEYS,
  clampPercentage,
} from "./config.js";

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

export function loadSettings() {
  const savedReferencePitch = Number(readValue(STORAGE_KEYS.referencePitch));
  const savedCapo = Number(readValue(STORAGE_KEYS.capo));

  return {
    instrument: readValue(STORAGE_KEYS.instrument) || "guitar",
    mode: readValue(STORAGE_KEYS.mode) || DEFAULT_MODE,
    reactivity: clampPercentage(readValue(STORAGE_KEYS.reactivity), DEFAULT_REACTIVITY),
    noiseGate: clampPercentage(readValue(STORAGE_KEYS.noiseGate), DEFAULT_NOISE_GATE),
    referencePitch:
      Number.isFinite(savedReferencePitch) && savedReferencePitch > 0
        ? savedReferencePitch
        : DEFAULT_REFERENCE_PITCH,
    targetMode: readValue(STORAGE_KEYS.targetMode) || DEFAULT_TARGET_MODE,
    targetString: readValue(STORAGE_KEYS.targetString) || null,
    hapticEnabled: readValue(STORAGE_KEYS.haptic) !== "0",
    capoSemitones:
      Number.isFinite(savedCapo) && savedCapo >= 0 ? Math.max(0, Math.min(12, Math.round(savedCapo))) : 0,
    theme: readValue(STORAGE_KEYS.theme) || null,
  };
}

export function saveSetting(key, value) {
  writeValue(key, String(value));
}

export function saveSettings(settings) {
  Object.entries(settings).forEach(([key, value]) => {
    if (key in STORAGE_KEYS && value != null) {
      saveSetting(STORAGE_KEYS[key], value);
    }
  });
}
