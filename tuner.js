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
  RETARGET_BIAS_CENTS,
  STORAGE_KEYS,
  clampPercentage,
  getNeedleTransitionMs,
  getRmsThreshold,
  getSampleIntervalMs,
  getSmoothingAlpha,
} from "./config.js";
import { INSTRUMENTS } from "./instruments.js";
import { advancePitchState, resolveTargetString } from "./pitch-engine.js";
import { closePreview, playPreview } from "./preview.js";
import {
  deleteCustomTuning,
  getDefaultSettings,
  loadCustomTunings,
  loadSettings,
  saveCustomTuning,
  saveSetting,
  saveSettings,
} from "./storage.js";
import { resolveActiveTuningContext } from "./tuning-state.js";
import {
  buildCustomTuningShareState,
  buildTuningShareState,
  createCustomTuningId,
  parseSharedTuningState,
  parseTuningStrings,
  resolveSharedSetupState,
  sanitizeTuningMetadata,
  serializeSharedTuningState,
} from "./tuning-utils.js";
import {
  applyNeedleTransition,
  highlightActiveString,
  renderCustomTuningsList,
  renderOnboardingChecklist,
  renderPitchDisplay,
  renderStatusMessage,
  renderStringsList,
  renderTuningOptions,
  resetVisualState,
  syncSelectValue,
} from "./ui.js";

const dom = {
  startBtn: document.getElementById("start-btn"),
  instrumentSelect: document.getElementById("instrument-select"),
  tuningSelect: document.getElementById("tuning-select"),
  tuningSummary: document.getElementById("tuning-summary"),
  manageTuningsBtn: document.getElementById("manage-tunings-btn"),
  tuningsDialog: document.getElementById("tunings-dialog"),
  tuningsList: document.getElementById("tunings-list"),
  newTuningName: document.getElementById("new-tuning-name"),
  newTuningBase: document.getElementById("new-tuning-base"),
  newTuningStrings: document.getElementById("new-tuning-strings"),
  newTuningError: document.getElementById("new-tuning-error"),
  addTuningBtn: document.getElementById("add-tuning-btn"),
  onboardingPanel: document.getElementById("onboarding-panel"),
  onboardingChecklist: document.getElementById("onboarding-checklist"),
  dismissOnboardingBtn: document.getElementById("dismiss-onboarding-btn"),
  shareBtn: document.getElementById("share-btn"),
  resetBtn: document.getElementById("reset-btn"),
  setupActionsStatus: document.getElementById("setup-actions-status"),
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

const DEFAULT_SETUP_STATUS_MS = 2400;

const state = {
  ...loadSettings(),
  minClarity: DEFAULT_MIN_CLARITY,
  customTuningsByInstrument: loadCustomTunings(),
  activeTuning: null,
  availableTunings: [],
  instrumentStrings: [],
  audioContext: null,
  analyser: null,
  mediaStream: null,
  frameId: null,
  isRunning: false,
  lastAnalysisTime: 0,
  wasInTune: false,
  setupStatusTimer: null,
  hasPlayedPreview: false,
  micPermissionState: "idle",
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
  syncSelectValue(dom.instrumentSelect, state.instrument);
  dom.reactivitySlider.value = String(state.reactivity);
  dom.reactivityValue.textContent = `${state.reactivity}%`;
  dom.noiseGateSlider.value = String(state.noiseGate);
  dom.noiseGateValue.textContent = `${state.noiseGate}%`;
  dom.modeSelect.value = state.mode;
  dom.refPitchSelect.value = String(state.referencePitch || DEFAULT_REFERENCE_PITCH);
  dom.targetModeSelect.value = state.targetMode || DEFAULT_TARGET_MODE;

  if (dom.tuningSelect && state.activeTuning) {
    dom.tuningSelect.value = state.activeTuning.id;
  }

  if (dom.hapticToggle) {
    dom.hapticToggle.checked = state.hapticEnabled;
  }

  if (dom.capoSelect) {
    dom.capoSelect.value = String(state.capoSemitones ?? 0);
  }

  applyNeedleTransition(document.documentElement, getNeedleTransitionMs(state.reactivity));
}

function setSetupStatus(message = "", tone = "success", timeoutMs = DEFAULT_SETUP_STATUS_MS) {
  if (!dom.setupActionsStatus) return;

  if (state.setupStatusTimer) {
    window.clearTimeout(state.setupStatusTimer);
    state.setupStatusTimer = null;
  }

  dom.setupActionsStatus.textContent = message;
  dom.setupActionsStatus.dataset.tone = tone;

  if (message && timeoutMs > 0) {
    state.setupStatusTimer = window.setTimeout(() => {
      dom.setupActionsStatus.textContent = "";
      delete dom.setupActionsStatus.dataset.tone;
      state.setupStatusTimer = null;
    }, timeoutMs);
  }
}

function setNewTuningError(message = "") {
  if (!dom.newTuningError) return;
  dom.newTuningError.textContent = message;
  dom.newTuningError.hidden = !message;
}

function hydrateBaseTuningOptions() {
  if (!dom.newTuningBase) return;
  dom.newTuningBase.innerHTML = "";
  Object.entries(INSTRUMENTS).forEach(([instrumentId, instrument]) => {
    const option = document.createElement("option");
    option.value = instrumentId;
    option.textContent = instrument.label;
    option.selected = instrumentId === state.instrument;
    dom.newTuningBase.appendChild(option);
  });
}

function stopRunningTunerBeforeRebuild() {
  if (state.isRunning) {
    stopTuner();
  }
}

function updateOnboardingUi() {
  const items = [
    {
      id: "instrument",
      label: `Choose your instrument${state.activeTuning ? ` (${INSTRUMENTS[state.instrument]?.label || state.instrument} · ${state.activeTuning.label})` : ""}`,
      completed: Boolean(state.instrument && state.activeTuning),
    },
    {
      id: "preview",
      label: "Tap a string note to hear a reference tone",
      completed: Boolean(state.hasPlayedPreview),
    },
    {
      id: "microphone",
      label: state.micPermissionState === "denied"
        ? "Allow microphone access in your browser settings"
        : state.micPermissionState === "granted" || state.isRunning
          ? "Microphone ready"
          : "Press Start and allow microphone access",
      completed: state.micPermissionState === "granted" || state.isRunning,
    },
    {
      id: "target-mode",
      label: state.targetMode === "target"
        ? `Target mode is active${state.targetString ? ` (${state.targetString})` : ""}`
        : "Optional: switch to target mode for a single string",
      completed: state.targetMode === "target",
    },
  ];

  const shouldHidePanel = Boolean(state.onboardingDismissed);
  if (dom.onboardingPanel) {
    dom.onboardingPanel.hidden = shouldHidePanel;
  }

  renderOnboardingChecklist({
    root: dom.onboardingChecklist,
    items,
    dismissed: shouldHidePanel,
  });
}

function dismissOnboarding() {
  state.onboardingDismissed = true;
  saveSetting(STORAGE_KEYS.onboardingDismissed, "1");
  updateOnboardingUi();
  setSetupStatus("Quick-start tips hidden.");
}

function updateTargetNoteSummary() {
  const resolvedTarget = resolveTargetString({
    targetMode: state.targetMode,
    targetString: state.targetString,
    instrumentStrings: state.instrumentStrings,
    frequency: state.engineState.smoothedFrequency,
  });

  dom.targetNoteDisplay.textContent = resolvedTarget ? `Target: ${resolvedTarget.note}` : "Target: Auto";
}

function syncResolvedTuningState() {
  const tuningContext = resolveActiveTuningContext({
    instrumentId: state.instrument,
    tuningId: state.tuningId,
    customTuningsByInstrument: state.customTuningsByInstrument,
    referencePitch: state.referencePitch,
    capoSemitones: state.capoSemitones,
  });

  state.activeTuning = tuningContext.tuning;
  state.availableTunings = tuningContext.availableTunings;
  state.instrumentStrings = tuningContext.instrumentStrings;

  if (tuningContext.resolvedTuningId && tuningContext.resolvedTuningId !== state.tuningId) {
    state.tuningId = tuningContext.resolvedTuningId;
    saveSetting(STORAGE_KEYS.tuning, state.tuningId);
  }

  if (
    state.targetString &&
    !state.instrumentStrings.some(
      (string) => string.note === state.targetString || string.sourceNote === state.targetString
    )
  ) {
    state.targetString = state.instrumentStrings[0]?.sourceNote ?? state.instrumentStrings[0]?.note ?? null;
    saveSetting(STORAGE_KEYS.targetString, state.targetString ?? "");
  }
}

function renderTuningControls() {
  if (dom.tuningSelect) {
    renderTuningOptions({
      tuningSelect: dom.tuningSelect,
      tunings: state.availableTunings,
      selectedTuningId: state.activeTuning?.id ?? null,
    });
  }

  if (dom.tuningSummary) {
    dom.tuningSummary.textContent = state.activeTuning
      ? `${state.activeTuning.kind === "custom" ? "Custom" : "Built-in"} tuning • ${
          state.activeTuning.label
        }${state.activeTuning.description ? ` • ${state.activeTuning.description}` : ""}`
      : "Choose a tuning preset or create your own.";
  }
}

function renderCustomTuningsDialog() {
  if (!dom.tuningsList) return;

  renderCustomTuningsList({
    tuningsList: dom.tuningsList,
    customTunings: state.customTuningsByInstrument[state.instrument] || [],
    selectedTuningId: state.activeTuning?.kind === "custom" ? state.activeTuning.id : null,
    onSelect: (tuningId) => {
      applyTuningSelection(tuningId);
      setSetupStatus("Custom tuning selected.");
    },
    onDelete: (tuningId) => {
      deleteCustomTuning(state.instrument, tuningId);
      state.customTuningsByInstrument = loadCustomTunings();

      if (state.tuningId === tuningId) {
        state.tuningId = null;
      }

      rebuildInstrumentStrings();
      setSetupStatus("Custom tuning deleted.", "warning");
    },
  });
}

function rebuildInstrumentStrings() {
  syncResolvedTuningState();
  renderTuningControls();
  renderCustomTuningsDialog();

  renderStringsList({
    stringsList: dom.stringsList,
    instrumentStrings: state.instrumentStrings,
    currentTargetString: state.targetMode === "target" ? state.targetString : null,
    onPlay: (string) => {
      state.hasPlayedPreview = true;
      updateOnboardingUi();
      playPreview(string.adjustedFreq, INSTRUMENTS[state.instrument].harmonics);
    },
    onSelectTarget: (note) => {
      state.targetMode = "target";
      state.targetString = note;
      dom.targetModeSelect.value = "target";
      saveSettings({
        targetMode: state.targetMode,
        targetString: note,
      });
      rebuildInstrumentStrings();
      updateTargetNoteSummary();
      if (state.isRunning) {
        resetDisplay("Listening... Play the selected target string clearly.");
      }
    },
  });

  updateDerivedControls();
  updateTargetNoteSummary();
  updateOnboardingUi();
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

function applyTuningSelection(tuningId) {
  state.tuningId = tuningId;
  saveSetting(STORAGE_KEYS.tuning, tuningId);
  stopRunningTunerBeforeRebuild();
  rebuildInstrumentStrings();
  resetDisplay("Tuning updated. Press Start to resume.");
}

function applySharedSetupFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const sharedValue = params.get("setup");
  const parsed = parseSharedTuningState(sharedValue);
  const sharedSetup = resolveSharedSetupState(parsed);

  if (!sharedSetup) {
    return;
  }

  if (sharedSetup.customTuning) {
    saveCustomTuning(sharedSetup.customTuning);
    state.customTuningsByInstrument = loadCustomTunings();
  }

  state.instrument = sharedSetup.instrument;
  state.tuningId = sharedSetup.tuningId;
  state.targetMode = sharedSetup.targetMode || DEFAULT_TARGET_MODE;
  state.targetString = sharedSetup.targetString || null;
  state.onboardingDismissed = false;

  saveSettings({
    instrument: state.instrument,
    tuningId: state.tuningId,
    targetMode: state.targetMode,
    targetString: state.targetString,
    onboardingDismissed: false,
  });

  setSetupStatus("Shared setup loaded.");
}

async function shareCurrentSetup() {
  if (!state.activeTuning) {
    setSetupStatus("Choose a tuning before sharing.", "warning");
    return;
  }

  const payload =
    state.activeTuning.kind === "custom"
      ? buildCustomTuningShareState({
          instrumentId: state.instrument,
          tuning: state.activeTuning,
          targetString: state.targetString,
          targetMode: state.targetMode,
        })
      : buildTuningShareState({
          instrumentId: state.instrument,
          tuning: state.activeTuning,
          targetString: state.targetString,
          targetMode: state.targetMode,
        });

  const url = new URL(window.location.href);
  url.searchParams.set("setup", serializeSharedTuningState(payload));

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url.toString());
      setSetupStatus("Share link copied.");
      return;
    }
  } catch {
    // fallback below
  }

  window.prompt("Copy this setup link:", url.toString());
  setSetupStatus("Share link ready.");
}

function resetSetupToDefaults() {
  stopRunningTunerBeforeRebuild();
  const defaults = getDefaultSettings();
  state.instrument = defaults.instrument;
  state.tuningId = defaults.tuningId;
  state.mode = defaults.mode;
  state.reactivity = defaults.reactivity;
  state.noiseGate = defaults.noiseGate;
  state.minClarity = getModePreset(defaults.mode).minClarity ?? DEFAULT_MIN_CLARITY;
  state.referencePitch = defaults.referencePitch;
  state.targetMode = defaults.targetMode;
  state.targetString = defaults.targetString;
  state.hapticEnabled = defaults.hapticEnabled;
  state.capoSemitones = defaults.capoSemitones;

  saveSettings({
    instrument: state.instrument,
    tuningId: state.tuningId,
    mode: state.mode,
    reactivity: state.reactivity,
    noiseGate: state.noiseGate,
    referencePitch: state.referencePitch,
    targetMode: state.targetMode,
    targetString: state.targetString ?? "",
    hapticEnabled: state.hapticEnabled,
    capoSemitones: state.capoSemitones,
    onboardingDismissed: false,
  });

  state.hasPlayedPreview = false;
  state.micPermissionState = "idle";
  state.onboardingDismissed = false;
  rebuildInstrumentStrings();
  resetDisplay("Setup reset. Press Start to begin.");
  setSetupStatus("Defaults restored.");
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
    retargetBiasCents: RETARGET_BIAS_CENTS,
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
    state.micPermissionState = "granted";
    updateOnboardingUi();
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
    state.micPermissionState =
      error.name === "NotAllowedError" || error.name === "SecurityError" ? "denied" : "idle";
    updateOnboardingUi();
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
  state.micPermissionState = state.micPermissionState === "denied" ? "denied" : "granted";
  dom.startBtn.textContent = "Start Tuner";
  dom.startBtn.classList.remove("active");
  dom.startBtn.setAttribute("aria-pressed", "false");
  setErrorHelp("");
  setHintVisible(true);
  resetDisplay("Press Start to begin");
}

function openTuningsDialog() {
  hydrateBaseTuningOptions();
  renderCustomTuningsDialog();
  setNewTuningError("");
  if (dom.tuningsDialog?.showModal) {
    dom.tuningsDialog.showModal();
  }
}

function bindEvents() {
  dom.startBtn.addEventListener("click", startTuner);

  dom.instrumentSelect.addEventListener("change", () => {
    state.instrument = dom.instrumentSelect.value;
    state.tuningId = null;
    saveSettings({
      instrument: state.instrument,
      tuningId: "",
    });
    hydrateBaseTuningOptions();
    rebuildInstrumentStrings();
    resetDisplay();
  });

  if (dom.tuningSelect) {
    dom.tuningSelect.addEventListener("change", () => {
      applyTuningSelection(dom.tuningSelect.value);
    });
  }

  dom.modeSelect.addEventListener("change", (event) => {
    applyMode(event.target.value);
    saveSettings({
      mode: state.mode,
      reactivity: state.reactivity,
      noiseGate: state.noiseGate,
    });
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
    saveSettings({
      targetMode: state.targetMode,
      targetString: state.targetString,
    });
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

  if (dom.manageTuningsBtn) {
    dom.manageTuningsBtn.addEventListener("click", openTuningsDialog);
  }

  if (dom.addTuningBtn) {
    dom.addTuningBtn.addEventListener("click", () => {
      try {
        const instrumentId = dom.newTuningBase?.value || state.instrument;
        const metadata = sanitizeTuningMetadata({
          label: dom.newTuningName?.value,
          description: "",
        });
        const strings = parseTuningStrings(dom.newTuningStrings?.value || "");

        if (!metadata.label) {
          throw new Error("Enter a name for the tuning.");
        }

        const tuning = {
          id: createCustomTuningId(metadata.label),
          instrumentId,
          label: metadata.label,
          description: strings.map((string) => string.note).join(" "),
          strings,
        };

        const saved = saveCustomTuning(tuning);
        if (!saved) {
          throw new Error("Unable to save that tuning. Check the values and try again.");
        }

        state.customTuningsByInstrument = loadCustomTunings();
        state.instrument = instrumentId;
        state.tuningId = tuning.id;
        saveSettings({
          instrument: state.instrument,
          tuningId: state.tuningId,
        });

        if (dom.newTuningName) dom.newTuningName.value = "";
        if (dom.newTuningStrings) dom.newTuningStrings.value = "";
        setNewTuningError("");
        rebuildInstrumentStrings();
        setSetupStatus("Custom tuning saved.");
      } catch (error) {
        setNewTuningError(error.message || "Unable to add tuning.");
      }
    });
  }

  if (dom.dismissOnboardingBtn) {
    dom.dismissOnboardingBtn.addEventListener("click", dismissOnboarding);
  }

  if (dom.shareBtn) {
    dom.shareBtn.addEventListener("click", () => {
      shareCurrentSetup();
    });
  }

  if (dom.resetBtn) {
    dom.resetBtn.addEventListener("click", resetSetupToDefaults);
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
  applySharedSetupFromUrl();
  populateInstrumentOptions();
  hydrateBaseTuningOptions();
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
  updateOnboardingUi();
  setHintVisible(true);
  setErrorHelp("");
  resetDisplay("Press Start to begin");
})();
