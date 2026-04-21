import {
  IN_TUNE_CENTS,
  RETARGET_BIAS_CENTS,
  SLIGHTLY_OFF_CENTS,
} from "./config.js";
import { noteFromFrequency, noteName } from "./instruments.js";

export function buildInstrumentStrings(strings, referencePitch, capoSemitones = 0) {
  const capoFactor = Math.pow(2, capoSemitones / 12);

  return strings.map(({ note, freq }) => {
    const adjustedFreq = freq * (referencePitch / 440) * capoFactor;
    const midi = noteFromFrequency(adjustedFreq, referencePitch);

    return {
      note: capoSemitones > 0 ? noteName(midi) : note,
      sourceNote: note,
      baseFreq: freq,
      adjustedFreq,
      midi,
    };
  });
}

export function smoothFrequency(previousFrequency, frequency, alpha) {
  if (previousFrequency == null) {
    return frequency;
  }
  return previousFrequency + (frequency - previousFrequency) * alpha;
}

export function findNearestString(frequency, instrumentStrings) {
  if (!frequency || !instrumentStrings.length) return null;

  return instrumentStrings.reduce((closest, current) => {
    if (!closest) return current;
    const currentDistance = Math.abs(current.adjustedFreq - frequency);
    const closestDistance = Math.abs(closest.adjustedFreq - frequency);
    return currentDistance < closestDistance ? current : closest;
  }, null);
}

export function resolveTargetString({ targetMode, targetString, instrumentStrings, frequency }) {
  if (targetMode === "target" && targetString) {
    return (
      instrumentStrings.find(
        (string) => string.note === targetString || string.sourceNote === targetString
      ) ?? null
    );
  }

  return findNearestString(frequency, instrumentStrings);
}

function describeGuidance(cents) {
  const absoluteCents = Math.abs(cents);
  if (absoluteCents <= IN_TUNE_CENTS) return "In Tune ✓";
  if (absoluteCents <= SLIGHTLY_OFF_CENTS) {
    return cents < 0 ? "Slightly Flat ↓" : "Slightly Sharp ↑";
  }
  return cents < 0 ? "Flat ↓" : "Sharp ↑";
}

export function classifyTuning(cents) {
  const absoluteCents = Math.abs(cents);
  if (absoluteCents <= IN_TUNE_CENTS) return "in-tune";
  if (absoluteCents <= SLIGHTLY_OFF_CENTS) return "slightly-off";
  return "out-of-tune";
}

function chooseLockedTarget(
  previousLockedTarget,
  resolvedTarget,
  frequency,
  targetMode,
  noteLockCents,
  _noteReleaseCents,
  retargetBiasCents = RETARGET_BIAS_CENTS
) {
  if (targetMode === "target") {
    return resolvedTarget?.note ?? null;
  }

  if (!previousLockedTarget) {
    return resolvedTarget?.note ?? null;
  }

  if (!resolvedTarget) {
    return previousLockedTarget.note;
  }

  if (previousLockedTarget.note === resolvedTarget.note) {
    return previousLockedTarget.note;
  }

  const previousCents = Math.abs(
    Math.round(1200 * Math.log2(frequency / previousLockedTarget.adjustedFreq))
  );
  const resolvedCents = Math.abs(
    Math.round(1200 * Math.log2(frequency / resolvedTarget.adjustedFreq))
  );

  if (previousCents <= noteLockCents) {
    return previousLockedTarget.note;
  }

  if (resolvedCents + retargetBiasCents < previousCents) {
    return resolvedTarget.note;
  }

  return previousLockedTarget.note;
}

export function advancePitchState(previousState, detection, options) {
  const {
    timestamp,
    referencePitch,
    holdMs,
    smoothingAlpha,
    targetMode,
    targetString,
    instrumentStrings,
    minClarity,
    noteLockCents,
    noteReleaseCents,
    retargetBiasCents = RETARGET_BIAS_CENTS,
  } = options;

  const hasConfidentFrequency =
    detection.frequency != null && Number.isFinite(detection.frequency) && detection.clarity >= minClarity;

  if (!hasConfidentFrequency) {
    if (previousState.display && timestamp - previousState.lastStableTime <= holdMs) {
      return previousState;
    }

    return {
      smoothedFrequency: null,
      lastStableTime: previousState.lastStableTime,
      display: null,
      lockedTargetNote: null,
    };
  }

  const smoothedFrequency = smoothFrequency(
    previousState.smoothedFrequency,
    detection.frequency,
    smoothingAlpha
  );

  const initialTarget = resolveTargetString({
    targetMode,
    targetString,
    instrumentStrings,
    frequency: smoothedFrequency,
  });

  if (!initialTarget) {
    return {
      smoothedFrequency,
      lastStableTime: timestamp,
      display: null,
      lockedTargetNote: null,
    };
  }

  const lockedTargetNote = chooseLockedTarget(
    previousState.lockedTargetNote
      ? instrumentStrings.find((string) => string.note === previousState.lockedTargetNote) ?? null
      : null,
    initialTarget,
    smoothedFrequency,
    targetMode,
    noteLockCents,
    noteReleaseCents,
    retargetBiasCents
  );

  const lockedTarget =
    instrumentStrings.find((string) => string.note === lockedTargetNote) ?? initialTarget;

  const nearestMidi = noteFromFrequency(smoothedFrequency, referencePitch);
  const detectedNote = noteName(nearestMidi);
  const cents =
    targetMode === "target"
      ? Math.round(1200 * Math.log2(smoothedFrequency / lockedTarget.adjustedFreq))
      : Math.round(1200 * Math.log2(smoothedFrequency / lockedTarget.adjustedFreq));

  return {
    smoothedFrequency,
    lastStableTime: timestamp,
    lockedTargetNote: lockedTarget.note,
    display: {
      note: targetMode === "target" ? lockedTarget.note : detectedNote,
      targetNote: lockedTarget.note,
      frequency: smoothedFrequency,
      cents,
      status: classifyTuning(cents),
      guidance: describeGuidance(cents),
      clarity: detection.clarity,
      activeMidi: lockedTarget.midi,
    },
  };
}
