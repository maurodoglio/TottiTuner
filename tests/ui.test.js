import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TUNING_IDS,
  describeTuningSummary,
  listTuningPresets,
  resolveTuningSelection,
} from "../instruments.js";
import {
  buildCustomTuningShareState,
  buildTuningShareState,
  parseSharedTuningState,
  parseTuningStrings,
  resolveSharedSetupState,
  sanitizeTuningMetadata,
  serializeSharedTuningState,
} from "../tuning-utils.js";
import {
  renderCustomTuningsList,
  renderOnboardingChecklist,
  renderStringsList,
  renderTuningOptions,
  syncSelectValue,
} from "../ui.js";

describe("custom tuning helpers", () => {
  it("parses a comma-separated string list into note/frequency entries", () => {
    expect(parseTuningStrings("D2:73.42, A2:110, D3:146.83")).toEqual([
      { note: "D2", freq: 73.42 },
      { note: "A2", freq: 110 },
      { note: "D3", freq: 146.83 },
    ]);
  });

  it("sanitizes tuning metadata for safe persistence", () => {
    expect(
      sanitizeTuningMetadata({
        label: "  Drop C  ",
        description: "  Heavy rhythm  ",
      })
    ).toEqual({
      label: "Drop C",
      description: "Heavy rhythm",
    });
  });

  it("lists built-in and custom tunings for an instrument", () => {
    const presets = listTuningPresets("guitar", [
      {
        id: "drop-c",
        instrumentId: "guitar",
        label: "Drop C",
        description: "Heavy rhythm",
        strings: [
          { note: "C2", freq: 65.41 },
          { note: "G2", freq: 98 },
          { note: "C3", freq: 130.81 },
          { note: "F3", freq: 174.61 },
          { note: "A3", freq: 220 },
          { note: "D4", freq: 293.66 },
        ],
      },
    ]);

    expect(presets[0]).toMatchObject({ id: DEFAULT_TUNING_IDS.guitar, kind: "preset" });
    expect(presets.at(-1)).toMatchObject({ id: "drop-c", kind: "custom" });
  });

  it("builds a readable tuning summary for the current selection", () => {
    expect(
      describeTuningSummary({
        instrumentLabel: "Guitar",
        tuningLabel: "Drop D",
        tuningDescription: "D A D G B E",
      })
    ).toBe("Guitar • Drop D • D A D G B E");
  });

  it("resolves invalid persisted tuning ids back to the default selection", () => {
    const resolved = resolveTuningSelection({
      instrumentId: "violin",
      tuningId: "baritone",
      customTuningsByInstrument: {},
    });

    expect(resolved.id).toBe(DEFAULT_TUNING_IDS.violin);
  });

  it("serializes and parses shared tuning state", () => {
    const shareState = buildCustomTuningShareState({
      instrumentId: "guitar",
      tuning: {
        id: "drop-c",
        label: "Drop C",
        description: "Heavy rhythm",
        strings: [
          { note: "C2", freq: 65.41 },
          { note: "G2", freq: 98 },
        ],
      },
      targetString: "C2",
      targetMode: "target",
    });

    const encoded = serializeSharedTuningState(shareState);
    const parsed = parseSharedTuningState(encoded);

    expect(parsed).toMatchObject({
      inst: "guitar",
      tuning: "custom",
      target: "C2",
      mode: "target",
      custom: {
        label: "Drop C",
      },
    });
  });

  it("builds a share payload for built-in tunings and resolves it back into app state", () => {
    const shareState = buildTuningShareState({
      instrumentId: "ukulele",
      tuning: {
        id: "baritone",
        instrumentId: "ukulele",
        label: "Baritone",
        kind: "preset",
      },
      targetString: "D3",
      targetMode: "target",
    });

    expect(shareState).toEqual({
      inst: "ukulele",
      tuning: "baritone",
      mode: "target",
      target: "D3",
    });

    expect(resolveSharedSetupState(shareState)).toEqual({
      instrument: "ukulele",
      tuningId: "baritone",
      targetMode: "target",
      targetString: "D3",
      customTuning: null,
    });
  });

  it("resolves shared custom tuning payloads into selectable app state", () => {
    const shareState = buildCustomTuningShareState({
      instrumentId: "guitar",
      tuning: {
        id: "drop-c",
        label: "Drop C",
        description: "Heavy rhythm",
        strings: [
          { note: "C2", freq: 65.41 },
          { note: "G2", freq: 98 },
        ],
      },
      targetString: "C2",
      targetMode: "target",
    });

    expect(resolveSharedSetupState(shareState)).toMatchObject({
      instrument: "guitar",
      tuningId: "drop-c",
      targetMode: "target",
      targetString: "C2",
      customTuning: {
        id: "drop-c",
        instrumentId: "guitar",
        label: "Drop C",
      },
    });
  });

  it("rejects shared custom tuning payloads with invalid note labels", () => {
    const shareState = buildCustomTuningShareState({
      instrumentId: "guitar",
      tuning: {
        id: "unsafe",
        label: "Unsafe",
        description: "bad payload",
        strings: [
          { note: '<img src=x onerror="alert(1)">', freq: 82.41 },
          { note: "A2", freq: 110 },
        ],
      },
      targetString: null,
      targetMode: "auto",
    });

    expect(resolveSharedSetupState(shareState)).toBeNull();
  });
});

describe("tuning selection rendering", () => {
  it("syncs a select control to a programmatically changed value", () => {
    document.body.innerHTML = `
      <select id="instrument-select">
        <option value="guitar">Guitar</option>
        <option value="viola">Viola</option>
      </select>
    `;

    const select = document.getElementById("instrument-select");
    syncSelectValue(select, "viola");

    expect(select.value).toBe("viola");
  });

  it("renders tuning options grouped by preset and custom entries", () => {
    document.body.innerHTML = '<select id="tuning-select"></select>';
    const tuningSelect = document.getElementById("tuning-select");

    renderTuningOptions({
      tuningSelect,
      tunings: [
        {
          id: "standard",
          label: "Standard",
          description: "E A D G B E",
          kind: "preset",
        },
        {
          id: "drop-c",
          label: "Drop C",
          description: "Heavy rhythm",
          kind: "custom",
        },
      ],
      selectedTuningId: "drop-c",
    });

    const groups = tuningSelect.querySelectorAll("optgroup");
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("Built-in tunings");
    expect(groups[1].label).toBe("Custom tunings");
    expect(tuningSelect.value).toBe("drop-c");
  });

  it("renders onboarding checklist with completion and dismissal states", () => {
    document.body.innerHTML = '<div id="onboarding-checklist"></div>';
    const root = document.getElementById("onboarding-checklist");

    renderOnboardingChecklist({
      root,
      items: [
        { id: "instrument", label: "Choose your instrument", completed: true },
        { id: "start", label: "Press Start and allow mic access", completed: false },
      ],
      dismissed: false,
    });

    expect(root.hidden).toBe(false);
    expect(root.textContent).toContain("Choose your instrument");
    expect(root.textContent).toContain("Press Start and allow mic access");
    expect(root.querySelectorAll("li")[0].dataset.completed).toBe("true");
    expect(root.querySelectorAll("li")[1].dataset.completed).toBe("false");

    renderOnboardingChecklist({
      root,
      items: [{ id: "done", label: "All set", completed: true }],
      dismissed: true,
    });

    expect(root.hidden).toBe(true);
  });

  it("renders custom tuning rows with use and delete actions", () => {
    document.body.innerHTML = '<div id="tunings-list"></div>';
    const tuningsList = document.getElementById("tunings-list");
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    renderCustomTuningsList({
      tuningsList,
      customTunings: [
        {
          id: "drop-c",
          label: "Drop C",
          description: "Heavy rhythm",
          strings: [
            { note: "C2", freq: 65.41 },
            { note: "G2", freq: 98 },
          ],
        },
      ],
      selectedTuningId: "drop-c",
      onSelect,
      onDelete,
    });

    const buttons = tuningsList.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(tuningsList.textContent).toContain("Currently selected");

    buttons[0].click();
    buttons[1].click();

    expect(onSelect).toHaveBeenCalledWith("drop-c");
    expect(onDelete).toHaveBeenCalledWith("drop-c");
  });
});

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

  it("renders dedicated play buttons instead of making the whole row interactive", () => {
    const item = stringsList.querySelector("li");
    const playButton = stringsList.querySelector(".string-play-btn");
    const targetButton = stringsList.querySelector(".string-target-btn");

    expect(item?.getAttribute("role")).toBeNull();
    expect(item?.tabIndex ?? -1).toBe(-1);
    expect(playButton?.tagName).toBe("BUTTON");
    expect(targetButton?.tagName).toBe("BUTTON");
  });

  it("plays a preview when the play button is clicked", () => {
    const playButton = stringsList.querySelector(".string-play-btn");
    playButton.click();

    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ note: "A2" }));
    expect(onSelectTarget).not.toHaveBeenCalled();
  });

  it("does not manually duplicate native Enter handling on the play button", () => {
    const playButton = stringsList.querySelector(".string-play-btn");
    playButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(onPlay).not.toHaveBeenCalled();
    expect(onSelectTarget).not.toHaveBeenCalled();
  });

  it("supports the keyboard target shortcut on the play button", () => {
    const playButton = stringsList.querySelector(".string-play-btn");
    playButton.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true }));

    expect(onSelectTarget).toHaveBeenCalledWith("A2");
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("selects the target without playing a preview when the target button is clicked", () => {
    const button = stringsList.querySelector(".string-target-btn");
    button.click();

    expect(onSelectTarget).toHaveBeenCalledWith("A2");
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("does not manually duplicate native Enter handling on the target button", () => {
    const button = stringsList.querySelector(".string-target-btn");
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(onSelectTarget).not.toHaveBeenCalled();
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

  it("renders string notes as text instead of injecting HTML", () => {
    document.body.innerHTML = '<ul id="strings-list"></ul>';
    stringsList = document.getElementById("strings-list");

    renderStringsList({
      stringsList,
      instrumentStrings: [
        {
          note: '<img src=x onerror="alert(1)">',
          sourceNote: '<img src=x onerror="alert(1)">',
          adjustedFreq: 82.41,
          midi: 40,
        },
      ],
      currentTargetString: null,
      onPlay,
      onSelectTarget,
    });

    expect(stringsList.querySelector("img")).toBeNull();
    expect(stringsList.textContent).toContain('<img src=x onerror="alert(1)">');
  });
});
