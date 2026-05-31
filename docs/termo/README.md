# Termo

Termo is the Brazilian Portuguese variant of the word-guessing game Wordle. The player has six attempts to guess a hidden five-letter word, receiving color-coded feedback after every submitted guess to indicate which letters are correctly placed, which letters appear in the word but in a different position, and which letters are not in the word at all.

This directory contains the specification for a single-board, web-based browser implementation of Termo, targeting the `arcade/newer` SPA. Multi-board variants ("Dueto", "Quarteto") are described below for context but are explicitly **out of scope for v1**.

## Origin

Wordle was created by software engineer Josh Wardle in late 2020 and went viral in early 2021. After being acquired by The New York Times in January 2022, several localized fan-made clones appeared around the world. The Portuguese-language clone, **Termo**, was built by Brazilian developer **Fernando Serboncini** and published at <https://term.ooo>. Termo became the de facto Portuguese version of the game, distinguished from its English counterpart by three things:

1. A Portuguese-language solution and validation word list.
2. Handling of Portuguese diacritics (accents and the cedilla) — players type unaccented letters, but the revealed answer displays in its natural orthographic form.
3. Multi-board "parallel" variants: **Dueto** (two boards simultaneously, eight attempts) and **Quarteto** (four boards simultaneously, ten attempts). These are mechanically identical to the single-board game but cross-cut a shared keyboard input across multiple independent puzzles.

The mechanics, color palette, animations, and on-screen-keyboard layout in Termo are direct ports of Wordle's; only the wordlist, language, and parallel-board variants differ materially.

## Look and Feel

- **Board**: a 6 (rows) by 5 (columns) grid of tiles. Each tile is a square that contains a single uppercase letter once typed.
- **Tile states**:
  - *Empty*: dark outline on a transparent background.
  - *Filled* (letter typed, row not yet submitted): outline thickens, letter rendered in the foreground color.
  - *Evaluated correct*: green fill, white letter.
  - *Evaluated present*: yellow/amber fill, white letter.
  - *Evaluated absent*: medium gray fill, white letter.
- **Reveal animation**: after Enter is pressed and a guess is accepted, each tile in the row flips horizontally in sequence (left to right, 250 ms per tile) to reveal its evaluated color.
- **Invalid input**: a quick horizontal shake of the current row, accompanied by a toast at the top of the board (e.g. "palavra inválida", "letras faltando").
- **Win**: the winning row's tiles do a small vertical bounce after the reveal completes.
- **Loss**: a toast displays the answer in its accented form (e.g. "PADRÃO").
- **Color palette**: dark theme by default — near-black background, off-white text, the canonical Wordle green (`#6aaa64`), yellow (`#c9b458`), and gray (`#787c7e`). A light theme is desirable but not required for v1.
- **Typography**: a heavy sans-serif (Helvetica/Arial/system stack is fine; a bundled font such as Inter or Clear Sans is nicer).
- **On-screen keyboard**: rendered below the board, three rows arranged in the Portuguese-friendly QWERTY layout used by term.ooo:
  - Row 1: `Q W E R T Y U I O P`
  - Row 2: `A S D F G H J K L`
  - Row 3: `ENTER  Z X C V B N M  BACKSPACE`
  - Keys carry the highest-priority color the player has discovered for that letter so far (correct > present > absent > unseen).

## pt-BR-specific touches

- **Accent normalization on input**: the player types only the 26 unaccented letters A–Z. Internally, both the solution and the guess are compared in a normalized form (NFD decomposition, diacritics stripped, uppercased). This is how `PADRÃO` is guessable by typing `PADRAO`, and how `AÇÃO` (hypothetical — `AÇÃO` is only four letters, used illustratively) would be guessable by typing the unaccented form.
- **Accented reveal**: when the game ends (win or loss), and when the player's final correct guess is shown on the board, the answer is also surfaced in its original accented orthography in a toast/banner, so the player learns the proper spelling. The grid tiles themselves continue to display the normalized letters the player typed.
- **`Ç`**: treated as `C` for input and comparison purposes. Displayed as `Ç` only in the natural-form reveal.
- **Language of UI strings**: all UI copy (buttons, toasts, modal headings, share-string header) is in Portuguese. The share-string header is `Termo X/6`, matching term.ooo.

## Multi-board variants (context only, not v1)

- **Dueto**: two independent 5-letter solutions guessed in parallel. Each guess the player makes is applied to both boards simultaneously. Player gets 7 attempts (one bonus over the 6 in single-board). Layout is side-by-side on desktop, stacked or tabbed on mobile.
- **Quarteto**: four independent 5-letter solutions, each guess applied to all four boards. Player gets 9 attempts. Layout is 2x2 on desktop, more compact arrangement on mobile.
- Both variants share the same evaluation logic per board and the same shared keyboard input; the keyboard's per-key coloring becomes per-board (the keyboard typically shows the worst-known state across boards, or splits each key visually into N quadrants — term.ooo does the latter). This complexity is why v1 is single-board only.

## Modes (v1)

- **Daily mode** (default): the entire world gets the same solution word on a given local-calendar date. Progress persists across page reloads within the same day. Solving (or failing) the day's puzzle locks the board until the next local midnight.
- **Infinite mode** (a.k.a. "treino" — practice): the player can request a new random solution on demand and play as many puzzles as they like. No daily lock, no shareable result. Best streak is the only persisted stat.

## Status

v1: single-board Daily + Infinite. See `gameplay.md` for player-facing rules and `engineering.md` for the implementation specification.
