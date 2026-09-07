import { beforeEach, describe, expect, it } from "vitest";
import { ChangeTracker } from "../changes/ChangeTracker";
import { PreviewEngine } from "../preview/PreviewEngine";
import { StagingEngine } from "./StagingEngine";

describe("StagingEngine", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("removes a property from the staged session with unstage()", () => {
    const preview = new PreviewEngine();
    const changes = new ChangeTracker();
    const engine = new StagingEngine(preview, changes);

    const element = document.createElement("div");
    element.style.height = "38px";
    document.body.appendChild(element);

    engine.begin("ut-001");
    engine.stage(element, "height", "52px");
    expect(engine.staged()).toHaveLength(1);

    engine.unstage("height");
    expect(engine.staged()).toHaveLength(0);

    document.body.removeChild(element);
  });

  it("does not throw when unstage() is called outside a session", () => {
    const preview = new PreviewEngine();
    const changes = new ChangeTracker();
    const engine = new StagingEngine(preview, changes);
    expect(() => engine.unstage("height")).not.toThrow();
  });
});
