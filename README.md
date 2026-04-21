# TottiTuner

A lightweight browser-based tuner for string instruments, built with vanilla JavaScript and the Web Audio API.

## Features

- Real-time microphone pitch detection
- Instruments included out of the box:
  - Guitar
  - Bass guitar
  - Ukulele
  - Violin
  - Viola
  - Cello
  - Double bass
  - Mandolin
  - Banjo
  - Tenor guitar
  - Dobro / resonator guitar
  - Charango
- Adjustable response modes:
  - Performance
  - Balanced
  - Precision
  - Custom
- Noise gate and reactivity controls
- Reference pitch selection (A4 from 432 Hz to 444 Hz)
- Auto-detect nearest string *or* tune to a selected target string
- Instrument-specific note preview playback
- Signal clarity feedback and held-pitch stability behavior
- localStorage persistence for user preferences
- Built-in alternate tuning presets for guitar, violin, banjo, dobro, double bass, ukulele, and more
- Custom tuning creation, selection, sharing, and reset-to-default flows

## Project structure

- `index.html` – static app shell
- `style.css` – app styles
- `tuner.js` – browser bootstrap/controller
- `audio.js` – pitch analysis and microphone helpers
- `config.js` – shared constants and tuning parameters
- `storage.js` – persisted settings helpers
- `pitch-engine.js` – target-string and display-state logic
- `preview.js` – preview note playback
- `ui.js` – rendering helpers for display and string controls
- `instruments.js` – instrument definitions and note/frequency math
- `tests/` – automated unit tests

## Running locally

Because browsers require a secure context for microphone access, use one of these options:

- `http://localhost:<port>`
- `https://...`

Example:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173
```

## Development

Install dev dependencies:

```bash
npm install
```

Run tests:

```bash
npm run test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Run linting:

```bash
npm run lint
```

Format files:

```bash
npm run format
```

## How tuning works

1. The app requests microphone access.
2. Audio is sampled through a Web Audio `AnalyserNode`.
3. `audio.js` performs autocorrelation-based pitch analysis and reports both frequency and signal clarity.
4. `pitch-engine.js` smooths results, applies hold behavior, and decides what target string / status to show.
5. `ui.js` renders the note, cents offset, signal clarity, meter state, and active string.

## Tuning modes

### Auto detect nearest string
The tuner matches the detected pitch to the closest string for the selected instrument.

### Alternate and custom tunings
Use the tuning preset selector to switch between built-in tunings for the active instrument. You can also create your own custom tunings from the **Manage custom tunings** dialog, then share the current setup or reset the app back to defaults.

### Tune selected target string
Choose a string from the instrument list and switch to target mode. The tuner will keep feedback anchored to that specific string.

## Browser notes

Best experience is expected in modern Chromium, Firefox, and Safari builds with Web Audio and `getUserMedia` support.

If the tuner cannot start, common reasons are:
- microphone permission denied
- no input device available
- insecure context (non-HTTPS remote site)
- unsupported browser

## Roadmap ideas

- Alternate tunings and custom tunings
- Better visual onboarding / first-run help
- More advanced pitch confidence and note-lock strategies
- Browser QA automation once Playwright browsers are installed
