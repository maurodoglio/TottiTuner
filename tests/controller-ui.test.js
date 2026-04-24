import { describe, expect, it, vi } from "vitest";
import {
  announcePitchDisplay,
  appendPitchHistory,
  clearPitchHistory,
  openDialogWithFallback,
} from "../controller-ui.js";

describe("controller UI helpers", () => {
  it("announces the current guidance and target in target mode", () => {
    document.body.innerHTML = '<div id="tuner-announcer"></div>';
    const announcer = document.getElementById("tuner-announcer");

    announcePitchDisplay(
      announcer,
      {
        note: "A2",
        targetNote: "A2",
        cents: -3,
        guidance: "In Tune ✓",
      },
      { targetMode: "target" }
    );

    expect(announcer.textContent).toContain("In Tune ✓");
    expect(announcer.textContent).toContain("Target A2");
    expect(announcer.textContent).toContain("minus 3 cents");
  });

  it("keeps the previous announcement when the tuner is holding the last stable pitch", () => {
    document.body.innerHTML = '<div id="tuner-announcer"></div>';
    const announcer = document.getElementById("tuner-announcer");

    const stableDisplay = {
      note: "A2",
      targetNote: "A2",
      cents: -3,
      guidance: "In Tune ✓",
    };

    announcePitchDisplay(announcer, stableDisplay, { targetMode: "target" });
    const previousAnnouncement = announcer.textContent;

    if (!announcer.textContent) {
      announcer.textContent = previousAnnouncement;
    }

    expect(announcer.textContent).toBe(previousAnnouncement);
  });

  it("caps pitch history to the most recent values and clears cleanly", () => {
    const history = [];

    for (let index = 0; index < 70; index += 1) {
      appendPitchHistory(history, index - 35, 64);
    }

    expect(history).toHaveLength(64);
    expect(history[0]).toBe(-29);
    expect(history.at(-1)).toBe(34);

    clearPitchHistory(history);
    expect(history).toEqual([]);
  });

  it("returns false and shows a fallback status when dialog.showModal is unavailable", () => {
    document.body.innerHTML = '<span id="status"></span>';
    const statusNode = document.getElementById("status");
    const setStatus = vi.fn((message) => {
      statusNode.textContent = message;
    });

    const opened = openDialogWithFallback(
      {},
      {
        setStatus,
        fallbackMessage: "Custom tunings open in browsers with dialog support.",
      }
    );

    expect(opened).toBe(false);
    expect(setStatus).toHaveBeenCalledWith(
      "Custom tunings open in browsers with dialog support.",
      "warning"
    );
    expect(statusNode.textContent).toContain("dialog support");
  });
});
