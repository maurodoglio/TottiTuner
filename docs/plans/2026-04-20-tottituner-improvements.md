# TottiTuner Improvements Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Improve TottiTuner in priority order by adding tooling/tests, refactoring the app architecture, improving UX and error handling, strengthening pitch stability, and upgrading documentation.

**Architecture:** Keep the project framework-free and build-free at runtime, but introduce lightweight development tooling and a modular ES-module structure. Extract pure logic for pitch analysis, settings, and target-string behavior into testable modules while keeping `index.html` as a static entry point and `tuner.js` as the browser bootstrap.

**Tech Stack:** Vanilla JS, HTML, CSS, Web Audio API, Vitest, ESLint, Prettier.

---

### Task 1: Add project metadata and dev tooling

**Objective:** Create the minimal tooling foundation needed for repeatable tests, linting, and formatting.

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`

**Verification:**
- Run: `npm install`
- Run: `npm run lint`
- Run: `npm run test`
- Expected: tooling commands resolve successfully even before meaningful tests exist.

### Task 2: Add tests for music math utilities

**Objective:** Protect the stable note/frequency math with automated tests before refactoring.

**Files:**
- Create: `tests/instruments.test.js`
- Modify: `instruments.js` only if testability gaps are found

**Verification:**
- Run: `npm run test -- instruments.test.js`
- Expected: note math behavior is covered and passing.

### Task 3: Add tests for pitch analysis utilities

**Objective:** Cover pitch detection and derived analysis behavior with deterministic synthetic sample data.

**Files:**
- Create: `tests/audio.test.js`
- Modify: `audio.js`

**Verification:**
- Run: `npm run test -- audio.test.js`
- Expected: silence rejection, valid pitch detection, and confidence/clarity behavior are covered.

### Task 4: Extract shared app configuration and settings helpers

**Objective:** Move constants and persistence logic out of the main coordinator.

**Files:**
- Create: `config.js`
- Create: `storage.js`
- Create: `tests/storage.test.js`
- Modify: `tuner.js`

**Verification:**
- Run: `npm run test -- storage.test.js`
- Run: `npm run lint`
- Expected: settings defaults, parsing, and persistence helpers are covered.

### Task 5: Extract tuner engine logic into pure/testable modules

**Objective:** Separate analysis, target-string selection, and UI decision logic from DOM wiring.

**Files:**
- Create: `pitch-engine.js`
- Create: `tests/pitch-engine.test.js`
- Modify: `tuner.js`

**Verification:**
- Run: `npm run test -- pitch-engine.test.js`
- Expected: smoothing, hold behavior, confidence filtering, and target-string logic are covered.

### Task 6: Extract UI rendering helpers and note preview playback

**Objective:** Shrink `tuner.js` into a bootstrap/controller by moving display rendering and preview audio into dedicated modules.

**Files:**
- Create: `ui.js`
- Create: `preview.js`
- Modify: `tuner.js`
- Modify: `style.css`

**Verification:**
- Run: `npm run lint`
- Run: `npm run test`
- Expected: module boundaries are clean and the app remains syntax-valid.

### Task 7: Improve microphone/status UX

**Objective:** Make startup, error, and idle states much more explicit and helpful.

**Files:**
- Modify: `index.html`
- Modify: `tuner.js`
- Modify: `ui.js`
- Modify: `style.css`

**Verification:**
- Run: `npm run lint`
- Expected: status messages support idle, listening, weak signal, permission denied, unsupported browser, insecure context, and no-device cases.

### Task 8: Add target-string workflow

**Objective:** Let users tune against a selected target string instead of only nearest-note detection.

**Files:**
- Modify: `index.html`
- Modify: `tuner.js`
- Modify: `ui.js`
- Modify: `style.css`
- Modify: `pitch-engine.js`
- Modify: `tests/pitch-engine.test.js`

**Verification:**
- Run: `npm run test -- pitch-engine.test.js`
- Expected: app supports auto mode and selected-string mode with accurate cents feedback.

### Task 9: Improve pitch stability and confidence gating

**Objective:** Reduce jitter and bad locks by using confidence-aware pitch analysis and note hysteresis.

**Files:**
- Modify: `audio.js`
- Modify: `pitch-engine.js`
- Modify: `tests/audio.test.js`
- Modify: `tests/pitch-engine.test.js`

**Verification:**
- Run: `npm run test`
- Expected: weak/confused detections are rejected or held instead of causing unstable UI jumps.

### Task 10: Upgrade project documentation

**Objective:** Make the repo understandable and contributor-friendly.

**Files:**
- Modify: `README.md`
- Modify: `.github/copilot-instructions.md`

**Verification:**
- Read both docs and confirm they reflect the new architecture, tooling, and features.

### Task 11: Final verification and review

**Objective:** Ensure the full implementation is clean, tested, and reviewable.

**Files:**
- Modify: any files required by lint/test fixes

**Verification:**
- Run: `npm run lint`
- Run: `npm run test`
- Run: `git diff --stat`
- Perform an independent review of the diff.
- Expected: all automated checks pass and review findings are resolved.
