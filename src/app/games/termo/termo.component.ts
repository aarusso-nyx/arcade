import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  inject,
  OnDestroy,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HelpDialogComponent } from '../../shared/help-dialog/help-dialog.component';
import { tryNavigate } from '../../shared/arcade-shortcuts';
import { createAudio, registerSounds, type Audio } from '../../../core';
import { TERMO_SFX } from './audio';
import { createTermoGame, type TermoGame } from './game';
import { normalize } from './normalize';
import {
  loadWordLists,
  SUPPORTED_LENGTHS,
  type WordLength,
  type WordLists,
} from './wordlist';
import { infiniteStorageKey } from './persistence';
import { maxBin, winPercent, type TermoStats } from './stats';
import {
  dateForPuzzleNumber,
  recentArchiveEntries,
  type ArchiveEntry,
} from './archive';
import type { Effect, GameMode, GameState, KeyState, ToastVariant } from './state';

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
            (click)="creditsOpen.set(true)"
            aria-label="Créditos"
            title="Créditos (Shift+C)"
          >©</button>
          <button
            type="button"
            class="help-btn"
            (click)="helpOpen.set(true)"
            aria-label="Instruções"
            title="Instruções (?)"
          >?</button>
          <button
            type="button"
            class="help-btn"
            (click)="openStats()"
            aria-label="Estatísticas"
            title="Estatísticas"
          >📊</button>
          <button
            type="button"
            class="help-btn"
            (click)="archiveOpen.set(true)"
            aria-label="Arquivo de jogos diários"
            title="Arquivo"
          >📅</button>
        </div>
      </header>

      <app-help-dialog [(open)]="creditsOpen" title="Créditos — Termo">
        <p>
          <strong><a href="https://term.ooo" target="_blank" rel="noopener">Termo</a></strong>
          é a variante brasileira do Wordle, criado por
          <strong><a href="https://github.com/fserb/term" target="_blank" rel="noopener">Fernando Serboncini</a></strong>
          em term.ooo (2022), inspirado pelo
          <strong><a href="https://www.nytimes.com/games/wordle/index.html" target="_blank" rel="noopener">Wordle</a></strong>
          de <a href="https://en.wikipedia.org/wiki/Josh_Wardle" target="_blank" rel="noopener">Josh Wardle</a>
          (2021).
        </p>
        <p>
          Esta implementação usa um avaliador de duas passadas (correto / presente
          / ausente, com a regra clássica para letras repetidas), normalização de
          acentos (NFD + remoção de diacríticos), modo Diário determinístico,
          sequências por comprimento, e a animação de revelação em flip.
        </p>
        <p>
          Lista de palavras portada de um dicionário pt-BR de 5 letras de uso
          permissivo. Construído por
          <a href="mailto:aarusso@nyxk.com.br" target="_blank" rel="noopener">Antonio Augusto Russo</a>
          na NYX Knowledge como exemplo de codificação agêntica com IA.
          Veja <code>docs/termo/engineering.md</code> ou o
          <a href="https://github.com/aarusso-nyx/arcade" target="_blank" rel="noopener">repositório no GitHub</a>.
        </p>
      </app-help-dialog>

      <app-help-dialog [(open)]="statsOpen" title="Estatísticas — Termo">
        @if (statsView(); as s) {
          <div class="stats-summary">
            <div class="stat"><div class="num">{{ s.played }}</div><div class="lbl">Jogadas</div></div>
            <div class="stat">
              <div class="num">{{ s.won }}</div>
              <div class="lbl">Vitórias ({{ s.winPercent }}%)</div>
            </div>
            <div class="stat"><div class="num">{{ s.currentStreak }}</div><div class="lbl">Sequência atual</div></div>
            <div class="stat"><div class="num">{{ s.maxStreak }}</div><div class="lbl">Melhor sequência</div></div>
          </div>
          <h4>Distribuição de vitórias</h4>
          @if (s.totalWins === 0) {
            <p class="hint" style="text-align:center">Nenhuma vitória registrada ainda.</p>
          } @else {
            <div class="histogram">
              @for (bin of s.bins; track bin.attempt) {
                <div class="hist-row" [class.highlight]="bin.highlight">
                  <span class="hist-label">{{ bin.attempt }}</span>
                  <span
                    class="hist-bar"
                    [style.width.%]="bin.widthPct"
                  >{{ bin.count }}</span>
                </div>
              }
            </div>
          }
        }
      </app-help-dialog>

      <app-help-dialog [(open)]="archiveOpen" title="Arquivo — Termo">
        <p>Reviva qualquer um dos últimos 30 dias. Jogos arquivados são para
          prática — não contam para suas estatísticas nem alteram sua sequência.</p>
        <ul class="archive-list">
          @for (entry of archiveEntries(); track entry.puzzleNumber) {
            <li>
              <button
                type="button"
                class="archive-row"
                (click)="loadArchive(entry)"
              >
                <span class="archive-num">Diário #{{ entry.puzzleNumber }}</span>
                <span class="archive-date">{{ formatArchiveDate(entry.date) }}</span>
              </button>
            </li>
          }
        </ul>
      </app-help-dialog>

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
          <tr><td><kbd>Shift</kbd>+<kbd>M</kbd></td><td>Ligar / desligar som</td></tr>
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
        <h4>Estatísticas e Arquivo</h4>
        <p>
          O botão <strong>📊</strong> abre suas estatísticas (jogadas, vitórias,
          sequência atual, melhor sequência e o histograma de tentativas até a
          vitória). A janela abre automaticamente ao final de cada jogo.<br>
          O botão <strong>📅</strong> abre o arquivo dos últimos 30 dias —
          clique em qualquer dia para revisitar o puzzle. Partidas arquivadas
          são apenas para prática e não alteram suas estatísticas.
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
          [style.grid-template-rows]="'repeat(' + maxAttempts() + ', 1fr)'"
          [style.aspect-ratio]="wordLength() + ' / ' + maxAttempts()"
        >
          @for (row of boardRows(); track $index; let r = $index) {
            <div
              class="row"
              role="row"
              [class.shaking]="shakingRow() === r"
              [style.grid-template-columns]="'repeat(' + wordLength() + ', 1fr)'"
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
          <div
            class="toast"
            [attr.data-variant]="toastVariant()"
            role="status"
            aria-live="polite"
          >{{ t }}</div>
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
          @if (isArchive()) {
            <p class="hint">
              Diário #{{ puzzleNumber() }} — Arquivo ({{ archiveDateLabel() }}).
              Esta partida não conta para suas estatísticas.
            </p>
          } @else {
            <p class="hint">
              Diário #{{ puzzleNumber() }}. Pressione Enter para enviar, Backspace para apagar.
            </p>
          }
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
    h2 { margin: 0; text-align: center; font-size: 1rem; letter-spacing: 0.06em; color: var(--nyx-brand-hi); }
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
      /* grid-template-rows and aspect-ratio are bound inline per the
         current wordLength/maxAttempts — Safari has issues resolving CSS
         custom-property values inside repeat(), so we set the literal
         repeat() string directly. */
      gap: 6px;
      width: 100%;
      max-width: 330px;
    }
    .row {
      display: grid;
      /* grid-template-columns bound inline (see board comment). */
      gap: 6px;
    }
    .row.shaking { animation: shake 400ms ease-in-out; }

    .tile {
      position: relative;
      perspective: 600px;
      -webkit-perspective: 600px;
      transform-style: preserve-3d;
      -webkit-transform-style: preserve-3d;
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
      -webkit-backface-visibility: hidden;
      transform: translateZ(0); /* Safari flip-animation rendering fix */
      -webkit-transform: translateZ(0);
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
    .toast[data-variant="warning"] {
      background: #f5c542;
      color: #1a1500;
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

    /* Stats modal */
    .stats-summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .stats-summary .stat { text-align: center; }
    .stats-summary .num {
      font-size: 1.7rem;
      font-weight: 700;
      line-height: 1;
      color: var(--nyx-brand-hi);
    }
    .stats-summary .lbl {
      font-size: 0.7rem;
      color: #8a8f99;
      margin-top: 0.25rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .histogram {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 0.5rem;
    }
    .hist-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-variant-numeric: tabular-nums;
    }
    .hist-label {
      width: 1.25rem;
      text-align: right;
      color: #8a8f99;
      font-weight: 600;
    }
    .hist-bar {
      background: var(--gray);
      color: #fff;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 3px;
      min-width: 1.5rem;
      text-align: right;
      box-sizing: border-box;
    }
    .hist-row.highlight .hist-bar { background: var(--green); }

    /* Archive list */
    .archive-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .archive-row {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #23262d;
      color: inherit;
      border: 0;
      border-radius: 4px;
      padding: 0.55rem 0.8rem;
      font: inherit;
      font-size: 0.95rem;
      cursor: pointer;
    }
    .archive-row:hover { background: #3a3f4b; }
    .archive-num { font-weight: 600; }
    .archive-date { color: #8a8f99; font-size: 0.85rem; }

    /* Arcade / fullscreen mode: hide the chrome, take over the viewport. */
    :host.arcade { position: fixed; inset: 0; z-index: 9999; background: var(--nyx-bg); }
    :host.arcade .page { max-width: none; height: 100vh; padding: 1rem; }
    :host.arcade header,
    :host.arcade .hint { display: none; }
  `,
})
export class TermoComponent implements AfterViewInit, OnDestroy {
  private game: TermoGame | null = null;
  private audio: Audio | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private toastTimer: number | null = null;
  private shakingTimer: number | null = null;
  private revealTimers: number[] = [];
  private bouncingTimer: number | null = null;
  /** Timers for per-tile flip clicks (rowReveal scheduling). */
  private flipClickTimers: number[] = [];
  /** Status before the last dispatch — used to detect win/loss transitions. */
  private lastStatusForAudio: 'playing' | 'won' | 'lost' = 'playing';

  protected readonly helpOpen = signal(false);
  protected readonly creditsOpen = signal(false);
  protected readonly statsOpen = signal(false);
  protected readonly archiveOpen = signal(false);
  protected readonly arcadeMode = signal(false);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  /** Bumped by orchestrator events so storage-backed signals recompute. */
  private readonly statsVersion = signal(0);
  /** Auto-open scheduler for the end-of-game stats modal. */
  private statsAutoOpenTimer: number | null = null;
  /** Tracks the puzzle for which we've already scheduled the auto-open. */
  private lastAutoOpenForPuzzle: string | null = null;

  @HostBinding('class.arcade')
  protected get arcadeClass(): boolean { return this.arcadeMode(); }

  constructor() {
    if (this.route.snapshot.data['help'] === true) this.helpOpen.set(true);
    if (this.route.snapshot.data['archive'] === true) this.archiveOpen.set(true);
  }

  // ---------- reactive UI state ----------
  protected readonly ready = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly stateVersion = signal(0); // bump on dispatch to recompute views
  protected readonly toast = signal<string | null>(null);
  protected readonly toastVariant = signal<ToastVariant>('error');
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

  protected readonly isArchive = computed(() => {
    this.stateVersion();
    return this.game?.isArchive() ?? false;
  });

  protected readonly archiveDateLabel = computed(() => {
    this.stateVersion();
    const p = this.game?.state().puzzleNumber ?? null;
    if (p === null || !this.game?.isArchive()) return '';
    return this.formatArchiveDate(dateForPuzzleNumber(p));
  });

  /** Computed read of the recent archive — refreshed when entries open. */
  protected readonly archiveEntries = computed<ArchiveEntry[]>(() => {
    this.archiveOpen(); // re-eval when reopened so list stays fresh past midnight
    return recentArchiveEntries(30);
  });

  /** View-model for the stats modal — reads storage via game.stats(). */
  protected readonly statsView = computed(() => {
    this.statsVersion();
    this.statsOpen();
    if (!this.game) return null;
    const s: TermoStats = this.game.stats();
    return buildStatsView(s, this.currentWonAttempts());
  });

  /** Attempts used in the just-finished game, if it was a win. */
  private currentWonAttempts(): number | null {
    const st = this.game?.state();
    if (!st || st.status !== 'won') return null;
    return st.guesses.length;
  }

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
    this.audio?.destroy();
    this.audio = null;
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
    this.lastStatusForAudio = this.game.state().status;
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
    this.lastStatusForAudio = this.game.state().status;
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
    this.lastStatusForAudio = this.game.state().status;
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

  protected openStats(): void {
    this.statsOpen.set(true);
  }

  protected loadArchive(entry: ArchiveEntry): void {
    if (!this.game) return;
    this.clearTimers();
    this.shakingRow.set(null);
    this.revealingRow.set(null);
    this.revealedRow.set(null);
    this.bouncingRow.set(null);
    this.toast.set(null);
    this.archiveOpen.set(false);
    // Switch to daily mode if needed; loadArchive itself sets the state.
    if (this.game.state().mode !== 'daily') {
      this.game.setMode('daily');
    }
    this.game.loadArchive(entry.puzzleNumber);
    this.lastStatusForAudio = this.game.state().status;
    this.lastAutoOpenForPuzzle = null;
    // Reflect the URL so the player can share / refresh the archived game.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { day: entry.puzzleNumber },
      queryParamsHandling: 'merge',
    });
    this.bump();
  }

  protected formatArchiveDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
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

    // Audio is owned by the component (not the orchestrator) because Termo's
    // SFX timing is tied to the per-tile flip animation that the component
    // schedules.
    this.audio = createAudio();
    registerSounds(this.audio, TERMO_SFX);
    this.lastStatusForAudio = this.game.state().status;

    this.keydownHandler = (e: KeyboardEvent): void => this.onPhysicalKey(e);
    window.addEventListener('keydown', this.keydownHandler);

    // Honour the ?day=N archive query param.
    const dayParam = this.route.snapshot.queryParamMap.get('day');
    if (dayParam !== null) {
      const n = Number(dayParam);
      if (Number.isFinite(n) && n >= 1) {
        this.game.loadArchive(Math.floor(n));
      }
    }

    // If we rehydrated a completed daily, suppress the auto-open trigger
    // for that puzzle so just reopening the page doesn't fire the modal.
    const st = this.game.state();
    if (st.mode === 'daily' && st.puzzleNumber !== null && st.status !== 'playing') {
      this.lastAutoOpenForPuzzle = `${st.puzzleNumber}-${st.status}`;
    }

    this.refreshInfiniteStreakDisplay();
    this.ready.set(true);
    this.bump();
  }

  private onPhysicalKey(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Help toggle: ? key works regardless of game status. (Not lowercase 'h' —
    // H is a legitimate letter input in Termo, so binding it to help would
    // break typing words containing H. We use ? and uppercase H/C.)
    if (e.key === '?' || e.key === 'H') {
      e.preventDefault();
      this.helpOpen.update((v) => !v);
      return;
    }
    // Credits: only on uppercase C (Shift+C) so lowercase c can still be
    // typed in words.
    if (e.key === 'C') {
      e.preventDefault();
      this.creditsOpen.update((v) => !v);
      return;
    }
    // Mute: uppercase M only — lowercase m is a valid letter in Termo words.
    if (e.key === 'M') {
      e.preventDefault();
      const muted = this.audio?.toggleMute() ?? false;
      this.showToast(muted ? 'som desligado' : 'som ligado');
      return;
    }
    // Backslash toggles arcade / fullscreen mode.
    if (e.key === '\\') {
      e.preventDefault();
      this.arcadeMode.update((v) => !v);
      return;
    }
    // Esc: close arcade mode first, otherwise quit to the arcade home
    // (Termo has no pause state to fall through to).
    if (e.key === 'Escape') {
      // Let the native <dialog> close on Esc without quitting to home.
      if (this.helpOpen() || this.creditsOpen() || this.statsOpen() || this.archiveOpen()) {
        return;
      }
      e.preventDefault();
      if (this.arcadeMode()) {
        this.arcadeMode.set(false);
        return;
      }
      this.router.navigate(['/']);
      return;
    }
    // Global navigation digits 0-5. Termo only consumes digit keys via this
    // path; the reducer rejects non-letters, so it's safe to intercept.
    if (tryNavigate(this.router, e.code)) {
      e.preventDefault();
      return;
    }
    // If any modal is open, swallow letter/Enter/Backspace events so typing
    // inside the dialog doesn't dispatch into the game.
    if (this.helpOpen() || this.creditsOpen() || this.statsOpen() || this.archiveOpen()) return;
    if (!this.game) return;
    if (this.game.state().status !== 'playing') return;
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
    this.maybePlayEndOfGameSfx();
  }

  /**
   * Win / loss audio fires once on the status transition. Scheduled so the
   * sting lands after the row flip-reveal completes (matches the visual
   * BOUNCE_WIN timing for wins; losses get the same delay so the reveal of
   * the final row plays first).
   */
  private maybePlayEndOfGameSfx(): void {
    if (!this.game || !this.audio) return;
    const status = this.game.state().status;
    if (status === this.lastStatusForAudio) return;
    const prev = this.lastStatusForAudio;
    this.lastStatusForAudio = status;
    if (prev !== 'playing') return; // ignore replay resets ('won' → 'playing')
    if (status === 'won' || status === 'lost') {
      const key = status; // capture for closure
      const delay = 4 * REVEAL_STAGGER_MS + FLIP_DURATION_MS;
      const t = window.setTimeout(() => {
        this.audio?.play(key === 'won' ? 'win' : 'loss');
      }, delay);
      this.revealTimers.push(t);
    }
  }

  private processEffects(effects: Effect[]): void {
    for (const eff of effects) {
      if (eff.type === 'TOAST') {
        this.showToast(eff.message, eff.variant ?? 'error');
      } else if (eff.type === 'SHAKE_ROW') {
        this.triggerShake(eff.row);
        this.audio?.play('invalid');
      } else if (eff.type === 'FLIP_REVEAL') {
        this.triggerFlip(eff.row);
        this.scheduleFlipClicks();
      } else if (eff.type === 'BOUNCE_WIN') {
        this.scheduleBounce(eff.row);
      } else if (eff.type === 'STATS_UPDATED') {
        this.statsVersion.update((v) => v + 1);
        this.scheduleStatsAutoOpen();
      }
    }
  }

  /**
   * Schedule one short click per tile reveal, aligned with the per-tile
   * REVEAL_STAGGER, plus a single rowReveal chord at the end. We schedule
   * via setTimeout (rather than using the AudioContext's own clock) so the
   * clicks remain audibly aligned with the CSS flip animation that lives
   * on the same wall-clock timeline.
   */
  private scheduleFlipClicks(): void {
    if (!this.audio || !this.game) return;
    const cols = this.game.state().wordLength;
    for (let c = 0; c < cols; c++) {
      const t = window.setTimeout(() => {
        this.audio?.play('tileFlip');
      }, c * REVEAL_STAGGER_MS);
      this.flipClickTimers.push(t);
    }
    // Row reveal chord plays after the last tile has flipped.
    const rowT = window.setTimeout(() => {
      this.audio?.play('rowReveal');
    }, (cols - 1) * REVEAL_STAGGER_MS + Math.floor(FLIP_DURATION_MS / 2));
    this.flipClickTimers.push(rowT);
  }

  /**
   * Auto-open the stats modal ~600ms after the end-of-game animation
   * starts, so the bounce / loss reveal plays first. We deliberately delay
   * by FLIP_REVEAL + BOUNCE durations so the modal lands cleanly.
   */
  private scheduleStatsAutoOpen(): void {
    const st = this.game?.state();
    if (!st || st.status === 'playing') return;
    // Suppress for archived plays (they don't change stats — the modal would
    // be misleading) and for replays we've already auto-opened.
    if (this.game?.isArchive()) return;
    const key =
      st.mode === 'daily'
        ? `${st.puzzleNumber}-${st.status}`
        : `infinite-${Date.now()}`;
    if (this.lastAutoOpenForPuzzle === key) return;
    this.lastAutoOpenForPuzzle = key;
    if (this.statsAutoOpenTimer !== null) {
      window.clearTimeout(this.statsAutoOpenTimer);
    }
    // 600ms after the flip+bounce animation finishes.
    const delay = 4 * REVEAL_STAGGER_MS + FLIP_DURATION_MS + 600;
    this.statsAutoOpenTimer = window.setTimeout(() => {
      this.statsOpen.set(true);
      this.statsAutoOpenTimer = null;
    }, delay);
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

  private showToast(msg: string, variant: ToastVariant = 'error'): void {
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastVariant.set(variant);
    this.toast.set(msg);
    this.toastTimer = window.setTimeout(() => {
      this.toast.set(null);
      this.toastTimer = null;
    }, TOAST_DURATION_MS);
  }

  private clearTimers(): void {
    for (const t of this.revealTimers) window.clearTimeout(t);
    this.revealTimers = [];
    for (const t of this.flipClickTimers) window.clearTimeout(t);
    this.flipClickTimers = [];
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    if (this.shakingTimer !== null) window.clearTimeout(this.shakingTimer);
    if (this.bouncingTimer !== null) window.clearTimeout(this.bouncingTimer);
    if (this.statsAutoOpenTimer !== null) window.clearTimeout(this.statsAutoOpenTimer);
    this.toastTimer = this.shakingTimer = this.bouncingTimer = null;
    this.statsAutoOpenTimer = null;
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

interface StatsBinView {
  attempt: number;
  count: number;
  widthPct: number;
  highlight: boolean;
}

interface StatsView {
  played: number;
  won: number;
  winPercent: number;
  currentStreak: number;
  maxStreak: number;
  totalWins: number;
  bins: StatsBinView[];
}

/**
 * Pure view-model builder for the stats modal. `highlightAttempts`, when
 * non-null, highlights the histogram row matching the current game's
 * winning attempt count (so the player sees where their game landed).
 */
function buildStatsView(
  s: TermoStats,
  highlightAttempts: number | null,
): StatsView {
  // Display attempt rows 1..8 — covers all current wordLengths (max 7+1).
  const attempts = [1, 2, 3, 4, 5, 6, 7, 8];
  // Trim to keys actually used OR up to 6 (typical Termo default) — keep
  // the row count compact so the modal stays small.
  const presentMax = Object.keys(s.winsByAttempt)
    .map((k) => Number(k))
    .reduce((acc, n) => Math.max(acc, n), 6);
  const rows = attempts.filter((n) => n <= presentMax);
  const m = maxBin(s);
  const bins: StatsBinView[] = rows.map((attempt) => {
    const count = s.winsByAttempt[attempt] ?? 0;
    const widthPct = m === 0 ? 8 : Math.max(8, Math.round((count / m) * 100));
    return {
      attempt,
      count,
      widthPct,
      highlight: highlightAttempts === attempt,
    };
  });
  return {
    played: s.played,
    won: s.won,
    winPercent: winPercent(s),
    currentStreak: s.currentStreak,
    maxStreak: s.maxStreak,
    totalWins: s.won,
    bins,
  };
}
