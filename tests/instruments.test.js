import { describe, expect, it } from "vitest";
import {
  BUILT_IN_TUNING_PRESETS,
  INSTRUMENTS,
  centsOffFromPitch,
  describeTuningSummary,
  frequencyFromNoteNumber,
  getTuningPreset,
  listInstrumentOptions,
  listTuningPresets,
  noteFromFrequency,
  noteName,
  normalizeCustomTuning,
  resolveTuningSelection,
} from "../instruments.js";

describe("instruments utilities", () => {
  it("maps concert A to midi 69", () => {
    expect(noteFromFrequency(440)).toBe(69);
  });

  it("supports alternative reference pitches", () => {
    expect(noteFromFrequency(442, 442)).toBe(69);
  });

  it("converts midi note numbers to frequencies", () => {
    expect(frequencyFromNoteNumber(69)).toBeCloseTo(440, 5);
    expect(frequencyFromNoteNumber(60)).toBeCloseTo(261.625565, 5);
  });

  it("returns cents offset from the closest pitch", () => {
    expect(centsOffFromPitch(440, 69)).toBe(0);
    expect(centsOffFromPitch(445, 69)).toBeGreaterThan(0);
    expect(centsOffFromPitch(435, 69)).toBeLessThan(0);
  });

  it("formats note names with octaves", () => {
    expect(noteName(69)).toBe("A4");
    expect(noteName(60)).toBe("C4");
    expect(noteName(76)).toBe("E5");
  });

  it("exposes built-in tuning presets for supported instruments", () => {
    expect(BUILT_IN_TUNING_PRESETS.guitar.standard.label).toBe("Standard");
    expect(BUILT_IN_TUNING_PRESETS.guitar.dropD.strings[0]).toMatchObject({ note: "D2" });
    expect(BUILT_IN_TUNING_PRESETS.guitar.openD).toMatchObject({
      id: "openD",
      instrumentId: "guitar",
      label: "Open D",
    });
    expect(BUILT_IN_TUNING_PRESETS.violin.crossA).toMatchObject({
      id: "crossA",
      instrumentId: "violin",
      label: "Cross A",
    });
    expect(BUILT_IN_TUNING_PRESETS.banjo.sawmill).toMatchObject({
      id: "sawmill",
      instrumentId: "banjo",
    });
    expect(getTuningPreset("ukulele", "baritone")).toMatchObject({
      id: "baritone",
      instrumentId: "ukulele",
    });
    expect(getTuningPreset("doubleBass", "standard")).toMatchObject({
      id: "standard",
      instrumentId: "doubleBass",
    });
    expect(getTuningPreset("doubleBass", "standard")?.strings).toHaveLength(4);
    expect(getTuningPreset("doubleBass", "standard")?.strings.slice(0, 2)).toEqual([
      { note: "E1", freq: 41.2 },
      { note: "A1", freq: 55 },
    ]);
  });

  it("lists instrument options with built-in tuning metadata", () => {
    const options = listInstrumentOptions();
    const guitar = options.find((option) => option.id === "guitar");
    const doubleBass = options.find((option) => option.id === "doubleBass");
    const viola = options.find((option) => option.id === "viola");

    expect(guitar).toMatchObject({
      label: INSTRUMENTS.guitar.label,
      tuningCount: expect.any(Number),
      defaultTuningId: "standard",
    });
    expect(guitar.tuningCount).toBeGreaterThan(1);
    expect(doubleBass).toMatchObject({
      label: "Double Bass",
      defaultTuningId: "standard",
    });
    expect(viola).toMatchObject({
      label: "Viola",
      defaultTuningId: "standard",
    });
  });

  it("normalizes custom tunings into a safe persisted shape", () => {
    expect(
      normalizeCustomTuning({
        id: "drop-c",
        instrumentId: "guitar",
        label: "Drop C",
        description: "Heavy tuning",
        strings: [
          { note: "C2", freq: 65.41 },
          { note: "G2", freq: 98 },
          { note: "C3", freq: 130.81 },
          { note: "F3", freq: 174.61 },
          { note: "A3", freq: 220 },
          { note: "D4", freq: 293.66 },
        ],
      })
    ).toMatchObject({
      id: "drop-c",
      instrumentId: "guitar",
      label: "Drop C",
      description: "Heavy tuning",
    });
    expect(
      normalizeCustomTuning({
        id: "drop-c",
        instrumentId: "guitar",
        label: "Drop C",
        description: "Heavy tuning",
        strings: [
          { note: "C2", freq: 65.41 },
          { note: "G2", freq: 98 },
          { note: "C3", freq: 130.81 },
          { note: "F3", freq: 174.61 },
          { note: "A3", freq: 220 },
          { note: "D4", freq: 293.66 },
        ],
      })?.strings
    ).toHaveLength(6);
  });

  it("lists preset and custom tunings together for an instrument", () => {
    const tunings = listTuningPresets("guitar", [
      {
        id: "drop-c",
        instrumentId: "guitar",
        label: "Drop C",
        description: "Heavy tuning",
        strings: [
          { note: "C2", freq: 65.41 },
          { note: "G2", freq: 98 },
          { note: "C3", freq: 130.81 },
          { note: "F3", freq: 174.61 },
          { note: "A3", freq: 220 },
          { note: "D4", freq: 293.66 },
        ],
      },
    ]);
    const dobroTunings = listTuningPresets("dobro");

    expect(tunings[0]).toMatchObject({ id: "standard", kind: "preset" });
    expect(tunings.at(-1)).toMatchObject({ id: "drop-c", kind: "custom" });
    expect(dobroTunings.map((tuning) => tuning.id)).toEqual(["openG", "openD"]);
  });

  it("builds a readable tuning summary", () => {
    expect(
      describeTuningSummary({
        instrumentLabel: "Guitar",
        tuningLabel: "Drop D",
        tuningDescription: "D A D G B E",
      })
    ).toBe("Guitar • Drop D • D A D G B E");
  });

  it("falls back to the instrument default when a persisted tuning is invalid", () => {
    const resolved = resolveTuningSelection({
      instrumentId: "violin",
      tuningId: "baritone",
      customTuningsByInstrument: {},
    });
    const dobroResolved = resolveTuningSelection({
      instrumentId: "dobro",
      tuningId: "missing-open-e",
      customTuningsByInstrument: {},
    });

    expect(resolved.id).toBe("standard");
    expect(resolved.instrumentId).toBe("violin");
    expect(dobroResolved.id).toBe("openG");
    expect(dobroResolved.instrumentId).toBe("dobro");
  });

  it("resolves a matching custom tuning for the selected instrument", () => {
    const resolved = resolveTuningSelection({
      instrumentId: "guitar",
      tuningId: "drop-c",
      customTuningsByInstrument: {
        guitar: [
          {
            id: "drop-c",
            instrumentId: "guitar",
            label: "Drop C",
            description: "Heavy tuning",
            strings: [
              { note: "C2", freq: 65.41 },
              { note: "G2", freq: 98 },
              { note: "C3", freq: 130.81 },
              { note: "F3", freq: 174.61 },
              { note: "A3", freq: 220 },
              { note: "D4", freq: 293.66 },
            ],
          },
        ],
      },
    });

    expect(resolved).toMatchObject({
      id: "drop-c",
      instrumentId: "guitar",
      kind: "custom",
    });
  });
});
