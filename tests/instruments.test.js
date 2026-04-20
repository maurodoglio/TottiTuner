import { describe, expect, it } from "vitest";
import {
  centsOffFromPitch,
  frequencyFromNoteNumber,
  noteFromFrequency,
  noteName,
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
});
