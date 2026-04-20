import {
  PREVIEW_ATTACK_TIME,
  PREVIEW_MIN_GAIN,
  PREVIEW_PEAK_GAIN,
  PREVIEW_RELEASE_TIME,
  PREVIEW_STOP_FADE_TIME,
  PREVIEW_SUSTAIN_TIME,
} from "./config.js";

let previewAudioContext = null;
let activePreview = null;

function getPreviewAudioContext() {
  if (!previewAudioContext || previewAudioContext.state === "closed") {
    previewAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return previewAudioContext;
}

export function stopPreview() {
  if (!activePreview || !previewAudioContext) return;

  const { oscillator, gainNode } = activePreview;
  const now = previewAudioContext.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(0, now + PREVIEW_STOP_FADE_TIME);

  try {
    oscillator.stop(now + PREVIEW_STOP_FADE_TIME);
  } catch {
    // oscillator may already be stopped
  }

  activePreview = null;
}

export function closePreview() {
  stopPreview();
  if (previewAudioContext && previewAudioContext.state !== "closed") {
    previewAudioContext.close().catch(() => {});
  }
  previewAudioContext = null;
}

export function playPreview(frequency, harmonics) {
  const context = getPreviewAudioContext();
  if (context.state === "suspended") {
    context.resume();
  }

  stopPreview();

  const real = new Float32Array(harmonics);
  const imag = new Float32Array(harmonics.length);
  const wave = context.createPeriodicWave(real, imag);
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const now = context.currentTime;
  const releaseStart = now + PREVIEW_ATTACK_TIME + PREVIEW_SUSTAIN_TIME;
  const endTime = releaseStart + PREVIEW_RELEASE_TIME;

  oscillator.setPeriodicWave(wave);
  oscillator.frequency.setValueAtTime(frequency, now);

  gainNode.gain.setValueAtTime(PREVIEW_MIN_GAIN, now);
  gainNode.gain.exponentialRampToValueAtTime(PREVIEW_PEAK_GAIN, now + PREVIEW_ATTACK_TIME);
  gainNode.gain.setValueAtTime(PREVIEW_PEAK_GAIN, releaseStart);
  gainNode.gain.exponentialRampToValueAtTime(PREVIEW_MIN_GAIN, endTime);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(now);
  oscillator.stop(endTime);

  activePreview = { oscillator, gainNode };
  oscillator.onended = () => {
    if (activePreview?.oscillator === oscillator) {
      activePreview = null;
    }
  };
}
