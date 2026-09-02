import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

/**
 * Static component index for source resolution (plan §19, M6).
 *
 * Regex-level extraction over conventional Vite/React structure — no parser
 * dependency. Per file we keep the signals the resolver scores against:
 * JSX text literals, className tokens, lowercase JSX tags, id attributes,
 * plus the component name and a 1-based line for every hit.
 */

export interface SourceHit {
  value: string;
  line: number;
}

export interface SourceIndexEntry {
  /** Project-root-relative, posix-style path (e.g. src/components/Card.tsx). */
  file: string;
  componentName: string;
  /** JSX text literals: `>文本<` (may span lines). */
  texts: SourceHit[];
  /** Individual class tokens from `className="…"` (strings and template statics). */
  classNames: SourceHit[];
  /** Lowercase JSX open tags (`<button`, `<div`, …). */
  tags: SourceHit[];
  /** `id="…"` literals. */
  ids: SourceHit[];
}

const SOURCE_EXTENSIONS = new Set([".tsx", ".jsx", ".ts", ".js", ".html"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".next", "build", "out", "coverage"]);
/** Safety rails: dev projects are small, but never walk unbounded trees. */
const MAX_FILES = 500;
const MAX_FILE_BYTES = 200_000;

/** Build the static index for `root` (its `src/` when present, else root). */
export function buildSourceIndex(root: string): SourceIndexEntry[] {
  const scanRoot = existsSync(join(root, "src")) ? join(root, "src") : root;
  const files: string[] = [];
  collectSourceFiles(scanRoot, files, { remaining: MAX_FILES });
  const entries: SourceIndexEntry[] = [];
  for (const path of files) {
    const entry = indexFile(root, path);
    if (entry) entries.push(entry);
  }
  return entries;
}

function collectSourceFiles(dir: string, out: string[], budget: { remaining: number }): void {
  if (budget.remaining <= 0) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // Unreadable directory — skip, never crash resolution.
  }
  for (const entry of entries) {
    if (budget.remaining <= 0) return;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        collectSourceFiles(path, out, budget);
      }
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      budget.remaining -= 1;
      out.push(path);
    }
  }
}

const JSX_TEXT = />([^<>{}]{2,80})</gs;
/** className="…" (JSX) and class="…" (HTML / HTML-in-JS templates) — each quote style its own branch so inner quotes survive. */
const CLASS_ATTR = /\bclass(?:Name)?\s*=\s*(?:\{\s*)?(?:"([^"]*)"|'([^']*)'|`([^`]*)`)(?:\s*\})?/g;
const ID_ATTR = /\sid\s*=\s*"([^"]+)"/g;
const JSX_TAG = /<([a-z][a-z0-9-]*)(?=[\s>/])/g;
/** Text that is operator/punctuation junk, not a human-readable literal. */
const TEXT_JUNK = /^[\s{}()[\],.;:!?&|+\-*/%=<>#@'"`~^\\]*$/;
const TEMPLATE_EXPR = /\$\{[^}]*\}/g;

function indexFile(root: string, path: string): SourceIndexEntry | null {
  let content: string;
  try {
    if (statSync(path).size > MAX_FILE_BYTES) return null;
    content = readFileSync(path, "utf8");
  } catch {
    return null;
  }

  const texts: SourceHit[] = [];
  for (const match of content.matchAll(JSX_TEXT)) {
    const rawText = match[1] ?? "";
    const value = rawText.replace(/\s+/g, " ").trim();
    if (value.length < 2 || TEXT_JUNK.test(value)) continue;
    texts.push({ value, line: hitLine(content, match.index, rawText, value) });
  }

  const classNames: SourceHit[] = [];
  for (const match of content.matchAll(CLASS_ATTR)) {
    const raw = match[1] ?? match[2] ?? match[3] ?? "";
    const line = lineNumberAt(content, match.index);
    const tokens = new Set<string>();
    // Static parts (template expressions removed)…
    for (const token of raw.replace(TEMPLATE_EXPR, " ").split(/\s+/)) {
      if (token) tokens.add(token);
    }
    // …plus string literals inside expressions (`cond ? "btn-ghost" : "btn-primary"`).
    for (const quoted of raw.matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)) {
      for (const token of (quoted[1] ?? quoted[2] ?? "").split(/\s+/)) {
        if (token) tokens.add(token);
      }
    }
    for (const token of tokens) classNames.push({ value: token, line });
  }

  const tags: SourceHit[] = [];
  for (const match of content.matchAll(JSX_TAG)) {
    const tag = match[1];
    if (tag) tags.push({ value: tag, line: lineNumberAt(content, match.index) });
  }

  const ids: SourceHit[] = [];
  for (const match of content.matchAll(ID_ATTR)) {
    const id = match[1];
    if (id) ids.push({ value: id, line: lineNumberAt(content, match.index) });
  }

  return {
    file: relative(root, path).split(sep).join("/"),
    componentName: componentNameOf(content, path),
    texts,
    classNames,
    tags,
    ids,
  };
}

function componentNameOf(content: string, path: string): string {
  // Static HTML has no component concept — the file stem is the honest label.
  // (An uppercase token in an inline <script> is not a component name.)
  if (extname(path) === ".html") {
    const stem = path.split(sep).pop() ?? path;
    return stem.replace(/\.[^.]+$/, "");
  }
  const direct = /export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Z][A-Za-z0-9]*)/.exec(
    content,
  );
  if (direct) return direct[1]!;
  const reference = /export\s+default\s+([A-Z][A-Za-z0-9]*)\b/.exec(content);
  if (reference) return reference[1]!;
  const named = /(?:export\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9]*)/.exec(content);
  if (named) return named[1]!;
  const stem = path.split(sep).pop() ?? path;
  return stem.replace(/\.[^.]+$/, "");
}

/** 1-based line of `index` within `content`. */
function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/** Line where the (trimmed) literal actually starts — literals may span lines. */
function hitLine(content: string, matchIndex: number, raw: string, trimmed: string): number {
  const offset = raw.indexOf(trimmed);
  return lineNumberAt(content, matchIndex + (offset >= 0 ? offset : 0));
}
