// Leitner spaced-repetition deck of expressions to review, accumulated from the
// training drills across sessions. Stored in localStorage (single browser, no
// account — see TODO.md for the cross-device/notification follow-ups).

export interface DeckItem {
  id: string;
  target: string; // the English expression
  meaning: string; // 中文含义/场景 — shown as the recall prompt
  example: string; // a model sentence, revealed with the answer
  box: number; // Leitner box 1..5
  due: string; // yyyy-mm-dd (local) — reviewable when <= today
  createdAt: string;
}

const KEY = "dotalk:deck";

// Days until the next review, by box. Correct → promote (longer gap); wrong →
// back to box 1 (see tomorrow).
const BOX_INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 15 };
const MAX_BOX = 5;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function todayStr(): string {
  return ymd(new Date());
}

function dueAfter(box: number): string {
  const d = new Date();
  d.setDate(d.getDate() + (BOX_INTERVAL_DAYS[box] ?? 1));
  return ymd(d);
}

export function loadDeck(): DeckItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as DeckItem[];
  } catch {
    return [];
  }
}

function saveDeck(items: DeckItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

const norm = (s: string) => s.trim().toLowerCase();

// Adds new expressions (from a session's drills) to the deck. Deduped by target
// against what's already there — existing items keep their review progress.
export function addToDeck(
  phrases: { target: string; meaning: string; example: string }[],
): void {
  if (typeof window === "undefined") return;
  const deck = loadDeck();
  const seen = new Set(deck.map((i) => norm(i.target)));
  const today = todayStr();
  let added = 0;
  for (const p of phrases) {
    if (!p.target?.trim() || seen.has(norm(p.target))) continue;
    seen.add(norm(p.target));
    deck.push({
      id: crypto.randomUUID(),
      target: p.target,
      meaning: p.meaning,
      example: p.example,
      box: 1,
      due: today,
      createdAt: new Date().toISOString(),
    });
    added++;
  }
  if (added) saveDeck(deck);
}

export function dueItems(): DeckItem[] {
  const today = todayStr();
  return loadDeck().filter((i) => i.due <= today);
}

export function deckStats(): { total: number; due: number } {
  const deck = loadDeck();
  const today = todayStr();
  return { total: deck.length, due: deck.filter((i) => i.due <= today).length };
}

// Grades one item and reschedules it: remembered → promote a box; forgot →
// reset to box 1.
export function gradeItem(id: string, remembered: boolean): void {
  const deck = loadDeck();
  const item = deck.find((i) => i.id === id);
  if (!item) return;
  item.box = remembered ? Math.min(item.box + 1, MAX_BOX) : 1;
  item.due = dueAfter(item.box);
  saveDeck(deck);
}
