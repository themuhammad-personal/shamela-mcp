import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs";

export const SHAMELA_ORIGIN = "https://shamela.ws";
export const SHAMELA_USER_AGENT = "ShamelaMCP/2.5";
export const CHECKPOINT_VERSION = 2;

export function robotsAllows(robots, path = "/book/") {
  const groups = String(robots ?? "").split(/\n\s*\n/);
  const applicable = groups.filter((group) => /^\s*user-agent\s*:\s*(?:\*|ShamelaMCP)/im.test(group));
  if (!applicable.length) return false;
  let best = null;
  for (const group of applicable) {
    for (const line of group.split(/\r?\n/)) {
      const match = /^\s*(allow|disallow)\s*:\s*(.*?)\s*$/i.exec(line);
      if (!match || !match[2] || !path.startsWith(match[2])) continue;
      if (!best || match[2].length > best.rule.length) best = { allow: match[1].toLowerCase() === "allow", rule: match[2] };
    }
  }
  return best?.allow === true;
}

export async function assertRobotsAllowed(fetchImpl = fetch) {
  const response = await fetchImpl(`${SHAMELA_ORIGIN}/robots.txt`, {
    headers: { "User-Agent": `${SHAMELA_USER_AGENT} (+https://github.com/themuhammad-personal/shamela-mcp)` },
  });
  if (!response.ok) throw new Error(`robots_preflight_failed_http_${response.status}`);
  const robots = await response.text();
  if (!robotsAllows(robots, "/book/") || !robotsAllows(robots, "/ajax/")) {
    throw new Error("robots_policy_disallows_required_paths");
  }
  return true;
}

export function validateCheckpoint(data, expectedType = null) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (data.version !== 1 && data.version !== CHECKPOINT_VERSION) return false;
  if (!data.books || typeof data.books !== "object" || Array.isArray(data.books)) return false;
  if (expectedType && data.type && data.type !== expectedType) return false;
  for (const [bookId, bookState] of Object.entries(data.books)) {
    if (!/^\d+$/.test(bookId)) return false;
    if (!bookState || typeof bookState !== "object" || Array.isArray(bookState)) return false;
  }
  return true;
}

export function readCheckpoint(path, fallback, expectedType = null) {
  try {
    if (!existsSync(path)) return fallback;
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);
    if (!validateCheckpoint(parsed, expectedType)) {
      console.warn(`[crawl-policy] Checkpoint at ${path} is invalid or has unsupported schema; using clean fallback.`);
      return fallback;
    }
    return parsed;
  } catch (err) {
    console.warn(`[crawl-policy] Failed to read checkpoint at ${path}: ${err.message}; using fallback.`);
    return fallback;
  }
}

export function writeCheckpoint(path, value) {
  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}`;
  const payload = {
    version: CHECKPOINT_VERSION,
    schema: "shamela-mcp-checkpoint",
    updated_at: new Date().toISOString(),
    ...(value ?? {}),
  };
  writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`);
  renameSync(tmpPath, path);
}

export function resetCheckpoint(path) {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch (err) {
    console.warn(`[crawl-policy] Failed to delete checkpoint at ${path}: ${err.message}`);
  }
}
