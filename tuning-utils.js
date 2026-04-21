export function parseTuningStrings(value) {
  if (typeof value !== "string") {
    throw new Error("Enter a comma-separated NOTE:HZ list.");
  }

  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    throw new Error("Add at least two strings.");
  }

  return parts.map((part, index) => {
    const match = part.match(/^([A-Ga-g][#b]?\d):\s*([0-9]+(?:\.[0-9]+)?)$/);
    if (!match) {
      throw new Error(`String ${index + 1} must look like NOTE:HZ (example: E2:82.41).`);
    }

    const frequency = Number(match[2]);
    if (!Number.isFinite(frequency) || frequency <= 0) {
      throw new Error(`String ${index + 1} must include a valid frequency.`);
    }

    return {
      note: `${match[1][0].toUpperCase()}${match[1].slice(1)}`,
      freq: frequency,
    };
  });
}

const NOTE_NAME_PATTERN = /^[A-Ga-g][#b]?\d$/;

export function isValidTuningNoteName(value) {
  return typeof value === "string" && NOTE_NAME_PATTERN.test(value.trim());
}

export function sanitizeTuningMetadata({ label, description }) {
  return {
    label: typeof label === "string" ? label.trim() : "",
    description: typeof description === "string" ? description.trim() : "",
  };
}

export function createCustomTuningId(label) {
  const slug = String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tuning";

  return `custom-${slug}-${Date.now().toString(36)}`;
}

export function serializeSharedTuningState(state) {
  return encodeURIComponent(JSON.stringify(state));
}

export function parseSharedTuningState(value) {
  if (typeof value !== "string" || !value) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function buildTuningShareState({ instrumentId, tuning, targetString, targetMode }) {
  return {
    inst: instrumentId,
    tuning: tuning?.kind === "custom" ? "custom" : tuning?.id ?? null,
    mode: targetMode,
    target: targetString,
  };
}

export function buildCustomTuningShareState({ instrumentId, tuning, targetString, targetMode }) {
  return {
    inst: instrumentId,
    tuning: "custom",
    mode: targetMode,
    target: targetString,
    custom: {
      id: tuning.id,
      label: tuning.label,
      description: tuning.description,
      strings: tuning.strings.map((string) => ({ ...string })),
    },
  };
}

export function resolveSharedSetupState(sharedState) {
  if (!sharedState || typeof sharedState !== "object") return null;

  const instrument = typeof sharedState.inst === "string" ? sharedState.inst : null;
  const targetMode = typeof sharedState.mode === "string" ? sharedState.mode : null;
  const targetString = typeof sharedState.target === "string" ? sharedState.target : null;

  if (!instrument) {
    return null;
  }

  if (sharedState.tuning === "custom") {
    const customTuning = sharedState.custom && typeof sharedState.custom === "object"
      ? {
          id: typeof sharedState.custom.id === "string" ? sharedState.custom.id : null,
          instrumentId: instrument,
          label: typeof sharedState.custom.label === "string" ? sharedState.custom.label : "Custom tuning",
          description:
            typeof sharedState.custom.description === "string" ? sharedState.custom.description : "",
          strings: Array.isArray(sharedState.custom.strings)
            ? sharedState.custom.strings
                .map((string) => {
                  if (!string || typeof string !== "object") return null;
                  const note = typeof string.note === "string" ? string.note.trim() : null;
                  const freq = Number(string.freq);
                  if (!isValidTuningNoteName(note) || !Number.isFinite(freq) || freq <= 0) return null;
                  return { note, freq };
                })
                .filter(Boolean)
            : [],
        }
      : null;

    if (!customTuning?.id || customTuning.strings.length < 2) {
      return null;
    }

    return {
      instrument,
      tuningId: customTuning.id,
      targetMode,
      targetString,
      customTuning,
    };
  }

  return {
    instrument,
    tuningId: typeof sharedState.tuning === "string" ? sharedState.tuning : null,
    targetMode,
    targetString,
    customTuning: null,
  };
}
