import { normalize } from './normalize';

export interface WordLists {
  /** Word length these lists belong to (5, 6, or 7). */
  wordLength: number;
  solutions: string[]; // normalized
  solutionsAccented: string[]; // parallel to solutions; falls back to solutions if file absent
  validGuesses: Set<string>; // normalized
}

export type WordLength = 5 | 6 | 7;
export const SUPPORTED_LENGTHS: readonly WordLength[] = [5, 6, 7] as const;

const BASE = 'assets/termo/';

/**
 * Filename convention:
 *   - 5 letters (legacy default): `solutions.txt`, `solutions-accented.txt`,
 *     `valid-guesses.txt`
 *   - 6/7 letters: `solutions-{N}.txt`, `solutions-{N}-accented.txt`,
 *     `valid-guesses-{N}.txt`
 *
 * The unsuffixed 5-letter names are kept for backwards-compat with any
 * existing references / share semantics; the new lengths use the
 * `-{N}` suffix.
 */
function fileNames(length: WordLength): {
  solutions: string;
  accented: string;
  guesses: string;
} {
  if (length === 5) {
    return {
      solutions: 'solutions.txt',
      accented: 'solutions-accented.txt',
      guesses: 'valid-guesses.txt',
    };
  }
  return {
    solutions: `solutions-${length}.txt`,
    accented: `solutions-${length}-accented.txt`,
    guesses: `valid-guesses-${length}.txt`,
  };
}

const cache = new Map<WordLength, WordLists>();
const inflight = new Map<WordLength, Promise<WordLists>>();

async function fetchText(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function parseList(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Load (and cache) the three word-list assets for the given length.
 * Subsequent calls for the same length return the cached result. The
 * accented list is optional — if it fails to load, the unaccented
 * solutions are used for end-of-game reveal too.
 *
 * Defaults to 5-letter for backwards-compat with the original API.
 */
export async function loadWordLists(
  length: WordLength = 5,
): Promise<WordLists> {
  const cached = cache.get(length);
  if (cached) return cached;
  const pending = inflight.get(length);
  if (pending) return pending;

  const names = fileNames(length);
  const p = (async (): Promise<WordLists> => {
    const [solRaw, guessesRaw, accRaw] = await Promise.all([
      fetchText(names.solutions),
      fetchText(names.guesses),
      fetchText(names.accented).catch(() => ''),
    ]);

    const solutions = parseList(solRaw)
      .map((w) => normalize(w))
      .filter((w) => w.length === length);
    const validList = parseList(guessesRaw)
      .map((w) => normalize(w))
      .filter((w) => w.length === length);
    const validGuesses = new Set(validList);

    // Ensure every solution is in the valid set (defensive — see spec 7.3).
    for (const s of solutions) {
      if (!validGuesses.has(s)) validGuesses.add(s);
    }

    let solutionsAccented = solutions;
    if (accRaw) {
      const parsed = parseList(accRaw);
      if (parsed.length === solutions.length) {
        solutionsAccented = parsed;
      }
      // If lengths mismatch, the accented file is stale — fall back silently.
    }

    const result: WordLists = {
      wordLength: length,
      solutions,
      solutionsAccented,
      validGuesses,
    };
    cache.set(length, result);
    return result;
  })();

  inflight.set(length, p);
  try {
    return await p;
  } finally {
    inflight.delete(length);
  }
}

/** Test-only: reset the module-level cache. */
export function _resetWordListCache(): void {
  cache.clear();
  inflight.clear();
}
