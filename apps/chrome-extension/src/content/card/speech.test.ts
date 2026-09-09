// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendUtterance,
  isSpeechSupported,
  startDictation,
  useVoiceDictation,
  type DictationHandlers,
} from "./speech";

/**
 * jsdom ships no SpeechRecognition, so every test injects a fake constructor
 * onto window and drives the handlers by hand. The fake records start/stop/
 * abort and exposes emit* helpers to simulate the browser firing events.
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
  emitError(error: string): void {
    this.onerror?.({ error });
  }
  emitEnd(): void {
    this.onend?.();
  }
}

function installFake(): void {
  FakeRecognition.instances = [];
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
}

function removeFake(): void {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
}

function handlers(): DictationHandlers & { calls: Record<"interim" | "final" | "error" | "end", unknown[][]> } {
  const calls: Record<"interim" | "final" | "error" | "end", unknown[][]> = { interim: [], final: [], error: [], end: [] };
  return {
    calls,
    onInterim: (t) => calls.interim.push([t]),
    onFinal: (t) => calls.final.push([t]),
    onError: (k) => calls.error.push([k]),
    onEnd: () => calls.end.push([]),
  };
}

beforeEach(installFake);
afterEach(removeFake);

describe("isSpeechSupported", () => {
  it("is true when the constructor exists and false when it does not", () => {
    expect(isSpeechSupported()).toBe(true);
    removeFake();
    expect(isSpeechSupported()).toBe(false);
  });
});

describe("appendUtterance", () => {
  it("joins with a single space", () => {
    expect(appendUtterance("圆角更大", "再大一点")).toBe("圆角更大 再大一点");
  });
  it("returns the utterance alone when there is no existing text", () => {
    expect(appendUtterance("", "hello")).toBe("hello");
    expect(appendUtterance("   ", "hello")).toBe("hello");
  });
  it("trims trailing whitespace off the base and ignores blank utterances", () => {
    expect(appendUtterance("base  ", "next")).toBe("base next");
    expect(appendUtterance("base", "   ")).toBe("base");
  });
});

describe("startDictation", () => {
  it("returns null when unsupported", () => {
    removeFake();
    expect(startDictation("zh-CN", handlers())).toBeNull();
  });

  it("configures the recognizer and starts it", () => {
    const session = startDictation("zh-CN", handlers());
    expect(session).not.toBeNull();
    const rec = FakeRecognition.instances[0]!;
    expect(rec.lang).toBe("zh-CN");
    expect(rec.interimResults).toBe(true);
    expect(rec.continuous).toBe(false);
    expect(rec.started).toBe(true);
  });

  it("routes interim and final results separately", () => {
    const h = handlers();
    startDictation("zh-CN", h);
    const rec = FakeRecognition.instances[0]!;
    rec.emitInterim("把字");
    rec.emitFinal("把字号调大");
    expect(h.calls.interim).toEqual([["把字"]]);
    expect(h.calls.final).toEqual([["把字号调大"]]);
  });

  it("maps raw error strings to dictation errors", () => {
    const h = handlers();
    startDictation("zh-CN", h);
    const rec = FakeRecognition.instances[0]!;
    rec.emitError("not-allowed");
    rec.emitError("no-speech");
    rec.emitError("network");
    rec.emitError("aborted");
    rec.emitError("something-else");
    expect(h.calls.error).toEqual([["denied"], ["no-speech"], ["network"], ["aborted"], ["other"]]);
  });

  it("stop/abort delegate to the recognizer and onEnd fires", () => {
    const h = handlers();
    const session = startDictation("zh-CN", h)!;
    const rec = FakeRecognition.instances[0]!;
    session.stop();
    expect(rec.stopped).toBe(true);
    session.abort();
    expect(rec.aborted).toBe(true);
    rec.emitEnd();
    expect(h.calls.end).toHaveLength(1);
  });
});

describe("useVoiceDictation", () => {
  function setup() {
    const commit = vi.fn();
    const view = renderHook(() => useVoiceDictation(commit));
    return { commit, ...view };
  }

  it("reports supported and starts listening on toggle", () => {
    const { result } = setup();
    expect(result.current.supported).toBe(true);
    expect(result.current.listening).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.listening).toBe(true);
    expect(FakeRecognition.instances[0]!.started).toBe(true);
  });

  it("shows interim text without committing it", () => {
    const { result, commit } = setup();
    act(() => result.current.toggle());
    const rec = FakeRecognition.instances[0]!;
    act(() => rec.emitInterim("字号"));
    expect(result.current.interim).toBe("字号");
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits final text via the updater and clears interim", () => {
    const { result, commit } = setup();
    act(() => result.current.toggle());
    const rec = FakeRecognition.instances[0]!;
    act(() => rec.emitInterim("字"));
    act(() => rec.emitFinal("字号调大"));
    expect(commit).toHaveBeenCalledTimes(1);
    // The updater appends onto whatever the instruction currently is.
    const updater = commit.mock.calls[0]![0] as (prev: string) => string;
    expect(updater("圆角")).toBe("圆角 字号调大");
    expect(result.current.interim).toBe("");
  });

  it("stops (not aborts) when toggled while listening", () => {
    const { result } = setup();
    act(() => result.current.toggle());
    const rec = FakeRecognition.instances[0]!;
    act(() => result.current.toggle());
    expect(rec.stopped).toBe(true);
    expect(rec.aborted).toBe(false);
  });

  it("resets listening and interim on end", () => {
    const { result } = setup();
    act(() => result.current.toggle());
    const rec = FakeRecognition.instances[0]!;
    act(() => rec.emitInterim("字"));
    act(() => rec.emitEnd());
    expect(result.current.listening).toBe(false);
    expect(result.current.interim).toBe("");
  });

  it("surfaces a permission error and a silent abort maps to no message", () => {
    const { result } = setup();
    act(() => result.current.toggle());
    const rec = FakeRecognition.instances[0]!;
    act(() => rec.emitError("not-allowed"));
    expect(result.current.errorKey).toBe("card.micDenied");
    act(() => rec.emitError("aborted"));
    expect(result.current.errorKey).toBeNull();
  });

  it("cancel aborts and drops the session", () => {
    const { result } = setup();
    act(() => result.current.toggle());
    const rec = FakeRecognition.instances[0]!;
    act(() => result.current.cancel());
    expect(rec.aborted).toBe(true);
    expect(result.current.listening).toBe(false);
  });

  it("aborts the live session on unmount", () => {
    const { result, unmount } = setup();
    act(() => result.current.toggle());
    const rec = FakeRecognition.instances[0]!;
    unmount();
    expect(rec.aborted).toBe(true);
  });

  it("is unsupported (and a no-op) when the constructor is missing", () => {
    removeFake();
    const { result, commit } = setup();
    expect(result.current.supported).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.listening).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });
});
