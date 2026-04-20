# TottiTuner – Copilot Instructions

## Overview

TottiTuner is a vanilla JS/HTML/CSS single-page web app (no runtime framework, no bundler). It uses the Web Audio API to detect pitch via microphone and help tune string instruments.

## Architecture

The app is split into small ES modules:

- **`index.html`** – Static HTML structure. Contains the SVG arc gauge and all interactive controls.
- **`style.css`** – All styles. Uses CSS custom properties on `:root`.
- **`tuner.js`** – Browser bootstrap/controller. Wires DOM, state, audio loop, and persistence together.
- **`audio.js`** – Pitch-analysis helpers. Exports `analyzePitch()`, `autoCorrelate()`, and `getAudioMediaStream()`.
- **`config.js`** – Shared tuning constants, mode presets, storage keys, and mapping helpers.
- **`storage.js`** – Safe localStorage load/save helpers.
- **`pitch-engine.js`** – Pure logic for target resolution, smoothing, hold behavior, and tuning-state classification.
- **`preview.js`** – Instrument note preview playback using Web Audio oscillators and `PeriodicWave` harmonics.
- **`ui.js`** – DOM rendering helpers for the tuner display and string list.
- **`instruments.js`** – Pure instrument data plus note/frequency math.
- **`tests/`** – Vitest unit tests for the pure modules.

## Data flow

1. `getAudioMediaStream()` requests microphone input.
2. `tuner.js` feeds the stream into a Web Audio `AnalyserNode`.
3. `processAudio()` samples a `Float32Array` buffer and passes it to `analyzePitch()`.
4. `advancePitchState()` decides whether to update, hold, or clear the current display.
5. `ui.js` updates the note display, cents readout, signal clarity, meter state, and string highlighting.

## Key conventions

- **No build step in production** – open `index.html` directly or serve it from any static file server. Microphone support still requires HTTPS or localhost.
- **Development tooling exists** – use `npm install`, `npm run test`, and `npm run lint`.
- **Reference pitch** – instrument frequencies are defined at A4=440 and scaled for the selected reference pitch.
- **Target modes** – `auto` locks to the nearest string; `target` anchors feedback to the selected string.
- **Signal clarity** – `audio.js` returns both `frequency` and `clarity`; weak/unclear detections should not drive UI updates.
- **Hold behavior** – pitch display persists briefly after signal loss to prevent flicker.
- **Note preview** – clicking a string plays an instrument-shaped preview tone via `PeriodicWave`, not a plain sine wave.
- **Persistence** – user settings are stored under `tottiTuner_*` keys defined in `config.js`.

## Adding a new instrument

Add an entry to `INSTRUMENTS` in `instruments.js`:

```js
myInstrument: {
  label: "Display Name",
  harmonics: [0, 1, 0.5, 0.2],
  strings: [
    { note: "A2", freq: 110.0 },
    { note: "D3", freq: 146.83 },
  ],
}
```

The selector, target-string controls, and string buttons are rendered dynamically from this data.

## Quality bar

- Keep pure logic in testable modules.
- Add or update Vitest tests when changing math, pitch behavior, or persistence logic.
- Prefer small modules over growing `tuner.js`.
- Run `npm run lint && npm run test` after non-trivial changes.
