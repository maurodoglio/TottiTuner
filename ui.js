export function setNeedlePosition(needleElement, cents) {
  const clamped = Math.max(-50, Math.min(50, cents));
  const degrees = (clamped / 50) * 85;
  needleElement.style.transform = `rotate(${degrees}deg)`;
}

export function applyNeedleTransition(documentRoot, transitionMs) {
  documentRoot.style.setProperty("--needle-transition-duration", `${transitionMs}ms`);
}

export function resetVisualState({
  noteDisplay,
  freqDisplay,
  centsDisplay,
  tunerStatus,
  tunerMeter,
  clarityDisplay,
  needle,
}) {
  noteDisplay.textContent = "--";
  freqDisplay.textContent = "-- Hz";
  centsDisplay.textContent = "0¢";
  clarityDisplay.textContent = "Signal clarity: --";
  tunerStatus.textContent = "Waiting for sound...";
  tunerStatus.className = "tuner-status idle";
  tunerMeter.className = "tuner-meter idle";
  setNeedlePosition(needle, 0);
}

export function renderPitchDisplay(
  {
    noteDisplay,
    freqDisplay,
    centsDisplay,
    tunerStatus,
    tunerMeter,
    clarityDisplay,
    needle,
  },
  display,
  { targetMode }
) {
  noteDisplay.textContent = display.note;
  freqDisplay.textContent = `${display.frequency.toFixed(1)} Hz`;
  centsDisplay.textContent = `${display.cents >= 0 ? "+" : ""}${display.cents}¢`;
  clarityDisplay.textContent = `Signal clarity: ${Math.round(display.clarity * 100)}%`;
  tunerStatus.textContent =
    targetMode === "target"
      ? `${display.guidance} • Target ${display.targetNote}`
      : display.guidance;
  tunerStatus.className = `tuner-status ${display.status}`;
  tunerMeter.className = `tuner-meter ${display.status}`;
  setNeedlePosition(needle, display.cents);
}

export function renderStatusMessage({ tunerStatus, tunerMeter, clarityDisplay }, message, state = "idle") {
  tunerStatus.textContent = message;
  tunerStatus.className = `tuner-status ${state}`;
  tunerMeter.className = `tuner-meter ${state}`;
  if (state !== "listening") {
    clarityDisplay.textContent = "Signal clarity: --";
  }
}

export function renderStringsList({
  stringsList,
  instrumentStrings,
  currentTargetString,
  onPlay,
  onSelectTarget,
}) {
  stringsList.innerHTML = "";

  instrumentStrings.forEach((string) => {
    const item = document.createElement("li");
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.classList.add("note-button");
    item.dataset.note = string.note;
    item.dataset.midi = String(string.midi);
    if (currentTargetString === string.note) {
      item.classList.add("target-selected");
    }
    item.setAttribute(
      "aria-label",
      `Play ${string.note} at ${string.adjustedFreq.toFixed(2)} Hz or set it as target`
    );
    item.innerHTML = `
      <span class="string-note">${string.note}</span>
      <span class="string-freq">${string.adjustedFreq.toFixed(2)} Hz</span>
      <button class="string-target-btn" type="button" aria-label="Set ${string.note} as target">Target</button>
    `;

    item.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.classList.contains("string-target-btn")) {
        event.stopPropagation();
        onSelectTarget(string.note);
        return;
      }
      onPlay(string);
    });

    item.addEventListener("keydown", (event) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.classList.contains("string-target-btn")
      ) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectTarget(string.note);
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onPlay(string);
      }
      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        onSelectTarget(string.note);
      }
    });

    stringsList.appendChild(item);
  });
}

export function highlightActiveString(stringsList, activeMidi, activeTarget) {
  stringsList.querySelectorAll(".note-button").forEach((item) => {
    item.classList.toggle("active", item.dataset.midi === String(activeMidi));
    item.classList.toggle("target-selected", item.dataset.note === activeTarget);
  });
}
