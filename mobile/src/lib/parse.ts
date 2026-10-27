// Pure helpers with no React Native imports, so they run under `node --test`.

export interface ParsedQuickAdd {
  title: string;
  list?: string;
  workspace?: string;
  priority?: 'low' | 'medium' | 'high';
  due_date?: string;
}

const PRIORITY_WORDS: Record<string, ParsedQuickAdd['priority']> = {
  '!': 'high',
  '!high': 'high',
  '!med': 'medium',
  '!medium': 'medium',
  '!low': 'low',
};

/**
 * Turns one line of phone typing into a quick-add request.
 *
 *   "milk #shopping"                  -> list "shopping"
 *   "Draft Q4 deck @toyota !high"     -> workspace "toyota", high priority
 *   "call mom ^tomorrow"              -> due tomorrow
 *
 * Multi-word list names use dashes or underscores: "#shopping-list".
 */
export function parseQuickAdd(input: string, today: Date = new Date()): ParsedQuickAdd {
  const words: string[] = [];
  const out: Omit<ParsedQuickAdd, 'title'> = {};
  for (const word of input.trim().split(/\s+/)) {
    const lower = word.toLowerCase();
    if (word.length > 1 && word.startsWith('#')) {
      out.list = word.slice(1).replace(/[-_]/g, ' ');
    } else if (word.length > 1 && word.startsWith('@')) {
      out.workspace = word.slice(1).replace(/[-_]/g, ' ');
    } else if (lower in PRIORITY_WORDS) {
      out.priority = PRIORITY_WORDS[lower];
    } else if (word.length > 1 && word.startsWith('^') && parseDue(word.slice(1), today)) {
      out.due_date = parseDue(word.slice(1), today);
    } else if (word) {
      words.push(word);
    }
  }
  return { title: words.join(' '), ...out };
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseDue(text: string, today: Date): string | undefined {
  const t = text.toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (t === 'today') return toISODate(today);
  if (t === 'tomorrow' || t === 'tmr') return toISODate(addDays(today, 1));
  const wd = WEEKDAYS.indexOf(t.slice(0, 3));
  if (wd >= 0) {
    const diff = (wd - today.getDay() + 7) % 7 || 7; // next occurrence, never today
    return toISODate(addDays(today, diff));
  }
  return undefined;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Local-time YYYY-MM-DD (toISOString would shift to UTC). */
export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Today", "Tomorrow", "Overdue · Oct 3", "Fri, Nov 7". */
export function describeDue(due: string, today: Date = new Date()): { label: string; overdue: boolean } {
  const t = toISODate(today);
  if (due === t) return { label: 'Today', overdue: false };
  if (due === toISODate(addDays(today, 1))) return { label: 'Tomorrow', overdue: false };
  const date = fromISODate(due);
  const sameYear = date.getFullYear() === today.getFullYear();
  const label = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return due < t ? { label: `Overdue · ${label}`, overdue: true } : { label, overdue: false };
}

/** Accepts "192.168.1.20:8000" or "https://tasks.example.com/" and returns a clean base URL. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}
