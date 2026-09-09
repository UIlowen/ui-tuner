import { useEffect, useRef, useState } from "react";
import type { MessageKey } from "../../i18n/messages";
import { usePrefsStore } from "../../state/prefs";

/**
 * Voice dictation for the editor card's instruction field (Web Speech API).
 *
 * Two layers, deliberately split:
 *
 *   startDictation — a thin, React-free wrapper over the (webkit)SpeechRecognition
 *                    global. jsdom has no such global, so tests inject a fake
 *                    constructor onto `window` and drive the handlers directly.
 *
 *   useVoiceDictation — the React state machine the card consumes: listening /
 *                    interim / error, a toggle, and unmount cleanup. Interim
 *                    text is kept OUT of the committed instruction so aborting
 *                    a session drops it cleanly.
 *
 * Verified by spike (2026-09-09): on localhost the API constructs, `start()`
 * doesn't throw, mic permission resolves and the service fires `onstart`.
 * Actual audio→text needs a real mic — not coverable headless.
 */

/* The SpeechRecognition interface is still non-standard, so lib.dom doesn't
 * declare it. These are the minimal structural shapes we rely on. */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function resolveCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True when this browser can dictate at all; false → keep the coming-soon mic. */
export function isSpeechSupported(): boolean {
  return resolveCtor() !== null;
}

export type DictationError = "denied" | "no-speech" | "network" | "aborted" | "other";

export interface DictationHandlers {
  /** Live, not-yet-committed transcript — re-rendered as the user speaks. */
  onInterim(text: string): void;
  /** A finished utterance; append it to the instruction. */
  onFinal(text: string): void;
  onError(kind: DictationError): void;
  /** Fired on any stop — manual, auto (silence), or after an error. */
  onEnd(): void;
}

export interface DictationSession {
  /** Finish gracefully: deliver any pending final result, then end. */
  stop(): void;
  /** Cancel immediately: pending results are discarded. */
  abort(): void;
}

function mapError(raw: string): DictationError {
  switch (raw) {
    case "not-allowed":
    case "service-not-allowed":
    case "audio-capture":
      return "denied";
    case "no-speech":
      return "no-speech";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    default:
      return "other";
  }
}

/**
 * Start one dictation session against the browser's recognizer. Returns null
 * when unsupported. `continuous: false` because the common case is a single
 * sentence — recognition ends itself on a pause.
 */
export function startDictation(lang: string, handlers: DictationHandlers): DictationSession | null {
  const Ctor = resolveCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result) continue;
      if (result.isFinal) handlers.onFinal(result[0].transcript);
      else interim += result[0].transcript;
    }
    if (interim) handlers.onInterim(interim);
  };
  rec.onerror = (event) => handlers.onError(mapError(event.error));
  rec.onend = () => handlers.onEnd();
  rec.start();
  return {
    stop: () => rec.stop(),
    abort: () => rec.abort(),
  };
}

/** Append a dictated utterance onto existing text without mangling spaces. */
export function appendUtterance(existing: string, utterance: string): string {
  const base = existing.replace(/\s+$/u, "");
  const add = utterance.trim();
  if (!add) return existing;
  return base ? `${base} ${add}` : add;
}

/** The message key a DictationError maps to; "aborted" stays silent. */
function errorMessageKey(kind: DictationError): MessageKey | null {
  switch (kind) {
    case "denied":
      return "card.micDenied";
    case "no-speech":
      return "card.micNoSpeech";
    case "network":
      return "card.micNetwork";
    case "other":
      return "card.micError";
    case "aborted":
      return null;
  }
}

export interface VoiceDictation {
  /** False → the mic stays a disabled "coming soon" affordance. */
  supported: boolean;
  listening: boolean;
  /** Live transcript while listening; render as a pending suffix, not committed. */
  interim: string;
  /** A transient error to surface (tooltip/hint); null when clear. */
  errorKey: MessageKey | null;
  /** Mic click: start when idle, stop when listening. */
  toggle(): void;
  /** Esc / unmount: cancel and drop the interim text. */
  cancel(): void;
}

/**
 * Drives the card's mic button. `commit` receives the running instruction and
 * returns the new one (the card passes its setInstruction wrapper).
 */
export function useVoiceDictation(commit: (updater: (prev: string) => string) => void): VoiceDictation {
  const locale = usePrefsStore((s) => s.locale);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const sessionRef = useRef<DictationSession | null>(null);

  const end = (): void => {
    sessionRef.current = null;
    setListening(false);
    setInterim("");
  };

  const toggle = (): void => {
    if (listening) {
      sessionRef.current?.stop();
      return;
    }
    setErrorKey(null);
    const session = startDictation(locale === "zh" ? "zh-CN" : "en-US", {
      onInterim: setInterim,
      onFinal: (text) => {
        commit((prev) => appendUtterance(prev, text));
        setInterim("");
      },
      onError: (kind) => setErrorKey(errorMessageKey(kind)),
      onEnd: end,
    });
    if (!session) return;
    sessionRef.current = session;
    setListening(true);
  };

  const cancel = (): void => {
    sessionRef.current?.abort();
    end();
  };

  // A live session must not outlive the card that started it.
  useEffect(() => () => sessionRef.current?.abort(), []);

  return { supported: isSpeechSupported(), listening, interim, errorKey, toggle, cancel };
}
