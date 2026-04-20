import { describe, expect, it } from "vitest";
import { analyzePitch, autoCorrelate } from "../audio.js";

function createSineBuffer(frequency, sampleRate, size, amplitude = 0.9) {
  return Float32Array.from({ length: size }, (_, index) => {
    const time = index / sampleRate;
    return Math.sin(2 * Math.PI * frequency * time) * amplitude;
  });
}

function createMixedBuffer(frequencies, sampleRate, size, amplitude = 0.5) {
  return Float32Array.from({ length: size }, (_, index) => {
    const time = index / sampleRate;
    return frequencies.reduce(
      (sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * time) * amplitude,
      0
    );
  });
}

describe("audio pitch analysis", () => {
  const sampleRate = 44100;
  const size = 2048;

  it("returns null analysis for silence", () => {
    const result = analyzePitch(new Float32Array(size), sampleRate, {
      rmsThreshold: 0.01,
      minClarity: 0.6,
    });

    expect(result.frequency).toBeNull();
    expect(result.clarity).toBe(0);
  });

  it("detects a strong sine wave and reports clarity", () => {
    const result = analyzePitch(createSineBuffer(440, sampleRate, size), sampleRate, {
      rmsThreshold: 0.01,
      minClarity: 0.6,
    });

    expect(result.frequency).toBeCloseTo(440, 1);
    expect(result.clarity).toBeGreaterThan(0.85);
  });

  it("rejects unclear mixed pitches when min clarity is high", () => {
    const result = analyzePitch(createMixedBuffer([440, 466.16], sampleRate, size), sampleRate, {
      rmsThreshold: 0.01,
      minClarity: 0.95,
    });

    expect(result.frequency).toBeNull();
    expect(result.clarity).toBeLessThan(0.95);
  });

  it("keeps the legacy autoCorrelate API", () => {
    const buffer = createSineBuffer(220, sampleRate, size);

    expect(autoCorrelate(buffer, sampleRate, 0.01)).toBeCloseTo(220, 1);
    expect(autoCorrelate(new Float32Array(size), sampleRate, 0.01)).toBe(-1);
  });
});
