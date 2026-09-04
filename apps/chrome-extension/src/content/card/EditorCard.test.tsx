// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    tagName: "button",
    number: null,
    initialValues: { height: "38px" },
    initialInstruction: "",
    changedProperties: [],
    onStage: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    onRevert: vi.fn(() => null),
    ...overrides,
  };
}

const PLACEHOLDER = "这个元素要怎么改？";

/** The compact row's single-line field; the expanded state uses a textarea. */
function compactInput(): HTMLInputElement {
  return screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement;
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "保存" }) as HTMLButtonElement;
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
      // No property groups, no 保存/取消 footer — that is the expanded state.
      expect(screen.queryByText("布局")).toBeNull();
      expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    });

    it.each([
      ["it already has a bubble number", { number: 2 }],
      ["it has recorded property changes", { changedProperties: ["height"] }],
      ["it has a saved instruction", { initialInstruction: "紧凑一点" }],
    ])("opens expanded when %s", (_why, overrides) => {
      render(<EditorCard {...baseProps(overrides)} />);

      expect(screen.getByText("布局")).toBeTruthy();
      expect(compactInput().tagName).toBe("TEXTAREA");
      expect(saveButton()).toBeTruthy();
    });

    it("collapses to the compact row and expands back", () => {
      render(<EditorCard {...baseProps({ number: 1 })} />);

      fireEvent.click(screen.getByRole("button", { name: "收起" }));
      expect(screen.queryByText("布局")).toBeNull();
      expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
      expect(compactInput().tagName).toBe("INPUT");
      // The badge survives the collapse — the annotation is still there.
      expect(screen.getByText("1")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "展开" }));
      expect(screen.getByText("布局")).toBeTruthy();
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

  describe("badges", () => {
    it("shows the tag name and a settings icon when number is null", () => {
      render(<EditorCard {...baseProps()} />);
      expect(screen.getByText("button")).toBeTruthy();
      expect(screen.getByLabelText("拖动卡片")).toBeTruthy();
    });

    it("shows the sequence number badge when provided", () => {
      render(<EditorCard {...baseProps({ number: 3 })} />);
      expect(screen.getByText("3")).toBeTruthy();
      expect(screen.queryByText("button")).toBeNull();
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

    it("calls onCancel and onDelete", () => {
      const props = baseProps({ number: 1 });
      render(<EditorCard {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "取消" }));
      expect(props.onCancel).toHaveBeenCalledTimes(1);
      // 删除 is icon-only; its accessible name still has to be the action.
      fireEvent.click(screen.getByRole("button", { name: "删除" }));
      expect(props.onDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("voice input", () => {
    it("offers the mic but keeps it disabled with a coming-soon hint", () => {
      render(<EditorCard {...baseProps()} />);
      const mic = screen.getByRole("button", { name: "语音输入即将上线" }) as HTMLButtonElement;
      expect(mic.disabled).toBe(true);
      // A disabled button swallows hover, so the tooltip sits on the wrapper.
      expect(mic.parentElement?.getAttribute("title")).toBe("语音输入即将上线");
    });

    it("keeps the mic disabled in the expanded state too", () => {
      render(<EditorCard {...baseProps({ number: 1 })} />);
      const mic = screen.getByRole("button", { name: "语音输入即将上线" }) as HTMLButtonElement;
      expect(mic.disabled).toBe(true);
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
      expect(screen.getByText("布局")).toBeTruthy();
      expect(container.querySelectorAll("[data-changed]")).toHaveLength(0);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });

  describe("per-property reset", () => {
    it("reverts a changed row when its reset button is clicked", () => {
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
      fireEvent.click(screen.getByRole("button", { name: "还原 高" }));
      expect(onRevert).toHaveBeenCalledWith("height");
      expect(container.querySelector("[data-changed]")).toBeNull();
    });

    it("updates the value back to the original after reset", () => {
      const onRevert = vi.fn(() => "20px");
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
      // The numeric display should switch to the original value returned by onRevert.
      fireEvent.click(screen.getByRole("button", { name: "还原 高" }));
      expect(screen.getByText("20")).toBeTruthy();
    });
  });
});
