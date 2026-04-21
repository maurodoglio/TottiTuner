import { describe, expect, it } from "vitest";
import { resolveActiveTuningContext } from "../tuning-state.js";
import {
  advancePitchState,
  buildInstrumentStrings,
  classifyTuning,
  findNearestString,
  resolveTargetString,
  smoothFrequency,
} from "../pitch-engine.js";

const STABILITY_OPTIONS = {
  referencePitch: 440,
  holdMs: 280,
  smoothingAlpha: 1,
  targetMode: "auto",
  targetString: null,
  minClarity: 0.82,
  noteLockCents: 18,
  noteReleaseCents: 28,
  retargetBiasCents: 10,
};

describe("pitch engine utilities", () => {
  const instrumentStrings = buildInstrumentStrings(
    [
      { note: "E2", freq: 82.41 },
      { note: "A2", freq: 110.0 },
      { note: "D3", freq: 146.83 },
    ],
    440
  );

  it("scales instrument strings with midi metadata", () => {
    expect(instrumentStrings[0]).toMatchObject({
      note: "E2",
      sourceNote: "E2",
      adjustedFreq: 82.41,
    });
    expect(instrumentStrings[0].midi).toBeTypeOf("number");
  });

  it("applies capo transposition while preserving the original source note", () => {
    const capoStrings = buildInstrumentStrings(
      [
        { note: "E2", freq: 82.41 },
        { note: "A2", freq: 110.0 },
      ],
      440,
      2
    );

    expect(capoStrings[0]).toMatchObject({
      note: "F#2",
      sourceNote: "E2",
    });
    expect(capoStrings[0].adjustedFreq).toBeGreaterThan(92);
  });

  it("finds the nearest string for a detected pitch", () => {
    expect(findNearestString(109.6, instrumentStrings)?.note).toBe("A2");
  });

  it("resolves a selected target string in target mode", () => {
    const target = resolveTargetString({
      targetMode: "target",
      targetString: "D3",
      instrumentStrings,
      frequency: 110,
    });

    expect(target?.note).toBe("D3");
  });

  it("smooths the detected frequency with an alpha factor", () => {
    expect(smoothFrequency(null, 440, 0.5)).toBe(440);
    expect(smoothFrequency(430, 440, 0.5)).toBe(435);
  });

  it("classifies tuning states from cents", () => {
    expect(classifyTuning(2)).toBe("in-tune");
    expect(classifyTuning(10)).toBe("slightly-off");
    expect(classifyTuning(25)).toBe("out-of-tune");
  });
});

describe("advancePitchState", () => {
  const instrumentStrings = buildInstrumentStrings(
    [
      { note: "E2", freq: 82.41 },
      { note: "A2", freq: 110.0 },
      { note: "D3", freq: 146.83 },
    ],
    440
  );

  it("creates display data from a confident pitch", () => {
    const result = advancePitchState(
      {
        smoothedFrequency: null,
        lastStableTime: 0,
        display: null,
        lockedTargetNote: null,
      },
      { frequency: 110.3, clarity: 0.93 },
      {
        timestamp: 1000,
        referencePitch: 440,
        holdMs: 280,
        smoothingAlpha: 0.4,
        targetMode: "auto",
        targetString: null,
        instrumentStrings,
        minClarity: 0.82,
        noteLockCents: 18,
        noteReleaseCents: 28,
      }
    );

    expect(result.display).toMatchObject({
      targetNote: "A2",
      status: "in-tune",
      guidance: "In Tune ✓",
    });
    expect(result.smoothedFrequency).toBeGreaterThan(110);
  });

  it("holds the last display when the signal drops briefly", () => {
    const previous = advancePitchState(
      {
        smoothedFrequency: null,
        lastStableTime: 0,
        display: null,
        lockedTargetNote: null,
      },
      { frequency: 110.3, clarity: 0.93 },
      {
        timestamp: 1000,
        referencePitch: 440,
        holdMs: 280,
        smoothingAlpha: 0.4,
        targetMode: "auto",
        targetString: null,
        instrumentStrings,
        minClarity: 0.82,
        noteLockCents: 18,
        noteReleaseCents: 28,
      }
    );

    const held = advancePitchState(
      previous,
      { frequency: null, clarity: 0.1 },
      {
        timestamp: 1100,
        referencePitch: 440,
        holdMs: 280,
        smoothingAlpha: 0.4,
        targetMode: "auto",
        targetString: null,
        instrumentStrings,
        minClarity: 0.82,
        noteLockCents: 18,
        noteReleaseCents: 28,
      }
    );

    expect(held.display).toEqual(previous.display);
  });

  it("resets after the hold window expires", () => {
    const previous = {
      smoothedFrequency: 110,
      lastStableTime: 1000,
      lockedTargetNote: "A2",
      display: { targetNote: "A2" },
    };

    const reset = advancePitchState(
      previous,
      { frequency: null, clarity: 0.1 },
      {
        timestamp: 1400,
        referencePitch: 440,
        holdMs: 280,
        smoothingAlpha: 0.4,
        targetMode: "auto",
        targetString: null,
        instrumentStrings,
        minClarity: 0.82,
        noteLockCents: 18,
        noteReleaseCents: 28,
      }
    );

    expect(reset.display).toBeNull();
    expect(reset.lockedTargetNote).toBeNull();
  });

  it("respects target-string mode even when another string is closer", () => {
    const result = advancePitchState(
      {
        smoothedFrequency: null,
        lastStableTime: 0,
        display: null,
        lockedTargetNote: null,
      },
      { frequency: 111, clarity: 0.93 },
      {
        timestamp: 1000,
        referencePitch: 440,
        holdMs: 280,
        smoothingAlpha: 0.4,
        targetMode: "target",
        targetString: "D3",
        instrumentStrings,
        minClarity: 0.82,
        noteLockCents: 18,
        noteReleaseCents: 28,
      }
    );

    expect(result.display).toMatchObject({
      targetNote: "D3",
      guidance: "Flat ↓",
    });
  });

  it("keeps auto-mode labels and cents aligned with the locked target string", () => {
    const result = advancePitchState(
      {
        smoothedFrequency: null,
        lastStableTime: 0,
        display: null,
        lockedTargetNote: "A2",
      },
      { frequency: 116.5, clarity: 0.93 },
      {
        timestamp: 1000,
        referencePitch: 440,
        holdMs: 280,
        smoothingAlpha: 1,
        targetMode: "auto",
        targetString: null,
        instrumentStrings,
        minClarity: 0.82,
        noteLockCents: 18,
        noteReleaseCents: 28,
      }
    );

    expect(result.display).toMatchObject({
      note: "A#2",
      targetNote: "A2",
      guidance: "Sharp ↑",
      status: "out-of-tune",
    });
    expect(result.display.cents).toBeGreaterThan(15);
  });

  it("rejects pitches below the clarity threshold and preserves the held display", () => {
    const previous = advancePitchState(
      {
        smoothedFrequency: null,
        lastStableTime: 0,
        display: null,
        lockedTargetNote: null,
      },
      { frequency: 110.3, clarity: 0.93 },
      {
        timestamp: 1000,
        referencePitch: 440,
        holdMs: 280,
        smoothingAlpha: 0.4,
        targetMode: "auto",
        targetString: null,
        instrumentStrings,
        minClarity: 0.82,
        noteLockCents: 18,
        noteReleaseCents: 28,
      }
    );

    const held = advancePitchState(
      previous,
      { frequency: 146.83, clarity: 0.2 },
      {
        timestamp: 1080,
        referencePitch: 440,
        holdMs: 280,
        smoothingAlpha: 0.4,
        targetMode: "auto",
        targetString: null,
        instrumentStrings,
        minClarity: 0.82,
        noteLockCents: 18,
        noteReleaseCents: 28,
      }
    );

    expect(held.display).toEqual(previous.display);
  });

  it("resolves active tuning context into pitch-engine compatible strings", () => {
    const context = resolveActiveTuningContext({
      instrumentId: "guitar",
      tuningId: "dropD",
      customTuningsByInstrument: {},
      referencePitch: 440,
      capoSemitones: 2,
    });

    const result = advancePitchState(
      {
        smoothedFrequency: null,
        lastStableTime: 0,
        display: null,
        lockedTargetNote: null,
      },
      { frequency: context.instrumentStrings[0].adjustedFreq, clarity: 0.95 },
      {
        timestamp: 1000,
        referencePitch: 440,
        holdMs: 280,
        smoothingAlpha: 1,
        targetMode: "target",
        targetString: context.instrumentStrings[0].sourceNote,
        instrumentStrings: context.instrumentStrings,
        minClarity: 0.82,
        noteLockCents: 18,
        noteReleaseCents: 28,
        retargetBiasCents: 10,
      }
    );

    expect(result.display).toMatchObject({
      targetNote: context.instrumentStrings[0].note,
      status: "in-tune",
      note: context.instrumentStrings[0].note,
    });
  });

  it("keeps the locked target when a neighboring note is only marginally closer", () => {
    const closeStrings = buildInstrumentStrings(
      [
        { note: "C4", freq: 261.63 },
        { note: "C#4", freq: 277.18 },
      ],
      440
    );

    const jittered = advancePitchState(
      {
        smoothedFrequency: 261.63,
        lastStableTime: 1000,
        display: {
          note: "C4",
          targetNote: "C4",
          frequency: 261.63,
          cents: 0,
          status: "in-tune",
          guidance: "In Tune ✓",
          clarity: 0.95,
          activeMidi: closeStrings[0].midi,
        },
        lockedTargetNote: "C4",
      },
      { frequency: 269.5, clarity: 0.95 },
      {
        ...STABILITY_OPTIONS,
        timestamp: 1080,
        instrumentStrings: closeStrings,
      }
    );

    expect(jittered.lockedTargetNote).toBe("C4");
    expect(jittered.display?.targetNote).toBe("C4");
  });
});
