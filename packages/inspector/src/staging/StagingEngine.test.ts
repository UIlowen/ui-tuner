// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ChangeTracker } from "../changes/ChangeTracker";
import { PreviewEngine } from "../preview/PreviewEngine";
import { StagingEngine } from "./StagingEngine";

function makeElement(id: string): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("data-ui-tuner-id", id);
  document.body.appendChild(el);
  return el;
}

describe("StagingEngine", () => {
  let preview: PreviewEngine;
  let changes: ChangeTracker;
  let engine: StagingEngine;
  let el: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.getElementById(PreviewEngine.STYLE_ID)?.remove();
    preview = new PreviewEngine();
    changes = new ChangeTracker();
    engine = new StagingEngine(preview, changes);
    el = makeElement("ut-1");
  });

  it("stage previews without recording to the ChangeTracker", () => {
    engine.begin("ut-1");
    engine.stage(el, "height", "52px");
    expect(preview.cssText()).toContain("height: 52px");
    expect(changes.all()).toEqual([]); // 保存才记录
    expect(engine.staged()).toEqual([{ property: "height", value: "52px" }]);
  });

  it("commit records staged edits with the captured original value", () => {
    engine.begin("ut-1");
    engine.stage(el, "height", "52px");
    const recorded = engine.commit();
    expect(recorded).toBe(true);
    const change = changes.find("ut-1", "height");
    expect(change?.nextValue).toBe("52px");
    expect(change?.previousValue).toBe("auto"); // 原值在 override 前捕获（jsdom 未设置 height 时返回 "auto"）
    expect(engine.isActive).toBe(false); // commit 结束会话
  });

  it("commit drops a staged edit that lands back on the original (no-op)", () => {
    el.style.height = "38px";
    engine.begin("ut-1");
    engine.stage(el, "height", "38px"); // 等于原值
    const recorded = engine.commit();
    expect(recorded).toBe(false);
    expect(changes.find("ut-1", "height")).toBeUndefined();
  });

  it("rollback restores the pre-session override and leaves no trace", () => {
    engine.begin("ut-1");
    engine.stage(el, "height", "52px");
    engine.rollback();
    expect(preview.cssText()).not.toContain("height: 52px");
    expect(changes.all()).toEqual([]);
    expect(engine.isActive).toBe(false);
  });

  it("rollback keeps a previously-saved change's override", () => {
    changes.record("ut-1", "height", "40px", "38px"); // 之前已保存
    preview.setOverride("ut-1", "height", "40px");
    engine.begin("ut-1");
    engine.stage(el, "height", "52px");
    engine.rollback();
    expect(preview.cssText()).toContain("height: 40px"); // 还原到已保存值
    expect(changes.find("ut-1", "height")?.nextValue).toBe("40px"); // 已保存改动不动
  });

  it("end rolls back an unsaved session", () => {
    engine.begin("ut-1");
    engine.stage(el, "height", "52px");
    engine.end();
    expect(preview.cssText()).not.toContain("height: 52px");
    expect(changes.all()).toEqual([]);
  });
});
