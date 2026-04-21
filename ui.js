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

export function renderTuningOptions({ tuningSelect, tunings, selectedTuningId }) {
  tuningSelect.innerHTML = "";

  const groups = [
    { label: "Built-in tunings", items: tunings.filter((tuning) => tuning.kind !== "custom") },
    { label: "Custom tunings", items: tunings.filter((tuning) => tuning.kind === "custom") },
  ];

  groups.forEach((group) => {
    if (!group.items.length) return;
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;

    group.items.forEach((tuning) => {
      const option = document.createElement("option");
      option.value = tuning.id;
      option.textContent = tuning.description ? `${tuning.label} — ${tuning.description}` : tuning.label;
      option.selected = tuning.id === selectedTuningId;
      optgroup.appendChild(option);
    });

    tuningSelect.appendChild(optgroup);
  });

  if (!tuningSelect.value && tuningSelect.options.length) {
    tuningSelect.value = tuningSelect.options[0].value;
  }
}

export function renderCustomTuningsList({
  tuningsList,
  customTunings,
  selectedTuningId,
  onSelect,
  onDelete,
}) {
  tuningsList.innerHTML = "";

  customTunings.forEach((tuning) => {
    const row = document.createElement("div");
    row.className = "tuning-row";

    const info = document.createElement("div");
    info.className = "tuning-info";

    const name = document.createElement("div");
    name.className = "tuning-name";
    name.textContent = tuning.label;

    const meta = document.createElement("div");
    meta.className = "tuning-meta";
    meta.textContent = tuning.description || tuning.strings.map((string) => string.note).join(" · ");

    info.append(name, meta);

    if (tuning.id === selectedTuningId) {
      const selected = document.createElement("div");
      selected.className = "tuning-meta";
      selected.textContent = "Currently selected";
      info.appendChild(selected);
    }

    const useButton = document.createElement("button");
    useButton.type = "button";
    useButton.textContent = tuning.id === selectedTuningId ? "Use again" : "Use";
    useButton.addEventListener("click", () => onSelect(tuning.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => onDelete(tuning.id));

    row.append(info, useButton, deleteButton);
    tuningsList.appendChild(row);
  });
}

export function renderOnboardingChecklist({ root, items, dismissed = false }) {
  if (!root) return;

  root.innerHTML = "";
  root.hidden = dismissed;

  if (dismissed) {
    return;
  }

  const list = document.createElement("ul");
  list.className = "onboarding-checklist-list";

  items.forEach((item) => {
    const entry = document.createElement("li");
    entry.dataset.completed = item.completed ? "true" : "false";
    entry.className = item.completed ? "is-complete" : "is-pending";
    entry.textContent = item.label;
    list.appendChild(entry);
  });

  root.appendChild(list);
}

export function syncSelectValue(selectElement, value) {
  if (!selectElement) return;
  selectElement.value = value ?? "";
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
    item.dataset.note = string.sourceNote ?? string.note;
    item.dataset.displayNote = string.note;
    item.dataset.midi = String(string.midi);
    if (currentTargetString === (string.sourceNote ?? string.note)) {
      item.classList.add("target-selected");
    }
    item.setAttribute(
      "aria-label",
      `Play ${string.note} at ${string.adjustedFreq.toFixed(2)} Hz or set it as target`
    );

    const note = document.createElement("span");
    note.className = "string-note";
    note.textContent = string.note;

    const frequency = document.createElement("span");
    frequency.className = "string-freq";
    frequency.textContent = `${string.adjustedFreq.toFixed(2)} Hz`;

    const targetButton = document.createElement("button");
    targetButton.className = "string-target-btn";
    targetButton.type = "button";
    targetButton.setAttribute("aria-label", `Set ${string.note} as target`);
    targetButton.textContent = "Target";

    item.append(note, frequency, targetButton);

    item.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.classList.contains("string-target-btn")) {
        event.stopPropagation();
        onSelectTarget(string.sourceNote ?? string.note);
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
          onSelectTarget(string.sourceNote ?? string.note);
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onPlay(string);
      }
      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        onSelectTarget(string.sourceNote ?? string.note);
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
