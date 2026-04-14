export const INSTRUMENTS = {
  guitar: {
    label: "Guitar",
    strings: [
      { note: "E2", freq: 82.41 },
      { note: "A2", freq: 110.0 },
      { note: "D3", freq: 146.83 },
      { note: "G3", freq: 196.0 },
      { note: "B3", freq: 246.94 },
      { note: "E4", freq: 329.63 },
    ],
  },
  bass: {
    label: "Bass Guitar",
    strings: [
      { note: "E1", freq: 41.2 },
      { note: "A1", freq: 55.0 },
      { note: "D2", freq: 73.42 },
      { note: "G2", freq: 98.0 },
    ],
  },
  ukulele: {
    label: "Ukulele",
    strings: [
      { note: "G4", freq: 392.0 },
      { note: "C4", freq: 261.63 },
      { note: "E4", freq: 329.63 },
      { note: "A4", freq: 440.0 },
    ],
  },
  violin: {
    label: "Violin",
    strings: [
      { note: "G3", freq: 196.0 },
      { note: "D4", freq: 293.66 },
      { note: "A4", freq: 440.0 },
      { note: "E5", freq: 659.25 },
    ],
  },
  cello: {
    label: "Cello",
    strings: [
      { note: "C2", freq: 65.41 },
      { note: "G2", freq: 98.0 },
      { note: "D3", freq: 146.83 },
      { note: "A3", freq: 220.0 },
    ],
  },
  mandolin: {
    label: "Mandolin",
    strings: [
      { note: "G3", freq: 196.0 },
      { note: "D4", freq: 293.66 },
      { note: "A4", freq: 440.0 },
      { note: "E5", freq: 659.25 },
    ],
  },
};

// Frequencies in INSTRUMENTS are defined at A4 = 440 Hz (standard tuning).
// Use scaledFreq(baseFreq, referencePitch) to obtain the adjusted frequency for
// any other reference pitch before passing values to playback or display.

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
