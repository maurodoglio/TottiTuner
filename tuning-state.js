import {
  INSTRUMENTS,
  describeTuningSummary,
  listTuningPresets,
  resolveTuningSelection,
} from "./instruments.js";
import { buildInstrumentStrings } from "./pitch-engine.js";

export function resolveActiveTuningContext({
  instrumentId,
  tuningId,
  customTuningsByInstrument = {},
  referencePitch,
  capoSemitones,
}) {
  const tuning = resolveTuningSelection({
    instrumentId,
    tuningId,
    customTuningsByInstrument,
  });
  const availableTunings = listTuningPresets(
    instrumentId,
    customTuningsByInstrument[instrumentId] || []
  );

  if (!tuning) {
    return {
      instrument: INSTRUMENTS[instrumentId] ?? null,
      tuning: null,
      availableTunings,
      resolvedTuningId: null,
      instrumentStrings: [],
      summary: INSTRUMENTS[instrumentId]?.label ?? "",
    };
  }

  return {
    instrument: INSTRUMENTS[instrumentId],
    tuning,
    availableTunings,
    resolvedTuningId: tuning.id,
    instrumentStrings: buildInstrumentStrings(tuning.strings, referencePitch, capoSemitones),
    summary: describeTuningSummary({
      instrumentLabel: INSTRUMENTS[instrumentId]?.label,
      tuningLabel: tuning.label,
      tuningDescription: tuning.description,
    }),
  };
}
