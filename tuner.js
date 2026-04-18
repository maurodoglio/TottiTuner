import {
  INSTRUMENTS,
  noteFromFrequency,
  centsOffFromPitch,
  noteName,
} from "./instruments.js";
import { autoCorrelate, getAudioMediaStream } from "./audio.js";

// --- Constants ---
const BUFFER_SIZE = 2048;
const PREVIEW_PEAK_GAIN = 0.14;
// Must be greater than 0 for exponential ramps.
const PREVIEW_MIN_GAIN = 0.0001;
const PREVIEW_ATTACK_TIME = 0.02;
// Short fade when interrupting a preview mid-playback, to avoid clicks.
const PREVIEW_STOP_FADE_TIME = 0.02;
const DEFAULT_NOISE_GATE = 50;
const DEFAULT_REACTIVITY = 60;
const DEFAULT_MODE = "balanced";
const DEFAULT_REFERENCE_PITCH = 440;
const PITCH_HOLD_MS = 280;
// String auto-lock: must see a different string be the closest for this long
// before switching the highlight. Prevents flicker between adjacent strings.
const STRING_LOCK_MS = 500;
// If detected pitch is farther than this from every string, fall back to
// closest-semitone display (user is probably playing something else).
const STRING_FALLBACK_CENTS = 700;
const MAX_SAMPLE_INTERVAL_MS = 130;
const MIN_SAMPLE_INTERVAL_MS = 25;
const MIN_RMS_THRESHOLD = 0.004;
const MAX_RMS_THRESHOLD = 0.03;
const MIN_SMOOTHING_ALPHA = 0.14;
const MAX_SMOOTHING_ALPHA = 0.72;
const MAX_NEEDLE_TRANSITION_MS = 300;
const MIN_NEEDLE_TRANSITION_MS = 70;
const MODE_PRESETS = {
  performance: { reactivity: 85, noiseGate: 35 },
  balanced: { reactivity: DEFAULT_REACTIVITY, noiseGate: DEFAULT_NOISE_GATE },
  precision: { reactivity: 35, noiseGate: 70 },
};
const STORAGE_KEYS = {
  instrument: "tottiTuner_instrument",
  mode: "tottiTuner_mode",
  reactivity: "tottiTuner_reactivity",
  noiseGate: "tottiTuner_noiseGate",
  referencePitch: "tottiTuner_referencePitch",
  haptic: "tottiTuner_haptic",
  capo: "tottiTuner_capo",
  theme: "tottiTuner_theme",
  customTunings: "tottiTuner_customTunings",
};

const CUSTOM_KEY_PREFIX = "custom:";

// --- Audio state ---
let audioContext = null;
let analyser = null;
let mediaStream = null;
let animFrame = null;
let isRunning = false;
let previewAudioContext = null;
let activePreview = null; // { oscillator, gainNode }
let smoothedFrequency = null;
let lastAnalysisTime = 0;
let lastStablePitchTime = 0;
// Auto-string-lock state
let lockedStringIdx = null;
let candidateStringIdx = null;
let candidateSinceMs = 0;
// Pulse the meter briefly when transitioning into the in-tune zone.
const IN_TUNE_PULSE_MS = 350;
let wasInTune = false;
let hapticEnabled = true;
// Throttle screen-reader announcements so the live region isn't spammed.
const ARIA_ANNOUNCE_MIN_MS = 1500;
let lastAriaAnnounceMs = 0;
let lastAriaAnnouncedNote = "";

// Tuning history strip chart (ring buffer of {cents, valid}).
const HISTORY_LEN = 140;
const historyBuffer = new Array(HISTORY_LEN).fill(null);
let historyHead = 0; // index where next sample will be written

// --- UI state ---
let currentInstrument = localStorage.getItem(STORAGE_KEYS.instrument) || "guitar";
let mode = DEFAULT_MODE;
let noiseGate = DEFAULT_NOISE_GATE;
let reactivity = DEFAULT_REACTIVITY;
let referencePitch = DEFAULT_REFERENCE_PITCH;
let capoSemitones = 0;

// --- DOM refs ---
const startBtn = document.getElementById("start-btn");
const instrumentSelect = document.getElementById("instrument-select");
const noteDisplay = document.getElementById("note-display");
const freqDisplay = document.getElementById("freq-display");
const centsDisplay = document.getElementById("cents-display");
const needle = document.getElementById("needle");
const tunerStatus = document.getElementById("tuner-status");
const stringsList = document.getElementById("strings-list");
const tunerMeter = document.getElementById("tuner-meter");
const modeSelect = document.getElementById("mode-select");
const noiseGateSlider = document.getElementById("noise-gate-slider");
const noiseGateValue = document.getElementById("noise-gate-value");
const reactivitySlider = document.getElementById("reactivity-slider");
const reactivityValue = document.getElementById("reactivity-value");
const refPitchSelect = document.getElementById("ref-pitch-select");
const tunerErrorHelp = document.getElementById("tuner-error-help");
const tunerHint = document.getElementById("tuner-hint");
const hapticToggle = document.getElementById("haptic-toggle");
const tunerAnnouncer = document.getElementById("tuner-announcer");
const historyCanvas = document.getElementById("history-canvas");
const historyCtx = historyCanvas ? historyCanvas.getContext("2d") : null;
const capoSelect = document.getElementById("capo-select");
const themeToggleBtn = document.getElementById("theme-toggle");
const manageTuningsBtn = document.getElementById("manage-tunings-btn");
const tuningsDialog = document.getElementById("tunings-dialog");
const tuningsList = document.getElementById("tunings-list");
const newTuningName = document.getElementById("new-tuning-name");
const newTuningBase = document.getElementById("new-tuning-base");
const newTuningStrings = document.getElementById("new-tuning-strings");
const newTuningError = document.getElementById("new-tuning-error");
const addTuningBtn = document.getElementById("add-tuning-btn");

// Instrument selector is populated dynamically in init() via renderInstrumentSelect(),
// which merges built-in INSTRUMENTS with any saved custom tunings.

// --- Custom tunings ---
let customTunings = {}; // { id: { label, baseInstrument, strings: [{note,freq}] } }

function loadCustomTunings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.customTunings);
    customTunings = raw ? (JSON.parse(raw) || {}) : {};
  } catch (_) {
    customTunings = {};
  }
}

function saveCustomTunings() {
  localStorage.setItem(STORAGE_KEYS.customTunings, JSON.stringify(customTunings));
}

// Returns the tuning definition for a key, looking up built-in instruments and
// custom tunings (prefixed with "custom:"). Always has { label, harmonics, strings }.
function getInstrumentDef(key) {
  if (key && key.startsWith(CUSTOM_KEY_PREFIX)) {
    const id = key.slice(CUSTOM_KEY_PREFIX.length);
    const t = customTunings[id];
    if (!t) return null;
    const base = INSTRUMENTS[t.baseInstrument] || INSTRUMENTS.guitar;
    return { label: t.label, harmonics: base.harmonics, strings: t.strings };
  }
  return INSTRUMENTS[key] || null;
}

function currentDef() {
  return getInstrumentDef(currentInstrument) || INSTRUMENTS.guitar;
}

function renderInstrumentSelect() {
  const previous = currentInstrument;
  instrumentSelect.innerHTML = "";

  const builtinGroup = document.createElement("optgroup");
  builtinGroup.label = "Built-in";
  Object.entries(INSTRUMENTS).forEach(([key, inst]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = inst.label;
    builtinGroup.appendChild(opt);
  });
  instrumentSelect.appendChild(builtinGroup);

  const customIds = Object.keys(customTunings);
  if (customIds.length) {
    const customGroup = document.createElement("optgroup");
    customGroup.label = "Custom";
    customIds.forEach((id) => {
      const opt = document.createElement("option");
      opt.value = CUSTOM_KEY_PREFIX + id;
      opt.textContent = "★ " + customTunings[id].label;
      customGroup.appendChild(opt);
    });
    instrumentSelect.appendChild(customGroup);
  }

  // Restore selection (or fall back to guitar if previous tuning no longer exists).
  if (getInstrumentDef(previous)) {
    instrumentSelect.value = previous;
  } else {
    currentInstrument = "guitar";
    instrumentSelect.value = "guitar";
    localStorage.setItem(STORAGE_KEYS.instrument, currentInstrument);
  }
}

// INSTRUMENTS frequencies are defined at A4=440. Scale proportionally for other reference pitches.
// Also apply the capo (transposes every string up by N semitones).
function scaledFreq(baseFreq) {
  const capoFactor = Math.pow(2, capoSemitones / 12);
  return baseFreq * (referencePitch / 440) * capoFactor;
}

function updateStringsList() {
  stringsList.innerHTML = "";
  currentDef().strings.forEach(({ note, freq }) => {
    const adjustedFreq = scaledFreq(freq);
    const midi = noteFromFrequency(adjustedFreq, referencePitch);
    // When a capo is applied, the sounding note differs from the open-string label.
    const displayNote = capoSemitones > 0 ? noteName(midi) : note;
    const li = document.createElement("li");
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", `Toggle reference tone for ${displayNote} (${adjustedFreq.toFixed(2)} Hz)`);
    li.classList.add("note-button");
    // Store MIDI note number for active-string highlighting comparison
    li.dataset.midi = String(midi);
    li.dataset.noteLabel = displayNote;
    li.innerHTML = `<span class="string-note">${displayNote}</span><span class="string-freq">${adjustedFreq.toFixed(2)} Hz</span>`;
    li.addEventListener("click", () => togglePreview(adjustedFreq, li));
    li.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      togglePreview(adjustedFreq, li);
    });
    stringsList.appendChild(li);
  });
}

instrumentSelect.addEventListener("change", () => {
  currentInstrument = instrumentSelect.value;
  localStorage.setItem(STORAGE_KEYS.instrument, currentInstrument);
  stopActivePreview();
  resetStringLock();
  updateStringsList();
  resetDisplay();
});

function mapRange(value, inMin, inMax, outMin, outMax) {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function getSampleIntervalMs() {
  return Math.round(mapRange(reactivity, 1, 100, MAX_SAMPLE_INTERVAL_MS, MIN_SAMPLE_INTERVAL_MS));
}

function getRmsThreshold() {
  return mapRange(noiseGate, 1, 100, MIN_RMS_THRESHOLD, MAX_RMS_THRESHOLD);
}

function getSmoothingAlpha() {
  return mapRange(reactivity, 1, 100, MIN_SMOOTHING_ALPHA, MAX_SMOOTHING_ALPHA);
}

function applyNeedleSpeed() {
  const transitionMs = Math.round(
    mapRange(reactivity, 1, 100, MAX_NEEDLE_TRANSITION_MS, MIN_NEEDLE_TRANSITION_MS)
  );
  document.documentElement.style.setProperty("--needle-transition-duration", `${transitionMs}ms`);
}

function applyReactivity(value) {
  const parsed = Number(value);
  reactivity = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : DEFAULT_REACTIVITY;
  reactivitySlider.value = String(reactivity);
  reactivityValue.textContent = `${reactivity}%`;
  applyNeedleSpeed();
}

function applyNoiseGate(value) {
  const parsed = Number(value);
  noiseGate = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : DEFAULT_NOISE_GATE;
  noiseGateSlider.value = String(noiseGate);
  noiseGateValue.textContent = `${noiseGate}%`;
}

function applyMode(value) {
  if (value === "custom") {
    mode = "custom";
    modeSelect.value = "custom";
    return;
  }
  const preset = MODE_PRESETS[value] || MODE_PRESETS[DEFAULT_MODE];
  mode = MODE_PRESETS[value] ? value : DEFAULT_MODE;
  modeSelect.value = mode;
  applyReactivity(preset.reactivity);
  applyNoiseGate(preset.noiseGate);
}

function applyReferencePitch(value) {
  const parsed = Number(value);
  referencePitch = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REFERENCE_PITCH;
  const available = Array.from(refPitchSelect.options).map(o => Number(o.value));
  refPitchSelect.value = available.includes(referencePitch)
    ? String(referencePitch)
    : String(DEFAULT_REFERENCE_PITCH);
}

function applyCapo(value) {
  const parsed = Number(value);
  capoSemitones = Number.isFinite(parsed) ? Math.max(0, Math.min(12, Math.round(parsed))) : 0;
  if (capoSelect) capoSelect.value = String(capoSemitones);
}

function clearActiveStrings() {
  stringsList.querySelectorAll(".note-button.active").forEach(el => el.classList.remove("active"));
}

function resetDisplay() {
  noteDisplay.textContent = "--";
  freqDisplay.textContent = "-- Hz";
  centsDisplay.textContent = "0¢";
  setNeedle(0);
  clearActiveStrings();
  clearHistory();
  tunerStatus.textContent = "Waiting for sound...";
  tunerStatus.className = "tuner-status";
  tunerMeter.className = "tuner-meter";
  wasInTune = false;
  lastAriaAnnouncedNote = "";
}

function setNeedle(cents) {
  // cents: -50 to +50; map to -85deg to +85deg rotation
  const clamped = Math.max(-50, Math.min(50, cents));
  const deg = (clamped / 50) * 85;
  needle.style.transform = `rotate(${deg}deg)`;
}

function pushHistorySample(cents) {
  historyBuffer[historyHead] = { cents };
  historyHead = (historyHead + 1) % HISTORY_LEN;
}

function clearHistory() {
  for (let i = 0; i < HISTORY_LEN; i++) historyBuffer[i] = null;
  historyHead = 0;
  drawHistory();
}

function colorForCents(absCents) {
  if (absCents <= 5) return "#00d4a0"; // green
  if (absCents <= 15) return "#f5a623"; // yellow
  return "#e94560"; // red
}

function drawHistory() {
  if (!historyCtx) return;
  // Match canvas pixel size to its CSS size for crisp rendering.
  const cssW = historyCanvas.clientWidth || historyCanvas.width;
  const cssH = historyCanvas.clientHeight || historyCanvas.height;
  const dpr = window.devicePixelRatio || 1;
  const targetW = Math.round(cssW * dpr);
  const targetH = Math.round(cssH * dpr);
  if (historyCanvas.width !== targetW) historyCanvas.width = targetW;
  if (historyCanvas.height !== targetH) historyCanvas.height = targetH;

  const w = historyCanvas.width;
  const h = historyCanvas.height;
  historyCtx.clearRect(0, 0, w, h);

  // Center line
  historyCtx.strokeStyle = "rgba(0, 212, 160, 0.45)";
  historyCtx.lineWidth = Math.max(1, dpr);
  historyCtx.beginPath();
  historyCtx.moveTo(0, h / 2);
  historyCtx.lineTo(w, h / 2);
  historyCtx.stroke();

  // ±15¢ guide band
  const bandRange = 15;
  const halfBand = (bandRange / 50) * (h / 2);
  historyCtx.fillStyle = "rgba(245, 166, 35, 0.08)";
  historyCtx.fillRect(0, h / 2 - halfBand, w, halfBand * 2);
  // ±5¢ in-tune band
  const goodBand = (5 / 50) * (h / 2);
  historyCtx.fillStyle = "rgba(0, 212, 160, 0.12)";
  historyCtx.fillRect(0, h / 2 - goodBand, w, goodBand * 2);

  // Sample dots, oldest on the left, newest on the right.
  const dotR = Math.max(1.2, 1.6 * dpr);
  for (let i = 0; i < HISTORY_LEN; i++) {
    const sample = historyBuffer[(historyHead + i) % HISTORY_LEN];
    if (!sample) continue;
    const clamped = Math.max(-50, Math.min(50, sample.cents));
    const x = (i / (HISTORY_LEN - 1)) * w;
    const y = h / 2 - (clamped / 50) * (h / 2 - dotR);
    historyCtx.fillStyle = colorForCents(Math.abs(sample.cents));
    historyCtx.beginPath();
    historyCtx.arc(x, y, dotR, 0, Math.PI * 2);
    historyCtx.fill();
  }
}

function resetStringLock() {
  lockedStringIdx = null;
  candidateStringIdx = null;
  candidateSinceMs = 0;
}

// Returns the index of the auto-locked string, or null if no string is close enough.
function pickLockedStringIdx(frequency, timestamp) {
  const strings = currentDef().strings;
  let bestIdx = 0;
  let bestAbs = Infinity;
  for (let i = 0; i < strings.length; i++) {
    const targetFreq = scaledFreq(strings[i].freq);
    const cents = Math.abs(1200 * Math.log2(frequency / targetFreq));
    if (cents < bestAbs) {
      bestAbs = cents;
      bestIdx = i;
    }
  }
  if (bestAbs > STRING_FALLBACK_CENTS) return null;

  if (lockedStringIdx === null) {
    lockedStringIdx = bestIdx;
    candidateStringIdx = bestIdx;
    candidateSinceMs = timestamp;
  } else if (bestIdx === lockedStringIdx) {
    candidateStringIdx = bestIdx;
    candidateSinceMs = timestamp;
  } else if (candidateStringIdx !== bestIdx) {
    candidateStringIdx = bestIdx;
    candidateSinceMs = timestamp;
  } else if (timestamp - candidateSinceMs >= STRING_LOCK_MS) {
    lockedStringIdx = bestIdx;
  }
  return lockedStringIdx;
}

function highlightActiveStringByIdx(idx) {
  const targetMidi = idx == null ? null : stringsList.children[idx]?.dataset.midi;
  stringsList.querySelectorAll(".note-button").forEach((li, i) => {
    li.classList.toggle("active", targetMidi != null && i === idx);
  });
}

function updateTunerUI(frequency, timestamp) {
  const lockedIdx = pickLockedStringIdx(frequency, timestamp);
  let displayName;
  let displayCents;

  if (lockedIdx !== null) {
    const target = currentDef().strings[lockedIdx];
    const targetFreq = scaledFreq(target.freq);
    const rawCents = 1200 * Math.log2(frequency / targetFreq);
    // Clamp displayed cents so wildly out-of-tune readings don't show 1500¢.
    displayCents = Math.max(-99, Math.min(99, Math.round(rawCents)));
    // Read the capo-aware label from the rendered string button if available,
    // falling back to the static note label.
    const li = stringsList.children[lockedIdx];
    displayName = (li && li.dataset && li.dataset.noteLabel) || target.note;
  } else {
    // Fallback: show closest semitone (original behavior).
    const noteNum = noteFromFrequency(frequency, referencePitch);
    displayCents = centsOffFromPitch(frequency, noteNum, referencePitch);
    displayName = noteName(noteNum);
  }

  noteDisplay.textContent = displayName;
  freqDisplay.textContent = `${frequency.toFixed(1)} Hz`;
  centsDisplay.textContent = `${displayCents >= 0 ? "+" : ""}${displayCents}¢`;

  setNeedle(displayCents);
  highlightActiveStringByIdx(lockedIdx);
  pushHistorySample(displayCents);
  drawHistory();

  const absCents = Math.abs(displayCents);
  const inTune = absCents <= 5;
  if (inTune) {
    tunerStatus.textContent = "In Tune ✓";
    tunerStatus.className = "tuner-status in-tune";
    tunerMeter.className = "tuner-meter in-tune";
  } else if (absCents <= 15) {
    tunerStatus.textContent = displayCents < 0 ? "Slightly Flat ↓" : "Slightly Sharp ↑";
    tunerStatus.className = "tuner-status slightly-off";
    tunerMeter.className = "tuner-meter slightly-off";
  } else {
    tunerStatus.textContent = displayCents < 0 ? "Flat ↓" : "Sharp ↑";
    tunerStatus.className = "tuner-status out-of-tune";
    tunerMeter.className = "tuner-meter out-of-tune";
  }

  // Positive feedback on transition into the in-tune zone.
  if (inTune && !wasInTune) {
    tunerMeter.classList.add("pulse");
    setTimeout(() => tunerMeter.classList.remove("pulse"), IN_TUNE_PULSE_MS);
    if (hapticEnabled && typeof navigator.vibrate === "function") {
      try { navigator.vibrate(30); } catch (_) { /* ignore */ }
    }
  }
  wasInTune = inTune;

  // Throttled screen-reader announcement.
  if (tunerAnnouncer) {
    const summary = inTune
      ? `${displayName} in tune`
      : `${displayName}, ${Math.abs(displayCents)} cents ${displayCents < 0 ? "flat" : "sharp"}`;
    if (
      summary !== lastAriaAnnouncedNote &&
      timestamp - lastAriaAnnounceMs >= ARIA_ANNOUNCE_MIN_MS
    ) {
      tunerAnnouncer.textContent = summary;
      lastAriaAnnouncedNote = summary;
      lastAriaAnnounceMs = timestamp;
    }
  }
}

function processAudio(timestamp) {
  if (timestamp == null) timestamp = performance.now();
  if (timestamp - lastAnalysisTime < getSampleIntervalMs()) {
    animFrame = requestAnimationFrame(processAudio);
    return;
  }
  lastAnalysisTime = timestamp;

  const buf = new Float32Array(BUFFER_SIZE);
  analyser.getFloatTimeDomainData(buf);
  const frequency = autoCorrelate(buf, audioContext.sampleRate, getRmsThreshold());

  if (frequency !== -1 && frequency > 20 && frequency < 5000) {
    if (smoothedFrequency === null) {
      smoothedFrequency = frequency;
    } else {
      smoothedFrequency += (frequency - smoothedFrequency) * getSmoothingAlpha();
    }
    lastStablePitchTime = timestamp;
    updateTunerUI(smoothedFrequency, timestamp);
  } else if (timestamp - lastStablePitchTime > PITCH_HOLD_MS) {
    smoothedFrequency = null;
    resetStringLock();
    resetDisplay();
  }

  animFrame = requestAnimationFrame(processAudio);
}

function getPreviewAudioContext() {
  if (!previewAudioContext || previewAudioContext.state === "closed") {
    previewAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return previewAudioContext;
}

function stopActivePreview() {
  if (!activePreview) return;
  const { oscillator, gainNode, element } = activePreview;
  const now = previewAudioContext.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(0, now + PREVIEW_STOP_FADE_TIME);
  try { oscillator.stop(now + PREVIEW_STOP_FADE_TIME); } catch (_) {}
  if (element) element.classList.remove("playing");
  activePreview = null;
}

// Click-to-toggle a sustained reference tone. Clicking the playing string stops
// it; clicking another string switches to it.
function togglePreview(freq, element) {
  if (activePreview && activePreview.element === element) {
    stopActivePreview();
    return;
  }
  playNotePreview(freq, element);
}

function playNotePreview(freq, element) {
  const context = getPreviewAudioContext();
  if (context.state === "suspended") context.resume();

  stopActivePreview();

  const { harmonics } = currentDef();
  const real = new Float32Array(harmonics);
  const imag = new Float32Array(harmonics.length);
  const wave = context.createPeriodicWave(real, imag);

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const now = context.currentTime;

  oscillator.setPeriodicWave(wave);
  oscillator.frequency.setValueAtTime(freq, now);

  // Sustained tone with a soft attack; held until the user clicks to stop.
  gainNode.gain.setValueAtTime(PREVIEW_MIN_GAIN, now);
  gainNode.gain.exponentialRampToValueAtTime(PREVIEW_PEAK_GAIN, now + PREVIEW_ATTACK_TIME);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(now);

  if (element) element.classList.add("playing");
  activePreview = { oscillator, gainNode, element };
  oscillator.onended = () => {
    if (activePreview && activePreview.oscillator === oscillator) {
      if (activePreview.element) activePreview.element.classList.remove("playing");
      activePreview = null;
    }
  };
}

async function startTuner() {
  if (isRunning) {
    stopTuner();
    return;
  }

  try {
    mediaStream = await getAudioMediaStream();
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(mediaStream);

    analyser = audioContext.createAnalyser();
    analyser.fftSize = BUFFER_SIZE;
    source.connect(analyser);

    smoothedFrequency = null;
    lastAnalysisTime = performance.now() - getSampleIntervalMs();
    lastStablePitchTime = performance.now();
    resetStringLock();
    isRunning = true;
    startBtn.textContent = "Stop Tuner";
    startBtn.classList.add("active");
    startBtn.setAttribute("aria-pressed", "true");
    tunerStatus.textContent = "Listening...";
    tunerStatus.className = "tuner-status";
    if (tunerErrorHelp) {
      tunerErrorHelp.hidden = true;
      tunerErrorHelp.textContent = "";
    }
    if (tunerHint) tunerHint.hidden = true;
    processAudio();
  } catch (err) {
    let helpText = "";
    if (err.name === "InsecureContextError") {
      tunerStatus.textContent = "Use HTTPS (or localhost) to enable microphone";
      helpText = "Browsers only allow microphone access on secure (HTTPS) pages or on localhost. Try opening this page over HTTPS.";
    } else if (err.name === "NotSupportedError") {
      tunerStatus.textContent = "Microphone is not supported in this browser";
      helpText = "Try a recent version of Chrome, Firefox, Edge, or Safari.";
    } else if (err.name === "NotFoundError") {
      tunerStatus.textContent = "No microphone device found";
      helpText = "Plug in or enable a microphone, then press Start again.";
    } else if (err.name === "NotAllowedError" || err.name === "SecurityError") {
      tunerStatus.textContent = "Microphone access denied";
      helpText = "To re-enable: click the lock/permissions icon in your browser's address bar, allow microphone access for this site, then reload the page.";
    } else {
      tunerStatus.textContent = "Microphone access denied";
      helpText = "Check your browser's microphone permissions for this site, then try again.";
    }
    tunerStatus.className = "tuner-status out-of-tune";
    if (tunerErrorHelp) {
      tunerErrorHelp.textContent = helpText;
      tunerErrorHelp.hidden = !helpText;
    }
    if (tunerHint) tunerHint.hidden = true;
    console.error(err);
  }
}

function stopTuner() {
  if (animFrame) cancelAnimationFrame(animFrame);
  if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
  if (audioContext) audioContext.close().catch(() => {});
  stopActivePreview();
  if (previewAudioContext && previewAudioContext.state !== "closed") {
    previewAudioContext.close().catch(() => {});
  }
  animFrame = null;
  analyser = null;
  mediaStream = null;
  audioContext = null;
  smoothedFrequency = null;
  lastAnalysisTime = 0;
  lastStablePitchTime = 0;
  resetStringLock();
  previewAudioContext = null;
  isRunning = false;
  startBtn.textContent = "Start Tuner";
  startBtn.classList.remove("active");
  startBtn.setAttribute("aria-pressed", "false");
  resetDisplay();
}

// --- Event listeners ---
startBtn.addEventListener("click", startTuner);

modeSelect.addEventListener("change", (event) => {
  applyMode(event.target.value);
  localStorage.setItem(STORAGE_KEYS.mode, mode);
  if (mode !== "custom") {
    localStorage.setItem(STORAGE_KEYS.reactivity, String(reactivity));
    localStorage.setItem(STORAGE_KEYS.noiseGate, String(noiseGate));
  }
});

noiseGateSlider.addEventListener("input", (event) => {
  applyNoiseGate(event.target.value);
  applyMode("custom");
  localStorage.setItem(STORAGE_KEYS.noiseGate, String(noiseGate));
  localStorage.setItem(STORAGE_KEYS.mode, "custom");
});

reactivitySlider.addEventListener("input", (event) => {
  applyReactivity(event.target.value);
  applyMode("custom");
  localStorage.setItem(STORAGE_KEYS.reactivity, String(reactivity));
  localStorage.setItem(STORAGE_KEYS.mode, "custom");
});

refPitchSelect.addEventListener("change", (event) => {
  referencePitch = Number(event.target.value);
  localStorage.setItem(STORAGE_KEYS.referencePitch, String(referencePitch));
  stopActivePreview();
  updateStringsList();
  if (isRunning) resetDisplay();
});

if (hapticToggle) {
  hapticToggle.addEventListener("change", (event) => {
    hapticEnabled = !!event.target.checked;
    localStorage.setItem(STORAGE_KEYS.haptic, hapticEnabled ? "1" : "0");
  });
}

if (capoSelect) {
  capoSelect.addEventListener("change", (event) => {
    applyCapo(event.target.value);
    localStorage.setItem(STORAGE_KEYS.capo, String(capoSemitones));
    stopActivePreview();
    resetStringLock();
    updateStringsList();
    if (isRunning) resetDisplay();
  });
}

function applyTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  if (next === "dark") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", "light");
  }
  if (themeToggleBtn) {
    themeToggleBtn.textContent = next === "light" ? "☀️" : "🌙";
    themeToggleBtn.setAttribute("aria-label",
      next === "light" ? "Switch to dark theme" : "Switch to light theme");
  }
  // Redraw history so any theme-dependent rendering refreshes.
  drawHistory();
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const next = isLight ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem(STORAGE_KEYS.theme, next);
  });
}

// --- Custom tunings dialog ---
function renderTuningsList() {
  if (!tuningsList) return;
  tuningsList.innerHTML = "";
  Object.entries(customTunings).forEach(([id, t]) => {
    const row = document.createElement("div");
    row.className = "tuning-row";
    const meta = t.strings.map(s => `${s.note}:${s.freq}`).join(", ");
    const info = document.createElement("div");
    info.className = "tuning-info";
    const nameEl = document.createElement("div");
    nameEl.className = "tuning-name";
    nameEl.textContent = t.label;
    const metaEl = document.createElement("div");
    metaEl.className = "tuning-meta";
    metaEl.title = meta;
    metaEl.textContent = meta;
    info.appendChild(nameEl);
    info.appendChild(metaEl);
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      delete customTunings[id];
      saveCustomTunings();
      renderTuningsList();
      renderInstrumentSelect();
      // If we just deleted the currently-selected one, switch to guitar.
      if (currentInstrument === CUSTOM_KEY_PREFIX + id) {
        currentInstrument = "guitar";
        instrumentSelect.value = "guitar";
        localStorage.setItem(STORAGE_KEYS.instrument, currentInstrument);
        stopActivePreview();
        resetStringLock();
        updateStringsList();
        resetDisplay();
      }
    });
    row.appendChild(info);
    row.appendChild(del);
    tuningsList.appendChild(row);
  });
}

function populateNewTuningBaseSelect() {
  if (!newTuningBase) return;
  newTuningBase.innerHTML = "";
  Object.entries(INSTRUMENTS).forEach(([key, inst]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = inst.label;
    newTuningBase.appendChild(opt);
  });
}

function parseTuningStrings(text) {
  const parts = text.split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error("Add at least one string.");
  if (parts.length > 12) throw new Error("Too many strings (max 12).");
  return parts.map((p, i) => {
    const m = p.match(/^([A-Ga-g][#b]?-?\d):\s*([0-9]+(?:\.[0-9]+)?)$/);
    if (!m) throw new Error(`String ${i + 1} ("${p}") must look like NOTE:HZ, e.g. "E2:82.41".`);
    const freq = Number(m[2]);
    if (!Number.isFinite(freq) || freq < 16 || freq > 5000) {
      throw new Error(`String ${i + 1}: frequency must be between 16 and 5000 Hz.`);
    }
    return { note: m[1].toUpperCase(), freq };
  });
}

function openTuningsDialog() {
  if (!tuningsDialog) return;
  populateNewTuningBaseSelect();
  renderTuningsList();
  if (newTuningName) newTuningName.value = "";
  if (newTuningStrings) newTuningStrings.value = "";
  if (newTuningError) {
    newTuningError.textContent = "";
    newTuningError.hidden = true;
  }
  if (typeof tuningsDialog.showModal === "function") {
    tuningsDialog.showModal();
  } else {
    tuningsDialog.setAttribute("open", "");
  }
}

if (manageTuningsBtn) {
  manageTuningsBtn.addEventListener("click", openTuningsDialog);
}

if (addTuningBtn) {
  addTuningBtn.addEventListener("click", () => {
    if (!newTuningName || !newTuningStrings || !newTuningBase) return;
    const name = newTuningName.value.trim();
    const base = newTuningBase.value;
    if (!name) {
      showTuningError("Please enter a name.");
      return;
    }
    if (!INSTRUMENTS[base]) {
      showTuningError("Pick a base instrument.");
      return;
    }
    let strings;
    try {
      strings = parseTuningStrings(newTuningStrings.value);
    } catch (err) {
      showTuningError(err.message);
      return;
    }
    const id = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    customTunings[id] = { label: name, baseInstrument: base, strings };
    saveCustomTunings();
    renderTuningsList();
    renderInstrumentSelect();
    if (newTuningError) { newTuningError.textContent = ""; newTuningError.hidden = true; }
    if (newTuningName) newTuningName.value = "";
    if (newTuningStrings) newTuningStrings.value = "";
  });
}

function showTuningError(msg) {
  if (!newTuningError) return;
  newTuningError.textContent = msg;
  newTuningError.hidden = false;
}

// --- Keyboard shortcuts ---
// Space = start/stop, 1-9 = preview string, M = toggle haptic.
document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  // Don't hijack typing/selection in form controls (except the start button itself).
  if (target && target !== startBtn && target !== document.body) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target.isContentEditable) {
      return;
    }
  }

  if (event.code === "Space") {
    event.preventDefault();
    startTuner();
    return;
  }
  if (event.key === "m" || event.key === "M") {
    if (hapticToggle) {
      hapticToggle.checked = !hapticToggle.checked;
      hapticToggle.dispatchEvent(new Event("change"));
      event.preventDefault();
    }
    return;
  }
  if (/^[1-9]$/.test(event.key)) {
    const idx = Number(event.key) - 1;
    const buttons = stringsList.querySelectorAll(".note-button");
    if (idx < buttons.length) {
      buttons[idx].click();
      event.preventDefault();
    }
  }
});

window.addEventListener("resize", () => {
  drawHistory();
});

// --- Initialize from localStorage ---
(function init() {
  loadCustomTunings();
  renderInstrumentSelect();
  // Ensure the dropdown reflects the (possibly fallback-corrected) currentInstrument.
  if (instrumentSelect && getInstrumentDef(currentInstrument)) {
    instrumentSelect.value = currentInstrument;
  }

  const savedMode = localStorage.getItem(STORAGE_KEYS.mode) || DEFAULT_MODE;
  const savedReactivity = localStorage.getItem(STORAGE_KEYS.reactivity);
  const savedNoiseGate = localStorage.getItem(STORAGE_KEYS.noiseGate);
  const savedReferencePitch = localStorage.getItem(STORAGE_KEYS.referencePitch);

  if (savedMode === "custom" && savedReactivity != null && savedNoiseGate != null) {
    applyReactivity(savedReactivity);
    applyNoiseGate(savedNoiseGate);
    applyMode("custom");
  } else {
    applyMode(savedMode);
  }

  applyReferencePitch(savedReferencePitch ?? DEFAULT_REFERENCE_PITCH);

  const savedCapo = localStorage.getItem(STORAGE_KEYS.capo);
  applyCapo(savedCapo ?? 0);

  const savedHaptic = localStorage.getItem(STORAGE_KEYS.haptic);
  if (savedHaptic != null) hapticEnabled = savedHaptic === "1";
  if (hapticToggle) hapticToggle.checked = hapticEnabled;

  // Theme: respect saved preference, else prefers-color-scheme, else dark.
  let savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  if (!savedTheme) {
    savedTheme = window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  applyTheme(savedTheme);

  updateStringsList();
})();
