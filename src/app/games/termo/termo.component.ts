import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HelpDialogComponent } from '../../shared/help-dialog/help-dialog.component';
import { createTermoGame, type TermoGame } from './game';
import { normalize } from './normalize';
import {
  loadWordLists,
  SUPPORTED_LENGTHS,
  type WordLength,
  type WordLists,
} from './wordlist';
import { infiniteStorageKey } from './persistence';
import type { Effect, GameMode, GameState, KeyState } from './state';

interface TileView {
  letter: string;
  state: 'empty' | 'filled' | 'revealing' | 'revealed' | 'won';
  eval: '' | 'correct' | 'present' | 'absent';
  flipDelayMs: number;
  bounceDelayMs: number;
  bouncing: boolean;
}

interface KeyView {
  label: string;
  key: string; // dispatch token: A..Z or 'ENTER' or 'BACKSPACE'
  wide: boolean;
  state: KeyState | 'special';
}

const KEYBOARD_LAYOUT: ReadonlyArray<ReadonlyArray<string>> = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
];

const REVEAL_STAGGER_MS = 250;
const FLIP_DURATION_MS = 500;
const SHAKE_DURATION_MS = 400;
const BOUNCE_STAGGER_MS = 100;
const BOUNCE_DURATION_MS = 600;
const TOAST_DURATION_MS = 2000;

@Component({
  selector: 'app-termo',
  imports: [RouterLink, HelpDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header>
        <a routerLink="/" class="back">&larr; Arcade</a>
        <h2 class="pixel">Termo</h2>
        <div class="mode-toggle" role="tablist" aria-label="Modo de jogo">
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="mode() === 'daily'"
            [class.active]="mode() === 'daily'"
            (click)="setMode('daily')"
          >Diário</button>
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="mode() === 'infinite'"
            [class.active]="mode() === 'infinite'"
            (click)="setMode('infinite')"
          >Treino</button>
          <button
            type="button"
            class="help-btn"
            (click)="helpOpen.set(true)"
            aria-label="Instruções"
            title="Instruções (?)"
          >?</button>
        </div>
      </header>

      <app-help-dialog [(open)]="helpOpen" title="Termo">
        <h4>Objetivo</h4>
        <p>
          Descubra a palavra do dia em até <strong>6 tentativas</strong> (ou 7 / 8 para
          palavras de 6 / 7 letras no modo Treino). Cada palpite deve ser uma palavra válida.
        </p>
        <h4>Cores</h4>
        <p>
          <strong style="color:#6aaa64">Verde</strong> — letra certa na posição certa.<br>
          <strong style="color:#c9b458">Amarelo</strong> — letra existe na palavra, em outra posição.<br>
          <strong style="color:#888">Cinza</strong> — letra não existe na palavra.
        </p>
        <p>
          O avaliador usa o algoritmo de duas passadas (marcação de verdes primeiro,
          depois amarelos), então palpites com letras repetidas se comportam como no Wordle
          original.
        </p>
        <h4>Controles</h4>
        <table>
          <tr><td><kbd>A</kbd>…<kbd>Z</kbd></td><td>Digitar letra (acentos são normalizados)</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Enviar palpite</td></tr>
          <tr><td><kbd>Backspace</kbd></td><td>Apagar letra</td></tr>
          <tr><td><kbd>?</kbd></td><td>Abrir / fechar esta janela</td></tr>
        </table>
        <p>
          O teclado virtual também aceita cliques e mostra a melhor pista descoberta para
          cada letra (verde &gt; amarelo &gt; cinza).
        </p>
        <h4>Modos</h4>
        <p>
          <strong>Diário</strong> — uma palavra de 5 letras por dia, igual para todo mundo.
          O progresso é salvo até a próxima meia-noite local. Vencer mostra o botão
          <em>Compartilhar</em> (grade de emojis).<br>
          <strong>Treino</strong> — palavras aleatórias. Você escolhe o comprimento (5, 6, ou 7);
          sequências de vitórias são contadas separadamente por comprimento.
        </p>
      </app-help-dialog>

      @if (loadError()) {
        <div class="error" role="alert">{{ loadError() }}</div>
      } @else if (!ready()) {
        <div class="loading">Carregando palavras…</div>
      } @else {
        @if (mode() === 'infinite') {
          <div class="length-toggle" role="radiogroup" aria-label="Tamanho da palavra">
            @for (n of supportedLengths; track n) {
              <button
                type="button"
                role="radio"
                [attr.aria-checked]="wordLength() === n"
                [class.active]="wordLength() === n"
                (click)="setLength(n)"
              >{{ n }} letras</button>
            }
          </div>
        }
        <div
          class="board"
          role="grid"
          [attr.aria-label]="boardAriaLabel()"
          [style.--cols]="wordLength()"
          [style.--rows]="maxAttempts()"
          [style.aspect-ratio]="wordLength() + ' / ' + maxAttempts()"
        >
          @for (row of boardRows(); track $index; let r = $index) {
            <div
              class="row"
              role="row"
              [class.shaking]="shakingRow() === r"
            >
              @for (tile of row; track $index; let c = $index) {
                <div
                  class="tile"
                  role="gridcell"
                  [attr.data-state]="tile.state"
                  [attr.data-eval]="tile.eval || null"
                  [class.bouncing]="tile.bouncing"
                  [style.animation-delay.ms]="tile.bouncing ? tile.bounceDelayMs : null"
                  [attr.aria-label]="ariaForTile(tile)"
                >
                  <div
                    class="tile-face tile-front"
                    [style.transition-delay.ms]="tile.flipDelayMs"
                  >{{ tile.letter }}</div>
                  <div
                    class="tile-face tile-back"
                    [style.transition-delay.ms]="tile.flipDelayMs"
                  >{{ tile.letter }}</div>
                </div>
              }
            </div>
          }
        </div>

        @if (toast(); as t) {
          <div class="toast" role="status" aria-live="polite">{{ t }}</div>
        }

        @if (status() !== 'playing') {
          <div class="result" role="status">
            @if (status() === 'won') {
              <p>Você acertou em {{ guessCount() }}/{{ maxAttempts() }}!</p>
            } @else {
              <p>A palavra era: <strong>{{ solutionAccented() }}</strong></p>
            }
            @if (mode() === 'daily' && shareString()) {
              <button type="button" class="share" (click)="share()">Compartilhar</button>
            }
            @if (mode() === 'infinite') {
              <button type="button" class="new" (click)="newInfinite()">Nova palavra</button>
            }
          </div>
        }

        <div class="keyboard" role="group" aria-label="Teclado virtual">
          @for (row of keyboardRows(); track $index) {
            <div class="kb-row">
              @for (key of row; track key.key) {
                <button
                  type="button"
                  class="key"
                  [class.wide]="key.wide"
                  [attr.data-state]="key.state"
                  [attr.data-key]="key.key"
                  (click)="onKey(key.key)"
                  [attr.aria-label]="key.label"
                >{{ key.label === 'BACKSPACE' ? '⌫' : key.label }}</button>
              }
            </div>
          }
        </div>

        @if (mode() === 'daily') {
          <p class="hint">
            Diário #{{ puzzleNumber() }}. Pressione Enter para enviar, Backspace para apagar.
          </p>
        } @else {
          <p class="hint">Treino: palavra aleatória. Sequência: {{ infiniteStreak() }}.</p>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: #14171c;
      color: #e6e6e6;
      --green: #6aaa64;
      --yellow: #c9b458;
      --gray: #3a3a3c;
      --tile-empty: #14171c;
      --tile-border: #3a3a3c;
      --tile-border-filled: #565758;
      --key-default: #818384;
    }
    .page {
      max-width: 520px;
      margin: 0 auto;
      padding: 1rem;
      font-family: system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }
    header {
      width: 100%;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 0.75rem;
    }
    h2 { margin: 0; text-align: center; font-size: 1rem; letter-spacing: 0.06em; }
    a.back { color: inherit; text-decoration: none; opacity: 0.8; font-size: 0.9rem; }
    a.back:hover { opacity: 1; }
    .mode-toggle {
      display: inline-flex;
      gap: 0;
      background: #23262d;
      border-radius: 0.5rem;
      overflow: hidden;
    }
    .mode-toggle button {
      background: transparent;
      color: inherit;
      border: 0;
      padding: 0.4rem 0.7rem;
      font: inherit;
      cursor: pointer;
      opacity: 0.7;
    }
    .mode-toggle button.active { background: #3a3f4b; opacity: 1; }
    .help-btn {
      margin-left: 0.5rem;
      background: transparent;
      color: inherit;
      border: 1px solid currentColor;
      border-radius: 999px;
      width: 1.75rem;
      height: 1.75rem;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      opacity: 0.6;
      padding: 0;
    }
    .help-btn:hover { opacity: 1; }

    .length-toggle {
      display: inline-flex;
      gap: 0;
      background: #23262d;
      border-radius: 0.5rem;
      overflow: hidden;
    }
    .length-toggle button {
      background: transparent;
      color: inherit;
      border: 0;
      padding: 0.4rem 0.7rem;
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      opacity: 0.7;
    }
    .length-toggle button.active { background: #3a3f4b; opacity: 1; }

    .board {
      display: grid;
      grid-template-rows: repeat(var(--rows, 6), 1fr);
      gap: 6px;
      width: 100%;
      max-width: 330px;
      /* aspect-ratio is set inline based on wordLength / maxAttempts. */
    }
    .row {
      display: grid;
      grid-template-columns: repeat(var(--cols, 5), 1fr);
      gap: 6px;
    }
    .row.shaking { animation: shake 400ms ease-in-out; }

    .tile {
      position: relative;
      perspective: 600px;
      aspect-ratio: 1 / 1;
      font-size: 2rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .tile-face {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      backface-visibility: hidden;
      transition: transform 500ms ease-in-out, background-color 200ms, border-color 200ms;
      border: 2px solid var(--tile-border);
      box-sizing: border-box;
      border-radius: 4px;
      user-select: none;
    }
    .tile-front {
      background: var(--tile-empty);
    }
    .tile[data-state="filled"] .tile-front {
      border-color: var(--tile-border-filled);
    }
    .tile-back {
      transform: rotateY(180deg);
      background: var(--gray);
      color: white;
      border-color: transparent;
    }
    .tile[data-state="revealing"] .tile-front,
    .tile[data-state="revealed"] .tile-front,
    .tile[data-state="won"] .tile-front { transform: rotateY(180deg); }
    .tile[data-state="revealing"] .tile-back,
    .tile[data-state="revealed"] .tile-back,
    .tile[data-state="won"] .tile-back { transform: rotateY(360deg); }

    .tile[data-eval="correct"] .tile-back { background: var(--green); }
    .tile[data-eval="present"] .tile-back { background: var(--yellow); }
    .tile[data-eval="absent"]  .tile-back { background: var(--gray); }

    .tile.bouncing { animation: bounce 600ms ease both; }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20%      { transform: translateX(-6px); }
      40%      { transform: translateX( 6px); }
      60%      { transform: translateX(-4px); }
      80%      { transform: translateX( 4px); }
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      40%      { transform: translateY(-30px); }
      60%      { transform: translateY(0); }
      80%      { transform: translateY(-8px); }
    }

    .keyboard {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
      max-width: 500px;
    }
    .kb-row {
      display: flex;
      justify-content: center;
      gap: 4px;
    }
    .key {
      flex: 1;
      min-width: 0;
      height: 52px;
      font: inherit;
      font-weight: 700;
      font-size: 0.9rem;
      text-transform: uppercase;
      background: var(--key-default);
      color: white;
      border: 0;
      border-radius: 4px;
      cursor: pointer;
      touch-action: manipulation;
    }
    .key.wide { flex: 1.5; font-size: 0.7rem; }
    .key[data-state="correct"] { background: var(--green); }
    .key[data-state="present"] { background: var(--yellow); }
    .key[data-state="absent"]  { background: var(--gray); color: #e6e6e6; }
    .key[data-state="unseen"]  { background: var(--key-default); }
    .key[data-state="special"] { background: #565758; }

    .toast {
      position: fixed;
      top: 25%;
      left: 50%;
      transform: translateX(-50%);
      background: #ffffff;
      color: #14171c;
      padding: 0.6rem 1rem;
      border-radius: 4px;
      font-weight: 600;
      box-shadow: 0 6px 20px rgba(0,0,0,0.4);
      pointer-events: none;
      z-index: 10;
    }

    .result {
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      align-items: center;
    }
    .result p { margin: 0; }
    .result button {
      background: var(--green);
      color: white;
      border: 0;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .hint { color: #8a8f99; font-size: 0.8rem; margin: 0; }
    .loading, .error {
      padding: 2rem 1rem;
      color: #8a8f99;
    }
    .error { color: #ff7a7a; }
  `,
})
export class TermoComponent implements AfterViewInit, OnDestroy {
  private game: TermoGame | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private toastTimer: number | null = null;
  private shakingTimer: number | null = null;
  private revealTimers: number[] = [];
  private bouncingTimer: number | null = null;

  protected readonly helpOpen = signal(false);
  private readonly router = inject(Router);

  constructor() {
    const route = inject(ActivatedRoute);
    if (route.snapshot.data['help'] === true) this.helpOpen.set(true);
  }

  // ---------- reactive UI state ----------
  protected readonly ready = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly stateVersion = signal(0); // bump on dispatch to recompute views
  protected readonly toast = signal<string | null>(null);
  protected readonly shakingRow = signal<number | null>(null);

  /** Indices of tiles by [row][col] that are currently in flip-revealing state. */
  protected readonly revealingRow = signal<number | null>(null);
  protected readonly revealedRow = signal<number | null>(null);
  protected readonly bouncingRow = signal<number | null>(null);

  protected readonly supportedLengths = SUPPORTED_LENGTHS;

  protected readonly mode = computed<GameMode>(() => {
    this.stateVersion();
    return this.game?.state().mode ?? 'daily';
  });
  protected readonly status = computed(() => {
    this.stateVersion();
    return this.game?.state().status ?? 'playing';
  });
  protected readonly puzzleNumber = computed(() => {
    this.stateVersion();
    return this.game?.state().puzzleNumber ?? 0;
  });
  protected readonly guessCount = computed(() => {
    this.stateVersion();
    return this.game?.state().guesses.length ?? 0;
  });
  protected readonly solutionAccented = computed(() => {
    this.stateVersion();
    return this.game?.state().solutionAccented ?? '';
  });
  protected readonly wordLength = computed(() => {
    this.stateVersion();
    return this.game?.state().wordLength ?? 5;
  });
  protected readonly maxAttempts = computed(() => {
    this.stateVersion();
    return this.game?.state().maxAttempts ?? 6;
  });
  protected readonly boardAriaLabel = computed(() => {
    const len = this.wordLength();
    const rows = this.maxAttempts();
    return `Tabuleiro Termo, ${rows} tentativas de ${len} letras`;
  });
  protected readonly infiniteStreak = signal(0);
  protected readonly shareString = computed<string | null>(() => {
    this.stateVersion();
    return this.game?.shareString() ?? null;
  });

  protected readonly boardRows = computed<TileView[][]>(() => {
    this.stateVersion();
    this.revealingRow();
    this.revealedRow();
    this.bouncingRow();
    if (!this.game) return Array.from({ length: 6 }, () => emptyRow(5));
    return buildBoardRows(
      this.game.state(),
      this.revealingRow(),
      this.revealedRow(),
      this.bouncingRow(),
    );
  });

  protected readonly keyboardRows = computed<KeyView[][]>(() => {
    this.stateVersion();
    const ks = this.game?.state().keyStates ?? {};
    return KEYBOARD_LAYOUT.map((row) =>
      row.map<KeyView>((tok) => {
        if (tok === 'ENTER' || tok === 'BACKSPACE') {
          return { label: tok, key: tok, wide: true, state: 'special' };
        }
        return {
          label: tok,
          key: tok,
          wide: false,
          state: (ks[tok] ?? 'unseen') as KeyState,
        };
      }),
    );
  });

  ngAfterViewInit(): void {
    this.init();
  }

  ngOnDestroy(): void {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
    }
    this.clearTimers();
  }

  // ---------- handlers ----------

  protected onKey(key: string): void {
    if (!this.game) return;
    if (key === 'ENTER') {
      this.dispatch({ type: 'SUBMIT' });
    } else if (key === 'BACKSPACE') {
      this.dispatch({ type: 'BACKSPACE' });
    } else if (key.length === 1) {
      this.dispatch({ type: 'TYPE_LETTER', letter: key });
    }
  }

  protected setMode(mode: GameMode): void {
    if (!this.game || this.game.state().mode === mode) return;
    this.clearTimers();
    this.shakingRow.set(null);
    this.revealingRow.set(null);
    this.revealedRow.set(null);
    this.bouncingRow.set(null);
    this.toast.set(null);
    this.game.setMode(mode);
    this.refreshInfiniteStreakDisplay();
    this.bump();
  }

  protected newInfinite(): void {
    if (!this.game) return;
    this.clearTimers();
    this.bouncingRow.set(null);
    this.revealedRow.set(null);
    this.revealingRow.set(null);
    this.game.newInfinite();
    this.refreshInfiniteStreakDisplay();
    this.bump();
  }

  protected setLength(len: WordLength): void {
    if (!this.game) return;
    // Switch to infinite mode if not already there; resets the board to a
    // fresh random word of the chosen length.
    if (this.game.state().mode !== 'infinite') {
      this.game.setMode('infinite');
    }
    if (this.game.state().wordLength === len && this.game.state().guesses.length === 0
        && this.game.state().status === 'playing') {
      // Already on this length with a fresh board — no-op.
      this.bump();
      return;
    }
    this.clearTimers();
    this.shakingRow.set(null);
    this.revealingRow.set(null);
    this.revealedRow.set(null);
    this.bouncingRow.set(null);
    this.toast.set(null);
    this.game.newInfinite(len);
    this.refreshInfiniteStreakDisplay();
    this.bump();
  }

  protected share(): void {
    const s = this.game?.shareString();
    if (!s) return;
    const fallback = (): void => {
      try {
        const ta = document.createElement('textarea');
        ta.value = s;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this.showToast('copiado!');
      } catch {
        this.showToast(s);
      }
    };
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      nav.share({ text: s }).catch(() => fallback());
    } else if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(s)
        .then(() => this.showToast('copiado!'))
        .catch(() => fallback());
    } else {
      fallback();
    }
  }

  protected ariaForTile(tile: TileView): string {
    if (!tile.letter) return 'vazio';
    switch (tile.eval) {
      case 'correct': return `${tile.letter}, correto`;
      case 'present': return `${tile.letter}, presente`;
      case 'absent':  return `${tile.letter}, ausente`;
      default:        return tile.letter;
    }
  }

  // ---------- internal ----------

  private async init(): Promise<void> {
    let listsByLength: Record<number, WordLists>;
    try {
      const loaded = await Promise.all(
        SUPPORTED_LENGTHS.map((n) => loadWordLists(n)),
      );
      listsByLength = {};
      for (const l of loaded) listsByLength[l.wordLength] = l;
    } catch (err) {
      this.loadError.set('Erro ao carregar palavras. Tente recarregar.');
      return;
    }
    try {
      this.game = createTermoGame({ lists: listsByLength });
    } catch (err) {
      this.loadError.set('Erro ao iniciar o jogo.');
      return;
    }

    this.keydownHandler = (e: KeyboardEvent): void => this.onPhysicalKey(e);
    window.addEventListener('keydown', this.keydownHandler);

    this.refreshInfiniteStreakDisplay();
    this.ready.set(true);
    this.bump();
  }

  private onPhysicalKey(e: KeyboardEvent): void {
    // Help toggle: ? key works regardless of game status. (Not 'H' — H is a
    // legitimate letter input in Termo, so binding it to help would break
    // typing words containing H.)
    if (e.key === '?') {
      e.preventDefault();
      this.helpOpen.update((v) => !v);
      return;
    }
    // Esc: quit straight to the arcade home (Termo has no pause state, so
    // there's nothing to pause to first).
    if (e.key === 'Escape') {
      e.preventDefault();
      this.router.navigate(['/']);
      return;
    }
    // If the help dialog is open, swallow letter/Enter/Backspace events so
    // typing inside the dialog doesn't dispatch into the game.
    if (this.helpOpen()) return;
    if (!this.game) return;
    if (this.game.state().status !== 'playing') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter') {
      this.dispatch({ type: 'SUBMIT' });
      return;
    }
    if (e.key === 'Backspace') {
      this.dispatch({ type: 'BACKSPACE' });
      return;
    }
    if (e.key.length !== 1) return;
    const n = normalize(e.key);
    if (n.length === 1 && n >= 'A' && n <= 'Z') {
      e.preventDefault();
      this.dispatch({ type: 'TYPE_LETTER', letter: n });
    }
  }

  private dispatch(
    action: { type: 'SUBMIT' } | { type: 'BACKSPACE' } | { type: 'TYPE_LETTER'; letter: string },
  ): void {
    if (!this.game) return;
    const effects = this.game.dispatch(action);
    this.bump();
    this.processEffects(effects);
  }

  private processEffects(effects: Effect[]): void {
    for (const eff of effects) {
      if (eff.type === 'TOAST') {
        this.showToast(eff.message);
      } else if (eff.type === 'SHAKE_ROW') {
        this.triggerShake(eff.row);
      } else if (eff.type === 'FLIP_REVEAL') {
        this.triggerFlip(eff.row);
      } else if (eff.type === 'BOUNCE_WIN') {
        this.scheduleBounce(eff.row);
      }
    }
  }

  private triggerShake(row: number): void {
    if (this.shakingTimer !== null) window.clearTimeout(this.shakingTimer);
    this.shakingRow.set(row);
    this.shakingTimer = window.setTimeout(() => {
      this.shakingRow.set(null);
      this.shakingTimer = null;
    }, SHAKE_DURATION_MS);
  }

  private triggerFlip(row: number): void {
    // Set row to 'revealing' to apply flip transforms; the bound state per-tile is
    // controlled via revealingRow/revealedRow signals consumed by buildBoardRows.
    this.revealingRow.set(row);
    // After total animation finishes, mark row revealed for ARIA / locked layout.
    const total = 4 * REVEAL_STAGGER_MS + FLIP_DURATION_MS;
    const t = window.setTimeout(() => {
      this.revealedRow.set(row);
      this.revealingRow.set(null);
      this.bump();
    }, total);
    this.revealTimers.push(t);
  }

  private scheduleBounce(row: number): void {
    const total = 4 * REVEAL_STAGGER_MS + FLIP_DURATION_MS;
    const t = window.setTimeout(() => {
      this.bouncingRow.set(row);
      this.bump();
      this.bouncingTimer = window.setTimeout(() => {
        this.bouncingRow.set(null);
        this.bouncingTimer = null;
      }, BOUNCE_DURATION_MS + 4 * BOUNCE_STAGGER_MS);
      this.refreshInfiniteStreakDisplay();
    }, total);
    this.revealTimers.push(t);
  }

  private refreshInfiniteStreakDisplay(): void {
    // Read fresh from storage so the displayed streak matches persisted value.
    // Streaks are namespaced per word length (infinite, infinite.6, infinite.7).
    const len = this.game?.state().wordLength ?? 5;
    const key = `arcade.termo.${infiniteStorageKey(len)}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { currentStreak?: number };
        this.infiniteStreak.set(parsed.currentStreak ?? 0);
        return;
      }
    } catch {
      /* ignore */
    }
    this.infiniteStreak.set(0);
  }

  private showToast(msg: string): void {
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toast.set(msg);
    this.toastTimer = window.setTimeout(() => {
      this.toast.set(null);
      this.toastTimer = null;
    }, TOAST_DURATION_MS);
  }

  private clearTimers(): void {
    for (const t of this.revealTimers) window.clearTimeout(t);
    this.revealTimers = [];
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    if (this.shakingTimer !== null) window.clearTimeout(this.shakingTimer);
    if (this.bouncingTimer !== null) window.clearTimeout(this.bouncingTimer);
    this.toastTimer = this.shakingTimer = this.bouncingTimer = null;
  }

  private bump(): void {
    this.stateVersion.update((v) => v + 1);
  }
}

function emptyRow(len: number): TileView[] {
  return Array.from({ length: len }, () => ({
    letter: '',
    state: 'empty' as const,
    eval: '' as const,
    flipDelayMs: 0,
    bounceDelayMs: 0,
    bouncing: false,
  }));
}

function buildBoardRows(
  state: GameState,
  revealingRow: number | null,
  revealedRow: number | null,
  bouncingRow: number | null,
): TileView[][] {
  const rows: TileView[][] = [];
  const totalRows = state.maxAttempts;
  const cols = state.wordLength;
  for (let r = 0; r < totalRows; r++) {
    const row: TileView[] = [];
    for (let c = 0; c < cols; c++) {
      // Submitted row.
      if (r < state.guesses.length) {
        const letter = state.guesses[r][c];
        const evalVal = state.evaluations[r][c];
        let tileState: TileView['state'] = 'revealed';
        if (r === bouncingRow) tileState = 'won';
        else if (r === revealingRow) tileState = 'revealing';
        else if (r === revealedRow) tileState = 'revealed';
        row.push({
          letter,
          state: tileState,
          eval: evalVal,
          flipDelayMs: c * REVEAL_STAGGER_MS,
          bounceDelayMs: c * BOUNCE_STAGGER_MS,
          bouncing: r === bouncingRow,
        });
      } else if (r === state.currentRow && state.status === 'playing') {
        // Active input row.
        const letter = state.currentInput[c] ?? '';
        row.push({
          letter,
          state: letter ? 'filled' : 'empty',
          eval: '',
          flipDelayMs: 0,
          bounceDelayMs: 0,
          bouncing: false,
        });
      } else {
        // Empty future row.
        row.push({
          letter: '',
          state: 'empty',
          eval: '',
          flipDelayMs: 0,
          bounceDelayMs: 0,
          bouncing: false,
        });
      }
    }
    rows.push(row);
  }
  return rows;
}
