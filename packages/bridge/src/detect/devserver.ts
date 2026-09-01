/**
 * Dev server detection (plan §15 "Dev server"): probe common local dev ports
 * with a short-timeout HEAD/GET and return the first URL that answers.
 * Side-effect free — probes only hit loopback candidates.
 */

export const DEFAULT_DEV_SERVER_CANDIDATES: readonly string[] = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:4000",
  "http://localhost:8000",
];

const PROBE_TIMEOUT_MS = 400;

async function isAlive(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // Any response (even 404/500) proves a dev server is listening.
    await fetch(url, { signal: controller.signal, mode: "no-cors" });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** First answering candidate, or null. */
export async function probeDevServer(
  candidates: readonly string[] = DEFAULT_DEV_SERVER_CANDIDATES,
): Promise<string | null> {
  for (const url of candidates) {
    if (await isAlive(url)) return url;
  }
  return null;
}
