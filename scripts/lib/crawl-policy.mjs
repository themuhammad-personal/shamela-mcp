import { readFileSync, writeFileSync } from "node:fs";

export const SHAMELA_ORIGIN = "https://shamela.ws";
export const SHAMELA_USER_AGENT = "ShamelaMCP/2.5";

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

export function readCheckpoint(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeCheckpoint(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
