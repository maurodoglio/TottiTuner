const MAX_PITCH_HISTORY = 64;

function formatSignedCents(cents) {
  if (!Number.isFinite(cents) || cents === 0) {
    return "0 cents";
  }

  return cents > 0 ? `plus ${cents} cents` : `minus ${Math.abs(cents)} cents`;
}

export function announcePitchDisplay(announcer, display, { targetMode } = {}) {
  if (!announcer || !display) return;

  const parts = [display.guidance];

  if (display.note) {
    parts.push(`Detected ${display.note}`);
  }

  if (targetMode === "target" && display.targetNote) {
    parts.push(`Target ${display.targetNote}`);
  }

  parts.push(formatSignedCents(display.cents));
  announcer.textContent = parts.join(" • ");
}

export function appendPitchHistory(history, cents, maxEntries = MAX_PITCH_HISTORY) {
  if (!Array.isArray(history) || !Number.isFinite(cents)) {
    return history;
  }

  history.push(Math.max(-50, Math.min(50, cents)));
  while (history.length > maxEntries) {
    history.shift();
  }

  return history;
}

export function clearPitchHistory(history) {
  if (!Array.isArray(history)) {
    return history;
  }

  history.length = 0;
  return history;
}

export function drawPitchHistory(canvas, history) {
  if (!canvas?.getContext) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  context.strokeStyle = "rgba(122, 122, 154, 0.35)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();

  if (!history.length) return;

  context.strokeStyle = "#e94560";
  context.lineWidth = 2;
  context.beginPath();

  history.forEach((value, index) => {
    const x = history.length === 1 ? width / 2 : (index / (history.length - 1)) * width;
    const normalized = (Math.max(-50, Math.min(50, value)) + 50) / 100;
    const y = height - normalized * height;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });

  context.stroke();
}

export function openDialogWithFallback(dialog, { setStatus, fallbackMessage }) {
  if (dialog?.showModal) {
    dialog.showModal();
    return true;
  }

  setStatus?.(fallbackMessage, "warning");
  return false;
}

export { MAX_PITCH_HISTORY };
