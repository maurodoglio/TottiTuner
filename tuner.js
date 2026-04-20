import { analyzePitch, getAudioMediaStream } from "./audio.js";
import {
  BUFFER_SIZE,
  DEFAULT_MIN_CLARITY,
  DEFAULT_MODE,
  DEFAULT_TARGET_MODE,
  DEFAULT_REFERENCE_PITCH,
  MODE_PRESETS,
  NOTE_LOCK_CENTS,
  NOTE_RELEASE_CENTS,
  PITCH_HOLD_MS,
  STORAGE_KEYS,
  clampPercentage,
  getNeedleTransitionMs,
  getRmsThreshold,
  getSampleIntervalMs,
  getSmoothingAlpha,
} from "./config.js";
import { INSTRUMENTS } from "./instruments.js";
import {
  advancePitchState,
  buildInstrumentStrings,
  resolveTargetString,
} from "./pitch-engine.js";
import { closePreview, playPreview } from "./preview.js";
import { loadSettings, saveSetting } from "./storage.js";
import {
  applyNeedleTransition,
  highlightActiveString,
  renderPitchDisplay,
  renderStatusMessage,
  renderStringsList,
  resetVisualState,
} from "./ui.js";

const dom = {
  startBtn: document.getElementById("start-btn"),
  instrumentSelect: document.getElementById("instrument-select"),
  noteDisplay: document.getElementById("note-display"),
  freqDisplay: document.getElementById("freq-display"),
  centsDisplay: document.getElementById("cents-display"),
  clarityDisplay: document.getElementById("clarity-display"),
  needle: document.getElementById("needle"),
  tunerStatus: document.getElementById("tuner-status"),
  stringsList: document.getElementById("strings-list"),
  tunerMeter: document.getElementById("tuner-meter"),
  modeSelect: document.getElementById("mode-select"),
  noiseGateSlider: document.getElementById("noise-gate-slider"),
  noiseGateValue: document.getElementById("noise-gate-value"),
  reactivitySlider: document.getElementById("reactivity-slider"),
  reactivityValue: document.getElementById("reactivity-value"),
  refPitchSelect: document.getElementById("ref-pitch-select"),
  targetModeSelect: document.getElementById("target-mode-select"),
  targetNoteDisplay: document.getElementById("target-note-display"),
  tunerHint: document.getElementById("tuner-hint"),
  tunerErrorHelp: document.getElementById("tuner-error-help"),
  hapticToggle: document.getElementById("haptic-toggle"),
  capoSelect: document.getElementById("capo-select"),
  themeToggle: document.getElementById("theme-toggle"),
};

const state = {
  ...loadSettings(),
  minClarity: DEFAULT_MIN_CLARITY,
  instrumentStrings: [],
  audioContext: null,
  analyser: null,
  mediaStream: null,
  frameId: null,
  isRunning: false,
  lastAnalysisTime: 0,
  wasInTune: false,
  engineState: {
    smoothedFrequency: null,
    lastStableTime: 0,
    display: null,
    lockedTargetNote: null,
  },
};

function getModePreset(value) {
  return MODE_PRESETS[value] || MODE_PRESETS[DEFAULT_MODE];
}

function getPreferredTheme() {
  if (state.theme) return state.theme;
  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
}

function applyTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  state.theme = next;

  if (next === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }

  if (dom.themeToggle) {
    dom.themeToggle.textContent = next === "light" ? "☀️" : "🌙";
    dom.themeToggle.setAttribute(
      "aria-label",
      next === "light" ? "Switch to dark theme" : "Switch to light theme"
    );
    dom.themeToggle.title = dom.themeToggle.getAttribute("aria-label");
  }
}

function setErrorHelp(message = "") {
  if (!dom.tunerErrorHelp) return;
  dom.tunerErrorHelp.textContent = message;
  dom.tunerErrorHelp.hidden = !message;
}

function setHintVisible(visible) {
  if (!dom.tunerHint) return;
  dom.tunerHint.hidden = !visible;
}

function populateInstrumentOptions() {
  dom.instrumentSelect.innerHTML = "";
  Object.entries(INSTRUMENTS).forEach(([key, instrument]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = instrument.label;
    option.selected = key === state.instrument;
    dom.instrumentSelect.appendChild(option);
  });
}

function updateDerivedControls() {
  dom.reactivitySlider.value = String(state.reactivity);
  dom.reactivityValue.textContent = `${state.reactivity}%`;
  dom.noiseGateSlider.value = String(state.noiseGate);
  dom.noiseGateValue.textContent = `${state.noiseGate}%`;
  dom.modeSelect.value = state.mode;
  dom.refPitchSelect.value = String(state.referencePitch || DEFAULT_REFERENCE_PITCH);
  dom.targetModeSelect.value = state.targetMode || DEFAULT_TARGET_MODE;

  if (dom.hapticToggle) {
    dom.hapticToggle.checked = state.hapticEnabled;
  }

  if (dom.capoSelect) {
    dom.capoSelect.value = String(state.capoSemitones ?? 0);
  }

  applyNeedleTransition(document.documentElement, getNeedleTransitionMs(state.reactivity));
}

function updateTargetNoteSummary() {
  const resolvedTarget = resolveTargetString({
    targetMode: state.targetMode,
    targetString: state.targetString,
    instrumentStrings: state.instrumentStrings,
    frequency: state.engineState.smoothedFrequency,
  });

  dom.targetNoteDisplay.textContent = resolvedTarget
    ? `Target: ${resolvedTarget.note}`
    : "Target: Auto";
}

function rebuildInstrumentStrings() {
  state.instrumentStrings = buildInstrumentStrings(
    INSTRUMENTS[state.instrument].strings,
    state.referencePitch,
    state.capoSemitones
  );

  if (
    state.targetString &&
    !state.instrumentStrings.some(
      (string) => string.note === state.targetString || string.sourceNote === state.targetString
    )
  ) {
    state.targetString = state.instrumentStrings[0]?.sourceNote ?? state.instrumentStrings[0]?.note ?? null;
    saveSetting(STORAGE_KEYS.targetString, state.targetString ?? "");
  }

  renderStringsList({
    stringsList: dom.stringsList,
    instrumentStrings: state.instrumentStrings,
    currentTargetString: state.targetMode === "target" ? state.targetString : null,
    onPlay: (string) => playPreview(string.adjustedFreq, INSTRUMENTS[state.instrument].harmonics),
    onSelectTarget: (note) => {
      state.targetMode = "target";
      state.targetString = note;
      dom.targetModeSelect.value = "target";
      saveSetting(STORAGE_KEYS.targetMode, state.targetMode);
      saveSetting(STORAGE_KEYS.targetString, note);
      rebuildInstrumentStrings();
      updateTargetNoteSummary();
      if (state.isRunning) resetDisplay("Listening... Play the selected target string clearly.");
    },
  });

  updateTargetNoteSummary();
}

function resetDisplay(message = "Waiting for sound...") {
  state.engineState = {
    smoothedFrequency: null,
    lastStableTime: 0,
    display: null,
    lockedTargetNote: null,
  };
  state.wasInTune = false;
  resetVisualState({ ...dom });
  renderStatusMessage(dom, message, state.isRunning ? "listening" : "idle");
  highlightActiveString(dom.stringsList, null, state.targetMode === "target" ? state.targetString : null);
  updateTargetNoteSummary();
}

function applyMode(mode) {
  if (mode === "custom") {
    state.mode = "custom";
    state.minClarity = DEFAULT_MIN_CLARITY;
    updateDerivedControls();
    return;
  }

  const preset = getModePreset(mode);
  state.mode = MODE_PRESETS[mode] ? mode : DEFAULT_MODE;
  state.reactivity = preset.reactivity;
  state.noiseGate = preset.noiseGate;
  state.minClarity = preset.minClarity ?? DEFAULT_MIN_CLARITY;
  updateDerivedControls();
}

function syncCustomSettings() {
  state.mode = "custom";
  state.minClarity = DEFAULT_MIN_CLARITY;
  dom.modeSelect.value = "custom";
  saveSetting(STORAGE_KEYS.mode, state.mode);
}

function handlePitchResult(result, timestamp) {
  const hadStableDisplay = Boolean(state.engineState.display);
  const nextState = advancePitchState(state.engineState, result, {
    timestamp,
    referencePitch: state.referencePitch,
    holdMs: PITCH_HOLD_MS,
    smoothingAlpha: getSmoothingAlpha(state.reactivity),
    targetMode: state.targetMode,
    targetString: state.targetString,
    instrumentStrings: state.instrumentStrings,
    minClarity: state.minClarity,
    noteLockCents: NOTE_LOCK_CENTS,
    noteReleaseCents: NOTE_RELEASE_CENTS,
  });

  state.engineState = nextState;

  if (!nextState.display) {
    state.wasInTune = false;
    if (hadStableDisplay && timestamp - nextState.lastStableTime <= PITCH_HOLD_MS) {
      renderStatusMessage(dom, "Holding last stable pitch...", "listening");
      return;
    }
    renderStatusMessage(dom, "Signal too weak or unclear — play a single string louder.", "warning");
    highlightActiveString(dom.stringsList, null, state.targetMode === "target" ? state.targetString : null);
    return;
  }

  renderPitchDisplay(dom, nextState.display, { targetMode: state.targetMode });
  highlightActiveString(
    dom.stringsList,
    nextState.display.activeMidi,
    state.targetMode === "target" ? nextState.display.targetNote : null
  );
  updateTargetNoteSummary();

  const inTune = nextState.display.status === "in-tune";
  if (inTune && !state.wasInTune && state.hapticEnabled && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(30);
    } catch {
      // ignore unsupported vibration failures
    }
  }
  state.wasInTune = inTune;
}

function processAudio(timestamp = performance.now()) {
  if (!state.analyser || !state.audioContext) return;

  if (timestamp - state.lastAnalysisTime < getSampleIntervalMs(state.reactivity)) {
    state.frameId = requestAnimationFrame(processAudio);
    return;
  }

  state.lastAnalysisTime = timestamp;
  const buffer = new Float32Array(BUFFER_SIZE);
  state.analyser.getFloatTimeDomainData(buffer);
  const pitchResult = analyzePitch(buffer, state.audioContext.sampleRate, {
    rmsThreshold: getRmsThreshold(state.noiseGate),
    minClarity: state.minClarity,
  });

  handlePitchResult(pitchResult, timestamp);
  state.frameId = requestAnimationFrame(processAudio);
}

async function startTuner() {
  if (state.isRunning) {
    stopTuner();
    return;
  }

  try {
    setErrorHelp("");
    setHintVisible(false);
    renderStatusMessage(dom, "Requesting microphone access...", "listening");

    state.mediaStream = await getAudioMediaStream();
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = state.audioContext.createMediaStreamSource(state.mediaStream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = BUFFER_SIZE;
    source.connect(state.analyser);

    state.engineState = {
      smoothedFrequency: null,
      lastStableTime: 0,
      display: null,
      lockedTargetNote: state.targetMode === "target" ? state.targetString : null,
    };
    state.lastAnalysisTime = performance.now() - getSampleIntervalMs(state.reactivity);
    state.isRunning = true;
    state.wasInTune = false;
    dom.startBtn.textContent = "Stop Tuner";
    dom.startBtn.classList.add("active");
    dom.startBtn.setAttribute("aria-pressed", "true");
    renderStatusMessage(dom, "Listening... Play a single string clearly.", "listening");
    processAudio();
  } catch (error) {
    if (error.name === "InsecureContextError") {
      renderStatusMessage(dom, "Use HTTPS or localhost to enable the microphone.", "error");
      setErrorHelp("Browsers only allow microphone access on secure origins. Try localhost or an HTTPS URL.");
    } else if (error.name === "NotSupportedError") {
      renderStatusMessage(dom, "This browser does not support microphone tuning.", "error");
      setErrorHelp("Try a recent version of Chrome, Edge, Firefox, or Safari.");
    } else if (error.name === "NotFoundError") {
      renderStatusMessage(dom, "No microphone device was found.", "error");
      setErrorHelp("Connect or enable a microphone, then press Start again.");
    } else if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      renderStatusMessage(dom, "Microphone access was denied. Allow permission and try again.", "error");
      setErrorHelp("Use the permissions control near your browser address bar to allow microphone access for this site.");
    } else {
      renderStatusMessage(dom, "Unable to start the tuner. Check your microphone and try again.", "error");
      setErrorHelp("If the problem continues, reload the page and verify that your microphone is available.");
    }
    setHintVisible(false);
    console.error(error);
  }
}

function stopTuner() {
  if (state.frameId) cancelAnimationFrame(state.frameId);
  if (state.mediaStream) state.mediaStream.getTracks().forEach((track) => track.stop());
  if (state.audioContext) state.audioContext.close().catch(() => {});
  closePreview();

  state.frameId = null;
  state.analyser = null;
  state.mediaStream = null;
  state.audioContext = null;
  state.lastAnalysisTime = 0;
  state.isRunning = false;
  state.wasInTune = false;
  dom.startBtn.textContent = "Start Tuner";
  dom.startBtn.classList.remove("active");
  dom.startBtn.setAttribute("aria-pressed", "false");
  setErrorHelp("");
  setHintVisible(true);
  resetDisplay("Press Start to begin");
}

function bindEvents() {
  dom.startBtn.addEventListener("click", startTuner);

  dom.instrumentSelect.addEventListener("change", () => {
    state.instrument = dom.instrumentSelect.value;
    saveSetting(STORAGE_KEYS.instrument, state.instrument);
    rebuildInstrumentStrings();
    resetDisplay();
  });

  dom.modeSelect.addEventListener("change", (event) => {
    applyMode(event.target.value);
    saveSetting(STORAGE_KEYS.mode, state.mode);
    saveSetting(STORAGE_KEYS.reactivity, state.reactivity);
    saveSetting(STORAGE_KEYS.noiseGate, state.noiseGate);
    resetDisplay();
  });

  dom.noiseGateSlider.addEventListener("input", (event) => {
    state.noiseGate = clampPercentage(event.target.value, state.noiseGate);
    dom.noiseGateValue.textContent = `${state.noiseGate}%`;
    syncCustomSettings();
    saveSetting(STORAGE_KEYS.noiseGate, state.noiseGate);
  });

  dom.reactivitySlider.addEventListener("input", (event) => {
    state.reactivity = clampPercentage(event.target.value, state.reactivity);
    dom.reactivityValue.textContent = `${state.reactivity}%`;
    applyNeedleTransition(document.documentElement, getNeedleTransitionMs(state.reactivity));
    syncCustomSettings();
    saveSetting(STORAGE_KEYS.reactivity, state.reactivity);
  });

  dom.refPitchSelect.addEventListener("change", (event) => {
    state.referencePitch = Number(event.target.value) || DEFAULT_REFERENCE_PITCH;
    saveSetting(STORAGE_KEYS.referencePitch, state.referencePitch);
    rebuildInstrumentStrings();
    resetDisplay();
  });

  dom.targetModeSelect.addEventListener("change", (event) => {
    state.targetMode = event.target.value;
    if (state.targetMode === "target" && !state.targetString) {
      state.targetString = state.instrumentStrings[0]?.sourceNote ?? state.instrumentStrings[0]?.note ?? null;
    }
    saveSetting(STORAGE_KEYS.targetMode, state.targetMode);
    if (state.targetString) {
      saveSetting(STORAGE_KEYS.targetString, state.targetString);
    }
    rebuildInstrumentStrings();
    resetDisplay();
  });

  if (dom.hapticToggle) {
    dom.hapticToggle.addEventListener("change", (event) => {
      state.hapticEnabled = Boolean(event.target.checked);
      saveSetting(STORAGE_KEYS.haptic, state.hapticEnabled ? "1" : "0");
    });
  }

  if (dom.capoSelect) {
    dom.capoSelect.addEventListener("change", (event) => {
      state.capoSemitones = Math.max(0, Math.min(12, Math.round(Number(event.target.value) || 0)));
      saveSetting(STORAGE_KEYS.capo, state.capoSemitones);
      rebuildInstrumentStrings();
      resetDisplay();
    });
  }

  if (dom.themeToggle) {
    dom.themeToggle.addEventListener("click", () => {
      const next = state.theme === "light" ? "dark" : "light";
      applyTheme(next);
      saveSetting(STORAGE_KEYS.theme, next);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target && target !== dom.startBtn && target !== document.body) {
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
      if (dom.hapticToggle) {
        dom.hapticToggle.checked = !dom.hapticToggle.checked;
        dom.hapticToggle.dispatchEvent(new Event("change"));
        event.preventDefault();
      }
      return;
    }

    if (/^[1-9]$/.test(event.key)) {
      const idx = Number(event.key) - 1;
      const buttons = dom.stringsList.querySelectorAll(".note-button");
      if (idx < buttons.length) {
        buttons[idx].click();
        event.preventDefault();
      }
    }
  });
}

(function init() {
  populateInstrumentOptions();
  applyMode(state.mode);
  if (state.mode === "custom") {
    state.reactivity = clampPercentage(state.reactivity, getModePreset(DEFAULT_MODE).reactivity);
    state.noiseGate = clampPercentage(state.noiseGate, getModePreset(DEFAULT_MODE).noiseGate);
    state.minClarity = DEFAULT_MIN_CLARITY;
  }
  updateDerivedControls();
  applyTheme(getPreferredTheme());
  rebuildInstrumentStrings();
  bindEvents();
  setHintVisible(true);
  setErrorHelp("");
  resetDisplay("Press Start to begin");
})();
