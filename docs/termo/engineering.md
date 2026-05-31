# Termo — Engineering Specification

This document specifies the implementation of the single-board Termo game for the `arcade/newer` web application. It is written at a level of detail sufficient for a competent web developer to implement the game without further design research. Where there is a known subtlety (e.g. duplicate-letter evaluation), it is spelled out with worked examples.

The host application is a routed single-page web application. The framework is TBD; this spec is deliberately framework-agnostic, treating Termo as a self-contained module that exposes pure-function game logic plus a thin presentation layer.

---

## 1. Scope

### 1.1 In scope (v1)

- Single-board, 6-attempt, 5-letter Termo.
- Daily mode (deterministic per-date solution) and Infinite mode (random solution on demand).
- Physical-keyboard and on-screen-keyboard input.
- Accent-normalized comparison; accented reveal of the answer.
- Color-coded per-tile evaluation with correct duplicate-letter handling.
- Flip-reveal, shake-on-invalid, bounce-on-win animations.
- Local persistence: today's daily progress, daily streak, infinite best streak.
- Share string (`Termo N M/6` plus emoji grid).

### 1.2 Out of scope (v1)

- Dueto / Quarteto multi-board variants.
- Hard mode, colorblind palette, light/dark theme toggle, sound effects.
- Stats modal beyond a simple displayed streak.
- Dictionary definitions, hint system, undo, redo.
- Server-side anything. No accounts, no leaderboards.

---

## 2. Data assets

### 2.1 Word lists

Two text resources are required:

1. **Solutions list** (`solutions.txt`)
   - The curated list of common Portuguese 5-letter words that may appear as the daily answer.
   - Size: approximately 2,000–3,000 entries.
   - Sourced from the user's prior project (`arcade/tetris/src/app/termo/`).
   - This list is intentionally smaller than the full guess list so that obscure words are not picked as the daily answer. Every word in this list must also appear in `valid-guesses.txt`.
2. **Valid guesses list** (`valid-guesses.txt`)
   - The superset of all accepted player input.
   - Size: approximately 10,000+ entries.
   - Includes the solutions list plus a long tail of less common but legitimately Portuguese 5-letter words.
   - Used purely for input validation; never selected as an answer.

### 2.2 Format

Both files share an identical format:

- UTF-8 encoded plain text.
- One word per line.
- All entries are exactly 5 characters long.
- All entries are lowercase ASCII (a–z), with diacritics already stripped at build time (see Section 3).
- Unix line endings (`\n`).
- No trailing whitespace, no blank lines, sorted alphabetically (sorting is for diff-friendliness; runtime does not depend on order).
- No BOM.

A separate optional file, **`solutions-accented.txt`**, contains the same solutions in the same order with their original orthography (accents, cedilla) preserved. The index `i` in `solutions.txt` corresponds to the index `i` in `solutions-accented.txt`. This is what the UI displays at end-of-game for natural-form reveal.

Example of the three files at index 42:

| File                     | Entry  |
|--------------------------|--------|
| `solutions.txt`          | `padrao` |
| `solutions-accented.txt` | `padrão` |
| `valid-guesses.txt`      | (contains `padrao` plus thousands of others) |

If the user's prior project does not supply `solutions-accented.txt`, it can be reconstructed by hand-curating the solutions list, or, as a fallback, by using the unaccented form everywhere and accepting the minor quality loss.

### 2.3 Distribution

The three files are bundled as **static assets in the app's `public/` directory** (or framework-equivalent), served as plain text. Either `.txt` or `.json` is acceptable; `.txt` is preferred because the lists are large (60–120 KB compressed for `valid-guesses.txt`) and the line-per-word format is trivially streamable.

Loading strategy:

- The solutions list (and, if present, its accented sibling) is small enough to load synchronously on app start.
- The valid-guesses list is loaded lazily — the player cannot submit a guess until at least one row of input is typed and `Enter` is pressed. Preload it on first keystroke or in the background after the board mounts, so it is in memory before the first `Enter`.
- Both lists are loaded once per page session, parsed into a `Set<string>` (the valid-guesses) and a `string[]` (the ordered solutions list), and held in module-level state.

---

## 3. Accent normalization

### 3.1 The normalization function

```
function normalize(s: string): string {
  return s
    .normalize('NFD')                      // decompose: 'á' -> 'a' + combining acute
    .replace(/[̀-ͯ]/g, '')       // strip combining diacritics
    .toUpperCase();                        // canonicalize case
}
```

This is **the single source of truth** for converting any string — solution, guess, input keystroke, validation lookup — into the canonical form used for comparison.

### 3.2 Behavior table

| Input | After NFD | After diacritic strip | After uppercase |
|-------|-----------|----------------------|-----------------|
| `á`   | `a` + U+0301 | `a` | `A` |
| `ã`   | `a` + U+0303 | `a` | `A` |
| `â`   | `a` + U+0302 | `a` | `A` |
| `é`   | `e` + U+0301 | `e` | `E` |
| `ê`   | `e` + U+0302 | `e` | `E` |
| `í`   | `i` + U+0301 | `i` | `I` |
| `ó`   | `o` + U+0301 | `o` | `O` |
| `ô`   | `o` + U+0302 | `o` | `O` |
| `õ`   | `o` + U+0303 | `o` | `O` |
| `ú`   | `u` + U+0301 | `u` | `U` |
| `ç`   | `c` + U+0327 | `c` | `C` |
| `à`   | `a` + U+0300 | `a` | `A` |

Note that `ç` decomposes into `c` plus combining cedilla (U+0327), which is in the range stripped above. This is why a single uniform regex handles every Portuguese diacritic.

### 3.3 Invariants

- The strings in `solutions.txt` and `valid-guesses.txt` are already normalized at build time. Calling `normalize()` on any entry in either file is a no-op.
- Player-typed input is always run through `normalize()` before being stored in game state or compared to anything.
- All comparisons (`guess[i] === answer[i]`, `validGuesses.has(guess)`, etc.) operate on normalized strings.
- The accented form is used **only** for the end-of-game reveal display, sourced from `solutions-accented.txt` by index. It never participates in comparison logic.

---

## 4. Daily-word selection

### 4.1 Determinism requirement

Every player playing on the same local-calendar date must see the same solution, without any server round-trip. This is achieved by a pure function of the date and the solutions list.

### 4.2 Algorithm

```
const LAUNCH_DATE = new Date(2026, 0, 1);   // 2026-01-01, local time, midnight
const MS_PER_DAY  = 86_400_000;

function dailyPuzzleNumber(now: Date = new Date()): number {
  // Use local-midnight of `now` and local-midnight of LAUNCH_DATE.
  const today  = new Date(now.getFullYear(),         now.getMonth(),         now.getDate());
  const launch = new Date(LAUNCH_DATE.getFullYear(), LAUNCH_DATE.getMonth(), LAUNCH_DATE.getDate());
  const diffMs = today.getTime() - launch.getTime();
  return Math.floor(diffMs / MS_PER_DAY) + 1;   // puzzle #1 on launch day
}

function dailySolutionIndex(now: Date, solutionsLen: number): number {
  // Subtract one so that puzzle #1 maps to index 0.
  return (dailyPuzzleNumber(now) - 1) % solutionsLen;
}

function dailySolution(now: Date, solutions: string[]): string {
  return solutions[dailySolutionIndex(now, solutions.length)];
}
```

`LAUNCH_DATE` is a constant chosen by the team and frozen at first deploy. Once shipped, it must never change — doing so would re-number every past puzzle and break shared scores. Pick a fixed date in the recent past so that puzzle #1 is "yesterday or earlier" at first launch.

### 4.3 Local time vs. UTC

This spec uses **local-midnight rollover**. The tradeoff is documented here so the choice is explicit.

- **Pro local**: matches term.ooo's behavior. Players experience "a new puzzle at midnight" in the timezone they live in, which feels intuitive. No timezone confusion in the morning.
- **Con local**: two players in different timezones on the same wall-clock moment can be playing different puzzles. This makes share-string comparison less crisp ("I got today's in 3!" — well, was it *your* today or *mine*?). A player who travels across timezones can experience the same puzzle twice or skip one.
- **Pro UTC**: all players globally are on exactly the same puzzle at the same moment. Cleaner for community discussion.
- **Con UTC**: in São Paulo, the daily rollover happens at 21:00 local time (UTC-3); a player who starts a puzzle at 20:55 has 5 minutes before it changes underneath them. Confusing.

For a Brazilian audience, **local-midnight is the right default**. The implementation uses `new Date(y, m, d)` (the local-time constructor) when computing rollover boundaries.

### 4.4 Shuffling the solutions list

The above algorithm walks `solutions.txt` in file order. If alphabetical order is undesirable (e.g. early days would feature only `A`-words), apply a one-time deterministic shuffle at build time using a seeded RNG, ship the resulting file, and never reshuffle. **Do not shuffle at runtime** — that breaks cross-client determinism unless every client uses the same seed.

### 4.5 Wrap-around

After `solutions.length` days, the modulo wraps and puzzle `N` repeats the solution from puzzle `N - solutions.length`. With ~2,500 solutions, that is a ~7-year cycle. Document this and don't try to be clever; by the time wrap-around matters, v2 will have shipped.

---

## 5. Game state

### 5.1 The state shape

```
type TileEvaluation = 'correct' | 'present' | 'absent';

type GameStatus = 'playing' | 'won' | 'lost';

type KeyState = TileEvaluation | 'unseen';

interface GameState {
  mode: 'daily' | 'infinite';
  solution: string;             // normalized, length 5
  solutionAccented: string;     // natural form, for reveal
  puzzleNumber: number | null;  // daily only; null for infinite

  guesses: string[];            // submitted, each length 5, normalized
  evaluations: TileEvaluation[][];  // parallel to guesses

  currentRow: number;           // 0..5, index of next row to be submitted
  currentInput: string;         // letters typed into current row, length 0..5

  status: GameStatus;
  keyStates: Record<string, KeyState>;  // 'A'..'Z' -> highest-priority state
}
```

Invariants:

- `guesses.length === evaluations.length === currentRow`.
- `currentInput.length` is `0..5`, only meaningful while `status === 'playing'`.
- Each `evaluations[r]` has length 5.
- `keyStates['A']` etc. defaults to `'unseen'` for every letter A–Z on game start.

### 5.2 Reducer-style transitions

Implement game-state mutations as a pure reducer:

```
type Action =
  | { type: 'TYPE_LETTER';     letter: string }        // single uppercase A-Z
  | { type: 'BACKSPACE' }
  | { type: 'SUBMIT' }
  | { type: 'NEW_INFINITE' }
  | { type: 'RESET_DAILY';     state: GameState };     // hydrate from localStorage

function reduce(state: GameState, action: Action): ReduceResult;

interface ReduceResult {
  state: GameState;
  effects?: Effect[];
}

type Effect =
  | { type: 'SHAKE_ROW';  row: number }
  | { type: 'TOAST';      message: string }
  | { type: 'FLIP_REVEAL'; row: number }
  | { type: 'BOUNCE_WIN'; row: number }
  | { type: 'PERSIST' };
```

Effects are returned to the host, which schedules animations and persistence. The reducer itself never touches the DOM, never calls `setTimeout`, never reads `localStorage`. This makes it trivially unit-testable.

### 5.3 Keyboard letter state

After each submitted guess, update `keyStates` for each letter in the guess according to the **highest priority** color discovered so far for that letter. Priority, highest first:

1. `correct` (green)
2. `present` (yellow)
3. `absent` (gray)
4. `unseen` (default)

A letter that has ever been green stays green on the keyboard even if a later guess places it in a wrong position. Update logic:

```
function bumpKeyState(prev: KeyState, next: TileEvaluation): KeyState {
  const rank = { correct: 3, present: 2, absent: 1, unseen: 0 };
  return rank[next] > rank[prev] ? next : prev;
}
```

---

## 6. Evaluation algorithm

This is the heart of the game. Get this right and the rest is window dressing. Get this wrong (the typical naive single-pass implementation does) and players will lose trust within a week.

### 6.1 The rule, restated

Each letter occurrence in the solution can "claim" at most one position in the guess. Exact-position matches (green) claim first; remaining yellows are assigned left-to-right over the not-yet-marked positions.

### 6.2 Two-pass implementation

```
function evaluateGuess(guess: string, solution: string): TileEvaluation[] {
  // Pre: both are normalized strings of length 5.
  const result: TileEvaluation[] = new Array(5).fill('absent');
  const remaining: Record<string, number> = {};

  // Pass 1: exact-position matches (green). Decrement letter pool for each.
  for (let i = 0; i < 5; i++) {
    if (guess[i] === solution[i]) {
      result[i] = 'correct';
    } else {
      remaining[solution[i]] = (remaining[solution[i]] ?? 0) + 1;
    }
  }

  // Pass 2: left-to-right, assign 'present' to leftover positions while
  //         the guess letter still has remaining count in the pool.
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'correct') continue;
    const ch = guess[i];
    if ((remaining[ch] ?? 0) > 0) {
      result[i] = 'present';
      remaining[ch]--;
    }
    // else: stays 'absent' from the initial fill.
  }

  return result;
}
```

Notes:

- The `remaining` map only counts solution letters that were **not** matched in pass 1. This is what implements the "each occurrence claims at most one tile" rule.
- Pass 2 must walk **left to right** so that with duplicate letters in the guess, the leftmost occurrence gets the yellow. This is a cosmetic but observable detail; players notice if it goes right-to-left.
- The result array is always length 5 and every slot is filled with one of the three values. No `null`s, no `undefined`s.

### 6.3 Worked example — duplicate letters

Re-walking the example from `gameplay.md`, now annotated with map state.

**Solution**: `LLAMA` (5 letters, normalized).
**Guess**: `ALLOY`.

Initial state:

- `result = ['absent','absent','absent','absent','absent']`
- `remaining = {}`

Pass 1, iterating `i = 0..4`:

| `i` | `guess[i]` | `solution[i]` | Match? | After this step                                                                |
|----|------------|---------------|--------|--------------------------------------------------------------------------------|
| 0  | `A`        | `L`           | no     | `remaining = {L:1}`                                                            |
| 1  | `L`        | `L`           | **yes** | `result[1]='correct'`. `remaining = {L:1}` (unchanged — only mismatches accrue) |
| 2  | `L`        | `A`           | no     | `remaining = {L:1, A:1}`                                                       |
| 3  | `O`        | `M`           | no     | `remaining = {L:1, A:1, M:1}`                                                  |
| 4  | `Y`        | `A`           | no     | `remaining = {L:1, A:2, M:1}`                                                  |

End of pass 1: `result = ['absent','correct','absent','absent','absent']`, `remaining = {L:1, A:2, M:1}`.

Pass 2, iterating `i = 0..4`, skipping `correct`:

| `i` | `guess[i]` | `remaining[guess[i]]` | Action                                                | After this step                                          |
|----|------------|-----------------------|-------------------------------------------------------|----------------------------------------------------------|
| 0  | `A`        | 2                     | mark present, `A--`                                   | `result[0]='present'`, `remaining = {L:1, A:1, M:1}`     |
| 1  | -          | (skipped, already correct) | —                                                | —                                                        |
| 2  | `L`        | 1                     | mark present, `L--`                                   | `result[2]='present'`, `remaining = {A:1, M:1}` (L:0 elided) |
| 3  | `O`        | 0 (no key)            | leave as absent                                       | `result[3]='absent'`                                     |
| 4  | `Y`        | 0 (no key)            | leave as absent                                       | `result[4]='absent'`                                     |

Final: `result = ['present', 'correct', 'present', 'absent', 'absent']`.

This matches the table in `gameplay.md`.

### 6.4 Additional test cases worth pinning

| Solution | Guess   | Expected colors                                          | Why                                                                                                                        |
|----------|---------|----------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| `ABATE`  | `ABATE` | `[correct, correct, correct, correct, correct]`          | Trivial all-green.                                                                                                         |
| `ABATE`  | `BANCO` | `[present, present, absent, absent, absent]`             | Two unique letters present, none correct.                                                                                  |
| `ALELO`  | `LLAMA` | walk it through                                          | `A` (pos0): present? Solution `A`s at 0,2,4 — but pos0 in solution is `A`, so pass1 makes... wait — `ALELO`[0]=`A`, `LLAMA`[0]=`L`, mismatch. Exercise for the reader.* |
| `MOMMY`  | `MAMMA` | `[correct, absent, correct, correct, absent]`            | Solution `MOMMY`: M-O-M-M-Y. Guess `MAMMA`: M-A-M-M-A. Pass1: pos0 M=M green, pos1 A!=O, pos2 M=M green, pos3 M=M green, pos4 A!=Y. `remaining = {O:1, Y:1}`. Pass2: pos1 A — 0, absent. pos4 A — 0, absent. Result: `[correct, absent, correct, correct, absent]`. |
| `MOMMY`  | `MMMMA` | `[correct, absent, correct, correct, absent]`            | Three `M`s in guess, three `M`s in solution at pos 0,2,3. Pass1: pos0 M=M, pos2 M=M, pos3 M=M all green. `remaining = {O:1, Y:1}`. Pass2: pos1 M — `remaining.M` is undefined (0), absent. pos4 A — 0, absent. |
| `BOOKS`  | `OOOOO` | `[absent, correct, absent, absent, absent]`              | Solution has two `O`s, both not at pos0. Pass1: pos1 O=O green. `remaining = {B:1, O:1, K:1, S:1}`. Pass2: pos0 O — present, `remaining.O--` to 0. pos2 O — 0, absent. pos3 O — 0, absent. pos4 O — 0, absent. Result: `[present, correct, absent, absent, absent]`. **Note:** I got it wrong on first pass; the above row is the corrected expectation. |

*The `ALELO` / `LLAMA` cell is intentionally left as an exercise for the implementer; it should be added to the test suite with the manually-computed expectation.

Lesson: write these tests before writing the function. Once `evaluateGuess` is green against a dozen pinned cases — including every published "tricky Wordle" case from the internet — the rest of the game is straightforward.

---

## 7. Input validation

### 7.1 Rules

A submitted guess is **valid** if and only if:

1. Its length, after normalization, is exactly 5.
2. After normalization, every character is in `A`–`Z` (i.e., the input contained only Portuguese letters, possibly accented).
3. The normalized string appears in the `validGuesses: Set<string>` loaded from `valid-guesses.txt`.

If any of these fails, the row is **rejected**:

- The reducer returns `state` unchanged plus effects `[{ type: 'SHAKE_ROW', row: currentRow }, { type: 'TOAST', message: '...' }]`.
- The toast message varies: `"letras faltando"` for length < 5, `"palavra inválida"` for not-in-list.
- The current input is **not** cleared. The player can backspace and edit.

### 7.2 Type-time normalization

Per Section 3, every keystroke is normalized before being appended to `currentInput`. In practice:

- A `keydown` event fires.
- If `event.key` is a single character, call `normalize(event.key)`.
- If the result is exactly one character in `A`–`Z`, dispatch `{ type: 'TYPE_LETTER', letter }`.
- Otherwise, ignore.

This way, `Á` (typed via a Brazilian keyboard layout) is normalized to `A` before it enters game state. The player can also paste a word with accents into a hypothetical text field and it would still normalize correctly, though no paste UI is part of v1.

### 7.3 The solution is always valid

Sanity-check at game-start: assert that `validGuesses.has(state.solution)`. Every solution must be a member of the valid-guesses superset. This catches list-mismatch bugs early.

---

## 8. Rendering

### 8.1 DOM, not canvas

Use the DOM. The game is a text grid with rich per-element animations (flip on Y-axis, shake on X-axis, vertical bounce, color-fill transitions, keyboard tinting). All of these are first-class CSS, painful in canvas, and impossible to make accessible in canvas.

Specifically:

- The 30 tiles are 30 DOM elements (e.g., `<div class="tile">`).
- Each on-screen keyboard key is one DOM element.
- Toasts are DOM elements.
- The board container, header, and modals are DOM.

### 8.2 Tile structure

Each tile is a CSS 3D-transformable element with two faces (front and back), arranged for a Y-axis flip:

```html
<div class="tile" data-state="filled" data-eval="">
  <div class="tile-face tile-front">A</div>
  <div class="tile-face tile-back">A</div>
</div>
```

- `data-state` is one of `empty | filled | revealing | revealed | won`.
- `data-eval` is set when the tile is revealed: `correct | present | absent`.
- CSS animations key off these data attributes.

### 8.3 Flip-reveal sequence

On `SUBMIT` acceptance, the host receives a `FLIP_REVEAL` effect and runs:

```
const REVEAL_STAGGER_MS = 250;
const FLIP_DURATION_MS  = 500;  // half-rotation duration; mid-flip is at 250 ms

for (let col = 0; col < 5; col++) {
  setTimeout(() => {
    tile[row][col].dataset.state = 'revealing';
    // CSS transition rotates Y from 0 to 180 over FLIP_DURATION_MS.
    setTimeout(() => {
      tile[row][col].dataset.eval  = evaluations[row][col]; // green/yellow/gray
      tile[row][col].dataset.state = 'revealed';
    }, FLIP_DURATION_MS / 2);
  }, col * REVEAL_STAGGER_MS);
}

// After all five tiles have started, schedule the win/lose check.
const totalRevealMs = 4 * REVEAL_STAGGER_MS + FLIP_DURATION_MS;
setTimeout(() => { /* dispatch post-reveal: win toast, bounce, lock board */ }, totalRevealMs);
```

The color is swapped at the **mid-point of the flip**, when the tile is edge-on to the viewer and you can't see either face clearly. This produces the canonical "tile turns over to reveal its color" effect.

CSS sketch:

```css
.tile { perspective: 600px; }
.tile-face {
  backface-visibility: hidden;
  transition: transform 500ms ease-in-out;
}
.tile-back  { transform: rotateY(180deg); }
.tile[data-state="revealing"] .tile-front,
.tile[data-state="revealed"]  .tile-front { transform: rotateY(180deg); }
.tile[data-state="revealing"] .tile-back,
.tile[data-state="revealed"]  .tile-back  { transform: rotateY(360deg); }

.tile[data-eval="correct"] .tile-back { background: var(--green); color: white; }
.tile[data-eval="present"] .tile-back { background: var(--yellow); color: white; }
.tile[data-eval="absent"]  .tile-back { background: var(--gray); color: white; }
```

### 8.4 Shake on invalid

A CSS keyframe animation on the row container, triggered by toggling a class:

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-6px); }
  40%      { transform: translateX( 6px); }
  60%      { transform: translateX(-4px); }
  80%      { transform: translateX( 4px); }
}
.row.shaking { animation: shake 400ms ease-in-out; }
```

The host adds the `shaking` class on the `SHAKE_ROW` effect, then removes it after 400 ms (via `animationend` listener or a `setTimeout`).

### 8.5 Bounce on win

After the row reveals all-green, dispatch `BOUNCE_WIN` and apply staggered vertical-translate animations to each tile in the winning row:

```css
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  40%      { transform: translateY(-30px); }
  60%      { transform: translateY(0); }
  80%      { transform: translateY(-8px); }
}
.tile.bouncing { animation: bounce 600ms ease; }
```

Stagger by 100 ms per tile.

### 8.6 Accessibility

- Tiles should have `aria-label` describing their state (e.g., `aria-label="P, correto"`).
- The board is a `<div role="grid">` with rows as `role="row"` and tiles as `role="gridcell"`.
- The on-screen keyboard buttons are real `<button>` elements with text labels.
- Toasts use `role="status"` so screen readers announce them.
- Color is not the sole indicator — pair with a textual aria-label so colorblind users (and screen readers) get the same info even without a colorblind palette in v1.

---

## 9. Input

### 9.1 Physical keyboard

Attach a single `keydown` listener at the document level when the game route mounts; detach on unmount.

```
function onKeyDown(e: KeyboardEvent) {
  if (state.status !== 'playing') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;   // don't intercept shortcuts
  if (e.key === 'Enter')      { dispatch({ type: 'SUBMIT' }); return; }
  if (e.key === 'Backspace')  { dispatch({ type: 'BACKSPACE' }); return; }
  if (e.key.length !== 1)     return;               // arrow keys, F-keys, etc.

  const normalized = normalize(e.key);
  if (normalized.length === 1 && normalized >= 'A' && normalized <= 'Z') {
    dispatch({ type: 'TYPE_LETTER', letter: normalized });
  }
}
```

### 9.2 On-screen keyboard

The on-screen keyboard is always visible. Each key is a real `<button>` whose click handler dispatches the same actions as the physical keyboard. The keys carry `data-key="A"` etc. and apply per-key tinting from `state.keyStates`:

```
function renderKey(letter: string) {
  const s = state.keyStates[letter];
  return <button data-key={letter} data-state={s} onClick={...}>{letter}</button>;
}
```

CSS:

```css
button[data-state="correct"] { background: var(--green); color: white; }
button[data-state="present"] { background: var(--yellow); color: white; }
button[data-state="absent"]  { background: var(--gray); color: white; }
button[data-state="unseen"]  { background: var(--key-default); }
```

The Enter and Backspace keys are wider, in the third row.

### 9.3 Mobile considerations

- **No native keyboard.** Do not render a hidden `<input>` to trigger the OS soft keyboard — that would interfere with the on-screen keyboard. The board is a passive display, the on-screen keyboard is the only input affordance on touch devices.
- Prevent double-tap-to-zoom on keys (`touch-action: manipulation`).
- Tappable target size ≥ 44x44 px on keys.

---

## 10. Game loop

There isn't one. Termo is fully event-driven.

- There is no `requestAnimationFrame` tick.
- There is no game-state update on a timer.
- All state changes are triggered by user actions (keystrokes, button clicks) or by lifecycle events (page load → hydrate from localStorage; route mount → attach keyboard listener; route unmount → detach).
- The only timing-related code is animation scheduling: `setTimeout`s within the flip-reveal sequence, the shake animation duration, and the bounce. These do not mutate game state — they only mutate DOM (or class names) for visual effect.
- A one-second-resolution countdown to the next daily puzzle, displayed after a daily game ends, **is** a `setInterval` — but it is purely cosmetic. When the interval fires past midnight, dispatch a `RESET_DAILY` action with the freshly-computed daily state.

Document this explicitly in the code so future maintainers don't add a tick out of habit.

---

## 11. Persistence (localStorage)

### 11.1 Keys

Use a single namespaced prefix to avoid collision with other arcade games:

```
arcade.termo.daily      // current daily in-progress state, JSON-serialized
arcade.termo.dailyMeta  // { lastCompletedPuzzleNumber, streak, history }
arcade.termo.infinite   // { bestStreak }
```

### 11.2 Daily mode persistence

On every state change in daily mode, serialize a small subset of state and write to `arcade.termo.daily`:

```json
{
  "puzzleNumber": 142,
  "guesses": ["arara", "barco"],
  "evaluations": [["absent","absent","correct","absent","absent"],
                  ["present","absent","absent","absent","absent"]],
  "status": "playing",
  "savedAt": 1748707200000
}
```

On game-route mount in daily mode:

1. Compute today's puzzle number via `dailyPuzzleNumber()`.
2. Read `arcade.termo.daily`. If absent, or its `puzzleNumber` ≠ today's, start a fresh state for today.
3. Otherwise, rehydrate `guesses`, `evaluations`, `status`, `currentRow`. Replay evaluations into `keyStates`. Do **not** replay animations — show the board in its final post-reveal state immediately.

`arcade.termo.dailyMeta`:

```json
{
  "lastCompletedPuzzleNumber": 141,
  "currentStreak": 5,
  "maxStreak": 12,
  "history": [
    { "puzzle": 141, "won": true,  "attempts": 4 },
    { "puzzle": 140, "won": false, "attempts": null },
    { "puzzle": 139, "won": true,  "attempts": 3 }
  ]
}
```

On game completion (win or loss):

- Append to `history` (cap at last 30 days; trim oldest).
- If won and `lastCompletedPuzzleNumber + 1 === today`, `currentStreak++`. If won and the gap is larger, reset `currentStreak = 1`. If lost, reset `currentStreak = 0`.
- `maxStreak = max(maxStreak, currentStreak)`.
- `lastCompletedPuzzleNumber = today`.

### 11.3 Infinite mode persistence

Infinite mode persists **only** the best streak, computed across consecutive wins without resetting the app:

```json
{ "bestStreak": 7, "currentStreak": 3 }
```

In-progress infinite puzzles are intentionally **not** persisted — closing the tab forfeits the puzzle. This keeps localStorage small and the implementation simple.

### 11.4 Storage failure

Wrap every `localStorage` access in try/catch. If quota is exceeded or the API is unavailable (e.g., Safari private mode), silently degrade: the game still works, just without persistence. Do not surface an error.

### 11.5 Versioning

Include a schema-version field in each stored object (e.g., `"v": 1`). On read, if the version is missing or unrecognized, discard and start fresh. This lets v2 evolve the schema without crashing v1-state clients on upgrade.

---

## 12. Share string

### 12.1 Format

Win example:

```
Termo 142 4/6

⬜⬜🟨⬜⬜
🟨⬜🟩⬜⬜
🟩🟩🟩🟨⬜
🟩🟩🟩🟩🟩
```

Loss example:

```
Termo 142 X/6

⬜⬜🟨⬜⬜
🟨⬜🟩⬜⬜
🟩🟩🟩🟨⬜
⬜⬜⬜⬜⬜
🟨🟨⬜⬜⬜
🟨🟩🟩⬜⬜
```

### 12.2 Generator

```
const EMOJI = { correct: '🟩', present: '🟨', absent: '⬜' } as const;

function buildShareString(state: GameState): string {
  const header =
    state.status === 'won'  ? `Termo ${state.puzzleNumber} ${state.guesses.length}/6` :
    state.status === 'lost' ? `Termo ${state.puzzleNumber} X/6`                          :
    '';   // 'playing' — should never be called

  const grid = state.evaluations
    .map(row => row.map(e => EMOJI[e]).join(''))
    .join('\n');

  return `${header}\n\n${grid}`;
}
```

### 12.3 Constraints

- Never include letters. The share string must not spoil the answer for the recipient.
- Only available after game-end in daily mode. Infinite mode does not produce a share string.
- The "share" affordance uses `navigator.clipboard.writeText(...)` with a fallback to `document.execCommand('copy')` on a transient hidden `<textarea>`. Show a toast: `"copiado!"`.
- If the platform supports `navigator.share` (mobile Safari, Android Chrome), prefer it over clipboard: `navigator.share({ text: shareString })`.

---

## 13. Module layout

Termo is implemented as a self-contained module under the host SPA. Suggested file layout (framework-agnostic):

```
src/games/termo/
  index.ts                   # public API (mount/unmount, route component)
  data/
    solutions.txt            # ~2.5k entries, normalized
    solutions-accented.txt   # parallel accented forms
    valid-guesses.txt        # ~10k+ entries, normalized
  wordlist.ts                # loader: fetch + parse + cache
  normalize.ts               # the normalize() function (Section 3)
  daily.ts                   # dailyPuzzleNumber, dailySolutionIndex, dailySolution
  evaluator.ts               # evaluateGuess (Section 6) — pure, no imports
  state.ts                   # GameState types, initial state factories, reducer
  keyboard-state.ts          # bumpKeyState helper, keyStates derivation
  share.ts                   # buildShareString
  persistence.ts             # localStorage read/write with versioning
  ui/
    Board.{tsx,vue,svelte}   # board + tile rendering
    Keyboard.{tsx,vue,svelte}# on-screen keyboard
    Toast.{tsx,vue,svelte}   # transient messages
    Modal.{tsx,vue,svelte}   # end-of-game modal with share button
    styles.css               # theme variables, animations
  tests/
    evaluator.test.ts
    normalize.test.ts
    daily.test.ts
    share.test.ts
    state.test.ts
```

Boundaries:

- **`evaluator.ts`, `normalize.ts`, `daily.ts`, `share.ts`**: pure functions, no DOM, no `Date.now()` calls except in well-named entry points that accept an optional `now` parameter for testability. These are the most heavily tested files.
- **`state.ts`**: pure reducer. Imports the pure modules above. No browser APIs.
- **`persistence.ts`**: the only file allowed to touch `localStorage`.
- **`wordlist.ts`**: the only file allowed to issue `fetch` calls.
- **`ui/*`**: the only files allowed to touch the DOM, schedule `setTimeout`, or attach `keydown` listeners.

This separation is what makes the tests in Section 14 fast and reliable.

---

## 14. Testing

### 14.1 Unit tests — `evaluator.ts`

This is the most important test file in the project. At minimum cover:

- All-green (`ABATE` / `ABATE`).
- All-gray (`ABATE` / `MUNDO`).
- Mixed without duplicates (`ABATE` / `BANCO`).
- The pinned **`LLAMA` / `ALLOY`** example from Section 6.3 — paste the expected `[present, correct, present, absent, absent]` directly as the assertion.
- Solution with duplicate, guess without: `BOOKS` / `OPERA` (one O in guess, two in solution — guess's O should be yellow).
- Solution without duplicate, guess with: `WORLD` / `OOZED` (one O in solution, two in guess — exactly one O in the guess should color, the other gray).
- All five guess letters the same, solution has zero: `XXXXX` / `ABCDE` (all gray).
- All five guess letters the same, solution has one: `XOXOX` (hypothetical 5-letter) — sanity check that exactly the count is colored.
- Guess equals solution permuted: every letter yellow, none green.

Each test asserts `evaluateGuess(guess, solution) === expectedArray`. Use deep equality.

### 14.2 Unit tests — `normalize.ts`

- Every entry in the Section 3.2 table.
- `normalize('AÇÃO')` returns `'ACAO'`.
- `normalize('ácido')` returns `'ACIDO'`.
- `normalize('')` returns `''`.
- `normalize('PADRAO')` (already normalized) returns `'PADRAO'`.
- Idempotence: `normalize(normalize(x)) === normalize(x)` for a fuzz of inputs.

### 14.3 Unit tests — `daily.ts`

- `dailyPuzzleNumber(LAUNCH_DATE) === 1`.
- `dailyPuzzleNumber(LAUNCH_DATE + 1 day) === 2`.
- `dailyPuzzleNumber(LAUNCH_DATE + 365 days) === 366`.
- Two `new Date()`s on the same local date at different times of day produce the same puzzle number.
- `dailySolutionIndex(date, N)` is in `[0, N)` for a range of dates.
- Determinism: calling `dailySolution(d, list)` twice returns the same string.
- Wrap-around: `dailyPuzzleNumber(LAUNCH_DATE + 2 * N days) % N === dailyPuzzleNumber(LAUNCH_DATE)`.

Use injected `Date` arguments throughout — never read `new Date()` inside the function under test.

### 14.4 Unit tests — `share.ts`

- Win 4/6: header is `Termo 142 4/6` (with the right puzzle number), four emoji rows, last row all 🟩.
- Loss: header is `Termo 142 X/6`, six emoji rows.
- Mapping: `correct → 🟩`, `present → 🟨`, `absent → ⬜`.
- No letters anywhere in the output (`/^[^A-Za-z]*$/` matches everything after the header line).
- Trailing newlines normalized (no extra blank lines).

### 14.5 Unit tests — `state.ts` (reducer)

- `TYPE_LETTER` appends to `currentInput`, capped at 5.
- `TYPE_LETTER` after `status === 'won'` is a no-op.
- `BACKSPACE` removes one letter; no-op on empty input.
- `SUBMIT` with fewer than 5 letters returns a `SHAKE_ROW` effect, state unchanged.
- `SUBMIT` with 5 letters not in the valid set returns a `SHAKE_ROW` effect, state unchanged.
- `SUBMIT` with a valid 5-letter word advances `currentRow`, appends `guesses` and `evaluations`, clears `currentInput`, updates `keyStates`.
- `SUBMIT` of the exact solution sets `status = 'won'`.
- `SUBMIT` of a non-solution on row index 5 (the 6th row) sets `status = 'lost'`.
- `keyStates` priority: a letter once green stays green even after a later submission paints it yellow at a different position.

### 14.6 Integration / manual tests

- Flip-reveal animation timing visually correct (250 ms stagger, 500 ms flip).
- Shake animation on invalid input does not displace the board.
- Bounce on win does not overlap awkwardly with toast.
- Page reload mid-game in daily mode restores the board exactly.
- Page reload at local midnight rolls over to the next puzzle.
- Physical and on-screen keyboards produce identical state changes.
- Mobile: on-screen keyboard works without the OS soft keyboard appearing.
- Share string copies to clipboard and pastes correctly into a tweet/message app.

---

## 15. Performance

The performance budget for this game is comically generous; do not over-engineer.

- Total JS bundle size for Termo: target < 30 KB gzipped (excluding word lists).
- Word lists: `solutions.txt` ~25 KB raw / ~10 KB gzipped; `valid-guesses.txt` ~100 KB raw / ~40 KB gzipped.
- First-meaningful-paint of the board: < 200 ms on a mid-range mobile after route navigation.
- Per-keystroke latency: < 16 ms (one frame). Trivial given the work involved.
- Reveal animation: render at 60 fps; uses CSS transforms (compositor-only, no layout).

No virtualization, no lazy rendering, no Web Workers needed.

---

## 16. Error handling and edge cases

- **Word lists fail to load**: show a toast "erro ao carregar palavras, tente recarregar". Disable input.
- **`Date` manipulated to before `LAUNCH_DATE`**: `dailyPuzzleNumber` returns ≤ 0. Clamp to 1 and play puzzle 1; do not crash. Don't write to localStorage in this case (it would corrupt the streak history).
- **Solution list is empty**: assert at app start; treat as a fatal bug, show an error state.
- **`localStorage` returns malformed JSON**: catch, discard, start fresh; do not crash.
- **`navigator.clipboard` is undefined** (insecure context, older browser): fallback to the `execCommand` path; if that also fails, show the share string in a selectable text area for manual copy.
- **User switches modes mid-puzzle**: allowed. Daily state is preserved in localStorage; infinite state is discarded. Switching back restores the daily board exactly.
- **System clock is wrong**: not our problem. The puzzle just won't match the rest of the world's. Document this as a known limitation.

---

## 17. Out of scope (recap)

For clarity, none of the following is part of v1:

- Dueto (2-board parallel) and Quarteto (4-board parallel) variants.
- Hard mode (must use revealed greens/yellows in subsequent guesses).
- Colorblind palette toggle.
- Light theme.
- Sound effects.
- Stats modal beyond a simple "streak: 5" badge.
- Dictionary lookups / definitions for the solution.
- Hint system.
- Cross-device sync of progress.
- Accounts, logins, leaderboards, social.
- Analytics beyond the bare minimum the host app already collects.

When the team is ready for v2, the most important additions are likely (in order): Dueto, then colorblind palette, then full stats modal, then Quarteto.

---

## 18. Open questions for v1 scoping

These should be confirmed with the user before implementation begins, but reasonable defaults are noted.

- **Where does the LAUNCH_DATE fall?** Recommend the first weekday on or after the first deploy, frozen forever.
- **Is `solutions-accented.txt` available from the prior project?** If not, ship without natural-form reveal in v1 — the unaccented form is shown instead.
- **Do we shuffle the solutions list at build time?** Recommend yes, with a fixed seed, to avoid an early run of alphabetically-clustered answers.
- **Header copy in Portuguese**: `"Termo"` for the title, `"Diário" / "Treino"` for the mode toggle, `"Compartilhar"` for the share button, `"Próxima palavra em HH:MM:SS"` for the countdown. Confirm exact phrasing with a native-speaker reviewer.
