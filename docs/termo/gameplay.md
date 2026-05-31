# Termo — Gameplay

## Objective

Guess the hidden five-letter Portuguese word in six attempts or fewer. After each guess, the game tells you, on a per-letter basis, how close you were. Use that information to narrow down the answer with subsequent guesses.

## Controls

### Physical keyboard

- **A–Z**: types the corresponding letter into the next empty tile on the current row. Accented keys (e.g. `Á`, `Ç`) are not required — the game compares words in unaccented form. If a physical keyboard layout produces an accented character, it is normalized to its base letter on input.
- **Backspace** (`Delete` on macOS keyboards): erases the most recently typed letter on the current row. If the current row is empty, does nothing.
- **Enter** (`Return`): submits the current row as a guess. The row must contain exactly five letters and the resulting word must appear in the valid-guesses list.
- Any other key is ignored.

### On-screen virtual keyboard

Always rendered below the board. Three rows:

```
Q W E R T Y U I O P
 A S D F G H J K L
ENTER Z X C V B N M ⌫
```

- **Letter keys**: tap/click types that letter into the next empty tile.
- **ENTER**: submits the current row, same as physical Enter.
- **⌫ (backspace)**: erases the most recent letter, same as physical Backspace.
- Each letter key is tinted with the highest-priority feedback color the player has discovered for it so far (green > yellow > gray > untouched).

## The board

A 6x5 grid. Each row is one guess attempt. Rows are filled from top to bottom; within a row, tiles fill from left to right as letters are typed. The currently active row (the one accepting input) has a visual focus indicator.

Tiles before submission are simply "filled" — the letter shows but no color. Colors only appear after Enter is pressed and the row has been accepted.

## Feedback colors

After a guess is submitted, each of the five tiles in that row reveals one of three colors. The reveal is a left-to-right staggered flip animation, ~250 ms per tile.

- **Green ("correto")**: the letter is in the answer **and** is in the correct position.
- **Yellow ("presente")**: the letter is in the answer **but** is in a different position than where you placed it.
- **Gray ("ausente")**: the letter is not in the answer at all — *with one important caveat about duplicate letters, described next.*

### Duplicate-letter feedback: the subtle rule

This is the rule that most casual players (and most clone implementations) get wrong. The precise rule is:

**Each letter occurrence in the answer can "claim" at most one tile in your guess. Exact-position (green) matches claim first; then remaining yellows are assigned left-to-right among the leftover positions.**

Restated as a procedure (what the game actually does):

1. For every position `i` from 0 to 4: if `guess[i] == answer[i]`, mark that tile **green**, and reduce the available count of that letter in the answer by one.
2. For every still-unmarked position `i` from left to right: if the guess letter at position `i` still has remaining count > 0 in the answer (after step 1's deductions), mark that tile **yellow** and decrement the count. Otherwise mark it **gray**.

**Consequences:**

- If the answer contains one `O` and your guess contains two `O`s, at most one of those `O`s in your guess will be colored (green or yellow). The other will be gray, *even though `O` is in the word.* This is correct and intentional.
- If a guessed letter appears in a green position, it cannot also appear yellow at another position unless the answer contains additional copies of that letter.
- The leftmost unmatched copy gets the yellow before the rightmost. (This only matters cosmetically; both copies are "in the wrong spot," but the player sees the first one highlighted.)

**Worked example.** Answer is `LLAMA`. Player guesses `ALLOY`.

| Position | 0 | 1 | 2 | 3 | 4 |
|----------|---|---|---|---|---|
| Answer   | L | L | A | M | A |
| Guess    | A | L | L | O | Y |

Pass 1 (exact matches): position 1 `L == L` -> green. Answer-letter pool after pass 1: `{L: 1, A: 2, M: 1}` (one `L` was claimed).

Pass 2, left to right over unmarked positions 0, 2, 3, 4:

- Position 0, guess `A`: pool has `A: 2`. Mark yellow. Pool: `{L: 1, A: 1, M: 1}`.
- Position 2, guess `L`: pool has `L: 1`. Mark yellow. Pool: `{A: 1, M: 1}`.
- Position 3, guess `O`: pool has no `O`. Mark gray.
- Position 4, guess `Y`: pool has no `Y`. Mark gray.

Final row coloring: `[yellow, green, yellow, gray, gray]`.

Note: there were two `A`s in the answer but only one `A` in the guess, so the player gets a single yellow on `A`. There were two `L`s in both the answer and the guess; one became green (position 1), the other became yellow (position 2). Neither `O` nor `Y` is in the answer at all, so both are gray.

## Submitting a guess

When you press Enter:

- If the current row has fewer than 5 letters: the row shakes briefly, a toast says "letras faltando", and nothing else happens.
- If the row has 5 letters but the resulting word is not in the valid-guesses list: the row shakes, a toast says "palavra inválida", and the row remains as-is (you can backspace and try again).
- If the row has 5 letters and the word is valid: the row's tiles flip one-by-one (left to right, 250 ms apart) to reveal their colors. After the animation finishes, the game checks for win/lose.

## Win, loss, and end-of-game

- **Win**: all five tiles in a submitted row reveal green. The winning row's tiles do a short vertical bounce after the reveal. A toast (or modal) congratulates the player and shows the share string.
- **Loss**: all six rows have been submitted and none was all-green. A toast displays the answer in its natural accented form (e.g. "A palavra era: PADRÃO"). The share string still shows the player's grid pattern, with `X/6` instead of a number.

In **daily mode**, after win or loss, the board is locked for the remainder of the local-calendar day. Refreshing the page shows the completed board with all guesses and their colors, plus the result toast and share button. A countdown to the next puzzle (next local midnight) is shown.

In **infinite mode**, after win or loss, a "Nova palavra" button replaces the keyboard prompt and starts a new puzzle immediately on click.

## Share string

After a daily-mode game ends (win or loss), the player can tap "Compartilhar" to copy a textual summary of the result to the clipboard. The format is:

```
Termo 123 4/6

⬜🟨⬜🟨⬜
🟩⬜🟩⬜🟩
🟩🟩🟩⬜🟩
🟩🟩🟩🟩🟩
```

- First line: `Termo <puzzle-number> <attempts>/6`. For a loss: `Termo <puzzle-number> X/6`.
- Blank line.
- One emoji row per submitted guess. `🟩` for green, `🟨` for yellow, `⬜` for gray.
- No letters appear — the share string never spoils the answer for the recipient.

The puzzle number is the integer index of today's puzzle, counting from puzzle #1 on the configured launch date (see `engineering.md`).

Infinite mode does not produce a share string (there is nothing for two players to compare).

## Daily vs. Infinite mode

- **Daily** (default): everyone in the world playing on the same local-calendar date sees the same hidden word. One puzzle per day. Progress persists across reloads.
- **Infinite** ("Treino"): an unlimited supply of randomly selected puzzles from the same solutions list. Progress does not persist beyond the current puzzle; closing the tab forfeits an in-progress treino puzzle. Best streak is tracked.

A toggle in the header switches between the two modes. Switching modes mid-puzzle in either direction is allowed; daily progress is preserved, treino progress is not.
