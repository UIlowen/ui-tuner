// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { usePrefsStore } from "../../state/prefs";
import { EditorCard } from "./EditorCard";
import type { EditorCardProps } from "./types";

function baseProps(overrides: Partial<EditorCardProps> = {}): EditorCardProps {
  return {
    elementId: "ut-000001",
    tagName: "button",
    number: null,
    initialValues: { height: "38px" },
    initialInstruction: "",
    onStage: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

describe("EditorCard", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    // StylePanel labels come from useT(); seed the locale or they throw.
    usePrefsStore.setState({ locale: "zh" });
  });

  it("shows the properties view by default and toggles to natural language", () => {
    render(<EditorCard {...baseProps()} />);

    // Default: properties view (StylePanel group headers visible).
    expect(screen.getByText("布局")).toBeTruthy();
    expect(screen.queryByPlaceholderText("对这个元素的修改要求…")).toBeNull();

    const propsTab = screen.getByRole("button", { name: "属性精调" });
    const nlTab = screen.getByRole("button", { name: "自然语言" });
    expect(propsTab.getAttribute("aria-pressed")).toBe("true");
    expect(nlTab.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(nlTab);
    expect(screen.getByPlaceholderText("对这个元素的修改要求…")).toBeTruthy();
    expect(screen.queryByText("布局")).toBeNull();
    expect(nlTab.getAttribute("aria-pressed")).toBe("true");
    expect(propsTab.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the tag name and an unsaved badge when number is null", () => {
    render(<EditorCard {...baseProps({ number: null })} />);
    expect(screen.getByText("button")).toBeTruthy();
    expect(screen.getByText("未保存")).toBeTruthy();
  });

  it("shows the sequence number badge when provided", () => {
    render(<EditorCard {...baseProps({ number: 3 })} />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByText("未保存")).toBeNull();
  });

  it("disables save until something changes", () => {
    render(<EditorCard {...baseProps()} />);
    const save = screen.getByRole("button", { name: "保存" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "自然语言" }));
    fireEvent.change(screen.getByPlaceholderText("对这个元素的修改要求…"), {
      target: { value: "再大一点" },
    });
    expect(save.disabled).toBe(false);
  });

  it("stays non-dirty when the instruction only differs by whitespace", () => {
    render(<EditorCard {...baseProps({ initialInstruction: "紧凑一点" })} />);
    const save = screen.getByRole("button", { name: "保存" }) as HTMLButtonElement;
    fireEvent.click(screen.getByRole("button", { name: "自然语言" }));
    fireEvent.change(screen.getByPlaceholderText("对这个元素的修改要求…"), {
      target: { value: "  紧凑一点 " },
    });
    expect(save.disabled).toBe(true);
  });

  it("calls onSave with the current instruction", () => {
    const props = baseProps();
    render(<EditorCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "自然语言" }));
    fireEvent.change(screen.getByPlaceholderText("对这个元素的修改要求…"), {
      target: { value: "圆角更大" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(props.onSave).toHaveBeenCalledWith("圆角更大");
  });

  it("calls onCancel and onDelete", () => {
    const props = baseProps();
    render(<EditorCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("collapses to a thin strip and expands back", () => {
    render(<EditorCard {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "折叠" }));

    // Body gone: no toggle, no style groups, no footer.
    expect(screen.queryByRole("button", { name: "属性精调" })).toBeNull();
    expect(screen.queryByText("布局")).toBeNull();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    // Thin strip keeps the tag name and offers expand.
    expect(screen.getByText("button")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "展开" }));
    expect(screen.getByRole("button", { name: "属性精调" })).toBeTruthy();
    expect(screen.getByText("布局")).toBeTruthy();
  });
});
