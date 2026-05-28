import { Directive, ElementRef, inject } from '@angular/core';

/**
 * Minimal modal focus management (no CDK dependency): keeps Tab focus cycling
 * within the host element and restores focus to whatever was focused before the
 * host appeared (the trigger) when the host is destroyed.
 *
 * Apply to a dialog container that is created on open and destroyed on close
 * (e.g. an `@if`-gated modal). Autofocus-into-the-dialog is left to the host
 * component; this only traps and restores.
 */
@Directive({
  selector: '[rrFocusTrap]',
  host: {
    '(keydown.tab)': 'onTab($event)',
    '(keydown.shift.tab)': 'onShiftTab($event)',
  },
})
export class FocusTrapDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  // Captured at construction — the element focused before the dialog opened.
  private readonly returnTo = document.activeElement as HTMLElement | null;

  private focusable(): HTMLElement[] {
    const sel =
      'a[href],button:not([disabled]),input:not([disabled]),' +
      'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(sel)).filter(
      (el) => el.offsetParent !== null, // visible only
    );
  }

  protected onTab(e: Event): void {
    const f = this.focusable();
    if (f.length === 0) return;
    if (document.activeElement === f[f.length - 1]) {
      e.preventDefault();
      f[0].focus();
    }
  }

  protected onShiftTab(e: Event): void {
    const f = this.focusable();
    if (f.length === 0) return;
    if (document.activeElement === f[0]) {
      e.preventDefault();
      f[f.length - 1].focus();
    }
  }

  ngOnDestroy(): void {
    this.returnTo?.focus?.();
  }
}
