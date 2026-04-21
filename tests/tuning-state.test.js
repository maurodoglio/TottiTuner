import { describe, expect, it } from "vitest";
import { resolveActiveTuningContext } from "../tuning-state.js";

describe("resolveActiveTuningContext", () => {
  it("falls back to the instrument default tuning when the selected tuning id is invalid", () => {
    const context = resolveActiveTuningContext({
      instrumentId: "violin",
      tuningId: "baritone",
      customTuningsByInstrument: {},
      referencePitch: 440,
      capoSemitones: 0,
    });

    expect(context.tuning).toMatchObject({
      id: "standard",
      instrumentId: "violin",
      label: "Standard",
    });
    expect(context.instrumentStrings.map((string) => string.note)).toEqual(["G3", "D4", "A4", "E5"]);
  });

  it("builds capo-adjusted instrument strings from the selected built-in tuning preset", () => {
    const context = resolveActiveTuningContext({
      instrumentId: "guitar",
      tuningId: "dropD",
      customTuningsByInstrument: {},
      referencePitch: 440,
      capoSemitones: 2,
    });

    expect(context.tuning).toMatchObject({ id: "dropD", label: "Drop D" });
    expect(context.instrumentStrings[0]).toMatchObject({
      note: "E2",
      sourceNote: "D2",
    });
    expect(context.instrumentStrings).toHaveLength(6);
  });

  it("resolves a selected custom tuning and exposes a readable summary", () => {
    const context = resolveActiveTuningContext({
      instrumentId: "guitar",
      tuningId: "drop-c",
      customTuningsByInstrument: {
        guitar: [
          {
            id: "drop-c",
            instrumentId: "guitar",
            label: "Drop C",
            description: "Heavy rhythm",
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
      referencePitch: 440,
      capoSemitones: 0,
    });

    expect(context.tuning).toMatchObject({
      id: "drop-c",
      kind: "custom",
      label: "Drop C",
    });
    expect(context.summary).toBe("Guitar • Drop C • Heavy rhythm");
    expect(context.instrumentStrings.map((string) => string.sourceNote)).toEqual([
      "C2",
      "G2",
      "C3",
      "F3",
      "A3",
      "D4",
    ]);
  });

  it("returns the available tunings and the resolved tuning id for UI selection", () => {
    const context = resolveActiveTuningContext({
      instrumentId: "guitar",
      tuningId: "missing-tuning",
      customTuningsByInstrument: {
        guitar: [
          {
            id: "drop-c",
            instrumentId: "guitar",
            label: "Drop C",
            description: "Heavy rhythm",
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
      referencePitch: 440,
      capoSemitones: 0,
    });

    expect(context.resolvedTuningId).toBe("standard");
    expect(context.availableTunings.some((tuning) => tuning.id === "drop-c")).toBe(true);
    expect(context.availableTunings.some((tuning) => tuning.id === "standard")).toBe(true);
  });
});
