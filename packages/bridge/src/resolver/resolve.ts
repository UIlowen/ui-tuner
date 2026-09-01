import type { SelectionPayload, SourceResolution } from "@ui-tuner/protocol";
import { buildSourceIndex, type SourceIndexEntry } from "./indexer.js";

/**
 * Source resolution (plan §19/§20): score every indexed file against the
 * selection's identity signals (plan §21) and map the best score to a
 * confidence level. Never fabricates a location — weak or ambiguous matches
 * degrade to `inferred` (file only) or `unknown` (Preview only).
 *
 * Signal weights (v1, tuned against examples/react-vite):
 * - JSX text literal match is the strongest signal and is required for
 *   `exact` — it points at the JSX call site, same as React's own semantics.
 * - className / tag / id matches are corroborating signals.
 */

const TEXT_SCORE = 4;
const UNIQUE_TEXT_BONUS = 1;
const CLASS_SCORE = 1;
const CLASS_SCORE_CAP = 3;
const TAG_SCORE = 1;
const ID_SCORE = 3;
const EXACT_MIN_SCORE = 5;
const EXACT_MIN_LEAD = 2;
const INFERRED_MIN_SCORE = 3;

/** Signals extracted from a selection (plan §21 Element Identity). */
export interface ResolveSignals {
  text?: string;
  classes: string[];
  tagName: string;
  idAnchor?: string;
}

/** Pull matching signals out of the selection payload the browser sent. */
export function signalsFromSelection(selection: SelectionPayload): ResolveSignals {
  const classes = new Set<string>();

  // Richest source: the class attribute in the DOM snapshot's outerHTML.
  const outerClass = /class="([^"]*)"/.exec(selection.dom?.outerHTML ?? "");
  if (outerClass) {
    for (const token of outerClass[1]!.split(/\s+/)) {
      if (token) classes.add(token);
    }
  }

  // Fallback: the structural fingerprint `tag#id.cls1.cls2>[children]`.
  const fingerprint = selection.element.domFingerprint;
  if (fingerprint) {
    const classPart = /^[^.]*?\.(.+?)>\[/.exec(fingerprint);
    if (classPart) {
      for (const token of classPart[1]!.split(".")) {
        if (token) classes.add(token);
      }
    }
  }

  const idAnchor = /#([A-Za-z][A-Za-z0-9_-]*)/.exec(selection.element.selector)?.[1];

  return {
    text: selection.element.text,
    classes: [...classes],
    tagName: selection.element.tagName,
    idAnchor,
  };
}

interface ScoredEntry {
  entry: SourceIndexEntry;
  score: number;
  line: number;
  textMatched: boolean;
}

function scoreEntry(
  entry: SourceIndexEntry,
  signals: ResolveSignals,
  unique: boolean,
): ScoredEntry {
  let score = 0;
  let line = 0;
  let textMatched = false;

  if (signals.text) {
    const hit = entry.texts.find((candidate) => candidate.value === signals.text);
    if (hit) {
      score += TEXT_SCORE + (unique ? UNIQUE_TEXT_BONUS : 0);
      line = hit.line;
      textMatched = true;
    }
  }

  let classHits = 0;
  for (const token of signals.classes) {
    const hit = entry.classNames.find((candidate) => candidate.value === token);
    if (hit) {
      classHits += 1;
      if (line === 0) line = hit.line;
    }
  }
  score += Math.min(classHits, CLASS_SCORE_CAP) * CLASS_SCORE;

  const tagHit = entry.tags.find((candidate) => candidate.value === signals.tagName);
  if (tagHit) {
    score += TAG_SCORE;
    if (line === 0) line = tagHit.line;
  }

  if (signals.idAnchor) {
    const idHit = entry.ids.find((candidate) => candidate.value === signals.idAnchor);
    if (idHit) {
      score += ID_SCORE;
      if (line === 0) line = idHit.line;
    }
  }

  return { entry, score, line: line || 1, textMatched };
}

/** Resolve a selection against a prebuilt index. */
export function resolveFromIndex(
  index: SourceIndexEntry[],
  selection: SelectionPayload,
): SourceResolution {
  const signals = signalsFromSelection(selection);
  const elementId = selection.element.id;

  // A text literal found in exactly one file is a stronger identity signal.
  const uniqueText =
    signals.text !== undefined &&
    index.filter((entry) => entry.texts.some((candidate) => candidate.value === signals.text))
      .length === 1;

  const scored = index
    .map((entry) => scoreEntry(entry, signals, uniqueText))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.file.localeCompare(b.entry.file));

  const top = scored[0];
  if (!top) return { elementId, confidence: "unknown" };

  const lead = top.score - (scored[1]?.score ?? 0);
  if (top.textMatched && top.score >= EXACT_MIN_SCORE && lead >= EXACT_MIN_LEAD) {
    return {
      elementId,
      confidence: "exact",
      componentName: top.entry.componentName,
      file: top.entry.file,
      line: top.line,
    };
  }
  if (top.score >= INFERRED_MIN_SCORE) {
    // Inferred never ships a line number (plan §20: "Possible: file").
    return {
      elementId,
      confidence: "inferred",
      componentName: top.entry.componentName,
      file: top.entry.file,
    };
  }
  return { elementId, confidence: "unknown" };
}

/** One-shot convenience: build the index for `root` and resolve. */
export function resolveSource(root: string, selection: SelectionPayload): SourceResolution {
  return resolveFromIndex(buildSourceIndex(root), selection);
}
