// Amplitude threshold used to trim silent edges before autocorrelation
export const AUTOCORRELATE_EDGE_THRESHOLD = 0.2;

// Autocorrelation-based pitch detection
export function autoCorrelate(buf, sampleRate, rmsThreshold) {
  const SIZE = buf.length;
  const rms = Math.sqrt(buf.reduce((sum, v) => sum + v * v, 0) / SIZE);

  if (rms < rmsThreshold) return -1; // Signal too quiet

  // Trim silent edges
  let r1 = 0, r2 = SIZE - 1;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < AUTOCORRELATE_EDGE_THRESHOLD) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < AUTOCORRELATE_EDGE_THRESHOLD) { r2 = SIZE - i; break; }
  }

  const trimmed = buf.slice(r1, r2);
  const c = new Float32Array(trimmed.length);

  for (let i = 0; i < trimmed.length; i++) {
    for (let j = 0; j < trimmed.length - i; j++) {
      c[i] += trimmed[j] * trimmed[j + i];
    }
  }

  // Find first valley, then the highest peak after it
  let d = 0;
  while (c[d] > c[d + 1]) d++;

  let maxVal = -1, maxPos = -1;
  for (let i = d; i < trimmed.length; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }

  if (maxPos === -1) return -1;

  // Interpolate around the peak for sub-sample accuracy
  let T0 = maxPos;
  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  return sampleRate / T0;
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
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
