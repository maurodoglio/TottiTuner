export const DEFAULT_NOISE_GATE = 50;
export const DEFAULT_REACTIVITY = 60;
export const DEFAULT_MODE = "balanced";
export const DEFAULT_REFERENCE_PITCH = 440;
export const DEFAULT_MIN_CLARITY = 0.82;
export const DEFAULT_TARGET_MODE = "auto";

export const BUFFER_SIZE = 2048;
export const PITCH_HOLD_MS = 280;
export const MAX_SAMPLE_INTERVAL_MS = 130;
export const MIN_SAMPLE_INTERVAL_MS = 25;
export const MIN_RMS_THRESHOLD = 0.004;
export const MAX_RMS_THRESHOLD = 0.03;
export const MIN_SMOOTHING_ALPHA = 0.14;
export const MAX_SMOOTHING_ALPHA = 0.72;
export const MAX_NEEDLE_TRANSITION_MS = 300;
export const MIN_NEEDLE_TRANSITION_MS = 70;
export const NOTE_LOCK_CENTS = 18;
export const NOTE_RELEASE_CENTS = 28;
export const RETARGET_BIAS_CENTS = 10;
export const LOW_REGISTER_MAX_FREQUENCY = 120;
export const LOW_REGISTER_CLARITY_FLOOR = 0.32;
export const LOW_REGISTER_HARMONIC_WEIGHT = 0.55;
export const IN_TUNE_CENTS = 5;
export const SLIGHTLY_OFF_CENTS = 15;

export const PREVIEW_PEAK_GAIN = 0.14;
export const PREVIEW_MIN_GAIN = 0.0001;
export const PREVIEW_ATTACK_TIME = 0.02;
export const PREVIEW_SUSTAIN_TIME = 1.0;
export const PREVIEW_RELEASE_TIME = 0.4;
export const PREVIEW_STOP_FADE_TIME = 0.02;

export const MODE_PRESETS = {
  performance: { reactivity: 85, noiseGate: 35, minClarity: 0.72 },
  balanced: {
    reactivity: DEFAULT_REACTIVITY,
    noiseGate: DEFAULT_NOISE_GATE,
    minClarity: DEFAULT_MIN_CLARITY,
  },
  precision: { reactivity: 35, noiseGate: 70, minClarity: 0.9 },
};

export const STORAGE_KEYS = {
  instrument: "tottiTuner_instrument",
  tuning: "tottiTuner_tuning",
  mode: "tottiTuner_mode",
  reactivity: "tottiTuner_reactivity",
  noiseGate: "tottiTuner_noiseGate",
  referencePitch: "tottiTuner_referencePitch",
  targetMode: "tottiTuner_targetMode",
  targetString: "tottiTuner_targetString",
  haptic: "tottiTuner_haptic",
  capo: "tottiTuner_capo",
  theme: "tottiTuner_theme",
  onboardingDismissed: "tottiTuner_onboardingDismissed",
  customTunings: "tottiTuner_customTunings",
};

export function mapRange(value, inMin, inMax, outMin, outMax) {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function clampPercentage(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, parsed));
}

export function getSampleIntervalMs(reactivity) {
  return Math.round(mapRange(reactivity, 1, 100, MAX_SAMPLE_INTERVAL_MS, MIN_SAMPLE_INTERVAL_MS));
}

export function getRmsThreshold(noiseGate) {
  return mapRange(noiseGate, 1, 100, MIN_RMS_THRESHOLD, MAX_RMS_THRESHOLD);
}

export function getSmoothingAlpha(reactivity) {
  return mapRange(reactivity, 1, 100, MIN_SMOOTHING_ALPHA, MAX_SMOOTHING_ALPHA);
}

export function getNeedleTransitionMs(reactivity) {
  return Math.round(
    mapRange(reactivity, 1, 100, MAX_NEEDLE_TRANSITION_MS, MIN_NEEDLE_TRANSITION_MS)
  );
}
