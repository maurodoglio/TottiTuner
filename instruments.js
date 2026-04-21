import { isValidTuningNoteName } from "./tuning-utils.js";

export const INSTRUMENTS = {
  guitar: {
    label: "Guitar",
    harmonics: [0, 1, 0.5, 0.25, 0.2, 0.1, 0.05, 0.03],
  },
  bass: {
    label: "Bass Guitar",
    harmonics: [0, 1, 0.7, 0.25, 0.1, 0.06, 0.03],
  },
  ukulele: {
    label: "Ukulele",
    harmonics: [0, 1, 0.4, 0.35, 0.25, 0.2, 0.12, 0.06],
  },
  violin: {
    label: "Violin",
    harmonics: [0, 1, 0.5, 0.33, 0.25, 0.2, 0.17, 0.14, 0.12, 0.1],
  },
  cello: {
    label: "Cello",
    harmonics: [0, 1, 0.8, 0.4, 0.2, 0.15, 0.08, 0.05],
  },
  mandolin: {
    label: "Mandolin",
    harmonics: [0, 1, 0.6, 0.4, 0.3, 0.2, 0.15, 0.08],
  },
  banjo: {
    label: "Banjo",
    harmonics: [0, 1, 0.45, 0.28, 0.2, 0.12, 0.08, 0.04],
  },
  tenorGuitar: {
    label: "Tenor Guitar",
    harmonics: [0, 1, 0.55, 0.3, 0.22, 0.12, 0.07, 0.03],
  },
  charango: {
    label: "Charango",
    harmonics: [0, 1, 0.4, 0.34, 0.22, 0.14, 0.08, 0.04],
  },
  viola: {
    label: "Viola",
    harmonics: [0, 1, 0.55, 0.36, 0.24, 0.16, 0.1, 0.06],
  },
  doubleBass: {
    label: "Double Bass",
    harmonics: [0, 1, 0.85, 0.48, 0.26, 0.16, 0.09, 0.05],
  },
  dobro: {
    label: "Dobro / Resonator Guitar",
    harmonics: [0, 1, 0.62, 0.38, 0.28, 0.17, 0.11, 0.07],
  },
};

export const BUILT_IN_TUNING_PRESETS = {
  guitar: {
    standard: {
      id: "standard",
      instrumentId: "guitar",
      label: "Standard",
      description: "E A D G B E",
      strings: [
        { note: "E2", freq: 82.41 },
        { note: "A2", freq: 110.0 },
        { note: "D3", freq: 146.83 },
        { note: "G3", freq: 196.0 },
        { note: "B3", freq: 246.94 },
        { note: "E4", freq: 329.63 },
      ],
    },
    dropD: {
      id: "dropD",
      instrumentId: "guitar",
      label: "Drop D",
      description: "D A D G B E",
      strings: [
        { note: "D2", freq: 73.42 },
        { note: "A2", freq: 110.0 },
        { note: "D3", freq: 146.83 },
        { note: "G3", freq: 196.0 },
        { note: "B3", freq: 246.94 },
        { note: "E4", freq: 329.63 },
      ],
    },
    dadgad: {
      id: "dadgad",
      instrumentId: "guitar",
      label: "DADGAD",
      description: "D A D G A D",
      strings: [
        { note: "D2", freq: 73.42 },
        { note: "A2", freq: 110.0 },
        { note: "D3", freq: 146.83 },
        { note: "G3", freq: 196.0 },
        { note: "A3", freq: 220.0 },
        { note: "D4", freq: 293.66 },
      ],
    },
    openG: {
      id: "openG",
      instrumentId: "guitar",
      label: "Open G",
      description: "D G D G B D",
      strings: [
        { note: "D2", freq: 73.42 },
        { note: "G2", freq: 98.0 },
        { note: "D3", freq: 146.83 },
        { note: "G3", freq: 196.0 },
        { note: "B3", freq: 246.94 },
        { note: "D4", freq: 293.66 },
      ],
    },
    openD: {
      id: "openD",
      instrumentId: "guitar",
      label: "Open D",
      description: "D A D F# A D",
      strings: [
        { note: "D2", freq: 73.42 },
        { note: "A2", freq: 110.0 },
        { note: "D3", freq: 146.83 },
        { note: "F#3", freq: 185.0 },
        { note: "A3", freq: 220.0 },
        { note: "D4", freq: 293.66 },
      ],
    },
  },
  bass: {
    standard: {
      id: "standard",
      instrumentId: "bass",
      label: "Standard",
      description: "E A D G",
      strings: [
        { note: "E1", freq: 41.2 },
        { note: "A1", freq: 55.0 },
        { note: "D2", freq: 73.42 },
        { note: "G2", freq: 98.0 },
      ],
    },
    dropD: {
      id: "dropD",
      instrumentId: "bass",
      label: "Drop D",
      description: "D A D G",
      strings: [
        { note: "D1", freq: 36.71 },
        { note: "A1", freq: 55.0 },
        { note: "D2", freq: 73.42 },
        { note: "G2", freq: 98.0 },
      ],
    },
  },
  ukulele: {
    standard: {
      id: "standard",
      instrumentId: "ukulele",
      label: "Standard",
      description: "G C E A",
      strings: [
        { note: "G4", freq: 392.0 },
        { note: "C4", freq: 261.63 },
        { note: "E4", freq: 329.63 },
        { note: "A4", freq: 440.0 },
      ],
    },
    baritone: {
      id: "baritone",
      instrumentId: "ukulele",
      label: "Baritone",
      description: "D G B E",
      strings: [
        { note: "D3", freq: 146.83 },
        { note: "G3", freq: 196.0 },
        { note: "B3", freq: 246.94 },
        { note: "E4", freq: 329.63 },
      ],
    },
    lowG: {
      id: "lowG",
      instrumentId: "ukulele",
      label: "Low G",
      description: "G C E A (low G)",
      strings: [
        { note: "G3", freq: 196.0 },
        { note: "C4", freq: 261.63 },
        { note: "E4", freq: 329.63 },
        { note: "A4", freq: 440.0 },
      ],
    },
  },
  violin: {
    standard: {
      id: "standard",
      instrumentId: "violin",
      label: "Standard",
      description: "G D A E",
      strings: [
        { note: "G3", freq: 196.0 },
        { note: "D4", freq: 293.66 },
        { note: "A4", freq: 440.0 },
        { note: "E5", freq: 659.25 },
      ],
    },
    crossA: {
      id: "crossA",
      instrumentId: "violin",
      label: "Cross A",
      description: "A E A E",
      strings: [
        { note: "A3", freq: 220.0 },
        { note: "E4", freq: 329.63 },
        { note: "A4", freq: 440.0 },
        { note: "E5", freq: 659.25 },
      ],
    },
  },
  viola: {
    standard: {
      id: "standard",
      instrumentId: "viola",
      label: "Standard",
      description: "C G D A",
      strings: [
        { note: "C3", freq: 130.81 },
        { note: "G3", freq: 196.0 },
        { note: "D4", freq: 293.66 },
        { note: "A4", freq: 440.0 },
      ],
    },
  },
  cello: {
    standard: {
      id: "standard",
      instrumentId: "cello",
      label: "Standard",
      description: "C G D A",
      strings: [
        { note: "C2", freq: 65.41 },
        { note: "G2", freq: 98.0 },
        { note: "D3", freq: 146.83 },
        { note: "A3", freq: 220.0 },
      ],
    },
  },
  mandolin: {
    standard: {
      id: "standard",
      instrumentId: "mandolin",
      label: "Standard",
      description: "G D A E",
      strings: [
        { note: "G3", freq: 196.0 },
        { note: "D4", freq: 293.66 },
        { note: "A4", freq: 440.0 },
        { note: "E5", freq: 659.25 },
      ],
    },
  },
  banjo: {
    standard: {
      id: "standard",
      instrumentId: "banjo",
      label: "Open G",
      description: "g D G B D",
      strings: [
        { note: "G4", freq: 392.0 },
        { note: "D3", freq: 146.83 },
        { note: "G3", freq: 196.0 },
        { note: "B3", freq: 246.94 },
        { note: "D4", freq: 293.66 },
      ],
    },
    doubleC: {
      id: "doubleC",
      instrumentId: "banjo",
      label: "Double C",
      description: "g C G C D",
      strings: [
        { note: "G4", freq: 392.0 },
        { note: "C3", freq: 130.81 },
        { note: "G3", freq: 196.0 },
        { note: "C4", freq: 261.63 },
        { note: "D4", freq: 293.66 },
      ],
    },
    sawmill: {
      id: "sawmill",
      instrumentId: "banjo",
      label: "Sawmill",
      description: "g D G C D",
      strings: [
        { note: "G4", freq: 392.0 },
        { note: "D3", freq: 146.83 },
        { note: "G3", freq: 196.0 },
        { note: "C4", freq: 261.63 },
        { note: "D4", freq: 293.66 },
      ],
    },
  },
  tenorGuitar: {
    standard: {
      id: "standard",
      instrumentId: "tenorGuitar",
      label: "CGDA",
      description: "C G D A",
      strings: [
        { note: "C3", freq: 130.81 },
        { note: "G3", freq: 196.0 },
        { note: "D4", freq: 293.66 },
        { note: "A4", freq: 440.0 },
      ],
    },
    chicago: {
      id: "chicago",
      instrumentId: "tenorGuitar",
      label: "Chicago",
      description: "D G B E",
      strings: [
        { note: "D3", freq: 146.83 },
        { note: "G3", freq: 196.0 },
        { note: "B3", freq: 246.94 },
        { note: "E4", freq: 329.63 },
      ],
    },
  },
  charango: {
    standard: {
      id: "standard",
      instrumentId: "charango",
      label: "Standard",
      description: "G C E A E",
      strings: [
        { note: "G4", freq: 392.0 },
        { note: "C5", freq: 523.25 },
        { note: "E5", freq: 659.25 },
        { note: "A4", freq: 440.0 },
        { note: "E5", freq: 659.25 },
      ],
    },
  },
  doubleBass: {
    standard: {
      id: "standard",
      instrumentId: "doubleBass",
      label: "Standard",
      description: "E A D G",
      strings: [
        { note: "E1", freq: 41.2 },
        { note: "A1", freq: 55.0 },
        { note: "D2", freq: 73.42 },
        { note: "G2", freq: 98.0 },
      ],
    },
    solo: {
      id: "solo",
      instrumentId: "doubleBass",
      label: "Solo Tuning",
      description: "F# B E A",
      strings: [
        { note: "F#1", freq: 46.25 },
        { note: "B1", freq: 61.74 },
        { note: "E2", freq: 82.41 },
        { note: "A2", freq: 110.0 },
      ],
    },
  },
  dobro: {
    openG: {
      id: "openG",
      instrumentId: "dobro",
      label: "Open G",
      description: "G B D G B D",
      strings: [
        { note: "G2", freq: 98.0 },
        { note: "B2", freq: 123.47 },
        { note: "D3", freq: 146.83 },
        { note: "G3", freq: 196.0 },
        { note: "B3", freq: 246.94 },
        { note: "D4", freq: 293.66 },
      ],
    },
    openD: {
      id: "openD",
      instrumentId: "dobro",
      label: "Open D",
      description: "D A D F# A D",
      strings: [
        { note: "D2", freq: 73.42 },
        { note: "A2", freq: 110.0 },
        { note: "D3", freq: 146.83 },
        { note: "F#3", freq: 185.0 },
        { note: "A3", freq: 220.0 },
        { note: "D4", freq: 293.66 },
      ],
    },
  },
};

export const DEFAULT_TUNING_IDS = Object.fromEntries(
  Object.entries(BUILT_IN_TUNING_PRESETS).map(([instrumentId, presets]) => [
    instrumentId,
    Object.keys(presets)[0],
  ])
);

export function getTuningPreset(instrumentId, tuningId = DEFAULT_TUNING_IDS[instrumentId]) {
  const presets = BUILT_IN_TUNING_PRESETS[instrumentId];
  if (!presets) return null;
  const resolvedId = tuningId && presets[tuningId] ? tuningId : DEFAULT_TUNING_IDS[instrumentId];
  const preset = presets[resolvedId];
  return preset ? { ...preset, strings: preset.strings.map((string) => ({ ...string })) } : null;
}

export function listInstrumentOptions() {
  return Object.entries(INSTRUMENTS).map(([id, instrument]) => ({
    id,
    label: instrument.label,
    tuningCount: Object.keys(BUILT_IN_TUNING_PRESETS[id] || {}).length,
    defaultTuningId: DEFAULT_TUNING_IDS[id] ?? null,
  }));
}

export function normalizeCustomTuning(tuning) {
  if (!tuning || typeof tuning !== "object") return null;

  const id = typeof tuning.id === "string" ? tuning.id.trim() : "";
  const instrumentId = typeof tuning.instrumentId === "string" ? tuning.instrumentId.trim() : "";
  const label = typeof tuning.label === "string" ? tuning.label.trim() : "";
  const description = typeof tuning.description === "string" ? tuning.description.trim() : "";
  const strings = Array.isArray(tuning.strings)
    ? tuning.strings
        .map((string) => {
          if (!string || typeof string !== "object") return null;
          const note = typeof string.note === "string" ? string.note.trim() : "";
          const freq = Number(string.freq);
          if (!isValidTuningNoteName(note) || !Number.isFinite(freq) || freq <= 0) return null;
          return { note, freq };
        })
        .filter(Boolean)
    : [];

  if (!id || !instrumentId || !label || strings.length < 2) {
    return null;
  }

  return {
    id,
    instrumentId,
    label,
    description,
    strings,
  };
}

export function listTuningPresets(instrumentId, customTunings = []) {
  const builtIns = Object.values(BUILT_IN_TUNING_PRESETS[instrumentId] || {}).map((preset) => ({
    ...preset,
    kind: "preset",
  }));

  const custom = customTunings
    .map(normalizeCustomTuning)
    .filter(Boolean)
    .filter((tuning) => tuning.instrumentId === instrumentId)
    .map((tuning) => ({
      ...tuning,
      kind: "custom",
    }));

  return [...builtIns, ...custom];
}

export function resolveTuningSelection({ instrumentId, tuningId, customTuningsByInstrument = {} }) {
  const availableTunings = listTuningPresets(
    instrumentId,
    customTuningsByInstrument[instrumentId] || []
  );

  return (
    availableTunings.find((tuning) => tuning.id === tuningId) ||
    availableTunings.find((tuning) => tuning.id === DEFAULT_TUNING_IDS[instrumentId]) ||
    null
  );
}

export function describeTuningSummary({ instrumentLabel, tuningLabel, tuningDescription }) {
  return [instrumentLabel, tuningLabel, tuningDescription].filter(Boolean).join(" • ");
}

export const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function noteFromFrequency(frequency, referencePitch = 440) {
  const noteNum = 12 * Math.log2(frequency / referencePitch);
  return Math.round(noteNum) + 69;
}

export function frequencyFromNoteNumber(note, referencePitch = 440) {
  return referencePitch * Math.pow(2, (note - 69) / 12);
}

export function centsOffFromPitch(frequency, note, referencePitch = 440) {
  return Math.floor(1200 * Math.log2(frequency / frequencyFromNoteNumber(note, referencePitch)));
}

export function noteName(noteNum) {
  const octave = Math.floor(noteNum / 12) - 1;
  const name = NOTE_STRINGS[noteNum % 12];
  return `${name}${octave}`;
}
