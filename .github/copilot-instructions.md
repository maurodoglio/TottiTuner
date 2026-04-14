# TottiTuner – Copilot Instructions

## Overview

TottiTuner is a vanilla JS/HTML/CSS single-page web app (no framework, no build system, no npm). It uses the Web Audio API to detect pitch via microphone and help tune string instruments.

## Architecture

Five files, no bundler. `tuner.js` is an ES module and imports from `instruments.js` and `audio.js`:

- **`index.html`** – Static HTML structure. Contains an inline SVG arc gauge for the needle. All interactive elements have `id` attributes that `tuner.js` targets directly. Loaded with `<script type="module" src="tuner.js">`.
- **`instruments.js`** – Pure data and music math. Exports `INSTRUMENTS` (instrument definitions at A4=440), `NOTE_STRINGS`, and the functions `noteFromFrequency`, `frequencyFromNoteNumber`, `centsOffFromPitch`, `noteName`. All math functions accept an optional `referencePitch` parameter (default 440).
- **`audio.js`** – Web Audio utilities. Exports `autoCorrelate` (pitch detection), `getAudioMediaStream`, and `AUTOCORRELATE_EDGE_THRESHOLD`.
- **`tuner.js`** – App coordinator. All state management, UI logic, event listeners, and localStorage persistence.
- **`style.css`** – All styles. Uses CSS custom properties defined on `:root`.

### Data flow

1. `getAudioMediaStream()` requests mic → feeds a `MediaStreamSource` into a Web Audio `AnalyserNode`
2. `processAudio()` runs each animation frame (throttled by `getSampleIntervalMs()`); reads `Float32Array` from the analyser and calls `autoCorrelate()` for pitch detection
3. Detected frequency is smoothed with an exponential moving average (`smoothedFrequency += (freq - smoothedFrequency) * alpha`) then passed to `updateTunerUI()`
4. `updateTunerUI()` applies CSS classes (`in-tune`, `slightly-off`, `out-of-tune`) to both `#tuner-meter` and `#tuner-status`, calls `setNeedle(cents)`, and calls `highlightActiveString()` to mark the matching string button

### Adding a new instrument

Add an entry to the `INSTRUMENTS` object in `instruments.js`. Frequencies should be at A4=440 — `scaledFreq()` in `tuner.js` adjusts them for other reference pitches automatically:

```js
myInstrument: {
  label: "Display Name",
  strings: [
    { note: "A2", freq: 110.0 },
    // ...
  ],
},
```

No other changes needed — the selector and string buttons are rendered dynamically from `INSTRUMENTS`.

## Key conventions

- **No build step** – open `index.html` directly in a browser, or serve with any static file server. `getUserMedia` requires HTTPS or localhost.
- **Reference pitch** – All `INSTRUMENTS` frequencies are defined at A4=440. `scaledFreq(baseFreq)` multiplies by `referencePitch / 440` before displaying or previewing. All note math functions (`noteFromFrequency`, `centsOffFromPitch`) take `referencePitch` as a second argument.
- **Active string highlighting** – Each string `<li>` gets `data-midi` set to the MIDI note number on render. `highlightActiveString(noteNum, cents)` toggles `.active` on whichever button's `data-midi` matches and `|cents| ≤ 15`.
- **CSS custom properties for theming** – colors (`--accent`, `--green`, `--yellow`, `--muted`, etc.) and `--needle-transition-duration` are all in `:root`. JS dynamically sets `--needle-transition-duration` via `document.documentElement.style.setProperty(...)` to control needle speed.
- **`mapRange(value, inMin, inMax, outMin, outMax)`** – utility used throughout to convert 1–100 slider values into physical parameters (RMS threshold, smoothing alpha, sample interval, needle transition ms).
- **Mode presets** – `MODE_PRESETS` maps named modes to `{ reactivity, noiseGate }` pairs. Adjusting either slider manually switches mode to `"custom"`.
- **localStorage** – User preferences (instrument, mode, reactivity, noiseGate, referencePitch) are persisted under keys namespaced as `tottiTuner_*` (see `STORAGE_KEYS`). Restored in the `init()` IIFE at the bottom of `tuner.js`.
- **`aria-pressed`** – The start/stop button's `aria-pressed` attribute is toggled between `"true"` and `"false"` in `startTuner()` and `stopTuner()`.
- **Pitch hold** – When no valid pitch is detected, the display holds for `PITCH_HOLD_MS` (280 ms) before resetting, preventing flicker.
- **Note preview** – Clicking a string button plays a sine wave at the reference-pitch-adjusted frequency via a separate `previewAudioContext`.
- **Tuning accuracy thresholds**: ≤5¢ = in-tune (green), ≤15¢ = slightly-off (yellow), >15¢ = out-of-tune (red).

