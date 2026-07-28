import type { SessionHistoryEntry, SessionReport } from "./schemas";

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

function persist(entries: SessionHistoryEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 50)));
}

// Called the moment a session ends — saves the transcript immediately so it
// survives even if report generation later fails.
export function saveHistoryEntry(entry: SessionHistoryEntry) {
  const history = loadHistory();
  history.unshift(entry);
  persist(history);
}

export function loadHistoryEntry(id: string): SessionHistoryEntry | null {
  return loadHistory().find((e) => e.id === id) ?? null;
}

// Fills in (or replaces) the report on an already-saved entry.
export function setHistoryReport(id: string, report: SessionReport) {
  const history = loadHistory();
  const entry = history.find((e) => e.id === id);
  if (!entry) return;
  entry.report = report;
  persist(history);
}

export function deleteHistoryEntry(id: string) {
  persist(loadHistory().filter((e) => e.id !== id));
}
