import type { SessionHistoryEntry } from "./schemas";

const KEY = "dotalk:history";

export function loadHistory(): SessionHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SessionHistoryEntry[];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: SessionHistoryEntry) {
  const history = loadHistory();
  history.unshift(entry);
  localStorage.setItem(KEY, JSON.stringify(history.slice(0, 50)));
}
