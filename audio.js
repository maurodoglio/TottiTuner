// Amplitude threshold used to trim silent edges before autocorrelation.
export const AUTOCORRELATE_EDGE_THRESHOLD = 0.2;

const DEFAULT_MIN_FREQUENCY = 20;
const DEFAULT_MAX_FREQUENCY = 5000;
const DEFAULT_MIN_CLARITY = 0;

function trimSignal(buffer) {
  let start = 0;
  let end = buffer.length - 1;

  for (let index = 0; index < buffer.length / 2; index += 1) {
    if (Math.abs(buffer[index]) < AUTOCORRELATE_EDGE_THRESHOLD) {
      start = index;
      break;
    }
  }

  for (let index = 1; index < buffer.length / 2; index += 1) {
    const reverseIndex = buffer.length - index;
    if (Math.abs(buffer[reverseIndex]) < AUTOCORRELATE_EDGE_THRESHOLD) {
      end = reverseIndex;
      break;
    }
  }

  return buffer.slice(start, end);
}

function computeRms(buffer) {
  if (!buffer.length) return 0;
  const total = buffer.reduce((sum, value) => sum + value * value, 0);
  return Math.sqrt(total / buffer.length);
}

function buildCorrelation(buffer) {
  const correlation = new Float32Array(buffer.length);

  for (let offset = 0; offset < buffer.length; offset += 1) {
    for (let index = 0; index < buffer.length - offset; index += 1) {
      correlation[offset] += buffer[index] * buffer[index + offset];
    }
  }

  return correlation;
}

function findFirstValley(correlation) {
  let index = 0;
  while (index + 1 < correlation.length && correlation[index] > correlation[index + 1]) {
    index += 1;
  }
  return index;
}

function findPeak(correlation, startIndex) {
  let peakValue = -1;
  let peakIndex = -1;

  for (let index = startIndex; index < correlation.length; index += 1) {
    if (correlation[index] > peakValue) {
      peakValue = correlation[index];
      peakIndex = index;
    }
  }

  return { peakIndex, peakValue };
}

function interpolatePeak(correlation, peakIndex) {
  if (peakIndex <= 0 || peakIndex >= correlation.length - 1) {
    return peakIndex;
  }

  const x1 = correlation[peakIndex - 1];
  const x2 = correlation[peakIndex];
  const x3 = correlation[peakIndex + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;

  if (!Number.isFinite(a) || a === 0) {
    return peakIndex;
  }

  return peakIndex - b / (2 * a);
}

export function analyzePitch(
  buffer,
  sampleRate,
  {
    rmsThreshold,
    minClarity = DEFAULT_MIN_CLARITY,
    minFrequency = DEFAULT_MIN_FREQUENCY,
    maxFrequency = DEFAULT_MAX_FREQUENCY,
  } = {}
) {
  const rms = computeRms(buffer);

  if (rms < rmsThreshold) {
    return {
      frequency: null,
      clarity: 0,
      rms,
    };
  }

  const trimmed = trimSignal(buffer);
  if (trimmed.length < 3) {
    return {
      frequency: null,
      clarity: 0,
      rms,
    };
  }

  const correlation = buildCorrelation(trimmed);
  const valleyIndex = findFirstValley(correlation);
  const { peakIndex, peakValue } = findPeak(correlation, valleyIndex);

  if (peakIndex === -1 || !Number.isFinite(peakValue) || peakValue <= 0) {
    return {
      frequency: null,
      clarity: 0,
      rms,
    };
  }

  const interpolatedPeak = interpolatePeak(correlation, peakIndex);
  const frequency = interpolatedPeak > 0 ? sampleRate / interpolatedPeak : null;
  const clarity = correlation[0] > 0 ? Math.max(0, Math.min(1, peakValue / correlation[0])) : 0;
  const isInRange = frequency && frequency >= minFrequency && frequency <= maxFrequency;

  if (!isInRange || clarity < minClarity) {
    return {
      frequency: null,
      clarity,
      rms,
    };
  }

  return {
    frequency,
    clarity,
    rms,
  };
}

// Backward-compatible API used by the UI loop.
export function autoCorrelate(buffer, sampleRate, rmsThreshold) {
  const result = analyzePitch(buffer, sampleRate, {
    rmsThreshold,
    minClarity: DEFAULT_MIN_CLARITY,
  });

  return result.frequency ?? -1;
}

function isLocalhost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function getAudioMediaStream() {
  if (!window.isSecureContext && !isLocalhost(window.location.hostname)) {
    const err = new Error("Microphone requires HTTPS or localhost");
    err.name = "InsecureContextError";
    throw err;
  }

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
  }

  const legacyGetUserMedia =
    navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

  if (legacyGetUserMedia) {
    return new Promise((resolve, reject) => {
      legacyGetUserMedia.call(navigator, { audio: true, video: false }, resolve, reject);
    });
  }

  const err = new Error("getUserMedia is not supported in this browser");
  err.name = "NotSupportedError";
  throw err;
}
