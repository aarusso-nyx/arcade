import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  model,
  viewChild,
} from '@angular/core';

/**
 * Reusable modal dialog backed by the native <dialog> element.
 *
 * Usage:
 *   <app-help-dialog [(open)]="helpOpen" title="Snake">
 *     <h4>Goal</h4>
 *     <p>Eat the apples.</p>
 *   </app-help-dialog>
 *
 * `open` is a two-way model — closing via the X button, Esc, or backdrop
 * click writes `false` back to the parent's signal. The parent can also
 * push `true` to open it. The actual <dialog> showModal/close calls are
 * mirrored from the signal inside an effect.
 */
@Component({
  selector: 'app-help-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dlg
      class="help-dialog"
      (close)="open.set(false)"
      (click)="onBackdropClick($event)"
    >
      <header>
        <h3>{{ title() }}</h3>
        <button type="button" class="close" (click)="open.set(false)" aria-label="Close">
          ×
        </button>
      </header>
      <div class="content"><ng-content /></div>
      <p class="dismiss">
        Press <kbd>Esc</kbd>, <kbd>H</kbd>, or <kbd>?</kbd> to close.
      </p>
    </dialog>
  `,
  styles: `
    .help-dialog {
      border: 1px solid #2a2f38;
      border-radius: 0.75rem;
      background: #1a1d24;
      color: #e6e6e6;
      padding: 0;
      width: min(90vw, 540px);
      max-height: 80vh;
      font-family: system-ui, sans-serif;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }
    .help-dialog::backdrop {
      background: rgba(0, 0, 0, 0.6);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #2a2f38;
    }
    header h3 { margin: 0; font-size: 1.15rem; color: var(--nyx-brand-hi); }
    .close {
      background: transparent;
      color: inherit;
      border: 0;
      font-size: 1.6rem;
      line-height: 1;
      cursor: pointer;
      padding: 0 0.25rem;
      opacity: 0.7;
    }
    .close:hover { opacity: 1; }
    .content {
      padding: 1rem 1.25rem;
      overflow-y: auto;
      max-height: calc(80vh - 7rem);
      line-height: 1.5;
      font-size: 0.95rem;
    }
    .content :first-child { margin-top: 0; }
    .content :last-child { margin-bottom: 0; }
    .content h4 {
      margin: 1rem 0 0.4rem;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #8a8f99;
      font-weight: 600;
    }
    .content kbd {
      display: inline-block;
      padding: 0.05em 0.4em;
      background: #2a2f38;
      border-radius: 0.25rem;
      font-family: inherit;
      font-size: 0.85em;
      border: 1px solid #3a3f4b;
    }
    .content table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
    .content td, .content th { padding: 0.3rem 0.5rem; text-align: left; vertical-align: top; }
    .content tr + tr td { border-top: 1px solid #2a2f38; }
    .content th { color: #8a8f99; font-weight: 600; font-size: 0.85rem; }
    .dismiss {
      padding: 0.6rem 1.25rem;
      margin: 0;
      border-top: 1px solid #2a2f38;
      font-size: 0.8rem;
      color: #8a8f99;
      text-align: center;
    }
  `,
})
export class HelpDialogComponent {
  readonly title = input<string>('Help');
  readonly open = model<boolean>(false);
  private readonly dlgRef = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.dlgRef()?.nativeElement;
      if (!el) return;
      if (this.open()) {
        if (!el.open) el.showModal();
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected onBackdropClick(ev: MouseEvent): void {
    // <dialog> click events bubble from inside content too, so only treat as
    // backdrop if the click target IS the dialog element itself.
    if (ev.target === this.dlgRef()?.nativeElement) this.open.set(false);
  }
}
