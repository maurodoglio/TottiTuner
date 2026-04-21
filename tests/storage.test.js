import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteCustomTuning,
  getDefaultSettings,
  loadCustomTunings,
  loadSettings,
  saveCustomTuning,
  saveSetting,
  saveSettings,
} from "../storage.js";
import { STORAGE_KEYS } from "../config.js";

describe("storage helpers", () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
        setItem: vi.fn((key, value) => store.set(key, String(value))),
      },
    });
  });

  it("loads defaults when storage is empty", () => {
    expect(loadSettings()).toMatchObject(getDefaultSettings());
  });

  it("falls back to default settings for reset behavior", () => {
    const defaults = getDefaultSettings();

    expect(defaults).toMatchObject({
      instrument: "guitar",
      tuningId: "standard",
      mode: "balanced",
      referencePitch: 440,
      targetMode: "auto",
      hapticEnabled: true,
      capoSemitones: 0,
      onboardingDismissed: false,
    });
  });

  it("parses persisted settings", () => {
    window.localStorage.setItem(STORAGE_KEYS.instrument, "violin");
    window.localStorage.setItem(STORAGE_KEYS.tuning, "baritone");
    window.localStorage.setItem(STORAGE_KEYS.mode, "custom");
    window.localStorage.setItem(STORAGE_KEYS.reactivity, "88");
    window.localStorage.setItem(STORAGE_KEYS.noiseGate, "33");
    window.localStorage.setItem(STORAGE_KEYS.referencePitch, "442");
    window.localStorage.setItem(STORAGE_KEYS.targetMode, "target");
    window.localStorage.setItem(STORAGE_KEYS.targetString, "A4");
    window.localStorage.setItem(STORAGE_KEYS.haptic, "0");
    window.localStorage.setItem(STORAGE_KEYS.capo, "2");
    window.localStorage.setItem(STORAGE_KEYS.theme, "light");
    window.localStorage.setItem(STORAGE_KEYS.onboardingDismissed, "1");

    expect(loadSettings()).toMatchObject({
      instrument: "violin",
      tuningId: "baritone",
      mode: "custom",
      reactivity: 88,
      noiseGate: 33,
      referencePitch: 442,
      targetMode: "target",
      targetString: "A4",
      hapticEnabled: false,
      capoSemitones: 2,
      theme: "light",
      onboardingDismissed: true,
    });
  });

  it("writes single settings and bulk settings", () => {
    saveSetting(STORAGE_KEYS.instrument, "cello");
    saveSettings({
      tuningId: "dropD",
      mode: "precision",
      targetMode: "target",
      targetString: "G3",
      capoSemitones: 3,
      hapticEnabled: false,
      onboardingDismissed: true,
    });

    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.instrument, "cello");
    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.tuning, "dropD");
    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.mode, "precision");
    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.targetMode, "target");
    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.targetString, "G3");
    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.capo, "3");
    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.haptic, "0");
    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.onboardingDismissed, "1");
  });

  it("clears stored values when bulk settings pass nullish fields", () => {
    saveSettings({
      targetString: "A4",
      tuningId: "dropD",
    });
    saveSettings({
      targetString: null,
      tuningId: "",
    });

    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.targetString, "");
    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.tuning, "");
  });

  it("returns null when custom tuning payload is invalid", () => {
    expect(
      saveCustomTuning({
        id: "bad-tuning",
        instrumentId: "guitar",
        label: "Bad",
        strings: [{ note: "E2", freq: 82.41 }],
      })
    ).toBe(false);
  });

  it("loads and persists custom tunings safely", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.customTunings,
      JSON.stringify({
        guitar: [
          {
            id: "drop-c",
            instrumentId: "guitar",
            label: "Drop C",
            description: "Heavy",
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
      })
    );

    const tunings = loadCustomTunings();
    expect(tunings.guitar[0]).toMatchObject({
      id: "drop-c",
      instrumentId: "guitar",
      label: "Drop C",
    });

    saveCustomTuning({
      id: "open-g",
      instrumentId: "guitar",
      label: "Open G",
      description: "Slide",
      strings: [
        { note: "D2", freq: 73.42 },
        { note: "G2", freq: 98 },
        { note: "D3", freq: 146.83 },
        { note: "G3", freq: 196 },
        { note: "B3", freq: 246.94 },
        { note: "D4", freq: 293.66 },
      ],
    });

    const savedPayload = JSON.parse(
      window.localStorage.setItem.mock.calls.filter(([key]) => key === STORAGE_KEYS.customTunings).at(-1)[1]
    );
    expect(savedPayload.guitar).toHaveLength(2);
    expect(savedPayload.guitar[1]).toMatchObject({ id: "open-g", label: "Open G" });
  });

  it("deletes a custom tuning by instrument and id", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.customTunings,
      JSON.stringify({
        guitar: [
          {
            id: "drop-d",
            instrumentId: "guitar",
            label: "Drop D",
            strings: [
              { note: "D2", freq: 73.42 },
              { note: "A2", freq: 110 },
              { note: "D3", freq: 146.83 },
              { note: "G3", freq: 196 },
              { note: "B3", freq: 246.94 },
              { note: "E4", freq: 329.63 },
            ],
          },
        ],
      })
    );

    deleteCustomTuning("guitar", "drop-d");

    const savedPayload = JSON.parse(
      window.localStorage.setItem.mock.calls.at(-1)[1]
    );
    expect(savedPayload.guitar).toEqual([]);
  });
});
