// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { usePrefsStore } from "../../state/prefs";
import { EditorCard } from "./EditorCard";
import type { EditorCardProps } from "./types";

/**
 * The card has two states and picks one when it mounts:
 *
 *   compact  — a freshly picked element with nothing recorded yet
 *   expanded — anything already annotated (bubble number, changed properties,
 *              or a saved instruction)
 *
 * Getting that derivation wrong is not a cosmetic miss: an element whose
 * properties were just tuned would open on a one-line input and the changed-row
 * highlight (plus the scroll that makes it visible) would never render.
 */

function baseProps(overrides: Partial<EditorCardProps> = {}): EditorCardProps {
  return {
    elementId: "ut-000001",
    number: null,
    initialValues: { height: "38px" },
    initialInstruction: "",
    changedProperties: [],
    onStage: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onDismiss: vi.fn(),
    onDelete: vi.fn(),
    onRevert: vi.fn(() => null),
    ...overrides,
  };
}

const PLACEHOLDER = "这个元素要怎么修改...";

/** The compact row's single-line field; the expanded state uses a textarea. */
function compactInput(): HTMLInputElement {
  return screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement;
}

function saveButton(): HTMLButtonElement {
  // The expanded card renders 保存 twice — header and footer (Figma 180:824).
  return screen.getAllByRole("button", { name: "保存" })[0] as HTMLButtonElement;
}

/**
 * jsdom does not implement scrollIntoView, and the card calls it on mount to
 * bring a highlighted row into view — so every test needs something installed,
 * not just the two that assert on it.
 */
function stubScrollIntoView(): ReturnType<typeof vi.fn> {
  const stub = vi.fn();
  Element.prototype.scrollIntoView = stub;
  return stub;
}

/**
 * jsdom has no SpeechRecognition, so voice tests inject this fake onto window.
 * It records start/stop/abort and exposes emit* to simulate browser events.
 */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  interimResults = false;
  continuous = true;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
  abort(): void {
    this.aborted = true;
  }
  emitInterim(text: string): void {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: text } }] });
  }
  emitFinal(text: string): void {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
  }
  emitEnd(): void {
    this.onend?.();
  }
}

function installFakeSpeech(): void {
  FakeRecognition.instances = [];
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
}

function removeFakeSpeech(): void {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
}

beforeAll(() => {
  // jsdom does not implement pointer capture (the scrub drag needs it).
  if (!("setPointerCapture" in Element.prototype)) {
    // @ts-expect-error test stub
    Element.prototype.setPointerCapture = () => {};
  }
  if (!("releasePointerCapture" in Element.prototype)) {
    // @ts-expect-error test stub
    Element.prototype.releasePointerCapture = () => {};
  }
});

describe("EditorCard", () => {
  afterEach(cleanup);

  beforeEach(() => {
    // StylePanel labels come from useT(); seed the locale or they throw.
    usePrefsStore.setState({ locale: "zh" });
    stubScrollIntoView();
  });

  describe("opening state", () => {
    it("opens compact for a freshly picked element", () => {
      render(<EditorCard {...baseProps()} />);

      expect(compactInput().tagName).toBe("INPUT");
      expect(screen.getByRole("button", { name: "提交" })).toBeTruthy();
      // No property panel, no 保存/取消 footer — that is the expanded state.
      expect(screen.queryByText("文本颜色")).toBeNull();
      expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    });

    it.each([
      ["it already has a bubble number", { number: 2 }],
      ["it has recorded property changes", { changedProperties: ["height"] }],
      ["it has a saved instruction", { initialInstruction: "紧凑一点" }],
    ])("opens expanded when %s", (_why, overrides) => {
      render(<EditorCard {...baseProps(overrides)} />);

      expect(screen.getByText("文本颜色")).toBeTruthy();
      // Instruction is now an input in the header, not a textarea in the body.
      expect(compactInput().tagName).toBe("INPUT");
      expect(saveButton()).toBeTruthy();
    });

    it("collapses to the compact row and expands back", () => {
      render(<EditorCard {...baseProps({ number: 1 })} />);

      fireEvent.click(screen.getByRole("button", { name: "收起" }));
      expect(screen.queryByText("文本颜色")).toBeNull();
      expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
      expect(compactInput().tagName).toBe("INPUT");

      fireEvent.click(screen.getByRole("button", { name: "展开" }));
      expect(screen.getByText("文本颜色")).toBeTruthy();
      expect(saveButton()).toBeTruthy();
    });
  });

  describe("compact submit", () => {
    it("saves the typed instruction via the ✓ button", () => {
      const props = baseProps();
      render(<EditorCard {...props} />);

      fireEvent.change(compactInput(), { target: { value: "改成次要样式" } });
      fireEvent.click(screen.getByRole("button", { name: "提交" }));
      expect(props.onSave).toHaveBeenCalledWith("改成次要样式");
    });

    it("saves on Enter without leaving the field", () => {
      const props = baseProps();
      render(<EditorCard {...props} />);

      fireEvent.change(compactInput(), { target: { value: "圆角更大" } });
      fireEvent.keyDown(compactInput(), { key: "Enter" });
      expect(props.onSave).toHaveBeenCalledWith("圆角更大");
    });

    it("keeps ✓ disabled until there is something to submit", () => {
      render(<EditorCard {...baseProps()} />);
      const submit = screen.getByRole("button", { name: "提交" }) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);

      fireEvent.change(compactInput(), { target: { value: "   " } });
      expect(submit.disabled).toBe(true);

      fireEvent.change(compactInput(), { target: { value: "大一点" } });
      expect(submit.disabled).toBe(false);
    });
  });

  describe("header affordances", () => {
    it("offers the drag grip and the property toggle when there is no bubble number", () => {
      render(<EditorCard {...baseProps()} />);
      expect(screen.getByLabelText("拖动卡片")).toBeTruthy();
      const toggle = screen.getByRole("button", { name: "展开" });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      // The tag name it replaced is gone — the card sits on the element itself.
      expect(screen.queryByText("button")).toBeNull();
    });

    it("never renders the sequence number badge (the Figma design drops it)", () => {
      render(<EditorCard {...baseProps({ number: 3 })} />);
      // Annotated, so it opens expanded — but no "3" anywhere; the bubble on
      // the page carries the number, the card does not repeat it.
      expect(screen.queryByText("3")).toBeNull();
      // The drag affordance is the element bar (tag + move glyph).
      expect(screen.getByLabelText("拖动卡片")).toBeTruthy();
    });

    it("opens and closes the property panel with the same icon", () => {
      render(<EditorCard {...baseProps()} />);
      fireEvent.click(screen.getByRole("button", { name: "展开" }));
      expect(screen.getByText("文本颜色")).toBeTruthy();

      // One icon does both directions — there is no separate collapse chevron.
      const collapse = screen.getByRole("button", { name: "收起" });
      expect(collapse.getAttribute("aria-expanded")).toBe("true");
      fireEvent.click(collapse);
      expect(screen.queryByText("文本颜色")).toBeNull();
      expect(screen.getByRole("button", { name: "展开" })).toBeTruthy();
    });
  });

  describe("expanded save", () => {
    it("disables save until something changes", () => {
      render(<EditorCard {...baseProps({ number: 1 })} />);
      expect(saveButton().disabled).toBe(true);

      fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
        target: { value: "再大一点" },
      });
      expect(saveButton().disabled).toBe(false);
    });

    it("stays non-dirty when the instruction only differs by whitespace", () => {
      render(<EditorCard {...baseProps({ initialInstruction: "紧凑一点" })} />);
      fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
        target: { value: "  紧凑一点 " },
      });
      expect(saveButton().disabled).toBe(true);
    });

    it("calls onSave with the current instruction", () => {
      const props = baseProps({ number: 1 });
      render(<EditorCard {...props} />);
      fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
        target: { value: "圆角更大" },
      });
      fireEvent.click(saveButton());
      expect(props.onSave).toHaveBeenCalledWith("圆角更大");
    });

    it("calls onCancel", () => {
      const props = baseProps({ number: 1 });
      render(<EditorCard {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "取消" }));
      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("voice input", () => {
    afterEach(removeFakeSpeech);

    it("keeps the mic disabled with a coming-soon hint when speech is unsupported", () => {
      removeFakeSpeech();
      render(<EditorCard {...baseProps()} />);
      const mic = screen.getByRole("button", { name: "语音输入即将上线" }) as HTMLButtonElement;
      expect(mic.disabled).toBe(true);
      // A disabled button swallows hover, so the tooltip sits on the wrapper.
      expect(mic.parentElement?.getAttribute("title")).toBe("语音输入即将上线");
    });

    it("keeps the mic disabled in the expanded state too", () => {
      removeFakeSpeech();
      render(<EditorCard {...baseProps({ number: 1 })} />);
      // Header and footer each render one (Figma 180:824).
      const mics = screen.getAllByRole("button", { name: "语音输入即将上线" });
      expect(mics.length).toBeGreaterThan(0);
      for (const mic of mics) expect((mic as HTMLButtonElement).disabled).toBe(true);
    });

    it("enables the mic when speech is supported and toggles listening", () => {
      installFakeSpeech();
      render(<EditorCard {...baseProps()} />);
      const mic = screen.getByRole("button", { name: "语音输入" }) as HTMLButtonElement;
      expect(mic.disabled).toBe(false);
      expect(mic.getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(mic);
      expect(FakeRecognition.instances).toHaveLength(1);
      expect(FakeRecognition.instances[0]!.started).toBe(true);
      expect(mic.getAttribute("aria-pressed")).toBe("true");
      // The field goes read-only while the recognizer owns it.
      expect(compactInput().readOnly).toBe(true);
    });

    it("streams interim text into the field, then commits the final utterance", () => {
      installFakeSpeech();
      render(<EditorCard {...baseProps()} />);
      fireEvent.click(screen.getByRole("button", { name: "语音输入" }));
      const rec = FakeRecognition.instances[0]!;
      act(() => rec.emitInterim("字号"));
      expect(compactInput().value).toBe("字号");
      act(() => rec.emitFinal("字号调大"));
      act(() => rec.emitEnd());
      expect(compactInput().value).toBe("字号调大");
      expect(compactInput().readOnly).toBe(false);
    });

    it("appends a dictated utterance onto an existing instruction", () => {
      installFakeSpeech();
      render(<EditorCard {...baseProps({ initialInstruction: "圆角更大" })} />);
      fireEvent.click(screen.getAllByRole("button", { name: "语音输入" })[0]!);
      const rec = FakeRecognition.instances[0]!;
      act(() => rec.emitFinal("再大一点"));
      act(() => rec.emitEnd());
      expect(compactInput().value).toBe("圆角更大 再大一点");
    });

    it("Escape while listening cancels the session instead of dismissing the card", () => {
      installFakeSpeech();
      const props = baseProps();
      const { container } = render(<EditorCard {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "语音输入" }));
      const rec = FakeRecognition.instances[0]!;
      fireEvent.keyDown(container.firstChild as Element, { key: "Escape" });
      expect(rec.aborted).toBe(true);
      expect(props.onDismiss).not.toHaveBeenCalled();
    });
  });

  describe("changed-property highlight", () => {
    it("marks the changed property and scrolls it into view on open", () => {
      const scrollIntoView = stubScrollIntoView();
      const { container } = render(
        <EditorCard
          {...baseProps({
            initialValues: { height: "38px", color: "rgb(0, 0, 0)" },
            changedProperties: ["color"],
          })}
        />,
      );

      const marked = container.querySelectorAll('[data-changed="true"]');
      expect(marked).toHaveLength(1);
      // The property list scrolls, so a mark far down must be brought to hand.
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(marked[0]);
    });

    it("marks and scrolls nothing when an annotated element has no property change", () => {
      const scrollIntoView = stubScrollIntoView();
      // Instruction-only annotation: expanded, but nothing to highlight.
      const { container } = render(
        <EditorCard {...baseProps({ initialInstruction: "紧凑一点" })} />,
      );
      expect(screen.getByText("文本颜色")).toBeTruthy();
      expect(container.querySelectorAll("[data-changed]")).toHaveLength(0);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });

  describe("Esc key", () => {
    it("collapses to compact when expanded instead of dismissing", () => {
      const props = baseProps({ number: 1 });
      render(<EditorCard {...props} />);
      expect(screen.getByText("文本颜色")).toBeTruthy();

      fireEvent.keyDown(screen.getByPlaceholderText(PLACEHOLDER), { key: "Escape" });
      // Collapsed — property panel gone, no 保存 footer.
      expect(screen.queryByText("文本颜色")).toBeNull();
      expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
      // Must not dismiss — annotation mode stays.
      expect(props.onDismiss).not.toHaveBeenCalled();
    });

    it("dismisses the card when already compact", () => {
      const props = baseProps();
      render(<EditorCard {...props} />);
      expect(screen.queryByText("文本颜色")).toBeNull();

      fireEvent.keyDown(compactInput(), { key: "Escape" });
      expect(props.onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe("scrub collapse", () => {
    it("collapses the card to just the scrubbed row while dragging, restores on release", () => {
      const { container } = render(
        <EditorCard {...baseProps({ number: 1, initialValues: { height: "38px" } })} />,
      );
      const slider = screen.getByRole("slider");
      const activeRow = slider.closest('div[class*="min-h-"]') as HTMLElement;
      const otherRow = screen.getByText("文本颜色").closest('div[class*="min-h-"]') as HTMLElement;
      const footer = container.querySelector("footer") as HTMLElement;
      const shell = container.firstElementChild as HTMLElement;

      expect(otherRow.className).not.toContain("invisible");
      expect(footer.className).not.toContain("invisible");

      fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });

      // Mid-scrub: every other row and the header/footer chrome fade away;
      // the card shell goes transparent so the active row floats over the page.
      expect(otherRow.className).toContain("invisible");
      expect(footer.className).toContain("invisible");
      expect(activeRow.className).not.toContain("invisible");
      expect(activeRow.className).toContain("bg-surface-solid");
      expect(shell.className).toContain("bg-transparent");

      fireEvent.pointerUp(slider, { pointerId: 1 });

      expect(otherRow.className).not.toContain("invisible");
      expect(footer.className).not.toContain("invisible");
      expect(shell.className).toContain("bg-surface-solid");
    });

    /** The SizeGroup rows are the only sliders when the other numerics are absent. */
    const rowOf = (label: string): HTMLElement =>
      screen.getByText(label).closest('div[class*="min-h-"]') as HTMLElement;
    const sliderOf = (label: string): HTMLElement =>
      rowOf(label).querySelector('[role="slider"]') as HTMLElement;

    it("keeps the locked sibling row floating too, its number following live", async () => {
      // width/height are locked by default: dragging 高度 moves 宽度 on the
      // page, so hiding the 宽度 row would leave the page moving with no
      // control on screen explaining why.
      render(
        <EditorCard {...baseProps({ number: 1, initialValues: { height: "38px", width: "76px" } })} />,
      );

      fireEvent.pointerDown(sliderOf("高度"), { clientX: 100, pointerId: 1 });

      const widthRow = rowOf("宽度");
      expect(widthRow.className).not.toContain("invisible");
      // Same floating-bar treatment as the scrubbed row.
      expect(widthRow.className).toContain("bg-surface-solid");
      expect(rowOf("文本颜色").className).toContain("invisible");

      // Mid-drag the values snapshot is untouched (no re-render), so the
      // sibling's number is written to its DOM node directly: +38px doubles
      // the height (38→76), and the locked width follows 76→152.
      fireEvent.pointerMove(sliderOf("高度"), { clientX: 138, pointerId: 1 });
      await new Promise((r) => requestAnimationFrame(r)); // flush the rAF preview frame
      expect(
        document.querySelector('[data-scrub-property="width"] > span')?.textContent,
      ).toBe("152");

      fireEvent.pointerUp(sliderOf("高度"), { pointerId: 1 });
    });

    it("hides the sibling row when the pair is unlocked", () => {
      render(
        <EditorCard {...baseProps({ number: 1, initialValues: { height: "38px", width: "76px" } })} />,
      );
      fireEvent.click(screen.getByRole("button", { name: "解除锁定" }));

      fireEvent.pointerDown(sliderOf("高度"), { clientX: 100, pointerId: 1 });
      expect(rowOf("宽度").className).toContain("invisible");
      fireEvent.pointerUp(sliderOf("高度"), { pointerId: 1 });
    });
  });

  describe("per-property reset", () => {
    it("reverts a dirty row when its reset button is clicked", () => {
      const onRevert = vi.fn(() => "20px");
      const onStage = vi.fn();
      const { container } = render(
        <EditorCard
          {...baseProps({
            number: 1,
            initialValues: { height: "38px" },
            changedProperties: ["height"],
            onStage,
            onRevert,
          })}
        />,
      );
      expect(container.querySelector("[data-changed=\"true\"]")).not.toBeNull();
      // First make the row dirty by editing it
      const scrubSlider = screen.getByRole("slider");
      fireEvent.keyDown(scrubSlider, { key: "ArrowUp" });
      // Now the reset button should appear
      fireEvent.click(screen.getByRole("button", { name: "还原 高度" }));
      expect(onRevert).toHaveBeenCalledWith("height");
      expect(container.querySelector("[data-changed]")).toBeNull();
    });

    it("updates the value back to the original after reset", () => {
      // height/width are linked by default, so the reset also asks for width —
      // the mock records nothing for it (null) and only height comes back.
      const onRevert = vi.fn((property: string) => (property === "height" ? "20px" : null));
      render(
        <EditorCard
          {...baseProps({
            number: 1,
            initialValues: { height: "38px" },
            changedProperties: ["height"],
            onRevert,
          })}
        />,
      );
      // First make the row dirty by editing it
      const scrubSlider = screen.getByRole("slider");
      fireEvent.keyDown(scrubSlider, { key: "ArrowUp" });
      // The reset button should now appear
      fireEvent.click(screen.getByRole("button", { name: "还原 高度" }));
      expect(screen.getByText("20")).toBeTruthy();
    });

    it("keeps 保存 usable after resetting a dirty row", () => {
      const props = baseProps({
        number: 1,
        initialValues: { height: "38px" },
        changedProperties: ["height"],
        onRevert: vi.fn(() => "20px"),
      });
      render(<EditorCard {...props} />);
      expect(saveButton().disabled).toBe(true);

      // First make the row dirty by editing it
      const scrubSlider = screen.getByRole("slider");
      fireEvent.keyDown(scrubSlider, { key: "ArrowUp" });
      expect(saveButton().disabled).toBe(false);

      // Undoing the edit is an edit like any other — it only lands when
      // the user saves, so a dead 保存 here would strand the reset.
      fireEvent.click(screen.getByRole("button", { name: "还原 高度" }));
      expect(saveButton().disabled).toBe(false);
      fireEvent.click(saveButton());
      expect(props.onSave).toHaveBeenCalledTimes(1);
    });

    it("leaves 保存 disabled when the reset only undid this session's edit", () => {
      render(
        <EditorCard
          {...baseProps({
            initialValues: { height: "38px" },
            // Nothing recorded (onRevert → null), but edited in this session.
            onRevert: vi.fn(() => null),
          })}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "展开" }));
      // The height ScrubInput is a div[role="slider"].
      const scrubSlider = screen.getByRole("slider");
      fireEvent.keyDown(scrubSlider!, { key: "ArrowUp" });
      expect(saveButton().disabled).toBe(false);

      fireEvent.click(screen.getByRole("button", { name: "还原 高度" }));
      expect(saveButton().disabled).toBe(true);
    });
  });

  describe("text content row", () => {
    it("renders the 文本 row when the mount passed an initial text snapshot", () => {
      render(<EditorCard {...baseProps({ number: 1, initialText: "搜索" })} />);
      expect(screen.getByText("文本")).toBeTruthy();
      expect(screen.getByDisplayValue("搜索")).toBeTruthy();
    });

    it("omits the 文本 row when no text snapshot was passed", () => {
      render(<EditorCard {...baseProps({ number: 1 })} />);
      expect(screen.queryByText("文本")).toBeNull();
    });

    it("stages edits under the text-content pseudo-property and enables save", () => {
      const props = baseProps({ number: 1, initialText: "搜索" });
      render(<EditorCard {...props} />);
      expect(saveButton().disabled).toBe(true);

      fireEvent.change(screen.getByDisplayValue("搜索"), { target: { value: "检索" } });
      expect(props.onStage).toHaveBeenCalledWith("text-content", "检索", true);
      expect(saveButton().disabled).toBe(false);
    });

    it("typing back the original text leaves save disabled", () => {
      const props = baseProps({ number: 1, initialText: "搜索" });
      render(<EditorCard {...props} />);
      const field = screen.getByDisplayValue("搜索");
      fireEvent.change(field, { target: { value: "检索" } });
      fireEvent.change(field, { target: { value: "搜索" } });
      expect(saveButton().disabled).toBe(true);
    });

    it("highlights the row when text-content is in changedProperties", () => {
      const scrollIntoView = stubScrollIntoView();
      const { container } = render(
        <EditorCard
          {...baseProps({ initialText: "搜索", changedProperties: ["text-content"] })}
        />,
      );
      const marked = container.querySelectorAll('[data-changed="true"]');
      expect(marked).toHaveLength(1);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });
  });
});
