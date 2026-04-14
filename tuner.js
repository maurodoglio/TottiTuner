import {
  INSTRUMENTS,
  noteFromFrequency,
  centsOffFromPitch,
  noteName,
} from "./instruments.js";
import { autoCorrelate, getAudioMediaStream } from "./audio.js";

// --- Constants ---
const BUFFER_SIZE = 2048;
const PREVIEW_ATTACK_GAIN = 0.14;
// Must be greater than 0 for exponential ramps.
const PREVIEW_MIN_GAIN = 0.0001;
const PREVIEW_ATTACK_TIME = 0.02;
const PREVIEW_DECAY_TIME = 0.45;
const PREVIEW_DURATION = 0.5;
const DEFAULT_NOISE_GATE = 50;
const DEFAULT_REACTIVITY = 60;
const DEFAULT_MODE = "balanced";
const DEFAULT_REFERENCE_PITCH = 440;
const PITCH_HOLD_MS = 280;
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
};

// --- Audio state ---
let audioContext = null;
let analyser = null;
let mediaStream = null;
let animFrame = null;
let isRunning = false;
let previewAudioContext = null;
let smoothedFrequency = null;
let lastAnalysisTime = 0;
let lastStablePitchTime = 0;

// --- UI state ---
let currentInstrument = localStorage.getItem(STORAGE_KEYS.instrument) || "guitar";
let mode = DEFAULT_MODE;
let noiseGate = DEFAULT_NOISE_GATE;
let reactivity = DEFAULT_REACTIVITY;
let referencePitch = DEFAULT_REFERENCE_PITCH;

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

// Populate instrument selector, restoring saved selection
Object.entries(INSTRUMENTS).forEach(([key, inst]) => {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = inst.label;
  if (key === currentInstrument) opt.selected = true;
  instrumentSelect.appendChild(opt);
});

// INSTRUMENTS frequencies are defined at A4=440. Scale proportionally for other reference pitches.
function scaledFreq(baseFreq) {
  return baseFreq * (referencePitch / 440);
}

function updateStringsList() {
  stringsList.innerHTML = "";
  INSTRUMENTS[currentInstrument].strings.forEach(({ note, freq }) => {
    const adjustedFreq = scaledFreq(freq);
    const li = document.createElement("li");
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", `Play ${note} at ${adjustedFreq.toFixed(2)} Hz`);
    li.classList.add("note-button");
    // Store MIDI note number for active-string highlighting comparison
    li.dataset.midi = String(noteFromFrequency(adjustedFreq, referencePitch));
    li.innerHTML = `<span class="string-note">${note}</span><span class="string-freq">${adjustedFreq.toFixed(2)} Hz</span>`;
    li.addEventListener("click", () => playNotePreview(adjustedFreq));
    li.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      playNotePreview(adjustedFreq);
    });
    stringsList.appendChild(li);
  });
}

instrumentSelect.addEventListener("change", () => {
  currentInstrument = instrumentSelect.value;
  localStorage.setItem(STORAGE_KEYS.instrument, currentInstrument);
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

function clearActiveStrings() {
  stringsList.querySelectorAll(".note-button.active").forEach(el => el.classList.remove("active"));
}

function resetDisplay() {
  noteDisplay.textContent = "--";
  freqDisplay.textContent = "-- Hz";
  centsDisplay.textContent = "0¢";
  setNeedle(0);
  clearActiveStrings();
  tunerStatus.textContent = "Waiting for sound...";
  tunerStatus.className = "tuner-status";
  tunerMeter.className = "tuner-meter";
}

function setNeedle(cents) {
  // cents: -50 to +50; map to -85deg to +85deg rotation
  const clamped = Math.max(-50, Math.min(50, cents));
  const deg = (clamped / 50) * 85;
  needle.style.transform = `rotate(${deg}deg)`;
}

function highlightActiveString(noteNum, cents) {
  const midiStr = String(noteNum);
  stringsList.querySelectorAll(".note-button").forEach(li => {
    li.classList.toggle("active", li.dataset.midi === midiStr && Math.abs(cents) <= 15);
  });
}

function updateTunerUI(frequency) {
  const noteNum = noteFromFrequency(frequency, referencePitch);
  const cents = centsOffFromPitch(frequency, noteNum, referencePitch);
  const name = noteName(noteNum);

  noteDisplay.textContent = name;
  freqDisplay.textContent = `${frequency.toFixed(1)} Hz`;
  centsDisplay.textContent = `${cents >= 0 ? "+" : ""}${cents}¢`;

  setNeedle(cents);
  highlightActiveString(noteNum, cents);

  const absCents = Math.abs(cents);
  if (absCents <= 5) {
    tunerStatus.textContent = "In Tune ✓";
    tunerStatus.className = "tuner-status in-tune";
    tunerMeter.className = "tuner-meter in-tune";
  } else if (absCents <= 15) {
    tunerStatus.textContent = cents < 0 ? "Slightly Flat ↓" : "Slightly Sharp ↑";
    tunerStatus.className = "tuner-status slightly-off";
    tunerMeter.className = "tuner-meter slightly-off";
  } else {
    tunerStatus.textContent = cents < 0 ? "Flat ↓" : "Sharp ↑";
    tunerStatus.className = "tuner-status out-of-tune";
    tunerMeter.className = "tuner-meter out-of-tune";
  }
}

function processAudio(timestamp) {
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
    updateTunerUI(smoothedFrequency);
  } else if (timestamp - lastStablePitchTime > PITCH_HOLD_MS) {
    smoothedFrequency = null;
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

function playNotePreview(freq) {
  const context = getPreviewAudioContext();
  if (context.state === "suspended") context.resume();

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const now = context.currentTime;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(freq, now);

  gainNode.gain.setValueAtTime(PREVIEW_MIN_GAIN, now);
  gainNode.gain.exponentialRampToValueAtTime(PREVIEW_ATTACK_GAIN, now + PREVIEW_ATTACK_TIME);
  gainNode.gain.exponentialRampToValueAtTime(PREVIEW_MIN_GAIN, now + PREVIEW_DECAY_TIME);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(now);
  oscillator.stop(now + PREVIEW_DURATION);
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
    isRunning = true;
    startBtn.textContent = "Stop Tuner";
    startBtn.classList.add("active");
    startBtn.setAttribute("aria-pressed", "true");
    tunerStatus.textContent = "Listening...";
    processAudio();
  } catch (err) {
    if (err.name === "InsecureContextError") {
      tunerStatus.textContent = "Use HTTPS (or localhost) to enable microphone";
    } else if (err.name === "NotSupportedError") {
      tunerStatus.textContent = "Microphone is not supported in this browser";
    } else if (err.name === "NotFoundError") {
      tunerStatus.textContent = "No microphone device found";
    } else {
      tunerStatus.textContent = "Microphone access denied";
    }
    tunerStatus.className = "tuner-status out-of-tune";
    console.error(err);
  }
}

function stopTuner() {
  if (animFrame) cancelAnimationFrame(animFrame);
  if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
  if (audioContext) audioContext.close().catch(() => {});
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
  updateStringsList();
  if (isRunning) resetDisplay();
});

// --- Initialize from localStorage ---
(function init() {
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
  updateStringsList();
})();
