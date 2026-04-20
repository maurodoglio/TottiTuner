import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSettings, saveSetting, saveSettings } from "../storage.js";
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
    expect(loadSettings()).toMatchObject({
      instrument: "guitar",
      mode: "balanced",
      reactivity: 60,
      noiseGate: 50,
      referencePitch: 440,
      targetMode: "auto",
      targetString: null,
      hapticEnabled: true,
      capoSemitones: 0,
      theme: null,
    });
  });

  it("parses persisted settings", () => {
    window.localStorage.setItem(STORAGE_KEYS.instrument, "violin");
    window.localStorage.setItem(STORAGE_KEYS.mode, "custom");
    window.localStorage.setItem(STORAGE_KEYS.reactivity, "88");
    window.localStorage.setItem(STORAGE_KEYS.noiseGate, "33");
    window.localStorage.setItem(STORAGE_KEYS.referencePitch, "442");
    window.localStorage.setItem(STORAGE_KEYS.targetMode, "target");
    window.localStorage.setItem(STORAGE_KEYS.targetString, "A4");
    window.localStorage.setItem(STORAGE_KEYS.haptic, "0");
    window.localStorage.setItem(STORAGE_KEYS.capo, "2");
    window.localStorage.setItem(STORAGE_KEYS.theme, "light");

    expect(loadSettings()).toMatchObject({
      instrument: "violin",
      mode: "custom",
      reactivity: 88,
      noiseGate: 33,
      referencePitch: 442,
      targetMode: "target",
      targetString: "A4",
      hapticEnabled: false,
      capoSemitones: 2,
      theme: "light",
    });
  });

  it("writes single settings and bulk settings", () => {
    saveSetting(STORAGE_KEYS.instrument, "cello");
    saveSettings({
      mode: "precision",
      targetMode: "target",
      targetString: "G3",
    });

    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.instrument, "cello");
    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.mode, "precision");
    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.targetMode, "target");
    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.targetString, "G3");
  });
});
