// Instrument definitions: name -> array of { note, freq }
const INSTRUMENTS = {
  guitar: {
    label: "Guitar",
    strings: [
      { note: "E2", freq: 82.41 },
      { note: "A2", freq: 110.0 },
      { note: "D3", freq: 146.83 },
      { note: "G3", freq: 196.0 },
      { note: "B3", freq: 246.94 },
      { note: "E4", freq: 329.63 },
    ],
  },
  bass: {
    label: "Bass Guitar",
    strings: [
      { note: "E1", freq: 41.2 },
      { note: "A1", freq: 55.0 },
      { note: "D2", freq: 73.42 },
      { note: "G2", freq: 98.0 },
    ],
  },
  ukulele: {
    label: "Ukulele",
    strings: [
      { note: "G4", freq: 392.0 },
      { note: "C4", freq: 261.63 },
      { note: "E4", freq: 329.63 },
      { note: "A4", freq: 440.0 },
    ],
  },
  violin: {
    label: "Violin",
    strings: [
      { note: "G3", freq: 196.0 },
      { note: "D4", freq: 293.66 },
      { note: "A4", freq: 440.0 },
      { note: "E5", freq: 659.25 },
    ],
  },
  cello: {
    label: "Cello",
    strings: [
      { note: "C2", freq: 65.41 },
      { note: "G2", freq: 98.0 },
      { note: "D3", freq: 146.83 },
      { note: "A3", freq: 220.0 },
    ],
  },
  mandolin: {
    label: "Mandolin",
    strings: [
      { note: "G3", freq: 196.0 },
      { note: "D4", freq: 293.66 },
      { note: "A4", freq: 440.0 },
      { note: "E5", freq: 659.25 },
    ],
  },
};

// All notes with their frequencies for nearest-note lookup
const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteFromFrequency(frequency) {
  const noteNum = 12 * Math.log2(frequency / 440);
  return Math.round(noteNum) + 69;
}

function frequencyFromNoteNumber(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function centsOffFromPitch(frequency, note) {
  return Math.floor(1200 * Math.log2(frequency / frequencyFromNoteNumber(note)));
}

function noteName(noteNum) {
  const octave = Math.floor(noteNum / 12) - 1;
  const name = NOTE_STRINGS[noteNum % 12];
  return `${name}${octave}`;
}

// Autocorrelation-based pitch detection
function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  const rms = Math.sqrt(buf.reduce((sum, v) => sum + v * v, 0) / SIZE);

  if (rms < 0.01) return -1; // Signal too quiet

  // Trim edges with signal
  let r1 = 0,
    r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }
  }

  const trimmed = buf.slice(r1, r2);
  const c = new Array(trimmed.length).fill(0);

  for (let i = 0; i < trimmed.length; i++) {
    for (let j = 0; j < trimmed.length - i; j++) {
      c[i] += trimmed[j] * trimmed[j + i];
    }
  }

  // Find first valley then first peak after it
  let d = 0;
  while (c[d] > c[d + 1]) d++;

  let maxVal = -1,
    maxPos = -1;
  for (let i = d; i < trimmed.length; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }

  if (maxPos === -1) return -1;

  // Interpolate around the peak for better accuracy
  let T0 = maxPos;
  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  return sampleRate / T0;
}

// --- UI State ---
let audioContext = null;
let analyser = null;
let mediaStream = null;
let animFrame = null;
let isRunning = false;
let currentInstrument = "guitar";
let previewAudioContext = null;

const BUFFER_SIZE = 2048;
const PREVIEW_ATTACK_GAIN = 0.14;
// Must be greater than 0 for exponential ramps.
const PREVIEW_MIN_GAIN = 0.0001;
const PREVIEW_ATTACK_TIME = 0.02;
const PREVIEW_DECAY_TIME = 0.45;
const PREVIEW_DURATION = 0.5;
const DEFAULT_REACTIVITY = 60;
const PITCH_HOLD_MS = 280;

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
const reactivitySlider = document.getElementById("reactivity-slider");
const reactivityValue = document.getElementById("reactivity-value");

let reactivity = DEFAULT_REACTIVITY;
let smoothedFrequency = null;
let lastAnalysisTime = 0;
let lastStablePitchTime = 0;

// Populate instrument selector
Object.entries(INSTRUMENTS).forEach(([key, inst]) => {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = inst.label;
  instrumentSelect.appendChild(opt);
});

function updateStringsList() {
  stringsList.innerHTML = "";
  const inst = INSTRUMENTS[currentInstrument];
  inst.strings.forEach(({ note, freq }) => {
    const li = document.createElement("li");
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", `Play ${note} at ${freq.toFixed(2)} Hz`);
    li.classList.add("note-button");
    li.innerHTML = `<span class="string-note">${note}</span><span class="string-freq">${freq.toFixed(2)} Hz</span>`;
    li.addEventListener("click", () => playNotePreview(freq));
    li.addEventListener("keydown", (event) => {
      const isActivationKey = event.key === "Enter" || event.key === " ";
      if (!isActivationKey) {
        return;
      }
      event.preventDefault();
      playNotePreview(freq);
    });
    stringsList.appendChild(li);
  });
}

instrumentSelect.addEventListener("change", () => {
  currentInstrument = instrumentSelect.value;
  updateStringsList();
  resetDisplay();
});

updateStringsList();

function mapRange(value, inMin, inMax, outMin, outMax) {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function getSampleIntervalMs() {
  return Math.round(mapRange(reactivity, 1, 100, 130, 25));
}

function getSmoothingAlpha() {
  return mapRange(reactivity, 1, 100, 0.14, 0.72);
}

function applyNeedleSpeed() {
  const transitionMs = Math.round(mapRange(reactivity, 1, 100, 300, 70));
  document.documentElement.style.setProperty("--needle-transition-duration", `${transitionMs}ms`);
}

function applyReactivity(value) {
  const parsed = Number(value);
  reactivity = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : DEFAULT_REACTIVITY;
  reactivityValue.textContent = `${reactivity}%`;
  applyNeedleSpeed();
}

function resetDisplay() {
  noteDisplay.textContent = "--";
  freqDisplay.textContent = "-- Hz";
  centsDisplay.textContent = "0¢";
  setNeedle(0);
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

function updateTunerUI(frequency) {
  const noteNum = noteFromFrequency(frequency);
  const cents = centsOffFromPitch(frequency, noteNum);
  const name = noteName(noteNum);

  noteDisplay.textContent = name;
  freqDisplay.textContent = `${frequency.toFixed(1)} Hz`;
  centsDisplay.textContent = `${cents >= 0 ? "+" : ""}${cents}¢`;

  setNeedle(cents);

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
  if (!lastAnalysisTime) {
    lastAnalysisTime = timestamp;
  }

  if (timestamp - lastAnalysisTime < getSampleIntervalMs()) {
    animFrame = requestAnimationFrame(processAudio);
    return;
  }
  lastAnalysisTime = timestamp;

  const buf = new Float32Array(BUFFER_SIZE);
  analyser.getFloatTimeDomainData(buf);
  const frequency = autoCorrelate(buf, audioContext.sampleRate);

  if (frequency !== -1 && frequency > 20 && frequency < 5000) {
    if (smoothedFrequency === null) {
      smoothedFrequency = frequency;
    } else {
      const alpha = getSmoothingAlpha();
      smoothedFrequency += (frequency - smoothedFrequency) * alpha;
    }
    lastStablePitchTime = timestamp;
    updateTunerUI(smoothedFrequency);
  } else {
    if (lastStablePitchTime && timestamp - lastStablePitchTime > PITCH_HOLD_MS) {
      smoothedFrequency = null;
      resetDisplay();
    }
  }

  animFrame = requestAnimationFrame(processAudio);
}

function getPreviewAudioContext() {
  if (!previewAudioContext || previewAudioContext.state === "closed") {
    previewAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return previewAudioContext;
}

applyReactivity(reactivitySlider.value);
reactivitySlider.addEventListener("input", (event) => {
  applyReactivity(event.target.value);
});

function playNotePreview(freq) {
  const context = getPreviewAudioContext();
  if (context.state === "suspended") {
    context.resume();
  }

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

function isLocalhost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getAudioMediaStream() {
  if (!window.isSecureContext && !isLocalhost(window.location.hostname)) {
    const err = new Error("Microphone requires HTTPS or localhost");
    err.name = "InsecureContextError";
    throw err;
  }

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }

  const legacyGetUserMedia =
    navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

  if (legacyGetUserMedia) {
    return new Promise((resolve, reject) => {
      legacyGetUserMedia.call(navigator, { audio: true, video: false }, resolve, reject);
    });
  }

  const err = new Error("getUserMedia is not supported in this browser");
  err.name = "NotSupportedError";
  throw err;
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
    lastAnalysisTime = 0;
    lastStablePitchTime = 0;
    isRunning = true;
    startBtn.textContent = "Stop Tuner";
    startBtn.classList.add("active");
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
  if (audioContext) {
    audioContext.close().catch(() => {});
  }
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
  resetDisplay();
}

startBtn.addEventListener("click", startTuner);
