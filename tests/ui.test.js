import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderStringsList } from "../ui.js";

describe("renderStringsList interactions", () => {
  let stringsList;
  let onPlay;
  let onSelectTarget;

  beforeEach(() => {
    document.body.innerHTML = '<ul id="strings-list"></ul>';
    stringsList = document.getElementById("strings-list");
    onPlay = vi.fn();
    onSelectTarget = vi.fn();

    renderStringsList({
      stringsList,
      instrumentStrings: [
        { note: "A2", sourceNote: "A2", adjustedFreq: 110, midi: 45 },
        { note: "D3", sourceNote: "D3", adjustedFreq: 146.83, midi: 50 },
      ],
      currentTargetString: null,
      onPlay,
      onSelectTarget,
    });
  });

  it("plays a preview when the list item is activated with Enter", () => {
    const item = stringsList.querySelector(".note-button");
    item.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ note: "A2" }));
    expect(onSelectTarget).not.toHaveBeenCalled();
  });

  it("selects the target without playing a preview when the target button is clicked", () => {
    const button = stringsList.querySelector(".string-target-btn");
    button.click();

    expect(onSelectTarget).toHaveBeenCalledWith("A2");
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("selects the target without playing a preview when the target button is activated by keyboard", () => {
    const button = stringsList.querySelector(".string-target-btn");
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(onSelectTarget).toHaveBeenCalledWith("A2");
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("uses the original source note when selecting a capo-shifted target", () => {
    document.body.innerHTML = '<ul id="strings-list"></ul>';
    stringsList = document.getElementById("strings-list");
    onPlay = vi.fn();
    onSelectTarget = vi.fn();

    renderStringsList({
      stringsList,
      instrumentStrings: [
        { note: "F#2", sourceNote: "E2", adjustedFreq: 92.5, midi: 42 },
      ],
      currentTargetString: "E2",
      onPlay,
      onSelectTarget,
    });

    const button = stringsList.querySelector(".string-target-btn");
    button.click();

    expect(onSelectTarget).toHaveBeenCalledWith("E2");
    expect(stringsList.querySelector(".note-button")?.dataset.note).toBe("E2");
    expect(stringsList.querySelector(".note-button")?.dataset.displayNote).toBe("F#2");
  });
});
