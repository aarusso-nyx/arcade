import { normalize } from './normalize';

export interface WordLists {
  solutions: string[]; // normalized, length 5
  solutionsAccented: string[]; // parallel to solutions; falls back to solutions if file absent
  validGuesses: Set<string>; // normalized
}

let cache: WordLists | null = null;
let inflight: Promise<WordLists> | null = null;

const BASE = 'assets/termo/';

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
 * Load (and cache) the three word-list assets. Subsequent calls return
 * the same cached result. The accented list is optional — if it fails to
 * load, the unaccented solutions are used for end-of-game reveal too.
 */
export async function loadWordLists(): Promise<WordLists> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const [solRaw, guessesRaw, accRaw] = await Promise.all([
      fetchText('solutions.txt'),
      fetchText('valid-guesses.txt'),
      fetchText('solutions-accented.txt').catch(() => ''),
    ]);

    const solutions = parseList(solRaw).map((w) => normalize(w));
    const validList = parseList(guessesRaw).map((w) => normalize(w));
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

    cache = { solutions, solutionsAccented, validGuesses };
    return cache;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Test-only: reset the module-level cache. */
export function _resetWordListCache(): void {
  cache = null;
  inflight = null;
}
